import React, { useState, useMemo } from 'react';
import { ethers } from 'ethers';
import { Token } from '@/constants/tokens';
import { IUserData } from '@/lib/contract';

interface SupplyModalProps {
    isOpen: boolean;
    onClose: () => void;
    token: Token;
    type: 'supply' | 'withdraw';
    onSubmit: (amount: string, token: Token, type: 'supply' | 'withdraw') => void;
    userData: IUserData | null;
}

const SupplyModal: React.FC<SupplyModalProps> = ({ isOpen, onClose, token, type, onSubmit, userData }) => {
    const [amount, setAmount] = useState('');

    const walletBalance = useMemo(() => {
        if (!userData || !userData.walletBalances[token.address]) return '0';
        return ethers.utils.formatUnits(userData.walletBalances[token.address], token.decimals);
    }, [userData, token]);

    const suppliedAmount = useMemo(() => {
        if (!userData || !userData.collateral[token.address]) return '0';
        return ethers.utils.formatUnits(userData.collateral[token.address], token.decimals);
    }, [userData, token]);

    if (!isOpen) return null;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSubmit(amount, token, type);
    };

    const title = type === 'supply' ? `Supply ${token.symbol}` : `Withdraw ${token.symbol}`;
    const buttonText = type === 'supply' ? 'Supply' : 'Withdraw';
    const maxAmount = type === 'supply' ? walletBalance : suppliedAmount;

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
                                {type === 'supply' ? 'Wallet Balance' : 'Supplied'}: {parseFloat(maxAmount).toFixed(4)} {token.symbol}
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
                    
                    <div className="space-y-2 text-sm mb-6">
                         <div className="flex justify-between"><span className="text-gray-400">Currently Supplying</span> <span className="text-white">{parseFloat(suppliedAmount).toFixed(4)} {token.symbol}</span></div>
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

export default SupplyModal;
