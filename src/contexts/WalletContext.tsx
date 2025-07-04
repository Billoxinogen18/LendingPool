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
    ensureWalletConnected: () => Promise<boolean>;
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
    ensureWalletConnected: async () => false,
});

// Determine the chain the frontend expects – injected via NEXT_PUBLIC_CHAIN_ID
const DEFAULT_CHAIN_ID = parseInt(process.env.NEXT_PUBLIC_CHAIN_ID || '11155111');

// Backwards-compat: keep the old variable name but point it at DEFAULT_CHAIN_ID so
// existing references continue to work until we finish the refactor.
const BSC_TESTNET_CHAIN_ID = DEFAULT_CHAIN_ID;

// Limit support to the configured chain for now (extend as needed)
const SUPPORTED_CHAIN_IDS = [DEFAULT_CHAIN_ID];

const NETWORKS: Record<number, any> = {
  11155111: {
    chainIdHex: '0xaa36a7',
    chainName: 'Sepolia Testnet',
    nativeCurrency: { name: 'Sepolia ETH', symbol: 'ETH', decimals: 18 },
    rpcUrls: ['https://rpc.sepolia.org', 'https://sepolia.infura.io/v3/9cfba16e9f16482f97687dca627cb64c'],
    blockExplorerUrls: ['https://sepolia.etherscan.io']
  },
  1: {
    chainIdHex: '0x1',
    chainName: 'Ethereum Mainnet',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: ['https://cloudflare-eth.com'],
    blockExplorerUrls: ['https://etherscan.io']
  }
};

const networkParams = NETWORKS[DEFAULT_CHAIN_ID];

// Create a provider component
export const WalletProvider = ({ children }: { children: React.ReactNode }) => {
    const [provider, setProvider] = useState<ethers.providers.Web3Provider | null>(null);
    const [signer, setSigner] = useState<ethers.Signer | null>(null);
    const [address, setAddress] = useState<string | null>(null);
    const [isConnected, setIsConnected] = useState<boolean>(false);
    const [isInitialized, setIsInitialized] = useState<boolean>(false);
    const [chainId, setChainId] = useState<number | null>(null);
    const [isInitializing, setIsInitializing] = useState<boolean>(true);
    const [connectionAttempts, setConnectionAttempts] = useState<number>(0);

    const switchToCorrectNetwork = async () => {
        try {
            await (window as any).ethereum.request({
                method: 'wallet_switchEthereumChain',
                params: [{ chainId: networkParams.chainIdHex }], // dynamic chain id
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
                                chainId: networkParams.chainIdHex,
                                chainName: networkParams.chainName,
                                nativeCurrency: networkParams.nativeCurrency,
                                rpcUrls: networkParams.rpcUrls,
                                blockExplorerUrls: networkParams.blockExplorerUrls,
                            }
                        ],
                    });
                    return true;
                } catch (addError) {
                    console.error('Error adding network to wallet:', addError);
                    toast.error(`Failed to add ${networkParams.chainName} to your wallet`);
                    return false;
                }
            }
            console.error('Error switching network:', switchError);
            toast.error(`Failed to switch to ${networkParams.chainName}`);
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
            toast.error(`Please switch to ${networkParams.chainName}`);
            await switchToCorrectNetwork();
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
                    const switched = await switchToCorrectNetwork();
                    if (!switched) {
                        toast.error(`Please switch to ${networkParams.chainName} to proceed.`);
                        setIsInitializing(false);
                        return;
                    }
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

    // Helper function to ensure wallet is connected
    const ensureWalletConnected = async (): Promise<boolean> => {
        if (isConnected && provider && address) {
            return true;
        }
        
        // If we're already initializing, wait for it to complete
        if (isInitializing) {
            return new Promise((resolve) => {
                const checkInterval = setInterval(() => {
                    if (!isInitializing) {
                        clearInterval(checkInterval);
                        resolve(isConnected);
                    }
                }, 500);
            });
        }
        
        // Only try to auto-connect if we haven't exceeded attempts
        if (connectionAttempts < 2) {
            setConnectionAttempts(prev => prev + 1);
            await connectWallet();
            return isConnected;
        }
        
        return false;
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
                            const switched = await switchToCorrectNetwork();
                            if (!switched) {
                                 setIsInitializing(false);
                                 return;
                            }
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
            isInitializing,
            ensureWalletConnected
        }}>
            {children}
        </WalletContext.Provider>
    );
};

// Custom hook to use the wallet context
export const useWalletContext = () => {
    return useContext(WalletContext);
};
