import React, { useState, useEffect, useCallback } from 'react';
import { 
  ArrowTrendingUpIcon, 
  ArrowTrendingDownIcon, 
  PlayIcon, 
  StopIcon,
  DocumentDuplicateIcon,
  BanknotesIcon,
  ChartBarIcon,
  WalletIcon
} from '@heroicons/react/24/solid';
import { Line } from 'react-chartjs-2';
import { ethers } from 'ethers';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  annotation
} from 'chart.js';
import annotationPlugin from 'chartjs-plugin-annotation';
import { startPricePolling } from '../utils/priceUtils';
import { roundManager } from '../utils/roundUtils';
import { calculateRSI, calculateBollingerBands } from '../utils/indicatorUtils';
import RoundHistory from './RoundHistory';
import IndicatorConfidence from './IndicatorConfidence';
import PerformanceMetrics from './PerformanceMetrics';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  annotationPlugin
);

const TIME_RANGES = [
  { label: '5m', minutes: 5 },
  { label: '15m', minutes: 15 },
  { label: '30m', minutes: 30 },
  { label: '1h', minutes: 60 }
];

const LivePrediction = () => {
  const [priceData, setPriceData] = useState({
    currentPrice: 0,
    minuteData: [],
    priceBuffer: []
  });
  const [timeLeft, setTimeLeft] = useState('05:00');
  const [roundHistory, setRoundHistory] = useState([]);
  const [currentRound, setCurrentRound] = useState(null);
  const [nextRound, setNextRound] = useState(null);
  const [isBotRunning, setIsBotRunning] = useState(false);
  const [wallet, setWallet] = useState(null);
  const [indicatorScores, setIndicatorScores] = useState(null);
  const [mode, setMode] = useState('paper');
  const [selectedTimeRange, setSelectedTimeRange] = useState(15);
  const [showIndicators, setShowIndicators] = useState(true);
  const [historyKey, setHistoryKey] = useState(0); // Add key for forcing re-renders

  // Function to update round history
  const updateRoundHistory = useCallback(() => {
    const pastRounds = roundManager.getPastRounds();
    if (pastRounds && pastRounds.length > 0) {
      setRoundHistory(pastRounds);
      setHistoryKey(prev => prev + 1); // Increment key to force re-render
    }
  }, []);

  // Initialize contracts and data
  useEffect(() => {
    const init = async () => {
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      await roundManager.initialize(provider);
      const cleanup = startPricePolling(provider, roundManager, (newPriceData) => {
        setPriceData(newPriceData);
      });
      updateRoundHistory();
      return cleanup;
    };
    init();
  }, [updateRoundHistory]);

  // Check for new rounds frequently at first, then every 5 minutes once synced
  useEffect(() => {
    let interval;
    let isInitialSync = true;
    let syncCount = 0;
    const MAX_SYNC_ATTEMPTS = 10; // Try for 10 seconds initially

    const checkRound = async () => {
      const currentEpoch = currentRound?.epoch;
      const latestRound = await roundManager.checkCurrentRound();
      
      if (latestRound?.epoch !== currentEpoch) {
        console.log('New round detected:', latestRound?.epoch);
        setCurrentRound(latestRound);
        setNextRound(roundManager.getNextRound());
        
        // Update round history after round change
        setTimeout(updateRoundHistory, 2000); // Wait 2 seconds for round data to be finalized
        
        // If this is our first sync and we've found a new round
        if (isInitialSync) {
          isInitialSync = false;
          clearInterval(interval);
          // Switch to 5-minute interval
          interval = setInterval(checkRound, 5 * 60 * 1000); // 5 minutes
          console.log('Switched to 5-minute round checks');
        }
      } else if (isInitialSync) {
        syncCount++;
        if (syncCount >= MAX_SYNC_ATTEMPTS) {
          // If we haven't synced after 10 attempts, switch to 5-minute interval
          isInitialSync = false;
          clearInterval(interval);
          interval = setInterval(checkRound, 5 * 60 * 1000); // 5 minutes
          console.log('Switched to 5-minute round checks after max attempts');
        }
      }
    };

    // Start with 1-second checks
    interval = setInterval(checkRound, 1000);
    console.log('Started 1-second round checks');

    return () => {
      clearInterval(interval);
      console.log('Cleared round check interval');
    };
  }, [currentRound?.epoch, updateRoundHistory]);

  // Update timer and round history
  useEffect(() => {
    let historyInterval;
    const timer = setInterval(async () => {
      const newTimeLeft = roundManager.getTimeLeft();
      setTimeLeft(newTimeLeft);
      
      // If timer hits zero, trigger a round check and update history
      if (newTimeLeft === '00:00') {
        const newRound = await roundManager.checkCurrentRound();
        if (newRound) {
          setCurrentRound(newRound);
          setNextRound(roundManager.getNextRound());
          // Force round history update after round end
          setTimeout(updateRoundHistory, 2000); // Wait 2 seconds for round data to be finalized
        }
      }

      if (roundManager.getCurrentRound()?.indicators) {
        setIndicatorScores(roundManager.getCurrentRound().indicators);
      }
    }, 1000);

    // Additional round history update interval
    historyInterval = setInterval(updateRoundHistory, 30000); // Check every 30 seconds

    return () => {
      clearInterval(timer);
      clearInterval(historyInterval);
    };
  }, [updateRoundHistory]);

  const connectWallet = async () => {
    try {
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      await provider.send("eth_requestAccounts", []);
      const signer = provider.getSigner();
      const address = await signer.getAddress();
      setWallet({ signer, address });
      console.log('Wallet connected:', address);
      return { signer, address };
    } catch (error) {
      console.error('Error connecting wallet:', error);
      throw error;
    }
  };

  const switchToPaper = async () => {
    try {
      await roundManager.setMode('paper');
      setMode('paper');
      if (isBotRunning) {
        await roundManager.stopBot();
        await roundManager.startBot(null);
      }
      console.log('Switched to paper mode');
    } catch (error) {
      console.error('Error switching to paper mode:', error);
    }
  };

  const switchToLive = async () => {
    try {
      let currentWallet = wallet;
      if (!currentWallet) {
        currentWallet = await connectWallet();
        if (!currentWallet) {
          console.error('Failed to connect wallet');
          return;
        }
      }

      await roundManager.setMode('live');
      setMode('live');
      
      if (isBotRunning) {
        await roundManager.stopBot();
        await roundManager.startBot(currentWallet.signer);
      }
      
      console.log('Switched to live mode with wallet:', currentWallet.address);
    } catch (error) {
      console.error('Error switching to live mode:', error);
      setMode('paper');
    }
  };

  const toggleBot = async () => {
    try {
      if (!isBotRunning) {
        if (mode === 'live' && !wallet) {
          await connectWallet();
          return;
        }
        await roundManager.startBot(mode === 'live' ? wallet.signer : null);
        setIsBotRunning(true);
        console.log('Bot started in', mode, 'mode');
      } else {
        await roundManager.stopBot();
        setIsBotRunning(false);
        console.log('Bot stopped');
      }
    } catch (error) {
      console.error('Error toggling bot:', error);
      setIsBotRunning(false);
    }
  };

  // Get visible data based on time range
  const getVisibleData = () => {
    const data = priceData.minuteData || [];
    return data.slice(-selectedTimeRange);
  };

  // Calculate indicators for visible data
  const calculateIndicators = (data) => {
    if (!data || data.length < 20) return null;

    const prices = data.map(d => d.price);
    let indicators = {};

    try {
      const rsi = calculateRSI(prices, 14);
      const bb = calculateBollingerBands(prices, 20, 2);

      if (rsi && bb) {
        indicators = {
          rsi: rsi,
          bollingerBands: bb
        };
      }
    } catch (error) {
      console.error('Error calculating indicators:', error);
      return null;
    }

    return indicators;
  };

  const visibleData = getVisibleData();
  const indicators = calculateIndicators(visibleData);

  const timestamps = visibleData.map((d) => {
    const date = new Date(d.timestamp);
    return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
  });

  const chartData = {
    labels: timestamps,
    datasets: [
      {
        label: 'WBNB/BUSD',
        data: visibleData.map(d => d.price),
        borderColor: currentRound?.prediction === 'bull' ? 'rgb(34, 197, 94)' : 
                    currentRound?.prediction === 'bear' ? 'rgb(239, 68, 68)' : 
                    'rgb(59, 130, 246)',
        tension: 0.1,
        order: 1,
        pointRadius: 0, // Hide regular points
      },
      // Add end price markers
      {
        label: 'Round End Prices',
        data: visibleData.map(d => d.isRoundEnd ? d.price : null),
        pointBackgroundColor: 'rgb(239, 68, 68)',
        pointRadius: 4,
        showLine: false, // Don't connect the points
        order: 0 // Draw on top
      },
      ...(showIndicators && indicators?.bollingerBands ? [
        {
          label: 'BB Upper',
          data: Array(visibleData.length).fill(indicators.bollingerBands.upper),
          borderColor: 'rgba(255, 255, 255, 0.5)',
          borderDash: [5, 5],
          pointRadius: 0,
          tension: 0,
          order: 2
        },
        {
          label: 'BB Lower',
          data: Array(visibleData.length).fill(indicators.bollingerBands.lower),
          borderColor: 'rgba(255, 255, 255, 0.5)',
          borderDash: [5, 5],
          pointRadius: 0,
          tension: 0,
          order: 2
        }
      ] : [])
    ]
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false
      },
      tooltip: {
        callbacks: {
          label: (context) => `$${context.raw.toFixed(2)}`
        }
      }
    },
    scales: {
      y: {
        grid: {
          color: 'rgba(75, 85, 99, 0.2)'
        },
        ticks: {
          color: '#9CA3AF',
          callback: (value) => `$${value.toFixed(2)}`
        }
      },
      x: {
        grid: {
          display: false
        },
        ticks: {
          color: '#9CA3AF'
        }
      }
    }
  };

  const renderPredictionBox = (type, amount, prediction, betSize) => (
    <div className={`p-4 rounded-lg border ${
      prediction === type ? 
        type === 'bull' ? 'bg-green-900/20 border-green-600' : 'bg-red-900/20 border-red-600' 
        : 'bg-secondary-700/50 border-gray-600'
    }`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center">
          {type === 'bull' ? (
            <ArrowTrendingUpIcon className="h-5 w-5 text-green-500 mr-2" />
          ) : (
            <ArrowTrendingDownIcon className="h-5 w-5 text-red-500 mr-2" />
          )}
          <span className="font-medium">{type === 'bull' ? 'UP' : 'DOWN'} Prediction</span>
        </div>
        <span className={`font-bold ${type === 'bull' ? 'text-green-400' : 'text-red-400'}`}>
          {((parseFloat(amount || 0) / parseFloat(currentRound?.totalAmount || 1)) * 100).toFixed(1)}%
        </span>
      </div>
      {prediction === type && betSize && (
        <div className="text-sm text-gray-400">
          Bet Size: {betSize.toFixed(3)} BNB
        </div>
      )}
    </div>
  );

  return (
    <>
      <div className="card">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-xl font-bold mb-2">
              Current Round #{currentRound?.epoch || '0'}
            </h2>
            <div className="text-3xl font-bold text-primary-400">
              {timeLeft}
            </div>
          </div>
          <div className="text-right">
            <div className="text-sm text-gray-400 mb-1">Current Price</div>
            <div className="text-2xl font-bold">${priceData.currentPrice.toFixed(2)}</div>
            {currentRound?.lockPrice && (
              <div className="text-sm text-gray-400">
                Lock Price: ${currentRound.lockPrice}
              </div>
            )}
          </div>
        </div>

        <div className="mb-6 space-y-4">
          {/* Mode Toggle */}
          <div className="flex items-center justify-between p-4 bg-secondary-700 rounded-lg">
            <div className="flex items-center space-x-4">
              <div className={`w-3 h-3 rounded-full ${mode === 'live' ? 'bg-red-500 animate-pulse' : 'bg-blue-500'}`}></div>
              <span className="font-medium text-lg">Trading Mode:</span>
              <div className="flex space-x-2">
                <button 
                  onClick={switchToPaper}
                  className={`flex items-center space-x-2 px-6 py-3 rounded-lg transition-all duration-200 ${
                    mode === 'paper' ? 
                    'bg-blue-900/50 text-blue-400 hover:bg-blue-900/70 border-2 border-blue-400' : 
                    'bg-secondary-700 text-gray-400 hover:bg-secondary-600'
                  }`}
                >
                  <DocumentDuplicateIcon className="h-5 w-5 mr-2" />
                  <span>Paper Trading</span>
                </button>
                <button 
                  onClick={switchToLive}
                  className={`flex items-center space-x-2 px-6 py-3 rounded-lg transition-all duration-200 ${
                    mode === 'live' ? 
                    'bg-red-900/50 text-red-400 hover:bg-red-900/70 border-2 border-red-400' : 
                    'bg-secondary-700 text-gray-400 hover:bg-secondary-600'
                  }`}
                >
                  <BanknotesIcon className="h-5 w-5 mr-2" />
                  <span>Live Trading</span>
                </button>
              </div>
            </div>
            {mode === 'live' && !wallet && (
              <button 
                onClick={connectWallet}
                className="flex items-center space-x-2 px-6 py-3 bg-primary-500 hover:bg-primary-600 rounded-lg transition-all duration-200"
              >
                <WalletIcon className="h-5 w-5" />
                <span>Connect Wallet</span>
              </button>
            )}
          </div>

          {/* Bot Controls */}
          <div className="flex items-center justify-between p-4 bg-secondary-700 rounded-lg">
            <div className="flex items-center space-x-4">
              <div className={`w-2 h-2 rounded-full ${isBotRunning ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></div>
              <span className="font-medium">Bot Status:</span>
              <span className={isBotRunning ? 'text-green-400' : 'text-red-400'}>
                {isBotRunning ? 'Running' : 'Stopped'}
              </span>
            </div>
            <button 
              onClick={toggleBot}
              disabled={mode === 'live' && !wallet}
              className={`flex items-center space-x-2 px-4 py-2 rounded-lg ${
                isBotRunning ? 
                'bg-red-900/50 text-red-400 hover:bg-red-900/70' : 
                'bg-green-900/50 text-green-400 hover:bg-green-900/70'
              } ${mode === 'live' && !wallet ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              {isBotRunning ? (
                <>
                  <StopIcon className="h-5 w-5" />
                  <span>Stop Bot</span>
                </>
              ) : (
                <>
                  <PlayIcon className="h-5 w-5" />
                  <span>Start Bot</span>
                </>
              )}
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-4">
            {TIME_RANGES.map(range => (
              <button
                key={range.minutes}
                onClick={() => setSelectedTimeRange(range.minutes)}
                className={`px-3 py-1 rounded-full text-sm ${
                  selectedTimeRange === range.minutes
                    ? 'bg-primary-500 text-white'
                    : 'bg-secondary-700 text-gray-400 hover:bg-secondary-600'
                }`}
              >
                {range.label}
              </button>
            ))}
          </div>
          <button
            onClick={() => setShowIndicators(!showIndicators)}
            className={`flex items-center space-x-2 px-3 py-1 rounded-full text-sm ${
              showIndicators ? 'bg-primary-500 text-white' : 'bg-secondary-700 text-gray-400'
            }`}
          >
            <ChartBarIcon className="h-4 w-4" />
            <span>Indicators</span>
          </button>
        </div>

        <div className="h-64 mb-6">
          <Line data={chartData} options={chartOptions} />
        </div>

        {/* Current Round Predictions */}
        <div className="mb-6">
          <h3 className="text-lg font-medium mb-3">Current Round</h3>
          <div className="grid grid-cols-2 gap-4">
            {renderPredictionBox('bull', currentRound?.bullAmount, currentRound?.prediction, currentRound?.betSize)}
            {renderPredictionBox('bear', currentRound?.bearAmount, currentRound?.prediction, currentRound?.betSize)}
          </div>
        </div>

        {/* Next Round Prediction */}
        {nextRound?.prediction && (
          <div className="mb-6 p-4 bg-secondary-700 rounded-lg">
            <h3 className="text-lg font-medium mb-3">Next Round Prediction</h3>
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                {nextRound.prediction === 'bull' ? (
                  <>
                    <ArrowTrendingUpIcon className="h-5 w-5 text-green-500" />
                    <span className="text-green-400">UP</span>
                  </>
                ) : (
                  <>
                    <ArrowTrendingDownIcon className="h-5 w-5 text-red-500" />
                    <span className="text-red-400">DOWN</span>
                  </>
                )}
                <span className="text-gray-400">
                  Planned Bet: {nextRound.betSize?.toFixed(3)} BNB
                </span>
              </div>
              <div className="text-sm text-gray-400">
                Round #{nextRound.epoch}
              </div>
            </div>
          </div>
        )}
      </div>

      <IndicatorConfidence indicators={indicatorScores} />
      <RoundHistory rounds={roundHistory} key={`history-${historyKey}`} />
      <PerformanceMetrics rounds={roundHistory} key={`metrics-${historyKey}`} />
    </>
  );
};

export default LivePrediction;
