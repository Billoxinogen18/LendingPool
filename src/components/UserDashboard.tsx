import React from 'react';
import { IUserData } from '@/lib/contract';
import { ethers } from 'ethers';

interface UserDashboardProps {
    userData: IUserData | null;
    isLoading?: boolean;
}

const StatCard = ({ label, value, className = '' }: { label: string, value: string, className?: string }) => (
    <div className={`bg-gray-800/70 p-6 rounded-xl border border-gray-700 ${className}`}>
        <p className="text-gray-400 text-sm mb-2">{label}</p>
        <p className="text-2xl lg:text-3xl font-bold text-white">{value}</p>
    </div>
);

const LoadingStatCard = ({ label }: { label: string }) => (
    <div className="bg-gray-800/70 p-6 rounded-xl border border-gray-700">
        <p className="text-gray-400 text-sm mb-2">{label}</p>
        <div className="h-8 bg-gray-700 rounded animate-pulse"></div>
    </div>
);

const HealthFactor = ({ value }: { value: number }) => {
    // Ensure value is a valid number and clamp between 0-100
    const safeValue = isNaN(value) ? 0 : Math.min(100, Math.max(0, value));
    const percentage = 100 - safeValue;
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

const LoadingHealthFactor = () => (
    <div className="relative flex items-center justify-center">
        <svg className="w-32 h-32 transform -rotate-90">
            <circle cx="64" cy="64" r="45" stroke="currentColor" strokeWidth="10" className="text-gray-700" fill="transparent" />
            <circle cx="64" cy="64" r="45" stroke="currentColor" strokeWidth="10" className="text-gray-600 animate-pulse" fill="transparent" />
        </svg>
        <div className="absolute flex flex-col items-center justify-center">
            <div className="h-6 w-16 bg-gray-700 rounded animate-pulse"></div>
            <span className="text-xs text-gray-400 mt-1">Health</span>
        </div>
    </div>
);

const UserDashboard: React.FC<UserDashboardProps> = ({ userData, isLoading = false }) => {
    if (!userData && !isLoading) {
        return null;
    }

    if (isLoading || !userData) {
        return (
            <div className="bg-gray-900/50 backdrop-blur-sm rounded-xl p-6 md:p-8 border border-gray-700">
                <h2 className="text-2xl font-bold text-white mb-6">My Dashboard</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 items-center">
                    <LoadingStatCard label="Total Supplied" />
                    <LoadingStatCard label="Total Borrowed" />
                    <LoadingStatCard label="Borrow Capacity" />
                    <div className="flex justify-center items-center">
                        <LoadingHealthFactor />
                    </div>
                </div>
            </div>
        );
    }

    // Format values safely
    const formatValue = (value: ethers.BigNumber) => {
        try {
            const formatted = ethers.utils.formatEther(value);
            const parsedValue = parseFloat(formatted);
            return isNaN(parsedValue) ? "0.00" : parsedValue.toFixed(2);
        } catch (e) {
            console.error("Failed to format value:", e);
            return "0.00";
        }
    };

    const totalCollateralUSD = formatValue(userData.totalCollateralUSD);
    const totalDebtUSD = formatValue(userData.totalDebtUSD);
    const borrowCapacity = formatValue(userData.borrowCapacity);
    const healthFactor = userData.indebtedness;

    return (
        <div className="bg-gray-900/50 backdrop-blur-sm rounded-xl p-6 md:p-8 border border-gray-700">
            <h2 className="text-2xl font-bold text-white mb-6">My Dashboard</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 items-center">
                <StatCard label="Total Supplied" value={`$${totalCollateralUSD}`} />
                <StatCard label="Total Borrowed" value={`$${totalDebtUSD}`} />
                <StatCard label="Borrow Capacity" value={`$${borrowCapacity}`} />
                <div className="flex justify-center items-center">
                    <HealthFactor value={healthFactor} />
                </div>
            </div>
        </div>
    );
};

export default UserDashboard;
