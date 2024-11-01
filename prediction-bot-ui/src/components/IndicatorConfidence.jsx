import React from 'react';
import {
  ChartBarIcon,
  ArrowTrendingUpIcon,
  ArrowsPointingOutIcon,
  ChartPieIcon,
  ArrowPathIcon
} from '@heroicons/react/24/outline';

const IndicatorConfidence = ({ indicators }) => {
  if (!indicators) return null;

  const getConfidenceColor = (value) => {
    const absValue = Math.abs(value);
    if (absValue >= 2) return value > 0 ? 'bg-green-500' : 'bg-red-500';
    if (absValue >= 1) return value > 0 ? 'bg-green-400' : 'bg-red-400';
    return value > 0 ? 'bg-green-300' : 'bg-red-300';
  };

  const getBarWidth = (value) => {
    const absValue = Math.abs(value);
    const maxWidth = 100;
    const percentage = (absValue / 2) * maxWidth; // 2 is max score per indicator
    return `${Math.min(percentage, maxWidth)}%`;
  };

  const indicatorList = [
    {
      name: 'RSI',
      icon: ChartBarIcon,
      value: indicators.rsiScore || 0,
      description: indicators.RSI ? `Current: ${indicators.RSI.toFixed(1)}` : ''
    },
    {
      name: 'MACD',
      icon: ArrowTrendingUpIcon,
      value: indicators.macdScore || 0,
      description: indicators.MACD ? `MACD: ${indicators.MACD.toFixed(4)} Signal: ${indicators.Signal.toFixed(4)}` : ''
    },
    {
      name: 'Bollinger',
      icon: ArrowsPointingOutIcon,
      value: indicators.bbScore || 0,
      description: indicators.bollingerBands ? 
        `Upper: ${indicators.bollingerBands.upper.toFixed(2)} Lower: ${indicators.bollingerBands.lower.toFixed(2)}` : ''
    },
    {
      name: 'Stochastic',
      icon: ChartPieIcon,
      value: indicators.stochScore || 0,
      description: indicators.stochastic ? 
        `K: ${indicators.stochastic.percentK.toFixed(1)} D: ${indicators.stochastic.percentD.toFixed(1)}` : ''
    },
    {
      name: 'Moving Avg',
      icon: ArrowPathIcon,
      value: indicators.maScore || 0,
      description: indicators.SMA20 ? 
        `SMA: ${indicators.SMA20.toFixed(2)} EMA: ${indicators.EMA20.toFixed(2)}` : ''
    }
  ];

  return (
    <div className="card mt-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold">Indicator Confidence</h2>
        <div className="text-sm text-gray-400">
          Bullish → / ← Bearish
        </div>
      </div>

      <div className="space-y-4">
        {indicatorList.map((indicator) => (
          <div key={indicator.name} className="space-y-1">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center space-x-2">
                <indicator.icon className="h-5 w-5 text-gray-400" />
                <span>{indicator.name}</span>
              </div>
              <span className="text-xs text-gray-400">{indicator.description}</span>
            </div>
            
            <div className="flex items-center">
              {/* Bearish bar (left) */}
              <div className="w-1/2 flex justify-end">
                {indicator.value < 0 && (
                  <div 
                    className={`h-2 rounded-l ${getConfidenceColor(indicator.value)}`}
                    style={{ width: getBarWidth(indicator.value) }}
                  />
                )}
              </div>
              
              {/* Center line */}
              <div className="w-px h-4 bg-gray-600" />
              
              {/* Bullish bar (right) */}
              <div className="w-1/2">
                {indicator.value > 0 && (
                  <div 
                    className={`h-2 rounded-r ${getConfidenceColor(indicator.value)}`}
                    style={{ width: getBarWidth(indicator.value) }}
                  />
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 pt-4 border-t border-gray-700">
        <div className="flex justify-between items-center">
          <span className="text-sm text-gray-400">Total Confidence</span>
          <div className="flex items-center space-x-2">
            <div className={`px-2 py-1 rounded ${
              indicators.totalConfidence > 0.2 ? 'bg-green-900/50 text-green-400' :
              indicators.totalConfidence < -0.2 ? 'bg-red-900/50 text-red-400' :
              'bg-gray-800 text-gray-400'
            }`}>
              {Math.abs(indicators.totalConfidence * 100).toFixed(1)}%
            </div>
            <span className="text-sm text-gray-400">
              {indicators.totalConfidence > 0.2 ? 'Bullish' :
               indicators.totalConfidence < -0.2 ? 'Bearish' :
               'Neutral'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default IndicatorConfidence;
