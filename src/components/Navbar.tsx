"use client";
import Link from 'next/link';
import { useWalletContext } from '@/contexts/WalletContext';

const Navbar = () => {
    const { isConnected, address, connectWallet, disconnectWallet } = useWalletContext();

    const formatAddress = (addr: string) => {
        return `${addr.substring(0, 6)}...${addr.substring(addr.length - 4)}`;
    };

    return (
        <nav className="fixed top-0 left-0 right-0 z-40 bg-gray-900/50 backdrop-blur-md border-b border-gray-800">
            <div className="container mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex items-center justify-between h-16">
                    <div className="flex items-center">
                        <Link href="/" className="flex-shrink-0 text-white text-2xl font-bold">
                           LendingPool
                        </Link>
                        <div className="hidden md:block">
                            <div className="ml-10 flex items-baseline space-x-4">
                                <Link href="/app" className="text-gray-300 hover:bg-gray-700 hover:text-white px-3 py-2 rounded-md text-sm font-medium">App</Link>
                                <Link href="/profile" className="text-gray-300 hover:bg-gray-700 hover:text-white px-3 py-2 rounded-md text-sm font-medium">Profile</Link>
                            </div>
                        </div>
                    </div>
                    <button
                        onClick={isConnected ? disconnectWallet : connectWallet}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-full transition-all duration-300 transform hover:scale-105 shadow-lg shadow-indigo-500/30"
                    >
                        {isConnected && address ? formatAddress(address) : 'Connect Wallet'}
                    </button>
                </div>
            </div>
        </nav>
    );
};

export default Navbar;
