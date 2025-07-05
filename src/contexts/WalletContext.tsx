"use client";

import React, { createContext, useState, useEffect, useContext, useCallback, useRef } from 'react';
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
    walletStatus: 'connected' | 'disconnected' | 'connecting' | 'error';
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
    walletStatus: 'disconnected',
});

// Create a global state object outside the component to persist across page navigation
type GlobalWalletState = {
    isConnected: boolean;
    address: string | null;
    chainId: number | null;
    lastConnectedAt: number;
};

// Persist wallet state for the current browser session so it survives page refreshes.
const WALLET_STATE_STORAGE_KEY = 'walletState';

const loadStoredState = (): GlobalWalletState => {
    if (typeof window !== 'undefined') {
        try {
            const raw = window.sessionStorage.getItem(WALLET_STATE_STORAGE_KEY);
            if (raw) {
                return JSON.parse(raw) as GlobalWalletState;
            }
        } catch (err) {
            console.warn('[WalletContext] Failed to parse stored wallet state', err);
        }
    }
    return {
        isConnected: false,
        address: null,
        chainId: null,
        lastConnectedAt: 0,
    };
};

const saveWalletState = (state: GlobalWalletState) => {
    if (typeof window !== 'undefined') {
        try {
            window.sessionStorage.setItem(WALLET_STATE_STORAGE_KEY, JSON.stringify(state));
        } catch (err) {
            console.warn('[WalletContext] Failed to save wallet state', err);
        }
    }
};

// Global state that persists between page navigations (and refreshed from storage)
let globalWalletState: GlobalWalletState = loadStoredState();

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

// Select the Ethereum provider we actually want to use (MetaMask).
const getEthereumProvider = (): any | null => {
    if (typeof window === 'undefined') return null;
    const winAny = window as any;
    const { ethereum } = winAny;
    if (!ethereum) return null;
    // If multiple providers injected, find MetaMask specifically.
    if (ethereum.isMetaMask) return ethereum;
    if (Array.isArray(ethereum.providers)) {
        const metamaskProvider = ethereum.providers.find((p: any) => p.isMetaMask);
        if (metamaskProvider) return metamaskProvider;
        // Fall back to first provider.
        return ethereum.providers[0];
    }
    return ethereum;
};

