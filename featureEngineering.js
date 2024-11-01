const indicators = require('./indicators');
const patterns = require('./patterns');
const logger = require('./logger');

/**
 * Generates features for the prediction model
 * @param {Array<number>} prices - Array of 5-minute prices
 * @returns {Array<number>} Array of features
 */
function prepareFeatures(prices) {
    if (!Array.isArray(prices) || prices.length < 100) {
        logger.warn('Insufficient data for feature preparation');
        return [];
    }

    try {
        const features = [];

        // Technical Indicators
        const rsi = indicators.calculateRSI(prices, 14);
        const macd = indicators.calculateMACD(prices, 12, 26, 9);
        const sma20 = indicators.calculateSMA(prices, 20);
        const ema20 = indicators.calculateEMA(prices, 20);
        const bb = indicators.calculateBollingerBands(prices, 20, 2);
        const stoch = indicators.calculateStochasticOscillator(prices, 14);

        // Get latest indicator values
        features.push(
            rsi[rsi.length - 1],
            macd.MACD[macd.MACD.length - 1],
            macd.signal[macd.signal.length - 1],
            sma20[sma20.length - 1],
            ema20[ema20.length - 1]
        );

        // Add Bollinger Bands values
        if (bb && bb.length > 0) {
            const lastBB = bb[bb.length - 1];
            features.push(
                lastBB.upper,
                lastBB.middle,
                lastBB.lower,
                (prices[prices.length - 1] - lastBB.lower) / (lastBB.upper - lastBB.lower) // BB position
            );
        }

        // Add Stochastic values
        if (stoch && stoch.k.length > 0 && stoch.d.length > 0) {
            features.push(
                stoch.k[stoch.k.length - 1],
                stoch.d[stoch.d.length - 1]
            );
        }

        // Add pattern analysis
        const patternAnalysis = patterns.analyzeConsecutivePatterns(prices);
        features.push(
            patternAnalysis.consecutiveBulls,
            patternAnalysis.consecutiveBears,
            patternAnalysis.bullishProbability,
            patternAnalysis.bearishProbability
        );

        // Add price movement analysis
        const priceMovement = patterns.analyzePriceMovement(prices);
        features.push(
            priceMovement.momentum,
            priceMovement.volatility,
            priceMovement.trend === 'bullish' ? 1 : priceMovement.trend === 'bearish' ? -1 : 0
        );

        // Add reversal pattern analysis
        const reversalPattern = patterns.detectReversalPatterns(prices);
        features.push(
            reversalPattern.pattern === 'potential_bullish_reversal' ? 1 :
            reversalPattern.pattern === 'potential_bearish_reversal' ? -1 : 0,
            reversalPattern.strength
        );

        // Normalize features
        return features.map(feature => {
            if (typeof feature !== 'number' || isNaN(feature)) {
                logger.warn('Invalid feature detected:', feature);
                return 0;
            }
            return feature;
        });

    } catch (error) {
        logger.error('Error in feature preparation:', error);
        return [];
    }
}

/**
 * Prepares labels for training data
 * @param {Array<number>} prices - Array of prices
 * @returns {Array<number>} Array of labels (1 for up, 0 for down)
 */
function prepareLabels(prices) {
    if (!Array.isArray(prices) || prices.length < 2) {
        return [];
    }

    const labels = [];
    for (let i = 1; i < prices.length; i++) {
        labels.push(prices[i] > prices[i - 1] ? 1 : 0);
    }
    return labels;
}

module.exports = { 
    prepareFeatures,
    prepareLabels
};
