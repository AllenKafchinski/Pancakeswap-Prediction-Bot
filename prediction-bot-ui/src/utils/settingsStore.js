// Simple store for strategy settings
class SettingsStore {
  constructor() {
    // Load settings from localStorage or use defaults
    const savedSettings = localStorage.getItem('strategySettings');
    this.settings = savedSettings ? JSON.parse(savedSettings) : {
      // RSI Settings
      rsiPeriod: 14,
      rsiOverbought: 70,
      rsiOversold: 30,
      
      // MACD Settings
      macdFastPeriod: 12,
      macdSlowPeriod: 26,
      macdSignalPeriod: 9,
      
      // Bollinger Bands Settings
      bbPeriod: 20,
      bbStdDev: 2,
      
      // Stochastic Settings
      stochPeriod: 14,
      stochKPeriod: 3,
      stochDPeriod: 3,
      
      // Moving Average Settings
      smaPeriod: 20,
      emaPeriod: 20,

      // Bet Size Settings
      minBet: 0.01,
      maxBet: 1.0,
      
      // Confidence Settings
      bullConfidence: 0.2,
      bearConfidence: -0.2
    };

    this.listeners = new Set();
  }

  getSettings() {
    return { ...this.settings };
  }

  updateSettings(newSettings) {
    this.settings = {
      ...this.settings,
      ...newSettings
    };

    // Save to localStorage
    localStorage.setItem('strategySettings', JSON.stringify(this.settings));

    // Notify listeners
    this.listeners.forEach(listener => listener(this.settings));
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

export const settingsStore = new SettingsStore();
