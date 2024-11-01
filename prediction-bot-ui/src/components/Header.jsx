import React from 'react';
import { WalletIcon, Cog6ToothIcon, SunIcon, SignalIcon } from '@heroicons/react/24/outline';

const Header = ({
  walletBalance = 0,
  isConnected = false,
  networkLatency = 0,
  walletAddress = '',
  isProcessing = false
}) => {
  // Format wallet address for display
  const formatAddress = (address) => {
    if (!address) return '';
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  // Get connection status color
  const getStatusColor = (latency) => {
    if (!isConnected) return 'bg-red-500';
    if (latency > 1000) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  return (
    <header className="bg-secondary-800 border-b border-secondary-700 px-6 py-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <h1 className="text-xl font-bold text-primary-400">PancakeSwap Prediction Bot</h1>
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2 bg-secondary-700 px-3 py-1 rounded-full">
              <div className={`w-2 h-2 ${getStatusColor(networkLatency)} rounded-full ${isConnected ? 'animate-pulse' : ''}`}></div>
              <span className="text-sm">
                {isConnected ? `Connected (${networkLatency}ms)` : 'Disconnected'}
              </span>
            </div>
            {isProcessing && (
              <div className="flex items-center space-x-2 bg-blue-900/30 text-blue-400 px-3 py-1 rounded-full">
                <div className="w-2 h-2 bg-blue-400 rounded-full animate-ping"></div>
                <span className="text-sm">Processing Round</span>
              </div>
            )}
          </div>
        </div>
        
        <div className="flex items-center space-x-6">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <SignalIcon className="h-5 w-5 text-green-400" />
              <span className="text-sm text-gray-400">BSC Mainnet</span>
            </div>
            
            <div className="h-4 border-l border-gray-600"></div>
            
            <div className="flex items-center space-x-2">
              <WalletIcon className="h-5 w-5 text-primary-400" />
              <span className="font-medium">{walletBalance.toFixed(4)} BNB</span>
            </div>
            
            {walletAddress && (
              <div className="text-sm text-gray-400">
                {formatAddress(walletAddress)}
              </div>
            )}
          </div>
          
          <button className="p-2 hover:bg-secondary-700 rounded-full" title="Settings">
            <Cog6ToothIcon className="h-5 w-5" />
          </button>
          
          <button className="p-2 hover:bg-secondary-700 rounded-full" title="Toggle Theme">
            <SunIcon className="h-5 w-5" />
          </button>
        </div>
      </div>
    </header>
  );
};

export default Header;
