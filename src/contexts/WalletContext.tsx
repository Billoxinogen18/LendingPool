"use client";

import React, { createContext, useState, useEffect, useContext, useCallback } from 'react';
import { ethers } from 'ethers';
import { toast } from 'react-hot-toast';

// Define the shape of the context state
interface IWalletContext {
    provider: ethers.providers.Web3Provider | null;
    signer: ethers.Signer | null;
    address: string | null;
    isConnected: boolean;
    connectWallet: () => Promise<void>;
    disconnectWallet: () => void;
    chainId: number | null;
    isInitializing: boolean;
}

// Create the context with a default value
const WalletContext = createContext<IWalletContext>({
    provider: null,
    signer: null,
    address: null,
    isConnected: false,
    connectWallet: async () => {},
    disconnectWallet: () => {},
    chainId: null,
    isInitializing: true,
});

// Preferred default: BSC Testnet (chain id 97)
const BSC_TESTNET_CHAIN_ID = 97;

// At top after BSC_TESTNET_CHAIN_ID define SUPPORTED_CHAIN_IDS
const SUPPORTED_CHAIN_IDS = [56, 97];

// Create a provider component
export const WalletProvider = ({ children }: { children: React.ReactNode }) => {
    const [provider, setProvider] = useState<ethers.providers.Web3Provider | null>(null);
    const [signer, setSigner] = useState<ethers.Signer | null>(null);
    const [address, setAddress] = useState<string | null>(null);
    const [isConnected, setIsConnected] = useState<boolean>(false);
    const [isInitialized, setIsInitialized] = useState<boolean>(false);
    const [chainId, setChainId] = useState<number | null>(null);
    const [isInitializing, setIsInitializing] = useState<boolean>(true);

    const switchToBSCNetwork = async () => {
        try {
            await (window as any).ethereum.request({
                method: 'wallet_switchEthereumChain',
                params: [{ chainId: '0x61' }], // BSC Testnet Chain ID in hex
            });
            return true;
        } catch (switchError: any) {
            // This error code indicates that the chain has not been added to MetaMask
            if (switchError.code === 4902) {
                try {
                    await (window as any).ethereum.request({
                        method: 'wallet_addEthereumChain',
                        params: [
                            {
                                chainId: '0x61',
                                chainName: 'Binance Smart Chain Testnet',
                                nativeCurrency: {
                                    name: 'BNB',
                                    symbol: 'BNB',
                                    decimals: 18
                                },
                                rpcUrls: ['https://data-seed-prebsc-1-s1.binance.org:8545/'],
                                blockExplorerUrls: ['https://testnet.bscscan.com']
                            }
                        ],
                    });
                    return true;
                } catch (addError) {
                    console.error('Error adding BSC network:', addError);
                    toast.error('Failed to add BSC network to your wallet');
                    return false;
                }
            }
            console.error('Error switching to BSC network:', switchError);
            toast.error('Failed to switch to BSC network');
            return false;
        }
    };

    const handleAccountsChanged = useCallback(async (accounts: string[]) => {
        if (accounts.length === 0) {
            // MetaMask is locked or the user has disconnected all accounts
            console.log('Please connect to MetaMask.');
            disconnectWallet();
        } else if (accounts[0] !== address) {
            try {
                const web3Provider = new ethers.providers.Web3Provider((window as any).ethereum, 'any');
                const web3Signer = web3Provider.getSigner();
                const network = await web3Provider.getNetwork();
                
                setProvider(web3Provider);
                setSigner(web3Signer);
                setAddress(accounts[0]);
                setChainId(network.chainId);
                setIsConnected(true);
                localStorage.setItem('walletConnected', 'true');
                
                // Only show toast if this is not the initial connection
                if (isInitialized && address !== null) {
                    toast.success('Account changed!');
                }
            } catch (error) {
                console.error('Error handling account change:', error);
            }
        }
    }, [address, isInitialized]);

    const handleChainChanged = useCallback(async (chainIdHex: string) => {
        const newChainId = parseInt(chainIdHex, 16);
        setChainId(newChainId);
        
        if (newChainId !== BSC_TESTNET_CHAIN_ID) {
            toast.error('Please switch to BSC Testnet');
            await switchToBSCNetwork();
        } else {
            // Refresh provider and signer with new chain
            try {
                const web3Provider = new ethers.providers.Web3Provider((window as any).ethereum, 'any');
                const accounts: string[] = await (web3Provider.provider as any).request({ method: 'eth_accounts' });
                
                if (accounts.length > 0) {
                    const web3Signer = web3Provider.getSigner();
                    setProvider(web3Provider);
                    setSigner(web3Signer);
                    setAddress(accounts[0]);
                    setIsConnected(true);
                }
            } catch (error) {
                console.error('Error refreshing provider after chain change:', error);
            }
        }
    }, []);

    const disconnectWallet = useCallback(() => {
        setProvider(null);
        setSigner(null);
        setAddress(null);
        setIsConnected(false);
        setChainId(null);
        localStorage.removeItem('walletConnected');
        
        // Only show toast if this is not the initial disconnection
        if (isInitialized && isConnected) {
            toast.success('Wallet disconnected');
        }
    }, [isConnected, isInitialized]);

    const connectWallet = async () => {
        if (typeof (window as any).ethereum !== 'undefined') {
            try {
                const ethereum = (window as any).ethereum;
                console.log('Connecting wallet...');
                
                // Request account access directly from ethereum provider
                const accounts: string[] = await ethereum.request({ method: 'eth_requestAccounts' });
                console.log('eth_requestAccounts returned:', accounts);
                
                if (accounts.length === 0) {
                    toast.error('No accounts found. Please unlock your wallet.');
                    return;
                }
                
                // Now create provider with authorized accounts
                const web3Provider = new ethers.providers.Web3Provider(ethereum, 'any');
                const currentNetwork = await web3Provider.getNetwork();
                if (currentNetwork.chainId !== BSC_TESTNET_CHAIN_ID) {
                    const networkSwitched = await switchToBSCNetwork();
                    if (!networkSwitched) {
                        return;
                    }
                }
                
                const web3Signer = web3Provider.getSigner();
                const userAddress = await web3Signer.getAddress();
                const network = await web3Provider.getNetwork();

                setProvider(web3Provider);
                setSigner(web3Signer);
                setAddress(userAddress);
                setChainId(network.chainId);
                setIsConnected(true);
                localStorage.setItem('walletConnected', 'true');
                console.log('Wallet connected successfully, saved to localStorage');
                
                // Only show toast if this is not the initial connection
                if (isInitialized) {
                    toast.success('Wallet connected!');
                }

                setIsInitializing(false);

            } catch (error) {
                console.error("Failed to connect wallet:", error);
                toast.error("Failed to connect wallet. Please try again.");
                setIsInitializing(false);
            }
        } else {
            toast.error('MetaMask is not installed. Please install it to use this app.');
        }
    };

    // Effect to check if wallet is already connected on page load
    useEffect(() => {
        const checkConnection = async () => {
            console.log('Checking wallet connection...');
            const ethereum = (window as any).ethereum;
            const walletConnected = localStorage.getItem('walletConnected');
            console.log('localStorage walletConnected:', walletConnected);
            if (ethereum && localStorage.getItem('walletConnected') === 'true') {
                try {
                    console.log('Attempting auto-reconnect...');
                    const web3Provider = new ethers.providers.Web3Provider(ethereum, 'any');
                    // Use eth_accounts to get currently connected accounts without prompting
                    const accounts: string[] = await (ethereum.request({ method: 'eth_accounts' }) as Promise<string[]>);
                    console.log('eth_accounts returned:', accounts);
                    
                    if (accounts && accounts.length > 0) {
                        console.log('Account found, reconnecting:', accounts[0]);
                        const web3Signer = web3Provider.getSigner();
                        const userAddress = accounts[0];
                        const network = await web3Provider.getNetwork();
                        
                        setProvider(web3Provider);
                        setSigner(web3Signer);
                        setAddress(userAddress);
                        setChainId(network.chainId);
                        setIsConnected(true);
                        console.log('Reconnected successfully to:', userAddress);
                        
                        // Check if we're on the right network
                        if (network.chainId !== BSC_TESTNET_CHAIN_ID) {
                            toast.error('Please switch to BSC Testnet');
                            await switchToBSCNetwork();
                        }
                    } else {
                        console.log('No accounts found despite localStorage flag');
                        localStorage.removeItem('walletConnected');
                    }
                } catch (error) {
                    console.error("Failed to reconnect wallet:", error);
                    localStorage.removeItem('walletConnected');
                }
            } else {
                console.log('No localStorage connection or no ethereum provider');
                if (!ethereum) console.log('Ethereum provider not found');
            }
            
            setIsInitialized(true);
            setIsInitializing(false);
        };
        
        checkConnection();
    }, []);

    // Effect to handle wallet events
    useEffect(() => {
        const ethereum = (window as any).ethereum;
        if (ethereum && isInitialized) {
            ethereum.on('accountsChanged', handleAccountsChanged);
            ethereum.on('chainChanged', handleChainChanged);
            ethereum.on('disconnect', disconnectWallet);

            // Cleanup function
            return () => {
                ethereum.removeListener('accountsChanged', handleAccountsChanged);
                ethereum.removeListener('chainChanged', handleChainChanged);
                ethereum.removeListener('disconnect', disconnectWallet);
            };
        }
    }, [handleAccountsChanged, handleChainChanged, disconnectWallet, isInitialized]);


    return (
        <WalletContext.Provider value={{ 
            provider, 
            signer, 
            address, 
            isConnected, 
            connectWallet, 
            disconnectWallet,
            chainId,
            isInitializing
        }}>
            {children}
        </WalletContext.Provider>
    );
};

// Custom hook to use the wallet context
export const useWalletContext = () => {
    return useContext(WalletContext);
};
