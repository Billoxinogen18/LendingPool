import React, { useState, useMemo } from 'react';
import { ethers } from 'ethers';
import { Token } from '@/constants/tokens';
import { IUserData } from '@/lib/contract';

interface BorrowModalProps {
    isOpen: boolean;
    onClose: () => void;
    token: Token;
    type: 'borrow' | 'repay';
    onSubmit: (amount: string, token: Token, type: 'borrow' | 'repay') => void;
    userData: IUserData | null;
}

const BorrowModal: React.FC<BorrowModalProps> = ({ isOpen, onClose, token, type, onSubmit, userData }) => {
    const [amount, setAmount] = useState('');

    const maxBorrowable = useMemo(() => {
        if (!userData) return '0';
        const capacityUSD = parseFloat(ethers.utils.formatEther(userData.borrowCapacity));
        const debtUSD = parseFloat(ethers.utils.formatEther(userData.totalDebtUSD));
        const tokenPrice = parseFloat(ethers.utils.formatEther(userData.prices[token.address] || '0'));
        if(tokenPrice === 0) return '0';
        
        const availableBorrowUSD = (capacityUSD * 0.8) - debtUSD;
        return (availableBorrowUSD / tokenPrice).toFixed(6);
    }, [userData, token]);

    const borrowedAmount = useMemo(() => {
        if (!userData || !userData.debt[token.address]) return '0';
        return ethers.utils.formatUnits(userData.debt[token.address], token.decimals);
    }, [userData, token]);

    if (!isOpen) return null;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSubmit(amount, token, type);
    };

    const title = type === 'borrow' ? `Borrow ${token.symbol}` : `Repay ${token.symbol}`;
    const buttonText = type === 'borrow' ? 'Borrow' : 'Repay';
    const maxAmount = type === 'borrow' ? maxBorrowable : borrowedAmount;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex justify-center items-center z-50">
            <div className="bg-gray-800 rounded-xl p-8 w-full max-w-md border border-gray-700">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-2xl font-bold text-white">{title}</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-white">&times;</button>
                </div>
                <form onSubmit={handleSubmit}>
                    <div className="mb-4">
                        <div className="flex justify-between items-baseline mb-2">
                            <label htmlFor="amount" className="text-sm text-gray-400">Amount</label>
                             <span className="text-xs text-gray-400">
                                {type === 'borrow' ? 'Max Borrowable' : 'Borrowed'}: {parseFloat(maxAmount).toFixed(4)} {token.symbol}
                            </span>
                        </div>
                        <div className="relative">
                            <input
                                type="number"
                                id="amount"
                                value={amount}
                                onChange={(e) => setAmount(e.target.value)}
                                placeholder="0.0"
                                className="w-full bg-gray-900 border border-gray-600 rounded-lg p-3 text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                            />
                            <button type="button" onClick={() => setAmount(maxAmount)} className="absolute right-3 top-1/2 -translate-y-1/2 text-indigo-400 font-bold text-sm">MAX</button>
                        </div>
                    </div>
                    
                    {/* Display user stats */}
                    <div className="space-y-2 text-sm mb-6">
                        <div className="flex justify-between"><span className="text-gray-400">Borrow Capacity</span> <span className="text-white">${userData ? parseFloat(ethers.utils.formatEther(userData.borrowCapacity)).toFixed(2) : '0.00'}</span></div>
                        <div className="flex justify-between"><span className="text-gray-400">Total Debt</span> <span className="text-white">${userData ? parseFloat(ethers.utils.formatEther(userData.totalDebtUSD)).toFixed(2) : '0.00'}</span></div>
                        <div className="flex justify-between"><span className="text-gray-400">Health Factor</span> <span className="text-green-400">{userData ? `${(100 - userData.indebtedness).toFixed(2)}%` : '100.00%'}</span></div>
                    </div>

                    <button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-lg transition-colors">
                        {buttonText}
                    </button>
                </form>
            </div>
        </div>
    );
};

export default BorrowModal;
