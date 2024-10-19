// prediction.js

const logger = require('./logger');
const { calculateRSI, calculateMACD, calculateSMA, calculateEMA, calculateBollingerBands, calculateStochasticOscillator } = require('./indicators');
const { RandomForestPredictor, prepareFeatures, prepareLabels } = require('./randomForests');

// Bet Size Parameters
const BET_SIZES = {
    minBet: 0.0001, // Minimum bet in BNB
    maxBet: 0.005  // Maximum bet in BNB
};

const CONFIDENCE_SCORE = {
    min: -3, // Minimum possible score
    max: 3   // Maximum possible score
};

/**
 * Calculates confidence score based on indicators.
 * @param {Object} indicators - The technical indicators.
 * @returns {number} Confidence score.
 */
function calculateConfidence(indicators) {
    let score = 0;

    // RSI Scoring
    if (indicators.RSI < 30) {
        score += 2; // Strong Bullish
    } else if (indicators.RSI < 50) {
        score += 1; // Bullish
    } else if (indicators.RSI > 70) {
        score -= 2; // Strong Bearish
    } else if (indicators.RSI > 50) {
        score -= 1; // Weak Bearish
    }

    // MACD Scoring
    if (indicators.MACD > indicators.Signal) {
        score += 2; // Strong Bullish
    } else if (indicators.MACD > indicators.Signal - 0.01 && indicators.MACD < indicators.Signal + 0.01) {
        score += 1; // Bullish Crossover
    } else if (indicators.MACD < indicators.Signal) {
        score -= 2; // Strong Bearish
    } else if (indicators.MACD > indicators.Signal - 0.01 && indicators.MACD < indicators.Signal + 0.01) {
        score -= 1; // Bearish Crossover
    }

    // Bollinger Bands Scoring
    if (indicators.price < indicators.bollingerBands.lower) {
        score += 1; // Potential Bullish Reversal
    } else if (indicators.price > indicators.bollingerBands.upper) {
        score -= 1; // Potential Bearish Reversal
    }

    // Stochastic Oscillator Scoring
    if (indicators.stochastic.percentK < 20) {
        score += 1; // Oversold
    } else if (indicators.stochastic.percentK > 80) {
        score -= 1; // Overbought
    }

    // SMA/EMA Scoring
    if (indicators.price > indicators.SMA20 && indicators.price > indicators.EMA20) {
        score += 1; // Bullish Trend
    } else if (indicators.price < indicators.SMA20 && indicators.price < indicators.EMA20) {
        score -= 1; // Bearish Trend
    }

    // Additional indicators can be added here with corresponding scoring

    return score;
}

/**
 * Maps a confidence score to a bet size using linear scaling.
 * @param {number} score - Confidence score.
 * @returns {number} Bet size in BNB.
 */
function mapScoreToBetSize(score) {
    const { minBet, maxBet } = BET_SIZES;
    const { min, max } = CONFIDENCE_SCORE;

    // Clamp the score within the defined range
    const clampedScore = Math.max(min, Math.min(max, score));

    // Use a sigmoid function for more aggressive betting on high confidence
    const normalized = 1 / (1 + Math.exp(-clampedScore));

    // Calculate bet size
    const betSize = minBet + normalized * (maxBet - minBet);

    return betSize;
}

/**
 * Makes a prediction and determines bet size based on confidence score.
 * @param {Array<number>} priceBuffer - Array of recent prices.
 * @returns {Object} { prediction: 'bull' | 'bear' | null, betSize: number }
 */
async function getPrediction(priceBuffer) {
    if (!Array.isArray(priceBuffer) || priceBuffer.length < 100) {
        logger.warn('Not enough data to make a prediction.');
        return { prediction: 'bear', betSize: BET_SIZES.minBet }; // Default to a small bet
    }

    try {
        const features = prepareFeatures(priceBuffer);
        if (features.length === 0) {
            logger.warn('Failed to prepare features for prediction.');
            return { prediction: 'bear', betSize: BET_SIZES.minBet }; // Default to a small bet
        }

        const labels = prepareLabels(priceBuffer);

        const randomForest = new RandomForestPredictor();
        await randomForest.train(features, labels);

        const latestFeatures = prepareFeatures(priceBuffer.slice(-51));
        if (latestFeatures.length === 0) {
            logger.warn('Failed to prepare latest features for prediction.');
            return { prediction: 'bear', betSize: BET_SIZES.minBet }; // Default to a small bet
        }

        const rfPrediction = await randomForest.predict(latestFeatures);

        // Calculate technical indicators
        const rsi = calculateRSI(priceBuffer, 14);
        const macd = calculateMACD(priceBuffer, 12, 26, 9);
        const sma20 = calculateSMA(priceBuffer, 20);
        const ema20 = calculateEMA(priceBuffer, 20);
        const bb = calculateBollingerBands(priceBuffer, 20, 2);
        const stoch = calculateStochasticOscillator(priceBuffer, 14);

        // Combine Random Forest prediction with technical indicators
        const technicalScore = calculateConfidence({
            RSI: rsi[rsi.length - 1],
            MACD: macd.MACD[macd.MACD.length - 1],
            Signal: macd.signal[macd.signal.length - 1],
            SMA20: sma20[sma20.length - 1],
            EMA20: ema20[ema20.length - 1],
            bollingerBands: bb[bb.length - 1],
            stochastic: { percentK: stoch.k[stoch.k.length - 1], percentD: stoch.d[stoch.d.length - 1] },
            price: priceBuffer[priceBuffer.length - 1]
        });

        const combinedScore = (rfPrediction - 0.5) * 5 + technicalScore * 0.5;
        const confidenceScore = combinedScore / 2;
        const betSize = mapScoreToBetSize(Math.abs(confidenceScore));

        let predictionDirection = null; // Default prediction
        if (confidenceScore > 0.10) {
            predictionDirection = 'bull';
        } else if (confidenceScore < -0.10) {
            predictionDirection = 'bear';
        }

        logger.info(`Combined Prediction: ${combinedScore}, Confidence Score: ${confidenceScore}, Bet Size: ${betSize.toFixed(4)} BNB, Prediction: ${predictionDirection}`);
        return { prediction: predictionDirection, betSize };
    } catch (error) {
        logger.error('Error in getPrediction:', error);
        return { prediction: null, betSize: BET_SIZES.minBet }; // Default to a small bet
    }
}

module.exports = { getPrediction };