// Create a provider component
export const WalletProvider = ({ children }: { children: React.ReactNode }) => {
    const [provider, setProvider] = useState<ethers.providers.Web3Provider | null>(null);
    const [signer, setSigner] = useState<ethers.Signer | null>(null);
    const [address, setAddress] = useState<string | null>(globalWalletState.address);
    const [isConnected, setIsConnected] = useState<boolean>(globalWalletState.isConnected);
    const [isInitialized, setIsInitialized] = useState<boolean>(false);
    const [chainId, setChainId] = useState<number | null>(globalWalletState.chainId);
    const [isInitializing, setIsInitializing] = useState<boolean>(true);
    const [connectionAttempts, setConnectionAttempts] = useState<number>(0);
    const [walletStatus, setWalletStatus] = useState<'connected' | 'disconnected' | 'connecting' | 'error'>(
        globalWalletState.isConnected ? 'connected' : 'disconnected'
    );

    // Ref to prevent overlapping connect attempts
    const connectInProgressRef = useRef(false);

    // Update global state whenever local state changes
    useEffect(() => {
        if (isConnected && address) {
            globalWalletState = {
                isConnected,
                address,
                chainId,
                lastConnectedAt: Date.now()
            };
            saveWalletState(globalWalletState);
        }
    }, [isConnected, address, chainId]);

    const switchToCorrectNetwork = async () => {
        const ethProvider = getEthereumProvider();
        if (!ethProvider) return false;
        try {
            await ethProvider.request({
                method: 'wallet_switchEthereumChain',
                params: [{ chainId: networkParams.chainIdHex }], // dynamic chain id
            });
            return true;
        } catch (switchError: any) {
            // This error code indicates that the chain has not been added to MetaMask
            if (switchError.code === 4902) {
                try {
                    await ethProvider.request({
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
            // Some providers briefly emit an empty array; verify before disconnecting
            console.log('[WalletContext] accountsChanged => [] (verifying)');
            setTimeout(async () => {
                const ethProvInner = getEthereumProvider();
                if (!ethProvInner) return;
                const currentAccounts: string[] = await ethProvInner.request({ method: 'eth_accounts' });
                if (currentAccounts.length === 0) {
                    disconnectWallet();
                }
            }, 500);
        } else if (accounts[0] !== address) {
            try {
                const baseProvider = getEthereumProvider();
                if (!baseProvider) return;
                const web3Provider = new ethers.providers.Web3Provider(baseProvider, 'any');
                const web3Signer = web3Provider.getSigner();
                const network = await web3Provider.getNetwork();
                
                setProvider(web3Provider);
                setSigner(web3Signer);
                setAddress(accounts[0]);
                setChainId(network.chainId);
                setIsConnected(true);
                setWalletStatus('connected');
                localStorage.setItem('walletConnected', 'true');
                
                // Update global state
                globalWalletState = {
                    isConnected: true,
                    address: accounts[0],
                    chainId: network.chainId,
                    lastConnectedAt: Date.now()
                };
                saveWalletState(globalWalletState);
                
                // Only show toast if this is not the initial connection
                if (isInitialized && address !== null) {
                    toast.success('Account changed!');
                }
            } catch (error) {
                console.error('Error handling account change:', error);
                setWalletStatus('error');
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
                const baseProvider = getEthereumProvider();
                if (!baseProvider) return;
                const web3Provider = new ethers.providers.Web3Provider(baseProvider, 'any');
                const accounts: string[] = await (web3Provider.provider as any).request({ method: 'eth_accounts' });
                
                if (accounts.length > 0) {
                    const web3Signer = web3Provider.getSigner();
                    setProvider(web3Provider);
                    setSigner(web3Signer);
                    setAddress(accounts[0]);
                    setIsConnected(true);
                    setWalletStatus('connected');
                    
                    // Update global state
                    globalWalletState = {
                        isConnected: true,
                        address: accounts[0],
                        chainId: newChainId,
                        lastConnectedAt: Date.now()
                    };
                    saveWalletState(globalWalletState);
                }
            } catch (error) {
                console.error('Error refreshing provider after chain change:', error);
                setWalletStatus('error');
            }
        }
    }, []);

    const disconnectWallet = useCallback(() => {
        setProvider(null);
        setSigner(null);
        setAddress(null);
        setIsConnected(false);
        setChainId(null);
        setWalletStatus('disconnected');
        localStorage.removeItem('walletConnected');
        
        // Reset global state
        globalWalletState = {
            isConnected: false,
            address: null,
            chainId: null,
            lastConnectedAt: 0
        };
        saveWalletState(globalWalletState);
        
        // Only show toast if this is not the initial disconnection
        if (isInitialized && isConnected) {
            toast.success('Wallet disconnected');
        }
    }, [isConnected, isInitialized]);

    const connectWallet = async () => {
        if (connectInProgressRef.current) {
            console.log('[WalletContext] connectWallet aborted: already in progress');
            return;
        }
        connectInProgressRef.current = true;

        try {
            const baseProvider = getEthereumProvider();
            if (!baseProvider) {
                toast.error('No Ethereum provider (MetaMask) detected.');
                setWalletStatus('error');
                return;
            }

            setIsInitializing(true);
            setWalletStatus('connecting');
            console.log('Connecting wallet...');

            const accounts: string[] = await baseProvider.request({ method: 'eth_requestAccounts' });
            console.log('eth_requestAccounts returned:', accounts);

            if (!accounts || accounts.length === 0) {
                toast.error('No accounts found. Please unlock your wallet.');
                setWalletStatus('error');
                return;
            }

            const web3Provider = new ethers.providers.Web3Provider(baseProvider, 'any');
            const network = await web3Provider.getNetwork();

            if (network.chainId !== BSC_TESTNET_CHAIN_ID) {
                console.log(`Wrong network detected: ${network.chainId}. Requesting switch to ${BSC_TESTNET_CHAIN_ID}`);
                const switched = await switchToCorrectNetwork();
                if (!switched) {
                    toast.error(`Please switch to ${networkParams.chainName} to proceed.`);
                    setWalletStatus('error');
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
            setWalletStatus('connected');
            localStorage.setItem('walletConnected', 'true');
            console.log('Wallet connected successfully, saved to localStorage');

            // Update global state
            globalWalletState = {
                isConnected: true,
                address: accounts[0],
                chainId: network.chainId,
                lastConnectedAt: Date.now()
            };
            saveWalletState(globalWalletState);

            if (isInitialized) {
                toast.success('Wallet connected!');
            }
        } catch (error: any) {
            if (error?.code === 4001) {
                // User rejected request
                toast.error('Connection request rejected.');
            } else {
                console.error('Failed to connect wallet:', error);
                toast.error('Failed to connect wallet. Please try again.');
            }
            setWalletStatus('error');
        } finally {
            setIsInitializing(false);
            connectInProgressRef.current = false;
        }
    };

    // Helper function to ensure wallet is connected
    const ensureWalletConnected = async (): Promise<boolean> => {
        // If we have a recent connection in global state, use that first
        if (globalWalletState.isConnected && 
            globalWalletState.address && 
            Date.now() - globalWalletState.lastConnectedAt < 60000) { // Within last minute
            
            if (!isConnected) {
                setIsConnected(true);
                setAddress(globalWalletState.address);
                setChainId(globalWalletState.chainId);
                setWalletStatus('connected');
                
                // Still need to set up provider and signer
                const baseProviderConnect = getEthereumProvider();
                if (baseProviderConnect) {
                    try {
                        setIsInitializing(true);
                        setWalletStatus('connecting');
                        const ethereum = baseProviderConnect;
                        const web3Provider = new ethers.providers.Web3Provider(ethereum, 'any');
                        const web3Signer = web3Provider.getSigner();
                        setProvider(web3Provider);
                        setSigner(web3Signer);
                    } catch (error) {
                        console.error('Error setting up provider for auto-connect:', error);
                        setWalletStatus('error');
                        return false;
                    }
                }
            }
            return true;
        }
        
        // If already connected (address present) ensure provider is ready
        if (isConnected && address) {
            if (!provider) {
                const ethereum = getEthereumProvider();
                if (ethereum) {
                    const web3Provider = new ethers.providers.Web3Provider(ethereum, 'any');
                    const web3Signer = web3Provider.getSigner();
                    setProvider(web3Provider);
                    setSigner(web3Signer);
                }
            }
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
            
            // First check global state for recent connection
            if (globalWalletState.isConnected && 
                globalWalletState.address && 
                Date.now() - globalWalletState.lastConnectedAt < 60000) { // Within last minute
                
                console.log('Using recent global connection state');
                setIsConnected(true);
                setAddress(globalWalletState.address);
                setChainId(globalWalletState.chainId);
                setWalletStatus('connected');
                
                // Still need to set up provider and signer
                const baseProviderConnect = getEthereumProvider();
                if (baseProviderConnect) {
                    try {
                        setIsInitializing(true);
                        setWalletStatus('connecting');
                        const ethereum = baseProviderConnect;
                        const web3Provider = new ethers.providers.Web3Provider(ethereum, 'any');
                        const web3Signer = web3Provider.getSigner();
                        setProvider(web3Provider);
                        setSigner(web3Signer);
                        setIsInitializing(false);
                        return;
                    } catch (error) {
                        console.error('Error setting up provider for auto-connect:', error);
                        setWalletStatus('error');
                        return;
                    }
                }
            }
            
            // Otherwise check localStorage and wallet
            const ethereum = getEthereumProvider();
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
                                 setWalletStatus('error');
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
                        setWalletStatus('connected');
                        console.log('Reconnected successfully to:', accounts[0]);
                        
                        // Update global state
                        globalWalletState = {
                            isConnected: true,
                            address: accounts[0],
                            chainId: network.chainId,
                            lastConnectedAt: Date.now()
                        };
                        saveWalletState(globalWalletState);

                    } else {
                        console.log('No accounts found authorized, clearing stored connection state.');
                        localStorage.removeItem('walletConnected');
                        setWalletStatus('disconnected');
                    }
                } catch (error) {
                    console.error("Failed to auto-reconnect wallet:", error);
                    localStorage.removeItem('walletConnected');
                    setWalletStatus('error');
                }
            } else {
                console.log('No ethereum provider or not previously connected.');
                setWalletStatus('disconnected');
            }
            setIsInitializing(false);
        };
        
        let safeDisconnect: (() => Promise<void>) | undefined;
        const ethProviderGlobal = getEthereumProvider();
        if (ethProviderGlobal) {
            const ethProvider = ethProviderGlobal;
            ethProvider.on('accountsChanged', handleAccountsChanged);
            ethProvider.on('chainChanged', handleChainChanged);
            // Some providers (e.g., TronLink) emit spurious "disconnect" events. Verify truly disconnected.
            safeDisconnect = async () => {
                try {
                    const accounts: string[] = await ethProvider.request({ method: 'eth_accounts' });
                    if (accounts.length === 0) {
                        disconnectWallet();
                    } else {
                        console.debug('[WalletContext] Ignored spurious disconnect event – accounts still present');
                    }
                } catch (err) {
                    console.warn('[WalletContext] Error verifying disconnect event', err);
                }
            };
            ethProvider.on('disconnect', safeDisconnect);
        }

        checkConnection();
        setIsInitialized(true);

        return () => {
            if (ethProviderGlobal) {
                const ethProviderCleanup = getEthereumProvider();
                if (ethProviderCleanup) {
                    const ethProvider = ethProviderCleanup;
                    ethProvider.removeListener('accountsChanged', handleAccountsChanged);
                    ethProvider.removeListener('chainChanged', handleChainChanged);
                    if (safeDisconnect) {
                        ethProvider.removeListener('disconnect', safeDisconnect);
                    }
                }
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
            ensureWalletConnected,
            walletStatus
        }}>
            {children}
        </WalletContext.Provider>
    );
};

// Custom hook to use the wallet context
export const useWalletContext = () => {
    return useContext(WalletContext);
};
