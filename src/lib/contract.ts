import { ethers, BigNumber } from 'ethers';
import { LENDING_POOL_ABI } from './abi/LendingPoolABI';
import { ERC20_ABI } from './abi/ERC20ABI';
import { TOKENS } from '@/constants/tokens';
import { toast } from 'react-hot-toast';

// Address injected at build time via NEXT_PUBLIC_LENDING_POOL_ADDRESS
export const LENDING_POOL_ADDRESS: string = process.env.NEXT_PUBLIC_LENDING_POOL_ADDRESS || '0x0000000000000000000000000000000000000000';

// BSC Mainnet Chain ID
export const BSC_CHAIN_ID = 56;

export const SUPPORTED_CHAIN_IDS = [56, 97];

export interface IUserData {
    collateral: { [key: string]: BigNumber };
    debt: { [key: string]: BigNumber };
    walletBalances: { [key: string]: BigNumber };
    prices: { [key: string]: BigNumber };
    totalCollateralUSD: BigNumber;
    totalDebtUSD: BigNumber;
    borrowCapacity: BigNumber;
    indebtedness: number;
}

// Helper to check if contract exists at address
export const verifyContractExists = async (provider: ethers.providers.Provider): Promise<boolean> => {
    try {
        const code = await provider.getCode(LENDING_POOL_ADDRESS);
        // If there's no code at the address, it will return "0x"
        return code !== '0x';
    } catch (error) {
        console.error("Error verifying contract:", error);
        return false;
    }
};

// Helper to get contract instances
const getLendingPoolContract = (providerOrSigner: ethers.providers.Provider | ethers.Signer) => {
    return new ethers.Contract(LENDING_POOL_ADDRESS, LENDING_POOL_ABI, providerOrSigner);
};

const getErc20Contract = (tokenAddress: string, providerOrSigner: ethers.providers.Provider | ethers.Signer) => {
    return new ethers.Contract(tokenAddress, ERC20_ABI, providerOrSigner);
};

// Fetches all relevant user and market data in a single batch
export const getUserData = async (provider: ethers.providers.Provider, userAddress: string): Promise<IUserData> => {
    if (LENDING_POOL_ADDRESS === '0x0000000000000000000000000000000000000000') {
        toast.error('Lending pool address not configured');
        throw new Error('Lending pool address not set');
    }

    // First verify the contract exists
    const contractExists = await verifyContractExists(provider);
    if (!contractExists) {
        toast.error("Contract not found at the specified address. Please check deployment.");
        throw new Error("Contract not found at address: " + LENDING_POOL_ADDRESS);
    }

    // Check if we're on the right network
    const network = await provider.getNetwork();
    if (!SUPPORTED_CHAIN_IDS.includes(network.chainId)) {
        toast.error("Please connect to a supported network (BSC Mainnet or Testnet)");
        throw new Error("Wrong network. Please connect to BSC Mainnet or Testnet.");
    }

    const lendingPool = getLendingPoolContract(provider);
    const nativeTokenAddress = '0x0000000000000000000000000000000000000000';

    const data: IUserData = {
        collateral: {},
        debt: {},
        walletBalances: {},
        prices: {},
        totalCollateralUSD: BigNumber.from(0),
        totalDebtUSD: BigNumber.from(0),
        borrowCapacity: BigNumber.from(0),
        indebtedness: 0,
    };

    try {
        // Fetch data in parallel for each token
        await Promise.all(TOKENS.map(async (token) => {
            try {
                const isNative = token.address === nativeTokenAddress;
                
                // Fetch collateral
                const collateralResult = await lendingPool.userCollateral(userAddress, token.address);
                // For userCollateral, the return is a struct with an 'amount' property
                data.collateral[token.address] = collateralResult.amount || collateralResult;
                
                // Fetch other data
                const [debt, price, balance] = await Promise.all([
                    lendingPool.userDebt(userAddress, token.address),
                    lendingPool.getTokenPrice(token.address),
                    isNative 
                        ? provider.getBalance(userAddress) 
                        : getErc20Contract(token.address, provider).balanceOf(userAddress)
                ]);
                
                data.debt[token.address] = debt;
                data.prices[token.address] = price;
                data.walletBalances[token.address] = balance;
            } catch (error) {
                console.error(`Error fetching data for token ${token.symbol}:`, error);
                // Set default values to prevent UI errors
                data.collateral[token.address] = BigNumber.from(0);
                data.debt[token.address] = BigNumber.from(0);
                data.prices[token.address] = BigNumber.from(0);
                data.walletBalances[token.address] = BigNumber.from(0);
            }
        }));

        // Fetch aggregate data
        try {
            // Calculate total collateral USD
            let totalCollateral = BigNumber.from(0);
            for (const token of TOKENS) {
                const amount = data.collateral[token.address] || BigNumber.from(0);
                const price = data.prices[token.address] || BigNumber.from(0);
                totalCollateral = totalCollateral.add(amount.mul(price).div(ethers.utils.parseEther('1')));
            }
            data.totalCollateralUSD = totalCollateral;
            
            // Get other aggregate data
            const [totalDebtUSD, borrowCapacity, indebtedness] = await Promise.all([
                lendingPool.getTotalDebtUSD(userAddress),
                lendingPool.getBorrowCapacity(userAddress),
                lendingPool.getIndebtedness(userAddress)
            ]);
            
            data.totalDebtUSD = totalDebtUSD;
            data.borrowCapacity = borrowCapacity;
            data.indebtedness = indebtedness.toNumber();
        } catch (error) {
            console.error("Error fetching aggregate data:", error);
        }
    } catch (error) {
        console.error("Error in getUserData:", error);
        throw error;
    }

    return data;
};


