// patterns.js
const logger = require('./logger');

/**
 * Analyzes consecutive candle patterns
 * @param {Array<number>} prices - Array of 5-minute prices
 * @returns {Object} Pattern analysis results
 */
function analyzeConsecutivePatterns(prices) {
    if (!Array.isArray(prices) || prices.length < 3) {
        return {
            consecutiveBulls: 0,
            consecutiveBears: 0,
            bullishProbability: 0.5,
            bearishProbability: 0.5
        };
    }

    let consecutiveBulls = 0;
    let consecutiveBears = 0;
    let currentBullStreak = 0;
    let currentBearStreak = 0;

    // Analyze the last 20 candles for patterns
    const recentPrices = prices.slice(-20);
    
    for (let i = 1; i < recentPrices.length; i++) {
        const priceChange = recentPrices[i] - recentPrices[i - 1];
        
        if (priceChange > 0) {
            currentBullStreak++;
            currentBearStreak = 0;
            consecutiveBulls = Math.max(consecutiveBulls, currentBullStreak);
        } else if (priceChange < 0) {
            currentBearStreak++;
            currentBullStreak = 0;
            consecutiveBears = Math.max(consecutiveBears, currentBearStreak);
        } else {
            currentBullStreak = 0;
            currentBearStreak = 0;
        }
    }

    // Calculate probabilities based on consecutive patterns
    // The longer the streak, the higher the probability of reversal
    const bullishProbability = consecutiveBears >= 3 ? 0.7 : 
                              consecutiveBears >= 2 ? 0.6 : 
                              consecutiveBulls >= 3 ? 0.3 : 
                              consecutiveBulls >= 2 ? 0.4 : 0.5;

    const bearishProbability = consecutiveBulls >= 3 ? 0.7 : 
                              consecutiveBulls >= 2 ? 0.6 : 
                              consecutiveBears >= 3 ? 0.3 : 
                              consecutiveBears >= 2 ? 0.4 : 0.5;

    return {
        consecutiveBulls: currentBullStreak,
        consecutiveBears: currentBearStreak,
        maxConsecutiveBulls: consecutiveBulls,
        maxConsecutiveBears: consecutiveBears,
        bullishProbability,
        bearishProbability
    };
}

/**
 * Analyzes price movement patterns
 * @param {Array<number>} prices - Array of 5-minute prices
 * @returns {Object} Price movement analysis
 */
function analyzePriceMovement(prices) {
    if (!Array.isArray(prices) || prices.length < 5) {
        return {
            trend: 'neutral',
            momentum: 0,
            volatility: 0
        };
    }

    // Calculate recent price changes
    const changes = [];
    for (let i = 1; i < prices.length; i++) {
        changes.push((prices[i] - prices[i - 1]) / prices[i - 1]);
    }

    // Calculate momentum (rate of price change)
    const momentum = changes.slice(-5).reduce((sum, change) => sum + change, 0);

    // Calculate volatility
    const volatility = Math.sqrt(
        changes.slice(-5)
            .map(change => Math.pow(change - (momentum / 5), 2))
            .reduce((sum, squared) => sum + squared, 0) / 5
    );

    // Determine trend
    const recentChanges = changes.slice(-5);
    const upMoves = recentChanges.filter(change => change > 0).length;
    const downMoves = recentChanges.filter(change => change < 0).length;

    const trend = upMoves > downMoves ? 'bullish' : 
                 downMoves > upMoves ? 'bearish' : 'neutral';

    return {
        trend,
        momentum,
        volatility,
        recentChanges: changes.slice(-5)
    };
}

/**
 * Detects potential reversal patterns
 * @param {Array<number>} prices - Array of 5-minute prices
 * @returns {Object} Reversal pattern analysis
 */
function detectReversalPatterns(prices) {
    if (!Array.isArray(prices) || prices.length < 5) {
        return {
            pattern: 'none',
            strength: 0
        };
    }

    const recentPrices = prices.slice(-5);
    const priceChanges = [];
    
    for (let i = 1; i < recentPrices.length; i++) {
        priceChanges.push(recentPrices[i] - recentPrices[i - 1]);
    }

    // Check for potential reversal patterns
    const allPositive = priceChanges.every(change => change > 0);
    const allNegative = priceChanges.every(change => change < 0);
    const lastChange = priceChanges[priceChanges.length - 1];

    let pattern = 'none';
    let strength = 0;

    if (allPositive && lastChange > Math.max(...priceChanges.slice(0, -1))) {
        pattern = 'potential_bearish_reversal';
        strength = 0.7;
    } else if (allNegative && lastChange < Math.min(...priceChanges.slice(0, -1))) {
        pattern = 'potential_bullish_reversal';
        strength = 0.7;
    }

    return {
        pattern,
        strength
    };
}

module.exports = {
    analyzeConsecutivePatterns,
    analyzePriceMovement,
    detectReversalPatterns
};
