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
    connectionEstablished?: boolean;
};

// Persist wallet state for the current browser session so it survives page refreshes.
const WALLET_STATE_STORAGE_KEY = 'walletState';

const loadStoredState = (): GlobalWalletState => {
    if (typeof window !== 'undefined') {
        try {
            const raw = window.localStorage.getItem(WALLET_STATE_STORAGE_KEY);
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
            window.localStorage.setItem(WALLET_STATE_STORAGE_KEY, JSON.stringify(state));
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
    if (ethereum.isMetaMask) return ethereum;
    if (Array.isArray(ethereum.providers)) {
        const metamaskProvider = ethereum.providers.find((p: any) => p.isMetaMask);
        return metamaskProvider || ethereum.providers[0];
    }
    return ethereum;
};

// Wait for wallet extensions to finish injecting before proceeding.
const waitForProvider = async (timeoutMs = 3000): Promise<any | null> => {
    const existing = getEthereumProvider();
    if (existing) return existing;

    return new Promise((resolve) => {
        let settled = false;
        const finish = () => {
            if (settled) return;
            settled = true;
            resolve(getEthereumProvider());
        };

        // Check if provider already exists in window
        if (typeof window !== 'undefined') {
            // Track provider initialization with a broader approach
            const checkForProvider = () => {
                const provider = getEthereumProvider();
                if (provider) {
                    console.log('[WalletContext] Provider found during initialization check');
                    finish();
                    return true;
                }
                return false;
            };

            // Check immediately
            if (checkForProvider()) return;

            // Use MutationObserver to detect when ethereum object might be injected
            const observer = new MutationObserver(() => {
                if (checkForProvider()) {
                    observer.disconnect();
                }
            });
            
            // Observe document for changes that might indicate wallet injection
            observer.observe(document, { 
                childList: true, 
                subtree: true, 
                attributes: true,
                characterData: true 
            });

            // Listen for standard events
            window.addEventListener('ethereum#initialized', finish, { once: true });
            window.addEventListener('eip6963:announceProvider', finish, { once: true });
            
            // Also set up polling as fallback
            const pollInterval = setInterval(() => {
                if (checkForProvider()) {
                    clearInterval(pollInterval);
                }
            }, 100);

            // Clean up after timeout
            setTimeout(() => {
                observer.disconnect();
                clearInterval(pollInterval);
                finish();
            }, timeoutMs);
        } else {
            // Server-side - resolve with null
            finish();
        }
    });
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
    const initialConnectionAttemptedRef = useRef(false);
    const eventListenersSetupRef = useRef(false);
    
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
                    console.error('[WalletContext] Error adding network to wallet:', addError);
                    toast.error(`Failed to add ${networkParams.chainName} to your wallet`);
                    return false;
                }
            }
            console.error('[WalletContext] Error switching network:', switchError);
            toast.error(`Failed to switch to ${networkParams.chainName}`);
            return false;
        }
    };
    
    // Initialize ethereum provider once on mount
    useEffect(() => {
        let mounted = true;
        
        const initializeProvider = async () => {
            try {
                console.log('[WalletContext] Initializing provider...');
                const provider = await waitForProvider(5000);
                
                if (!mounted) return;
                
                if (provider) {
                    console.log('[WalletContext] Provider successfully initialized');
                    
                    // Auto-reconnect if we have stored connection
                    if (globalWalletState.isConnected && globalWalletState.address) {
                        await checkStoredConnection();
                    } else {
                        setIsInitializing(false);
                    }
                } else {
                    console.warn('[WalletContext] No provider available after waiting');
                    setIsInitializing(false);
                }
            } catch (err) {
                console.error('[WalletContext] Error initializing provider:', err);
                setIsInitializing(false);
            }
        };
        
        initializeProvider();
        
        return () => {
            mounted = false;
        };
    }, []);

    // Check stored connection (called once on init)
    const checkStoredConnection = async () => {
        if (initialConnectionAttemptedRef.current) return;
        initialConnectionAttemptedRef.current = true;
        
        console.log('[WalletContext] Checking stored wallet connection...');
        
        const ethereum = getEthereumProvider();
        if (!ethereum) {
            console.log('[WalletContext] No ethereum provider found');
            setIsInitializing(false);
            return;
        }

        try {
            // Check if we have stored connection and it's recent
            if (globalWalletState.isConnected && 
                globalWalletState.address && 
                Date.now() - globalWalletState.lastConnectedAt < 300000) { // 5 minutes
                
                // Verify the wallet is still connected
                const accounts: string[] = await ethereum.request({ method: 'eth_accounts' });
                
                if (accounts && accounts.length > 0 && 
                    accounts[0].toLowerCase() === globalWalletState.address.toLowerCase()) {
                    
                    console.log('[WalletContext] Restoring wallet connection:', accounts[0]);
                    
                    const web3Provider = new ethers.providers.Web3Provider(ethereum, 'any');
                    const network = await web3Provider.getNetwork();
                    
                    if (network.chainId !== BSC_TESTNET_CHAIN_ID) {
                        console.log(`[WalletContext] Wrong network: ${network.chainId}, requesting switch`);
                        const switched = await switchToCorrectNetwork();
                        if (!switched) {
                            setIsInitializing(false);
                            return;
                        }
                    }

                    const web3Signer = web3Provider.getSigner();
                    setProvider(web3Provider);
                    setSigner(web3Signer);
                    setAddress(accounts[0]);
                    setChainId(network.chainId);
                    setIsConnected(true);
                    setWalletStatus('connected');
                    
                    // Update global state timestamp
                    globalWalletState = {
                        ...globalWalletState,
                        lastConnectedAt: Date.now()
                    };
                    saveWalletState(globalWalletState);
                    
                    console.log('[WalletContext] Wallet connection restored successfully');
                } else {
                    console.log('[WalletContext] Stored wallet not connected anymore, clearing state');
                    disconnectWallet();
                }
            } else {
                console.log('[WalletContext] No recent stored connection found');
            }
        } catch (error) {
            console.error('[WalletContext] Error checking stored connection:', error);
            disconnectWallet();
        } finally {
            setIsInitializing(false);
        }
    };

    // Modified connectWallet to use the known provider
    const connectWallet = async () => {
        if (connectInProgressRef.current) {
            console.log('[WalletContext] connectWallet aborted: already in progress');
            return;
        }
        
        // If we're already connected, don't try to connect again
        if (isConnected && address && provider && signer) {
            console.log('[WalletContext] Wallet already connected - skipping connect attempt');
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
            console.log('[WalletContext] Connecting wallet...');

            const accounts: string[] = await baseProvider.request({ method: 'eth_requestAccounts' });
            console.log('[WalletContext] eth_requestAccounts returned:', accounts);

            if (!accounts || accounts.length === 0) {
                toast.error('No accounts found. Please unlock your wallet.');
                setWalletStatus('error');
                return;
            }

            const web3Provider = new ethers.providers.Web3Provider(baseProvider, 'any');
            const network = await web3Provider.getNetwork();

            if (network.chainId !== BSC_TESTNET_CHAIN_ID) {
                console.log(`[WalletContext] Wrong network detected: ${network.chainId}. Requesting switch to ${BSC_TESTNET_CHAIN_ID}`);
                const switched = await switchToCorrectNetwork();
                if (!switched) {
                    toast.error(`Please switch to ${networkParams.chainName} to proceed.`);
                    setWalletStatus('error');
                    return;
                }
            }

            console.log('[WalletContext] Correct network. Setting up provider...');
            const web3Signer = web3Provider.getSigner();
            setProvider(web3Provider);
            setSigner(web3Signer);
            setAddress(accounts[0]);
            setChainId(network.chainId);
            setIsConnected(true);
            setWalletStatus('connected');
            localStorage.setItem('walletConnected', 'true');
            console.log('[WalletContext] Wallet connected successfully, saved to localStorage');

            // Update global state
            globalWalletState = {
                isConnected: true,
                address: accounts[0],
                chainId: network.chainId,
                lastConnectedAt: Date.now(),
                connectionEstablished: true
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
                console.error('[WalletContext] Failed to connect wallet:', error);
                toast.error('Failed to connect wallet. Please try again.');
            }
            setWalletStatus('error');
        } finally {
            setIsInitializing(false);
            connectInProgressRef.current = false;
        }
    };

    // Stable event handlers (using refs to avoid dependency changes)
    const handleAccountsChanged = useCallback(async (accounts: string[]) => {
        console.log('[WalletContext] accountsChanged event received:', accounts);
        
        if (accounts.length === 0) {
            // Verify disconnection after a brief delay
            setTimeout(async () => {
                const ethProvider = getEthereumProvider();
                if (!ethProvider) return;
                try {
                    const currentAccounts: string[] = await ethProvider.request({ method: 'eth_accounts' });
                    if (currentAccounts.length === 0) {
                        console.log('[WalletContext] Confirmed disconnection');
                        disconnectWallet();
                    }
                } catch (err) {
                    console.warn('[WalletContext] Error verifying disconnection:', err);
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
                
                if (isInitialized) {
                    toast.success('Account changed!');
                }
            } catch (error) {
                console.error('Error handling account change:', error);
                setWalletStatus('error');
            }
        }
    }, [address, isInitialized]);

    const handleChainChanged = useCallback(async (chainIdHex: string) => {
        console.log('[WalletContext] chainChanged event received:', chainIdHex);
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
                const accounts: string[] = await baseProvider.request({ method: 'eth_accounts' });
                
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
        console.log('[WalletContext] Disconnecting wallet');
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
        
        if (isInitialized) {
            toast.success('Wallet disconnected');
        }
    }, [isInitialized]);

    // Simple ensure wallet connected that doesn't trigger loops
    const ensureWalletConnected = async (): Promise<boolean> => {
        // If already connected, return true
        if (isConnected && address && provider) {
            return true;
        }
        
        // If initializing, wait a bit and check again
        if (isInitializing) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            return Boolean(isConnected && address && provider);
        }
        
        // If not connected, don't auto-connect, just return false
        // This prevents the circular dependency issue
        return false;
    };

    // Set up wallet event listeners once
    useEffect(() => {
        if (eventListenersSetupRef.current) return;
        
        const ethProvider = getEthereumProvider();
        if (!ethProvider) return;
        
        console.log('[WalletContext] Setting up wallet event listeners');
        eventListenersSetupRef.current = true;
        
        ethProvider.on('accountsChanged', handleAccountsChanged);
        ethProvider.on('chainChanged', handleChainChanged);
        
        // Safer disconnect handler
        const handleDisconnect = async () => {
            console.log('[WalletContext] disconnect event received - verifying...');
            try {
                const accounts: string[] = await ethProvider.request({ method: 'eth_accounts' });
                if (accounts.length === 0) {
                    console.log('[WalletContext] Confirmed disconnection');
                    disconnectWallet();
                } else {
                    console.debug('[WalletContext] Ignored spurious disconnect event');
                }
            } catch (err) {
                console.warn('[WalletContext] Error verifying disconnect:', err);
            }
        };
        ethProvider.on('disconnect', handleDisconnect);

        setIsInitialized(true);

        return () => {
            console.log('[WalletContext] Removing wallet event listeners');
            if (ethProvider) {
                ethProvider.removeListener('accountsChanged', handleAccountsChanged);
                ethProvider.removeListener('chainChanged', handleChainChanged);
                ethProvider.removeListener('disconnect', handleDisconnect);
            }
            eventListenersSetupRef.current = false;
        };
    }, []); // Empty dependency array to prevent re-setup

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
