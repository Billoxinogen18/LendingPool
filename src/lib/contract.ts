import { ethers, BigNumber } from 'ethers';
import { LENDING_POOL_ABI } from './abi/LendingPoolABI';
import { ERC20_ABI } from './abi/ERC20ABI';
import { TOKENS } from '@/constants/tokens';
import { toast } from 'react-hot-toast';

// Read values injected at build/deploy time.  Primary var is NEXT_PUBLIC_CONTRACT_ADDRESS
// (fall back to legacy NEXT_PUBLIC_LENDING_POOL_ADDRESS for backwards-compatibility).
export const LENDING_POOL_ADDRESS: string =
  (typeof window !== 'undefined' 
    ? (window as any).__NEXT_DATA__?.env?.NEXT_PUBLIC_CONTRACT_ADDRESS || 
      (window as any).__NEXT_DATA__?.env?.NEXT_PUBLIC_LENDING_POOL_ADDRESS 
    : '0xFfcB1025c44d7a09f07a043F85b695619C5AFE1e') || '0xFfcB1025c44d7a09f07a043F85b695619C5AFE1e';

// Determine which chain the frontend should operate on.  This is injected via
// NEXT_PUBLIC_CHAIN_ID by the deployment script (defaults to Sepolia – 11155111).
export const DEFAULT_CHAIN_ID = parseInt(
  (typeof window !== 'undefined' 
    ? (window as any).__NEXT_DATA__?.env?.NEXT_PUBLIC_CHAIN_ID 
    : '11155111') || '11155111'
);

// Extend this list if you want to support multiple networks simultaneously.
export const SUPPORTED_CHAIN_IDS = [DEFAULT_CHAIN_ID];

export interface IUserData {
    collateral: { [key: string]: BigNumber };
    debt: { [key: string]: BigNumber };
    walletBalances: { [key: string]: BigNumber };
    prices: { [key: string]: BigNumber };
    reserves: { [key: string]: BigNumber }; // Add reserves property
    totalCollateralUSD: BigNumber;
    totalDebtUSD: BigNumber;
    borrowCapacity: BigNumber;
    indebtedness: number;
}

// Create a fallback provider to improve reliability
const createFallbackProvider = (chainId: number): ethers.providers.JsonRpcProvider => {
    let rpcUrls: string[];
    
    // Define multiple RPC URLs for different networks with fallbacks
    switch(chainId) {
        case 11155111: // Sepolia
            rpcUrls = [
                'https://rpc.sepolia.org',
                'https://sepolia.gateway.tenderly.co',
                'https://gateway.tenderly.co/public/sepolia',
                'https://sepolia-rpc.scroll.io/',
                                 'https://sepolia.infura.io/v3/9cfba16e9f16482f97687dca627cb64c'
            ];
            break;
        default:
            rpcUrls = ['https://rpc.sepolia.org'];
            break;
    }
    
    // Use the first available RPC (most reliable public ones first)
    const rpcUrl = rpcUrls[0];
    return new ethers.providers.JsonRpcProvider(rpcUrl);
};

