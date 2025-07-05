"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { useWalletContext } from '@/contexts/WalletContext';
import { TOKENS, Token } from '@/constants/tokens';
import { getUserData, IUserData, verifyContractExists, SUPPORTED_CHAIN_IDS } from '@/lib/contract';
import { ethers } from 'ethers';
import { toast } from 'react-hot-toast';
import UserDashboard from '@/components/UserDashboard';

// Profile page to display a detailed view of the user's assets
export default function ProfilePage() {
    const { isConnected, provider, address, chainId, isInitializing, connectWallet } = useWalletContext();
    const [userData, setUserData] = useState<IUserData | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [contractError, setContractError] = useState<string | null>(null);
    const [dataFetchInProgress, setDataFetchInProgress] = useState(false);

    // Function to check if the contract is deployed
    const checkContractDeployment = useCallback(async () => {
        console.log('[ProfilePage] checkContractDeployment triggered.');
        if (!provider) {
             console.log('[ProfilePage] checkContractDeployment aborted: no provider.');
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

    const fetchData = useCallback(async () => {
        console.log('[ProfilePage] fetchData triggered.');
        
        // Only fetch if we have required wallet state
        if (!isConnected || !provider || !address) {
            console.log('[ProfilePage] fetchData aborted: wallet not ready.');
            setIsLoading(false);
            return;
        }
        
        console.log(`[ProfilePage] State before fetching: isConnected=${isConnected}, chainId=${chainId}`);
        
        // Prevent multiple simultaneous fetches
        if (dataFetchInProgress) {
            console.log('[ProfilePage] A data fetch is already in progress, skipping.');
            return;
        }
        
        setDataFetchInProgress(true);
        setIsLoading(true);
        
        // Check if contract is deployed first
        const contractValid = await checkContractDeployment();
        if (!contractValid) {
            setIsLoading(false);
            setDataFetchInProgress(false);
            return;
        }
        
        try {
            // Add a small delay to ensure provider is fully initialized
            await new Promise(resolve => setTimeout(resolve, 500));
            
            // Log provider state to help debug
            console.log('[ProfilePage] Provider ready:', !!provider);
            console.log('[ProfilePage] Provider type:', provider ? provider.constructor.name : 'null');
            console.log('[ProfilePage] Address:', address);
            
            // Make sure we have a valid provider before proceeding
            if (!provider._isProvider) {
                console.error('[ProfilePage] Provider is not valid');
                setIsLoading(false);
                setDataFetchInProgress(false);
                return;
            }
            
            const data = await getUserData(provider, address);
            setUserData(data);
        } catch (error) {
            console.error("[ProfilePage] Error fetching user data:", error);
            toast.error("Could not fetch your data from the network.");
        } finally {
            setIsLoading(false);
            setDataFetchInProgress(false);
        }
    }, [provider, address, isConnected, chainId]); // Simplified dependencies

    useEffect(() => {
        // Clear data if wallet disconnected
        if (!isConnected || !address) {
            setUserData(null);
            setIsLoading(false);
            return;
        }

        // Skip if still initializing
        if (isInitializing) {
            return;
        }

        // Fetch data when wallet is ready
        if (isConnected && provider && address && !dataFetchInProgress) {
            fetchData();
            
            // Set up interval to refresh data every 60 seconds
            const intervalId = setInterval(() => {
                if (isConnected && !dataFetchInProgress) {
                    fetchData();
                }
            }, 60000);
            
            return () => clearInterval(intervalId);
        }
    }, [isConnected, provider, address, isInitializing]); // Simplified dependencies

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
                <h1 className="text-4xl font-bold text-white mb-4">My Profile</h1>
                <p className="text-xl text-gray-400 mb-6">Connect your wallet to view your detailed positions.</p>
                <button 
                    onClick={connectWallet}
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
                <p className="text-white text-lg">Loading your profile...</p>
            </div>
        );
    }

    if (!userData) {
        return <div className="text-center text-white p-10">Could not load your data. Please try again later.</div>
    }

    const renderAssetTable = (title: string, assets: { [key: string]: ethers.BigNumber }) => {
        const hasAssets = Object.values(assets).some(amount => amount.gt(0));

        return (
            <div className="bg-gray-900/50 backdrop-blur-sm rounded-xl p-6 border border-gray-700">
                <h3 className="text-2xl font-bold text-white mb-4">{title}</h3>
                {hasAssets ? (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead>
                                <tr className="border-b border-gray-700">
                                    <th className="p-3 text-gray-400">Asset</th>
                                    <th className="p-3 text-gray-400 text-right">Amount</th>
                                    <th className="p-3 text-gray-400 text-right">Value (USD)</th>
                                </tr>
                            </thead>
                            <tbody>
                                {TOKENS.map(token => {
                                    const amount = assets[token.address];
                                    if (!amount || amount.isZero()) return null;
                                    const price = userData.prices[token.address] || ethers.BigNumber.from(0);
                                    const value = amount.mul(price).div(ethers.utils.parseEther('1'));

                                    return (
                                        <tr key={token.address} className="border-b border-gray-800">
                                            <td className="p-3 flex items-center gap-3">
                                                <img src={token.logo} alt={token.name} className="w-8 h-8"/>
                                                <span className="font-bold text-white">{token.symbol}</span>
                                            </td>
                                            <td className="p-3 text-right text-white">{ethers.utils.formatUnits(amount, token.decimals)}</td>
                                            <td className="p-3 text-right text-white">${ethers.utils.formatEther(value)}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <p className="text-gray-400">You have no {title.toLowerCase()}.</p>
                )}
            </div>
        );
    };

    return (
        <div className="container mx-auto p-4 md:p-8">
            <UserDashboard userData={userData} />

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-8">
                {renderAssetTable("Supplied Assets", userData.collateral)}
                {renderAssetTable("Borrowed Assets", userData.debt)}
            </div>
        </div>
    );
}
