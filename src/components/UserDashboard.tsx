import React from 'react';
import { IUserData } from '@/lib/contract';
import { ethers } from 'ethers';

interface UserDashboardProps {
    userData: IUserData | null;
}

const StatCard = ({ label, value, className = '' }: { label: string, value: string, className?: string }) => (
    <div className={`bg-gray-800/70 p-6 rounded-xl border border-gray-700 ${className}`}>
        <p className="text-gray-400 text-sm mb-2">{label}</p>
        <p className="text-2xl lg:text-3xl font-bold text-white">{value}</p>
    </div>
);

const HealthFactor = ({ value }: { value: number }) => {
    const percentage = 100 - value;
    const circumference = 2 * Math.PI * 45;
    const offset = circumference - (percentage / 100) * circumference;

    let colorClass = 'text-green-400';
    if (percentage < 50) colorClass = 'text-yellow-400';
    if (percentage < 25) colorClass = 'text-red-400';

    return (
        <div className="relative flex items-center justify-center">
            <svg className="w-32 h-32 transform -rotate-90">
                <circle cx="64" cy="64" r="45" stroke="currentColor" strokeWidth="10" className="text-gray-700" fill="transparent" />
                <circle
                    cx="64"
                    cy="64"
                    r="45"
                    stroke="currentColor"
                    strokeWidth="10"
                    fill="transparent"
                    strokeDasharray={circumference}
                    strokeDashoffset={offset}
                    className={`transition-all duration-500 ${colorClass}`}
                    strokeLinecap="round"
                />
            </svg>
            <div className="absolute flex flex-col items-center justify-center">
                <span className={`text-2xl font-bold ${colorClass}`}>{percentage.toFixed(2)}%</span>
                <span className="text-xs text-gray-400">Health</span>
            </div>
        </div>
    );
};


const UserDashboard: React.FC<UserDashboardProps> = ({ userData }) => {
    if (!userData) {
        return null;
    }

    const totalCollateralUSD = ethers.utils.formatEther(userData.totalCollateralUSD);
    const totalDebtUSD = ethers.utils.formatEther(userData.totalDebtUSD);
    const borrowCapacity = ethers.utils.formatEther(userData.borrowCapacity);
    const healthFactor = userData.indebtedness;

    return (
        <div className="bg-gray-900/50 backdrop-blur-sm rounded-xl p-6 md:p-8 border border-gray-700">
            <h2 className="text-2xl font-bold text-white mb-6">My Dashboard</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 items-center">
                <StatCard label="Total Supplied" value={`$${parseFloat(totalCollateralUSD).toFixed(2)}`} />
                <StatCard label="Total Borrowed" value={`$${parseFloat(totalDebtUSD).toFixed(2)}`} />
                <StatCard label="Borrow Capacity" value={`$${parseFloat(borrowCapacity).toFixed(2)}`} />
                <div className="flex justify-center items-center">
                     <HealthFactor value={healthFactor} />
                </div>
            </div>
        </div>
    );
};

export default UserDashboard;