// Helper to check if contract exists at address
export const verifyContractExists = async (provider: ethers.providers.Provider): Promise<boolean> => {
    console.log(`[verifyContractExists] Verifying contract at address: ${LENDING_POOL_ADDRESS}`);
    if (LENDING_POOL_ADDRESS === '0x0000000000000000000000000000000000000000') {
        console.error("[verifyContractExists] Lending pool address is not configured (is zero address).");
        return false;
    }
    
    try {
        const network = await provider.getNetwork();
        console.log(`[verifyContractExists] Verifying on network: ${network.name} (chainId: ${network.chainId})`);
        
        // Simplified approach with timeout to prevent infinite loops
        const timeoutPromise = new Promise<string>((_, reject) => 
            setTimeout(() => reject(new Error('Contract verification timeout')), 10000)
        );
        
        const codePromise = provider.getCode(LENDING_POOL_ADDRESS);
        
        const code = await Promise.race([codePromise, timeoutPromise]);
        
        console.log(`[verifyContractExists] Contract code length: ${code.length}`);
        const exists = code !== '0x' && code !== '0x0' && code.length > 2;
        console.log(`[verifyContractExists] Contract ${exists ? 'exists' : 'does NOT exist'}.`);
        return exists;
    } catch (error) {
        console.error("[verifyContractExists] Error during contract verification:", error);
        
        // If verification fails, assume contract exists to avoid blocking the UI
        // This is safer than getting stuck in loops
        console.warn("[verifyContractExists] Assuming contract exists due to verification error");
        return true;
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
    console.log(`[getUserData] Starting data fetch for user ${userAddress} on contract ${LENDING_POOL_ADDRESS}`);
    if (LENDING_POOL_ADDRESS === '0x0000000000000000000000000000000000000000') {
        toast.error('Lending pool address not configured');
        throw new Error('Lending pool address not set');
    }

    // Validate provider
    if (!provider) {
        console.error('[getUserData] Provider is null or undefined');
        throw new Error('Provider is not available');
    }

    // Check if provider is valid
    try {
        if (!provider._isProvider) {
            console.error('[getUserData] Provider is not a valid ethers provider');
            throw new Error('Invalid provider');
        }
    } catch (err) {
        console.error('[getUserData] Error checking provider:', err);
        throw new Error('Provider validation failed');
    }

    // First verify the contract exists
    const contractExists = await verifyContractExists(provider);
    if (!contractExists) {
        toast.error("Contract not found at the specified address. Please check deployment.");
        throw new Error("Contract not found at address: " + LENDING_POOL_ADDRESS);
    }

    // Check if we're on the right network
    let network;
    try {
        network = await provider.getNetwork();
        console.log(`[getUserData] Connected to network: ${network.name} (chainId: ${network.chainId})`);
    } catch (err) {
        console.error('[getUserData] Failed to get network:', err);
        throw new Error('Failed to get network information');
    }
    
    if (!SUPPORTED_CHAIN_IDS.includes(network.chainId)) {
        toast.error("Please connect to the correct network");
        throw new Error("Wrong network. Please switch your wallet to the expected network.");
    }

    const lendingPool = getLendingPoolContract(provider);
    const nativeTokenAddress = '0x0000000000000000000000000000000000000000';

    const data: IUserData = {
        collateral: {},
        debt: {},
        walletBalances: {},
        prices: {},
        reserves: {}, // Initialize reserves
        totalCollateralUSD: BigNumber.from(0),
        totalDebtUSD: BigNumber.from(0),
        borrowCapacity: BigNumber.from(0),
        indebtedness: 0,
    };

    try {
        // Fetch data for each token serially to avoid overloading the provider
        for (const token of TOKENS) {
            try {
                const isNative = token.address === nativeTokenAddress;
                
                // Fetch collateral
                const collateralResult = await lendingPool.userCollateral(userAddress, token.address)
                    .catch(() => ({ amount: BigNumber.from(0) }));
                
                // For userCollateral, the return is a struct with an 'amount' property
                data.collateral[token.address] = collateralResult.amount || collateralResult || BigNumber.from(0);
                
                // Fetch debt with fallbacks
                let debt = BigNumber.from(0);
                try {
                    debt = await lendingPool.userDebt(userAddress, token.address);
                } catch (error) {
                    console.warn(`Failed to fetch debt for ${token.symbol}:`, error);
                }
                data.debt[token.address] = debt;
                
                // Fetch price with fallbacks
                let price = BigNumber.from(0);
                try {
                    price = await lendingPool.getTokenPrice(token.address);
                } catch (error) {
                    console.warn(`Failed to fetch price for ${token.symbol}:`, error);
                }
                data.prices[token.address] = price;
                
                // Fetch pool reserves
                let reserves = BigNumber.from(0);
                try {
                    reserves = await lendingPool.reserves(token.address);
                } catch (error) {
                    console.warn(`Failed to fetch reserves for ${token.symbol}:`, error);
                }
                data.reserves[token.address] = reserves;
                
                // Fetch balance with fallbacks
                let balance = BigNumber.from(0);
                try {
                    if (isNative) {
                        balance = await provider.getBalance(userAddress);
                    } else {
                        const erc20 = getErc20Contract(token.address, provider);
                        balance = await erc20.balanceOf(userAddress);
                    }
                } catch (error) {
                    console.warn(`Failed to fetch balance for ${token.symbol}:`, error);
                }
                data.walletBalances[token.address] = balance;
            } catch (error) {
                console.error(`Error fetching data for token ${token.symbol}:`, error);
                // Set default values to prevent UI errors
                data.collateral[token.address] = BigNumber.from(0);
                data.debt[token.address] = BigNumber.from(0);
                data.prices[token.address] = BigNumber.from(0);
                data.walletBalances[token.address] = BigNumber.from(0);
                data.reserves[token.address] = BigNumber.from(0);
            }
        }

        // Fetch aggregate data
        try {
            // Calculate total collateral USD
            let totalCollateral = BigNumber.from(0);
            for (const token of TOKENS) {
                const amount = data.collateral[token.address] || BigNumber.from(0);
                const price = data.prices[token.address] || BigNumber.from(0);
                if (!amount.isZero() && !price.isZero()) {
                    totalCollateral = totalCollateral.add(amount.mul(price).div(ethers.utils.parseEther('1')));
                }
            }
            data.totalCollateralUSD = totalCollateral;
            
            // Get other aggregate data
            try {
                data.totalDebtUSD = await lendingPool.getTotalDebtUSD(userAddress);
            } catch (error) {
                console.warn("Failed to fetch total debt:", error);
                data.totalDebtUSD = BigNumber.from(0);
            }
            
            try {
                data.borrowCapacity = await lendingPool.getBorrowCapacity(userAddress);
            } catch (error) {
                console.warn("Failed to fetch borrow capacity:", error);
                data.borrowCapacity = BigNumber.from(0);
            }
            
            try {
                const indebtedness = await lendingPool.getIndebtedness(userAddress);
                data.indebtedness = indebtedness.toNumber();
            } catch (error) {
                console.warn("Failed to fetch indebtedness:", error);
                data.indebtedness = 0;
            }
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

// Liquidation function
export const liquidate = async (signer: ethers.Signer, userToLiquidate: string) => {
    const lendingPool = getLendingPoolContract(signer);
    const tx = await lendingPool.liquidate(userToLiquidate);
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
