import React from 'react';
import { IUserData } from '@/lib/contract';
import { ethers } from 'ethers';
import { TOKENS } from '@/constants/tokens';

interface UserDashboardProps {
    userData: IUserData | null;
    isLoading?: boolean;
}

const StatCard = ({ label, value, className = '', subtext = '' }: { label: string, value: string, className?: string, subtext?: string }) => (
    <div className={`bg-gray-800/70 p-6 rounded-xl border border-gray-700 ${className}`}>
        <p className="text-gray-400 text-sm mb-2">{label}</p>
        <p className="text-2xl lg:text-3xl font-bold text-white">{value}</p>
        {subtext && <p className="text-gray-400 text-xs mt-2">{subtext}</p>}
    </div>
);

const LoadingStatCard = ({ label }: { label: string }) => (
    <div className="bg-gray-800/70 p-6 rounded-xl border border-gray-700">
        <p className="text-gray-400 text-sm mb-2">{label}</p>
        <div className="h-8 bg-gray-700/50 rounded animate-pulse"></div>
    </div>
);

const UserDashboard = ({ userData, isLoading = false }: UserDashboardProps) => {
    // Format USD values for display
    const formatUSD = (value: ethers.BigNumber | undefined): string => {
        if (!value) return '$0.00';
        try {
            const formatted = ethers.utils.formatEther(value);
            return `$${parseFloat(formatted).toFixed(2)}`;
        } catch (e) {
            return '$0.00';
        }
    };

    // Format percentage values
    const formatPercentage = (value: number | undefined): string => {
        if (value === undefined) return '0%';
        return `${value}%`;
    };

    // Calculate health factor
    const calculateHealthFactor = (indebtedness: number | undefined): string => {
        if (!indebtedness || indebtedness === 0) return '∞';
        const healthFactor = 100 / indebtedness;
        return healthFactor > 10 ? '> 10' : healthFactor.toFixed(2);
    };

    // Calculate liquidation threshold
    const calculateLiquidationThreshold = (userData: IUserData | null): string => {
        if (!userData || !userData.borrowCapacity || userData.borrowCapacity.isZero()) return '0%';
        // In the contract, liquidation happens at 80% indebtedness
        return '80%';
    };

    // Calculate available to borrow
    const calculateAvailableToBorrow = (userData: IUserData | null): string => {
        if (!userData || !userData.borrowCapacity || userData.borrowCapacity.isZero()) return '$0.00';
        
        // Max borrow is 80% of capacity
        const maxBorrow = userData.borrowCapacity.mul(80).div(100);
        
        // If already borrowed more than max, return 0
        if (userData.totalDebtUSD.gte(maxBorrow)) return '$0.00';
        
        // Otherwise, calculate remaining capacity
        const available = maxBorrow.sub(userData.totalDebtUSD);
        return formatUSD(available);
    };

    // If loading or no data, show skeleton
    if (isLoading || !userData) {
        return (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <LoadingStatCard label="Total Supplied" />
                <LoadingStatCard label="Total Borrowed" />
                <LoadingStatCard label="Available to Borrow" />
                <LoadingStatCard label="Health Factor" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <h2 className="text-2xl font-bold text-white">Your Dashboard</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard 
                    label="Total Supplied" 
                    value={formatUSD(userData.totalCollateralUSD)}
                    className="border-l-4 border-l-blue-500"
                />
                <StatCard 
                    label="Total Borrowed" 
                    value={formatUSD(userData.totalDebtUSD)}
                    className="border-l-4 border-l-purple-500"
                />
                <StatCard 
                    label="Available to Borrow" 
                    value={calculateAvailableToBorrow(userData)}
                    className="border-l-4 border-l-green-500"
                    subtext={`Borrow Limit: ${formatUSD(userData.borrowCapacity.mul(80).div(100))}`}
                />
                <StatCard 
                    label="Health Factor" 
                    value={calculateHealthFactor(userData.indebtedness)}
                    className={`border-l-4 ${
                        userData.indebtedness > 70 ? 'border-l-red-500' : 
                        userData.indebtedness > 50 ? 'border-l-yellow-500' : 
                        'border-l-green-500'
                    }`}
                    subtext={`Liquidation at ${calculateLiquidationThreshold(userData)}`}
                />
            </div>
            
            <div className="bg-gray-800/70 p-6 rounded-xl border border-gray-700">
                <h3 className="text-xl font-bold text-white mb-4">Borrow Limit</h3>
                <div className="w-full bg-gray-700 rounded-full h-4 mb-2">
                    <div 
                        className={`h-4 rounded-full ${
                            userData.indebtedness > 70 ? 'bg-red-500' : 
                            userData.indebtedness > 50 ? 'bg-yellow-500' : 
                            'bg-green-500'
                        }`} 
                        style={{ width: `${Math.min(userData.indebtedness, 100)}%` }}
                    ></div>
                </div>
                <div className="flex justify-between text-sm">
                    <span className="text-gray-400">
                        {formatPercentage(userData.indebtedness)} used
                    </span>
                    <span className="text-gray-400">
                        {formatUSD(userData.totalDebtUSD)} of {formatUSD(userData.borrowCapacity.mul(80).div(100))}
                    </span>
                </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-gray-800/70 p-6 rounded-xl border border-gray-700">
                    <h3 className="text-xl font-bold text-white mb-4">Collateral Composition</h3>
                    {Object.entries(userData.collateral).some(([_, amount]) => amount.gt(0)) ? (
                        <div className="space-y-3">
                            {Object.entries(userData.collateral).map(([tokenAddress, amount]) => {
                                if (amount.isZero()) return null;
                                const token = TOKENS.find(t => t.address.toLowerCase() === tokenAddress.toLowerCase()) || 
                                    (tokenAddress === '0x0000000000000000000000000000000000000000' ? 
                                    { symbol: 'ETH', decimals: 18, logo: 'https://s2.coinmarketcap.com/static/img/coins/64x64/1027.png' } : 
                                    { symbol: 'Unknown', decimals: 18, logo: '' });
                                
                                const price = userData.prices[tokenAddress] || ethers.BigNumber.from(0);
                                const value = amount.mul(price).div(ethers.utils.parseEther('1'));
                                const percentage = userData.totalCollateralUSD.isZero() ? 
                                    0 : 
                                    value.mul(100).div(userData.totalCollateralUSD).toNumber();
                                
                                return (
                                    <div key={tokenAddress} className="flex justify-between items-center">
                                        <div className="flex items-center">
                                            <img src={token.logo} alt={token.symbol} className="w-6 h-6 mr-2" />
                                            <span className="text-white">{token.symbol}</span>
                                            <span className="text-gray-400 ml-2 text-sm">
                                                {ethers.utils.formatUnits(amount, token.decimals)}
                                            </span>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-white">{formatUSD(value)}</div>
                                            <div className="text-gray-400 text-sm">{percentage}%</div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <p className="text-gray-400">No collateral supplied yet.</p>
                    )}
                </div>
                
                <div className="bg-gray-800/70 p-6 rounded-xl border border-gray-700">
                    <h3 className="text-xl font-bold text-white mb-4">Borrowed Assets</h3>
                    {Object.entries(userData.debt).some(([_, amount]) => amount.gt(0)) ? (
                        <div className="space-y-3">
                            {Object.entries(userData.debt).map(([tokenAddress, amount]) => {
                                if (amount.isZero()) return null;
                                const token = TOKENS.find(t => t.address.toLowerCase() === tokenAddress.toLowerCase()) || 
                                    (tokenAddress === '0x0000000000000000000000000000000000000000' ? 
                                    { symbol: 'ETH', decimals: 18, logo: 'https://s2.coinmarketcap.com/static/img/coins/64x64/1027.png' } : 
                                    { symbol: 'Unknown', decimals: 18, logo: '' });
                                
                                const price = userData.prices[tokenAddress] || ethers.BigNumber.from(0);
                                const value = amount.mul(price).div(ethers.utils.parseEther('1'));
                                const percentage = userData.totalDebtUSD.isZero() ? 
                                    0 : 
                                    value.mul(100).div(userData.totalDebtUSD).toNumber();
                                
                                return (
                                    <div key={tokenAddress} className="flex justify-between items-center">
                                        <div className="flex items-center">
                                            <img src={token.logo} alt={token.symbol} className="w-6 h-6 mr-2" />
                                            <span className="text-white">{token.symbol}</span>
                                            <span className="text-gray-400 ml-2 text-sm">
                                                {ethers.utils.formatUnits(amount, token.decimals)}
                                            </span>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-white">{formatUSD(value)}</div>
                                            <div className="text-gray-400 text-sm">{percentage}%</div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <p className="text-gray-400">No assets borrowed yet.</p>
                    )}
                </div>
            </div>
        </div>
    );
};

export default UserDashboard;