// Contract write functions
export const deposit = async (signer: ethers.Signer, tokenAddress: string, amount: BigNumber) => {
    const lendingPool = getLendingPoolContract(signer);
    const isNative = tokenAddress === '0x0000000000000000000000000000000000000000';
    const tx = await lendingPool.deposit(tokenAddress, amount, {
        value: isNative ? amount : 0,
    });
    return tx;
};

export const withdraw = async (signer: ethers.Signer, tokenAddress: string, amount: BigNumber) => {
    const lendingPool = getLendingPoolContract(signer);
    const tx = await lendingPool.withdraw(tokenAddress, amount);
    return tx;
};

export const borrow = async (signer: ethers.Signer, tokenAddress: string, amount: BigNumber) => {
    const lendingPool = getLendingPoolContract(signer);
    const isNative = tokenAddress === '0x0000000000000000000000000000000000000000';
    const tx = await lendingPool.borrow(tokenAddress, amount, {
        value: isNative ? 0 : 0, // No value needed for borrow, but needed for contract signature
    });
    return tx;
};

export const repay = async (signer: ethers.Signer, tokenAddress: string, amount: BigNumber) => {
    const lendingPool = getLendingPoolContract(signer);
    const isNative = tokenAddress === '0x0000000000000000000000000000000000000000';
    const tx = await lendingPool.repay(tokenAddress, amount, {
        value: isNative ? amount : 0,
    });
    return tx;
};

// ERC20 approval functions
export const approve = async (signer: ethers.Signer, tokenAddress: string, amount: BigNumber) => {
    const erc20 = getErc20Contract(tokenAddress, signer);
    const tx = await erc20.approve(LENDING_POOL_ADDRESS, amount);
    return tx;
};

export const getAllowance = async (provider: ethers.providers.Provider, tokenAddress: string, ownerAddress: string): Promise<BigNumber> => {
    try {
        const erc20 = getErc20Contract(tokenAddress, provider);
        return await erc20.allowance(ownerAddress, LENDING_POOL_ADDRESS);
    } catch (error) {
        console.error("Error getting allowance:", error);
        return BigNumber.from(0);
    }
};
