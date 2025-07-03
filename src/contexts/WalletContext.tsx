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
                setIsInitializing(true);
                const ethereum = (window as any).ethereum;
                console.log('Connecting wallet...');

                const accounts: string[] = await ethereum.request({ method: 'eth_requestAccounts' });
                console.log('eth_requestAccounts returned:', accounts);

                if (accounts.length === 0) {
                    toast.error('No accounts found. Please unlock your wallet.');
                    setIsInitializing(false);
                    return;
                }

                const web3Provider = new ethers.providers.Web3Provider(ethereum, 'any');
                const network = await web3Provider.getNetwork();

                if (network.chainId !== BSC_TESTNET_CHAIN_ID) {
                    console.log(`Wrong network detected: ${network.chainId}. Requesting switch to ${BSC_TESTNET_CHAIN_ID}`);
                    const switched = await switchToBSCNetwork();
                    if (!switched) {
                        toast.error('Please switch to BSC Testnet to proceed.');
                        setIsInitializing(false);
                        return;
                    }
                    // The chainChanged event handler will now correctly take over
                    localStorage.setItem('walletConnected', 'true');
                    // We don't need to set the rest of the state, the event handler will.
                    // Set isInitializing to false after a brief delay to allow event to propagate
                    setTimeout(() => setIsInitializing(false), 1000);
                    return;
                }
                
                console.log('Correct network. Setting up provider...');
                const web3Signer = web3Provider.getSigner();
                setProvider(web3Provider);
                setSigner(web3Signer);
                setAddress(accounts[0]);
                setChainId(network.chainId);
                setIsConnected(true);
                localStorage.setItem('walletConnected', 'true');
                console.log('Wallet connected successfully, saved to localStorage');
                
                if (isInitialized) {
                    toast.success('Wallet connected!');
                }

            } catch (error) {
                console.error("Failed to connect wallet:", error);
                toast.error("Failed to connect wallet. Please try again.");
            } finally {
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
            if (ethereum && localStorage.getItem('walletConnected') === 'true') {
                try {
                    const web3Provider = new ethers.providers.Web3Provider(ethereum, 'any');
                    const accounts: string[] = await ethereum.request({ method: 'eth_accounts' });

                    if (accounts && accounts.length > 0) {
                        console.log('Account found:', accounts[0]);
                        const network = await web3Provider.getNetwork();
                        
                        if (network.chainId !== BSC_TESTNET_CHAIN_ID) {
                            console.log(`Wrong network detected: ${network.chainId}. Requesting switch to ${BSC_TESTNET_CHAIN_ID}`);
                            const switched = await switchToBSCNetwork();
                            if (!switched) {
                                 setIsInitializing(false);
                            }
                            // Let the 'chainChanged' event handler manage state updates.
                            return;
                        }

                        console.log('Correct network. Setting up provider for auto-reconnect...');
                        const web3Signer = web3Provider.getSigner();
                        setProvider(web3Provider);
                        setSigner(web3Signer);
                        setAddress(accounts[0]);
                        setChainId(network.chainId);
                        setIsConnected(true);
                        console.log('Reconnected successfully to:', accounts[0]);

                    } else {
                        console.log('No accounts found authorized, clearing stored connection state.');
                        localStorage.removeItem('walletConnected');
                    }
                } catch (error) {
                    console.error("Failed to auto-reconnect wallet:", error);
                    localStorage.removeItem('walletConnected');
                }
            } else {
                console.log('No ethereum provider or not previously connected.');
            }
            setIsInitializing(false);
        };
        
        // Setup listeners first
        if ((window as any).ethereum) {
            (window as any).ethereum.on('accountsChanged', handleAccountsChanged);
            (window as any).ethereum.on('chainChanged', handleChainChanged);
            (window as any).ethereum.on('disconnect', disconnectWallet);
        }

        checkConnection();
        setIsInitialized(true);

        return () => {
            if ((window as any).ethereum) {
                (window as any).ethereum.removeListener('accountsChanged', handleAccountsChanged);
                (window as any).ethereum.removeListener('chainChanged', handleChainChanged);
                (window as any).ethereum.removeListener('disconnect', disconnectWallet);
            }
        };
    }, [handleAccountsChanged, handleChainChanged, disconnectWallet]);

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
