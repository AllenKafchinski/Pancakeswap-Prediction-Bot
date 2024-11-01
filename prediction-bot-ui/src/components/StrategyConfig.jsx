import React, { useState, useEffect } from 'react';
import { AdjustmentsHorizontalIcon, BeakerIcon } from '@heroicons/react/24/outline';
import { settingsStore } from '../utils/settingsStore';

const StrategyConfig = () => {
  const [settings, setSettings] = useState(settingsStore.getSettings());
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    // Subscribe to settings changes
    const unsubscribe = settingsStore.subscribe(newSettings => {
      setSettings(newSettings);
      setIsDirty(false);
    });

    return unsubscribe;
  }, []);

  const handleChange = (key, value) => {
    // Convert to number and validate
    const numValue = Number(value);
    if (!isNaN(numValue)) {
      setSettings(prev => ({
        ...prev,
        [key]: numValue
      }));
      setIsDirty(true);
    }
  };

  const handleSave = () => {
    settingsStore.updateSettings(settings);
    setIsDirty(false);
  };

  const renderSetting = (label, key, min, max, step = 1) => (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <label className="text-gray-400">{label}</label>
        <span className="text-primary-400">{settings[key]}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={settings[key]}
        onChange={(e) => handleChange(key, e.target.value)}
        className="w-full"
      />
    </div>
  );

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold">Strategy Configuration</h2>
        <button 
          onClick={handleSave}
          className={`btn ${isDirty ? 'btn-primary' : 'btn-secondary'}`}
          disabled={!isDirty}
        >
          {isDirty ? 'Save Changes' : 'Saved'}
        </button>
      </div>

      <div className="space-y-6">
        {/* RSI Settings */}
        <div className="bg-secondary-700 p-4 rounded-lg">
          <h3 className="font-medium mb-4">RSI Settings</h3>
          <div className="space-y-4">
            {renderSetting('Period', 'rsiPeriod', 5, 30)}
            {renderSetting('Overbought Level', 'rsiOverbought', 50, 90)}
            {renderSetting('Oversold Level', 'rsiOversold', 10, 50)}
          </div>
        </div>

        {/* MACD Settings */}
        <div className="bg-secondary-700 p-4 rounded-lg">
          <h3 className="font-medium mb-4">MACD Settings</h3>
          <div className="space-y-4">
            {renderSetting('Fast Period', 'macdFastPeriod', 5, 20)}
            {renderSetting('Slow Period', 'macdSlowPeriod', 15, 40)}
            {renderSetting('Signal Period', 'macdSignalPeriod', 5, 15)}
          </div>
        </div>

        {/* Bollinger Bands Settings */}
        <div className="bg-secondary-700 p-4 rounded-lg">
          <h3 className="font-medium mb-4">Bollinger Bands Settings</h3>
          <div className="space-y-4">
            {renderSetting('Period', 'bbPeriod', 10, 50)}
            {renderSetting('Standard Deviation', 'bbStdDev', 1, 4, 0.5)}
          </div>
        </div>

        {/* Stochastic Settings */}
        <div className="bg-secondary-700 p-4 rounded-lg">
          <h3 className="font-medium mb-4">Stochastic Settings</h3>
          <div className="space-y-4">
            {renderSetting('Period', 'stochPeriod', 5, 30)}
            {renderSetting('K Period', 'stochKPeriod', 1, 10)}
            {renderSetting('D Period', 'stochDPeriod', 1, 10)}
          </div>
        </div>

        {/* Moving Average Settings */}
        <div className="bg-secondary-700 p-4 rounded-lg">
          <h3 className="font-medium mb-4">Moving Average Settings</h3>
          <div className="space-y-4">
            {renderSetting('SMA Period', 'smaPeriod', 10, 50)}
            {renderSetting('EMA Period', 'emaPeriod', 10, 50)}
          </div>
        </div>

        {/* Bet Size Settings */}
        <div className="bg-secondary-700 p-4 rounded-lg">
          <h3 className="font-medium mb-4">Bet Size Settings</h3>
          <div className="space-y-4">
            {renderSetting('Minimum Bet (BNB)', 'minBet', 0.1, 1, 0.1)}
            {renderSetting('Maximum Bet (BNB)', 'maxBet', 0.2, 5, 0.1)}
          </div>
        </div>

        {/* Confidence Settings */}
        <div className="bg-secondary-700 p-4 rounded-lg">
          <h3 className="font-medium mb-4">Confidence Settings</h3>
          <div className="space-y-4">
            {renderSetting('Bull Confidence', 'bullConfidence', 0.1, 0.5, 0.05)}
            {renderSetting('Bear Confidence', 'bearConfidence', -0.5, -0.1, 0.05)}
          </div>
        </div>
      </div>

      <div className="mt-6 bg-blue-900/20 border border-blue-600 rounded-lg p-4">
        <div className="flex items-center space-x-2 mb-2">
          <BeakerIcon className="h-5 w-5 text-blue-400" />
          <h3 className="font-medium">Strategy Info</h3>
        </div>
        <div className="text-sm text-gray-400">
          Adjust the technical indicators and betting parameters to fine-tune the prediction strategy. Changes will take effect after saving.
        </div>
      </div>
    </div>
  );
};

export default StrategyConfig;
