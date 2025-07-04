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
    SUPPORTED_CHAIN_IDS
} from '@/lib/contract';
import { ethers } from 'ethers';
import { toast } from 'react-hot-toast';
import SupplyModal from '@/components/SupplyModal';
import BorrowModal from '@/components/BorrowModal';
import UserDashboard from '@/components/UserDashboard';

// Main application component for the Lending Pool
export default function AppPage() {
    const { isConnected, provider, address, signer, chainId, isInitializing } = useWalletContext();
    const [userData, setUserData] = useState<IUserData | null>(null);
    const [marketData, setMarketData] = useState<Token[]>(TOKENS);
    const [isLoading, setIsLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedToken, setSelectedToken] = useState<Token | null>(null);
    const [modalType, setModalType] = useState<'supply' | 'withdraw' | 'borrow' | 'repay' | null>(null);
    const [isProcessingTransaction, setIsProcessingTransaction] = useState(false);
    const [contractError, setContractError] = useState<string | null>(null);

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
        if (!provider || !address) {
            console.log('[AppPage] fetchData aborted: provider or address missing.');
            setIsLoading(false);
            return;
        }
        
        console.log(`[AppPage] State before fetching: isConnected=${isConnected}, chainId=${chainId}`);

        // Check if contract is deployed first
        const contractValid = await checkContractDeployment();
        if (!contractValid) {
            setIsLoading(false);
            return;
        }
        
        setIsLoading(true);
        try {
            const data = await getUserData(provider, address);
            setUserData(data);

            // Update market data with user-specific balances
            const updatedMarketData = TOKENS.map(token => {
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
        }
    }, [provider, address, isLoading, checkContractDeployment]);

    useEffect(() => {
        if (isConnected) {
            fetchData();
            
            // Set up interval to refresh data every 30 seconds
            const intervalId = setInterval(() => {
                fetchData();
            }, 30000);
            
            return () => clearInterval(intervalId);
        } else {
            setIsLoading(false);
            setUserData(null);
        }
    }, [isConnected, fetchData, chainId]);

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


    if (isInitializing) {
        return <div className="text-center text-white py-10">Connecting wallet...</div>;
    }

    if (!isConnected) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[calc(100vh-200px)] text-center">
                <h1 className="text-4xl font-bold text-white mb-4">Welcome to the Lending Pool</h1>
                <p className="text-xl text-gray-400">Please connect your wallet to manage your assets.</p>
            </div>
        );
    }
    
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

    if (isLoading) {
        return <div className="text-center text-white py-10">Loading your lending data...</div>;
    }

    return (
        <div className="container mx-auto p-4 md:p-8">
            <UserDashboard userData={userData} />

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-8">
                {/* Supply Section */}
                <div className="bg-gray-900/50 backdrop-blur-sm rounded-xl p-6 border border-gray-700">
                    <h2 className="text-2xl font-bold text-white mb-4">Assets to Supply</h2>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead>
                                <tr className="border-b border-gray-700">
                                    <th className="p-3 text-gray-400">Asset</th>
                                    <th className="p-3 text-gray-400 text-right">Supplied</th>
                                    <th className="p-3 text-gray-400 text-center">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {marketData.map(token => (
                                    <tr key={token.address} className="border-b border-gray-800 hover:bg-gray-800/50">
                                        <td className="p-3 flex items-center gap-3">
                                            <img src={token.logo} alt={token.name} className="w-8 h-8"/>
                                            <span className="font-bold text-white">{token.symbol}</span>
                                        </td>
                                        <td className="p-3 text-right text-white">{parseFloat(token.supplied || '0').toFixed(4)}</td>
                                        <td className="p-3 text-center space-x-2">
                                            <button 
                                                onClick={() => openModal(token, 'supply')} 
                                                className="bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-4 rounded-lg transition-colors"
                                                disabled={isProcessingTransaction}
                                            >
                                                Supply
                                            </button>
                                            <button 
                                                onClick={() => openModal(token, 'withdraw')} 
                                                className="bg-yellow-500 hover:bg-yellow-600 text-white font-bold py-2 px-4 rounded-lg transition-colors"
                                                disabled={isProcessingTransaction}
                                            >
                                                Withdraw
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Borrow Section */}
                <div className="bg-gray-900/50 backdrop-blur-sm rounded-xl p-6 border border-gray-700">
                    <h2 className="text-2xl font-bold text-white mb-4">Assets to Borrow</h2>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead>
                                <tr className="border-b border-gray-700">
                                    <th className="p-3 text-gray-400">Asset</th>
                                    <th className="p-3 text-gray-400 text-right">Borrowed</th>
                                    <th className="p-3 text-gray-400 text-center">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {marketData.map(token => (
                                    <tr key={token.address} className="border-b border-gray-800 hover:bg-gray-800/50">
                                        <td className="p-3 flex items-center gap-3">
                                            <img src={token.logo} alt={token.name} className="w-8 h-8"/>
                                            <span className="font-bold text-white">{token.symbol}</span>
                                        </td>
                                        <td className="p-3 text-right text-white">{parseFloat(token.borrowed || '0').toFixed(4)}</td>
                                        <td className="p-3 text-center space-x-2">
                                            <button 
                                                onClick={() => openModal(token, 'borrow')} 
                                                className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded-lg transition-colors"
                                                disabled={isProcessingTransaction}
                                            >
                                                Borrow
                                            </button>
                                            <button 
                                                onClick={() => openModal(token, 'repay')} 
                                                className="bg-red-500 hover:bg-red-600 text-white font-bold py-2 px-4 rounded-lg transition-colors"
                                                disabled={isProcessingTransaction}
                                            >
                                                Repay
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

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
