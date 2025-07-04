"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { useWalletContext } from '@/contexts/WalletContext';
import { TOKENS, Token } from '@/constants/tokens';
import {
    getUserData,
    IUserData,
    deposit,
    withdraw,
    borrow,
    repay,
    approve,
    getAllowance,
    verifyContractExists,
    SUPPORTED_CHAIN_IDS,
    liquidate
} from '@/lib/contract';
import { ethers } from 'ethers';
import { toast } from 'react-hot-toast';
import SupplyModal from '@/components/SupplyModal';
import BorrowModal from '@/components/BorrowModal';
import UserDashboard from '@/components/UserDashboard';

// Main application component for the Lending Pool
export default function AppPage() {
    const { isConnected, provider, address, signer, chainId, isInitializing, ensureWalletConnected } = useWalletContext();
    const [userData, setUserData] = useState<IUserData | null>(null);
    const [marketData, setMarketData] = useState<Token[]>(TOKENS);
    const [isLoading, setIsLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedToken, setSelectedToken] = useState<Token | null>(null);
    const [modalType, setModalType] = useState<'supply' | 'withdraw' | 'borrow' | 'repay' | null>(null);
    const [isProcessingTransaction, setIsProcessingTransaction] = useState(false);
    const [contractError, setContractError] = useState<string | null>(null);
    const [dataFetchInProgress, setDataFetchInProgress] = useState(false);
    const [liquidationAddress, setLiquidationAddress] = useState<string>('');
    const [liquidationInProgress, setLiquidationInProgress] = useState<boolean>(false);
    const [showLiquidationTool, setShowLiquidationTool] = useState<boolean>(false);
    const [riskAddresses, setRiskAddresses] = useState<{address: string, indebtedness: number}[]>([]);
    const [isLoadingRiskAddresses, setIsLoadingRiskAddresses] = useState<boolean>(false);

    // Function to check if the contract is deployed
    const checkContractDeployment = useCallback(async () => {
        console.log('[AppPage] checkContractDeployment triggered.');
        if (!provider) {
             console.log('[AppPage] checkContractDeployment aborted: no provider.');
             return false;
        }
        
        try {
            const exists = await verifyContractExists(provider);
            if (!exists) {
                setContractError("Contract not found at the specified address. Please check deployment.");
                return false;
            }
            
            // Check if we're on the right network
            if (chainId && !SUPPORTED_CHAIN_IDS.includes(chainId)) {
                setContractError("Please switch your wallet to the correct network.");
                return false;
            }
            
            setContractError(null);
            return true;
        } catch (error) {
            console.error("Error checking contract:", error);
            setContractError("Error verifying contract deployment");
            return false;
        }
    }, [provider, chainId]);

    // Function to fetch all required data from the blockchain
    const fetchData = useCallback(async () => {
        console.log('[AppPage] fetchData triggered.');
        
        // First ensure wallet is connected
        if (!isConnected) {
            const connected = await ensureWalletConnected();
            if (!connected) {
                console.log('[AppPage] fetchData aborted: wallet connection failed.');
                setIsLoading(false);
                return;
            }
        }
        
        if (!provider || !address) {
            console.log('[AppPage] fetchData aborted: provider or address missing.');
            setIsLoading(false);
            return;
        }
        
        console.log(`[AppPage] State before fetching: isConnected=${isConnected}, chainId=${chainId}`);

        // Prevent multiple simultaneous fetches
        if (dataFetchInProgress) {
            console.log('[AppPage] A data fetch is already in progress, skipping.');
            return;
        }
        
        setDataFetchInProgress(true);
        
        // Check if contract is deployed first
        const contractValid = await checkContractDeployment();
        if (!contractValid) {
            setIsLoading(false);
            setDataFetchInProgress(false);
            return;
        }
        
        try {
            const data = await getUserData(provider, address);
            setUserData(data);

            // Update market data with user-specific balances
            const updatedMarketData = TOKENS.map(token => {
                // Use previous data as fallback if available to prevent UI jumps
                const supplied = data.collateral[token.address] 
                    ? ethers.utils.formatUnits(data.collateral[token.address], token.decimals) 
                    : '0';
                const borrowed = data.debt[token.address] 
                    ? ethers.utils.formatUnits(data.debt[token.address], token.decimals) 
                    : '0';
                return { ...token, supplied, borrowed };
            });
            setMarketData(updatedMarketData);
        } catch (error) {
            console.error("Error fetching user data:", error);
            // Only show toast if we're not in the initial loading state
            if (!isLoading) {
                toast.error("Could not fetch your data from the network.");
            }
        } finally {
            setIsLoading(false);
            setDataFetchInProgress(false);
        }
    }, [provider, address, isConnected, checkContractDeployment, chainId, ensureWalletConnected, dataFetchInProgress]);

    useEffect(() => {
        // If wallet is connected or just initialized, fetch data
        if ((isConnected || !isInitializing) && !dataFetchInProgress) {
            fetchData();
            
            // Set up interval to refresh data every 60 seconds
            const intervalId = setInterval(() => {
                if (!dataFetchInProgress) {
                    fetchData();
                }
            }, 60000);
            
            return () => clearInterval(intervalId);
        } else if (!isConnected && !isInitializing) {
            setIsLoading(false);
            setUserData(null);
        }
    }, [isConnected, fetchData, isInitializing, dataFetchInProgress]);

    // Handlers to open different types of modals
    const openModal = (token: Token, type: 'supply' | 'withdraw' | 'borrow' | 'repay') => {
        setSelectedToken(token);
        setModalType(type);
        setIsModalOpen(true);
    };

    const closeModal = () => {
        setIsModalOpen(false);
        setSelectedToken(null);
        setModalType(null);
    };

    // Main transaction handler
    const handleTransaction = async (amount: string, token: Token, type: 'supply' | 'withdraw' | 'borrow' | 'repay') => {
        // First ensure wallet is connected
        if (!isConnected) {
            const connected = await ensureWalletConnected();
            if (!connected) {
                toast.error("Please connect your wallet to proceed");
                return;
            }
        }
        
        if (!signer || !address) {
            toast.error("Wallet not connected");
            return;
        }
        
        if (isProcessingTransaction) {
            toast.error("Transaction already in progress");
            return;
        }
        
        // Check if contract is deployed first
        const contractValid = await checkContractDeployment();
        if (!contractValid) {
            return;
        }

        setIsProcessingTransaction(true);
        const toastId = toast.loading(`Processing ${type} transaction...`);

        try {
            const amountWei = ethers.utils.parseUnits(amount, token.decimals);
            let tx;
            
            // For non-native tokens, check allowance and approve if necessary
            if (token.address !== '0x0000000000000000000000000000000000000000') {
                if (type === 'supply' || type === 'repay') {
                    const allowance = await getAllowance(provider!, token.address, address);
                    if (allowance.lt(amountWei)) {
                        toast.loading("Approval required...", { id: toastId });
                        const approveTx = await approve(signer, token.address, amountWei);
                        await approveTx.wait();
                        toast.loading("Approval successful! Continuing transaction...", { id: toastId });
                    }
                }
            }

            toast.loading(`Confirm ${type} transaction...`, { id: toastId });

            switch (type) {
                case 'supply':
                    tx = await deposit(signer, token.address, amountWei);
                    break;
                case 'withdraw':
                    tx = await withdraw(signer, token.address, amountWei);
                    break;
                case 'borrow':
                    tx = await borrow(signer, token.address, amountWei);
                    break;
                case 'repay':
                    tx = await repay(signer, token.address, amountWei);
                    break;
            }

            await tx.wait();
            toast.success("Transaction successful!", { id: toastId });
            fetchData(); // Refresh data after transaction
            closeModal();
        } catch (error: any) {
            console.error(error);
            let errorMessage = "Transaction failed.";
            
            if (error?.reason) {
                errorMessage = error.reason;
            } else if (error?.message) {
                // Clean up common MetaMask errors
                const message = error.message;
                if (message.includes("user rejected transaction")) {
                    errorMessage = "Transaction rejected by user.";
                } else if (message.includes("insufficient funds")) {
                    errorMessage = "Insufficient funds for transaction.";
                }
            }
            
            toast.error(errorMessage, { id: toastId });
        } finally {
            setIsProcessingTransaction(false);
        }
    };

    // Handle liquidation
    const handleLiquidation = async () => {
        if (!signer || !address) {
            toast.error("Wallet not connected");
            return;
        }
        
        if (!liquidationAddress || !ethers.utils.isAddress(liquidationAddress)) {
            toast.error("Please enter a valid address to liquidate");
            return;
        }
        
        if (liquidationInProgress) {
            toast.error("Liquidation already in progress");
            return;
        }
        
        // Check if contract is deployed first
        const contractValid = await checkContractDeployment();
        if (!contractValid) {
            return;
        }

        setLiquidationInProgress(true);
        const toastId = toast.loading(`Processing liquidation...`);

        try {
            const tx = await liquidate(signer, liquidationAddress);
            await tx.wait();
            toast.success("Liquidation successful!", { id: toastId });
            fetchData(); // Refresh data after transaction
            setLiquidationAddress('');
        } catch (error: any) {
            console.error(error);
            let errorMessage = "Liquidation failed.";
            
            if (error?.reason) {
                errorMessage = error.reason;
            } else if (error?.message) {
                // Clean up common MetaMask errors
                const message = error.message;
                if (message.includes("user rejected transaction")) {
                    errorMessage = "Transaction rejected by user.";
                } else if (message.includes("insufficient funds")) {
                    errorMessage = "Insufficient funds for transaction.";
                } else if (message.includes("Healthy")) {
                    errorMessage = "Position is healthy and cannot be liquidated.";
                } else if (message.includes("No debt")) {
                    errorMessage = "Address has no debt to liquidate.";
                }
            }
            
            toast.error(errorMessage, { id: toastId });
        } finally {
            setLiquidationInProgress(false);
        }
    };

    // Function to fetch accounts at risk of liquidation (mock function for demo)
    // In a real application, this would query an indexer or subgraph
    const fetchRiskAddresses = useCallback(async () => {
        if (!provider) return;
        
        setIsLoadingRiskAddresses(true);
        
        try {
            // This is a mock implementation
            // In a real application, you would query an indexer or subgraph
            // For demo purposes, we'll just use the current user if they have debt
            if (userData && userData.indebtedness > 50) {
                setRiskAddresses([{
                    address: address!,
                    indebtedness: userData.indebtedness
                }]);
            } else {
                // Mock data for demonstration
                setRiskAddresses([
                    {address: '0x1234567890123456789012345678901234567890', indebtedness: 78},
                    {address: '0x0987654321098765432109876543210987654321', indebtedness: 92}
                ]);
            }
        } catch (error) {
            console.error("Error fetching risk addresses:", error);
        } finally {
            setIsLoadingRiskAddresses(false);
        }
    }, [provider, userData, address]);

    // Fetch risk addresses when liquidation tool is shown
    useEffect(() => {
        if (showLiquidationTool) {
            fetchRiskAddresses();
        }
    }, [showLiquidationTool, fetchRiskAddresses]);

    // If wallet is initializing, show a loading state
    if (isInitializing) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[calc(100vh-200px)]">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mb-4"></div>
                <p className="text-white text-lg">Connecting to wallet...</p>
            </div>
        );
    }

    // If wallet is not connected, show a connection prompt
    if (!isConnected) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[calc(100vh-200px)] text-center">
                <h1 className="text-4xl font-bold text-white mb-4">Welcome to the Lending Pool</h1>
                <p className="text-xl text-gray-400 mb-6">Please connect your wallet to manage your assets.</p>
                <button 
                    onClick={() => ensureWalletConnected()}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-lg text-lg font-medium transition-colors"
                >
                    Connect Wallet
                </button>
            </div>
        );
    }
    
    // If there's a contract error, show the error
    if (contractError) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[calc(100vh-200px)] text-center">
                <h1 className="text-2xl font-bold text-red-500 mb-4">Contract Error</h1>
                <p className="text-xl text-gray-400 mb-4">{contractError}</p>
                <p className="text-md text-gray-500">
                    The contract may not be deployed or you might be connected to the wrong network.
                    <br />Please make sure you are connected to the Sepolia network.
                </p>
            </div>
        );
    }

    // If data is loading, show a loading indicator
    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[calc(100vh-200px)]">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mb-4"></div>
                <p className="text-white text-lg">Loading your lending data...</p>
            </div>
        );
    }

    return (
        <div className="px-4 max-w-7xl mx-auto">
            {userData && (
                <div className="my-8">
                    <UserDashboard userData={userData} isLoading={isLoading} />
                </div>
            )}

            {/* Supply Markets */}
            <div className="my-12">
                <h2 className="text-2xl font-bold text-white mb-6">Supply Markets</h2>
                <div className="overflow-x-auto">
                    <table className="w-full bg-gray-900/50 backdrop-blur-sm rounded-xl border border-gray-700">
                        <thead>
                            <tr className="border-b border-gray-700">
                                <th className="text-left p-4 text-gray-400">Asset</th>
                                <th className="text-right p-4 text-gray-400">Wallet Balance</th>
                                <th className="text-right p-4 text-gray-400">APY</th>
                                <th className="text-right p-4 text-gray-400">Total Supplied</th>
                                <th className="text-right p-4 text-gray-400"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {marketData.map(token => {
                                const walletBalance = userData && userData.walletBalances[token.address] 
                                    ? ethers.utils.formatUnits(userData.walletBalances[token.address], token.decimals)
                                    : '0';

                                return (
                                    <tr key={token.address} className="border-b border-gray-800 hover:bg-gray-800/50 transition-colors">
                                        <td className="p-4">
                                            <div className="flex items-center">
                                                <img src={token.logo} alt={token.name} className="w-8 h-8 mr-3" />
                                                <div>
                                                    <p className="text-white font-medium">{token.symbol}</p>
                                                    <p className="text-gray-400 text-sm">{token.name}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="p-4 text-right text-white">{parseFloat(walletBalance).toFixed(4)}</td>
                                        <td className="p-4 text-right text-green-400">3.5%</td>
                                        <td className="p-4 text-right text-white">{token.supplied || '0.00'}</td>
                                        <td className="p-4 text-right">
                                            <div className="flex justify-end space-x-2">
                                                <button 
                                                    onClick={() => openModal(token, 'supply')}
                                                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-1 rounded-md transition-colors"
                                                >
                                                    Supply
                                                </button>
                                                {token.supplied && parseFloat(token.supplied) > 0 && (
                                                    <button 
                                                        onClick={() => openModal(token, 'withdraw')}
                                                        className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-1 rounded-md transition-colors"
                                                    >
                                                        Withdraw
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Borrow Markets */}
            <div className="my-12">
                <h2 className="text-2xl font-bold text-white mb-6">Borrow Markets</h2>
                <div className="overflow-x-auto">
                    <table className="w-full bg-gray-900/50 backdrop-blur-sm rounded-xl border border-gray-700">
                        <thead>
                            <tr className="border-b border-gray-700">
                                <th className="text-left p-4 text-gray-400">Asset</th>
                                <th className="text-right p-4 text-gray-400">Available</th>
                                <th className="text-right p-4 text-gray-400">APY</th>
                                <th className="text-right p-4 text-gray-400">Total Borrowed</th>
                                <th className="text-right p-4 text-gray-400"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {marketData.map(token => {
                                const available = userData && userData.reserves && userData.reserves[token.address]
                                    ? ethers.utils.formatUnits(userData.reserves[token.address], token.decimals)
                                    : '0';
                                
                                return (
                                    <tr key={token.address} className="border-b border-gray-800 hover:bg-gray-800/50 transition-colors">
                                        <td className="p-4">
                                            <div className="flex items-center">
                                                <img src={token.logo} alt={token.name} className="w-8 h-8 mr-3" />
                                                <div>
                                                    <p className="text-white font-medium">{token.symbol}</p>
                                                    <p className="text-gray-400 text-sm">{token.name}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="p-4 text-right text-white">{parseFloat(available).toFixed(4)}</td>
                                        <td className="p-4 text-right text-red-400">5.2%</td>
                                        <td className="p-4 text-right text-white">{token.borrowed || '0.00'}</td>
                                        <td className="p-4 text-right">
                                            <div className="flex justify-end space-x-2">
                                                <button 
                                                    onClick={() => openModal(token, 'borrow')}
                                                    disabled={parseFloat(available) <= 0}
                                                    className={`${parseFloat(available) > 0 ? 'bg-purple-600 hover:bg-purple-700' : 'bg-gray-600 cursor-not-allowed'} text-white px-4 py-1 rounded-md transition-colors`}
                                                >
                                                    Borrow
                                                </button>
                                                {token.borrowed && parseFloat(token.borrowed) > 0 && (
                                                    <button 
                                                        onClick={() => openModal(token, 'repay')}
                                                        className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-1 rounded-md transition-colors"
                                                    >
                                                        Repay
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Liquidation Tool for Advanced Users */}
            <div className="my-12">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-2xl font-bold text-white">Advanced Tools</h2>
                    <button 
                        onClick={() => setShowLiquidationTool(!showLiquidationTool)}
                        className="text-sm bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-md transition-colors"
                    >
                        {showLiquidationTool ? 'Hide Liquidation Tool' : 'Show Liquidation Tool'}
                    </button>
                </div>
                
                {showLiquidationTool && (
                    <div className="bg-gray-900/50 backdrop-blur-sm rounded-xl p-6 border border-gray-700">
                        <h3 className="text-xl font-bold text-white mb-4">Liquidation Tool</h3>
                        <p className="text-gray-400 mb-6">
                            This tool allows you to liquidate undercollateralized positions. 
                            You will receive the collateral of the liquidated position.
                        </p>
                        
                        <div className="flex flex-col md:flex-row gap-4 mb-8">
                            <input 
                                type="text" 
                                placeholder="Address to liquidate (0x...)" 
                                value={liquidationAddress}
                                onChange={(e) => setLiquidationAddress(e.target.value)}
                                className="flex-grow bg-gray-800 text-white border border-gray-700 rounded-md px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                            <button 
                                onClick={handleLiquidation}
                                disabled={liquidationInProgress || !liquidationAddress}
                                className={`${liquidationInProgress || !liquidationAddress ? 'bg-gray-600 cursor-not-allowed' : 'bg-red-600 hover:bg-red-700'} text-white px-6 py-2 rounded-md transition-colors`}
                            >
                                {liquidationInProgress ? 'Processing...' : 'Liquidate Position'}
                            </button>
                        </div>
                        
                        <div>
                            <h4 className="text-lg font-semibold text-white mb-3">Accounts at Risk</h4>
                            
                            {isLoadingRiskAddresses ? (
                                <div className="flex items-center justify-center py-4">
                                    <div className="animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-blue-500"></div>
                                    <span className="ml-2 text-gray-400">Loading accounts at risk...</span>
                                </div>
                            ) : riskAddresses.length > 0 ? (
                                <div className="overflow-x-auto">
                                    <table className="w-full">
                                        <thead>
                                            <tr className="border-b border-gray-700">
                                                <th className="text-left p-2 text-gray-400">Address</th>
                                                <th className="text-right p-2 text-gray-400">Health</th>
                                                <th className="text-right p-2 text-gray-400">Action</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {riskAddresses.map((item) => (
                                                <tr key={item.address} className="border-b border-gray-800">
                                                    <td className="p-2 text-white">
                                                        {item.address.substring(0, 6)}...{item.address.substring(38)}
                                                    </td>
                                                    <td className="p-2 text-right">
                                                        <span className={`px-2 py-1 rounded text-xs ${
                                                            item.indebtedness > 90 ? 'bg-red-900/50 text-red-300' : 
                                                            item.indebtedness > 70 ? 'bg-yellow-900/50 text-yellow-300' : 
                                                            'bg-green-900/50 text-green-300'
                                                        }`}>
                                                            {item.indebtedness}%
                                                        </span>
                                                    </td>
                                                    <td className="p-2 text-right">
                                                        <button
                                                            onClick={() => setLiquidationAddress(item.address)}
                                                            className="bg-gray-700 hover:bg-gray-600 text-white px-3 py-1 rounded-md text-sm transition-colors"
                                                        >
                                                            Select
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            ) : (
                                <p className="text-gray-400">No accounts currently at risk of liquidation.</p>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* Modal */}
            {isModalOpen && selectedToken && modalType && (
                modalType === 'supply' || modalType === 'withdraw' ?
                <SupplyModal
                    isOpen={isModalOpen}
                    onClose={closeModal}
                    token={selectedToken}
                    type={modalType}
                    onSubmit={handleTransaction}
                    userData={userData}
                />
                :
                <BorrowModal
                    isOpen={isModalOpen}
                    onClose={closeModal}
                    token={selectedToken}
                    type={modalType}
                    onSubmit={handleTransaction}
                    userData={userData}
                />
            )}
        </div>
    );
}
