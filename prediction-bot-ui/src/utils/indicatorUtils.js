import { settingsStore } from './settingsStore';

export const calculateRSI = (prices, period = null) => {
  const settings = settingsStore.getSettings();
  period = period || settings.rsiPeriod;

  if (prices.length < period + 1) return null;

  let gains = 0;
  let losses = 0;

  // Calculate initial average gain/loss
  for (let i = 1; i <= period; i++) {
    const change = prices[i] - prices[i - 1];
    if (change >= 0) {
      gains += change;
    } else {
      losses -= change;
    }
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  // Calculate RSI using smoothed averages
  for (let i = period + 1; i < prices.length; i++) {
    const change = prices[i] - prices[i - 1];
    if (change >= 0) {
      avgGain = (avgGain * (period - 1) + change) / period;
      avgLoss = (avgLoss * (period - 1)) / period;
    } else {
      avgGain = (avgGain * (period - 1)) / period;
      avgLoss = (avgLoss * (period - 1) - change) / period;
    }
  }

  if (avgLoss === 0) return 100;
  const RS = avgGain / avgLoss;
  return 100 - (100 / (1 + RS));
};

export const calculateMACD = (prices, fastPeriod = null, slowPeriod = null, signalPeriod = null) => {
  const settings = settingsStore.getSettings();
  fastPeriod = fastPeriod || settings.macdFastPeriod;
  slowPeriod = slowPeriod || settings.macdSlowPeriod;
  signalPeriod = signalPeriod || settings.macdSignalPeriod;

  if (prices.length < slowPeriod + signalPeriod) return null;

  // Calculate EMAs
  const fastEMA = calculateEMA(prices, fastPeriod);
  const slowEMA = calculateEMA(prices, slowPeriod);
  
  // Calculate MACD line
  const macdLine = fastEMA - slowEMA;
  
  // Calculate signal line
  const signalLine = calculateEMA([...Array(slowPeriod - 1).fill(macdLine), macdLine], signalPeriod);
  
  // Calculate histogram
  const histogram = macdLine - signalLine;

  return {
    macd: macdLine,
    signal: signalLine,
    histogram: histogram
  };
};

export const calculateEMA = (prices, period = null) => {
  const settings = settingsStore.getSettings();
  period = period || settings.emaPeriod;

  if (prices.length < period) return null;

  const multiplier = 2 / (period + 1);
  let ema = prices.slice(0, period).reduce((sum, price) => sum + price, 0) / period;

  for (let i = period; i < prices.length; i++) {
    ema = (prices[i] - ema) * multiplier + ema;
  }

  return ema;
};

export const calculateBollingerBands = (prices, period = null, stdDev = null) => {
  const settings = settingsStore.getSettings();
  period = period || settings.bbPeriod;
  stdDev = stdDev || settings.bbStdDev;

  if (prices.length < period) return null;

  // Calculate SMA
  const sma = prices.slice(-period).reduce((sum, price) => sum + price, 0) / period;

  // Calculate standard deviation
  const squaredDiffs = prices.slice(-period).map(price => Math.pow(price - sma, 2));
  const variance = squaredDiffs.reduce((sum, diff) => sum + diff, 0) / period;
  const std = Math.sqrt(variance);

  return {
    upper: sma + (stdDev * std),
    middle: sma,
    lower: sma - (stdDev * std)
  };
};

export const calculateStochastic = (prices, period = null, kPeriod = null, dPeriod = null) => {
  const settings = settingsStore.getSettings();
  period = period || settings.stochPeriod;
  kPeriod = kPeriod || settings.stochKPeriod;
  dPeriod = dPeriod || settings.stochDPeriod;

  if (prices.length < period) return null;

  const highs = prices;
  const lows = prices;
  const closes = prices;

  const highestHigh = Math.max(...highs.slice(-period));
  const lowestLow = Math.min(...lows.slice(-period));
  
  const currentClose = closes[closes.length - 1];
  const k = ((currentClose - lowestLow) / (highestHigh - lowestLow)) * 100;

  return {
    k: k,
    d: calculateSMA([k], dPeriod) // Simple moving average of K
  };
};

export const calculateSMA = (prices, period = null) => {
  const settings = settingsStore.getSettings();
  period = period || settings.smaPeriod;

  if (prices.length < period) return null;
  return prices.slice(-period).reduce((sum, price) => sum + price, 0) / period;
};

export const analyzeTechnicals = (prices) => {
  const settings = settingsStore.getSettings();

  const rsi = calculateRSI(prices);
  const macd = calculateMACD(prices);
  const bb = calculateBollingerBands(prices);
  const stoch = calculateStochastic(prices);
  const sma = calculateSMA(prices);
  const ema = calculateEMA(prices);

  // Calculate scores based on settings
  let rsiScore = 0;
  if (rsi < settings.rsiOversold) {
    rsiScore = 2; // Strong Bullish
  } else if (rsi < 50) {
    rsiScore = 1; // Bullish
  } else if (rsi > settings.rsiOverbought) {
    rsiScore = -2; // Strong Bearish
  } else if (rsi > 50) {
    rsiScore = -1; // Bearish
  }

  let macdScore = 0;
  if (macd) {
    if (macd.macd > macd.signal) {
      macdScore = 2;
    } else if (macd.macd < macd.signal) {
      macdScore = -2;
    }
  }

  let bbScore = 0;
  if (bb && prices.length > 0) {
    const currentPrice = prices[prices.length - 1];
    if (currentPrice < bb.lower) {
      bbScore = 1;
    } else if (currentPrice > bb.upper) {
      bbScore = -1;
    }
  }

  let stochScore = 0;
  if (stoch) {
    if (stoch.k < 20) {
      stochScore = 1;
    } else if (stoch.k > 80) {
      stochScore = -1;
    }
  }

  let maScore = 0;
  if (sma && ema && prices.length > 0) {
    const currentPrice = prices[prices.length - 1];
    if (currentPrice > sma && currentPrice > ema) {
      maScore = 1;
    } else if (currentPrice < sma && currentPrice < ema) {
      maScore = -1;
    }
  }

  return {
    rsiScore,
    macdScore,
    bbScore,
    stochScore,
    maScore,
    totalScore: (rsiScore + macdScore + bbScore + stochScore + maScore) / 7 // Normalize to -1 to 1
  };
};
