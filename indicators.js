// indicators.js
const logger = require('./logger');

/**
 * Calculates Relative Strength Index (RSI).
 * @param {Array<number>} prices - Array of recent prices.
 * @param {number} period - RSI period.
 * @returns {Array<number>} Array of RSI values.
 */
function calculateRSI(prices, period = 20) {
    if (prices.length < period + 1) return [];

    let gains = [];
    let losses = [];

    for (let i = 1; i <= period; i++) {
        const change = prices[prices.length - i] - prices[prices.length - i - 1];
        if (change > 0) {
            gains.push(change);
            losses.push(0);
        } else {
            gains.push(0);
            losses.push(Math.abs(change));
        }
    }

    let averageGain = gains.reduce((a, b) => a + b, 0) / period;
    let averageLoss = losses.reduce((a, b) => a + b, 0) / period;
    let rs = averageGain / averageLoss;
    let rsi = 100 - (100 / (1 + rs));

    let rsiArray = [rsi];

    for (let i = period + 1; i < prices.length; i++) {
        const change = prices[i] - prices[i - 1];
        let gain = change > 0 ? change : 0;
        let loss = change < 0 ? Math.abs(change) : 0;

        averageGain = (averageGain * (period - 1) + gain) / period;
        averageLoss = (averageLoss * (period - 1) + loss) / period;

        rs = averageGain / averageLoss;
        rsi = averageLoss === 0 ? 100 : 100 - (100 / (1 + rs));
        rsiArray.push(rsi);
    }

    return rsiArray;
}

/**
 * Calculates Moving Average Convergence Divergence (MACD).
 * @param {Array<number>} prices - Array of recent prices.
 * @param {number} fastPeriod - Fast EMA period.
 * @param {number} slowPeriod - Slow EMA period.
 * @param {number} signalPeriod - Signal line EMA period.
 * @returns {Object} MACD { MACD, signal }
 */
function calculateMACD(prices, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
    try {
        if (!Array.isArray(prices) || prices.length < Math.max(fastPeriod, slowPeriod) + signalPeriod) {
            logger.error(`Invalid input for MACD calculation. Prices length: ${prices.length}`);
            return null;
        }

        const fastEMA = calculateEMA(prices, fastPeriod);
        const slowEMA = calculateEMA(prices, slowPeriod);

        if (!fastEMA || !slowEMA) {
            logger.error('Failed to calculate EMA for MACD');
            return null;
        }

        const macdLine = fastEMA.map((fast, i) => fast - slowEMA[i]);
        const signalLine = calculateEMA(macdLine, signalPeriod);

        if (!signalLine) {
            logger.error('Failed to calculate signal line for MACD');
            return null;
        }

        return {
            MACD: macdLine,
            signal: signalLine,
            histogram: macdLine.map((macd, i) => macd - signalLine[i])
        };
    } catch (error) {
        logger.error('Error in MACD calculation:', error);
        return null;
    }
}

/**
 * Calculates Simple Moving Average (SMA).
 * @param {Array<number>} prices - Array of recent prices.
 * @param {number} period - SMA period.
 * @returns {Array<number>} Array of SMA values.
 */
function calculateSMA(prices, period = 20) {
    if (prices.length < period) return [];

    let smaArray = [];
    for (let i = period; i <= prices.length; i++) {
        const window = prices.slice(i - period, i);
        const sma = window.reduce((a, b) => a + b, 0) / period;
        smaArray.push(sma);
    }

    return smaArray;
}

/**
 * Calculates Exponential Moving Average (EMA).
 * @param {Array<number>} prices - Array of recent prices.
 * @param {number} period - EMA period.
 * @returns {Array<number>} Array of EMA values.
 */
function calculateEMA(prices, period = 20) {
    if (prices.length < period) return [];

    const k = 2 / (period + 1);
    let emaArray = [];

    // Start with SMA for the first EMA value
    const sma = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;
    emaArray.push(sma);

    // Calculate EMA for the rest
    for (let i = period; i < prices.length; i++) {
        const ema = prices[i] * k + emaArray[i - period] * (1 - k);
        emaArray.push(ema);
    }

    return emaArray;
}

/**
 * Calculates Bollinger Bands.
 * @param {Array<number>} prices - Array of recent prices.
 * @param {number} period - SMA period.
 * @param {number} multiplier - Number of standard deviations.
 * @returns {Object|null} Bollinger Bands { middle, upper, lower } or null if insufficient data.
 */
function calculateBollingerBands(prices, period = 20, multiplier = 2) {
    try {
        if (!Array.isArray(prices) || prices.length < period) {
            logger.error(`Invalid input for Bollinger Bands calculation. Prices length: ${prices.length}`);
            return null;
        }

        const sma = calculateSMA(prices, period);
        if (!sma) {
            logger.error('Failed to calculate SMA for Bollinger Bands');
            return null;
        }

        const bands = sma.map((ma, i) => {
            const slice = prices.slice(i - period + 1, i + 1);
            const std = calculateStandardDeviation(slice);
            return {
                upper: ma + multiplier * std,
                middle: ma,
                lower: ma - multiplier * std
            };
        });

        return bands;
    } catch (error) {
        logger.error('Error in Bollinger Bands calculation:', error);
        return null;
    }
}

/**
 * Calculates Stochastic Oscillator.
 * @param {Array<number>} prices - Array of recent prices.
 * @param {number} period - Stochastic period.
 * @returns {Object|null} Stochastic Oscillator { percentK, percentD } or null if insufficient data.
 */
function calculateStochasticOscillator(prices, period = 14) {
    try {
        if (!Array.isArray(prices) || prices.length < period) {
            logger.error(`Invalid input for Stochastic Oscillator calculation. Prices length: ${prices.length}`);
            return null;
        }

        const stochK = [];
        const stochD = [];

        for (let i = period - 1; i < prices.length; i++) {
            const periodSlice = prices.slice(i - period + 1, i + 1);
            const low = Math.min(...periodSlice);
            const high = Math.max(...periodSlice);
            const close = periodSlice[periodSlice.length - 1];

            const k = ((close - low) / (high - low)) * 100;
            stochK.push(k);

            if (stochK.length >= 3) {
                const d = calculateSMA(stochK.slice(-3), 3)[0];
                stochD.push(d);
            }
        }

        return { k: stochK, d: stochD };
    } catch (error) {
        logger.error('Error in Stochastic Oscillator calculation:', error);
        return null;
    }
}

// Helper function for standard deviation
function calculateStandardDeviation(values) {
    const avg = values.reduce((sum, val) => sum + val, 0) / values.length;
    const squareDiffs = values.map(value => Math.pow(value - avg, 2));
    const avgSquareDiff = squareDiffs.reduce((sum, val) => sum + val, 0) / squareDiffs.length;
    return Math.sqrt(avgSquareDiff);
}

module.exports = {
    calculateRSI,
    calculateMACD,
    calculateSMA,
    calculateEMA,
    calculateBollingerBands,
    calculateStochasticOscillator
};
