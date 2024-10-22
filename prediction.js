// prediction.js

const logger = require('./logger');
const config = require('./config');
const { calculateRSI, calculateMACD, calculateSMA, calculateEMA, calculateBollingerBands, calculateStochasticOscillator } = require('./indicators');
const { RandomForestPredictor, prepareFeatures, prepareLabels } = require('./randomForests');

// Bet Size Parameters
const BET_SIZES = {
    minBet: config.betMin, // Minimum bet in BNB
    maxBet: config.betMax  // Maximum bet in BNB
};

const CONFIDENCE_SCORE = {
    min: config.minConfidence, // Minimum possible score
    max: config.maxConfidence   // Maximum possible score
};

/**
 * Calculates confidence score based on indicators.
 * @param {Object} indicators - The technical indicators.
 * @returns {number} Confidence score.
 */
function calculateConfidence(indicators) {
    let score = 0;

    // RSI Scoring
    logger.info(`RSI: ${indicators.RSI}`)
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
    logger.info(`Current round finish Price: ${indicators.price}`)
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

    // Ensure minBet and maxBet are numbers
    const minBetNum = Number(minBet);
    const maxBetNum = Number(maxBet);

    // Clamp the score within the defined range
    const clampedScore = Math.max(min, Math.min(max, score));

    // Use a sigmoid function for more aggressive betting on high confidence
    const normalized = 1 / (1 + Math.exp(-clampedScore));

    // Calculate bet size
    const betSize = minBetNum + normalized * (maxBetNum - minBetNum);

    // Ensure betSize is a number
    if (isNaN(betSize)) {
        logger.error('Calculated betSize is NaN, defaulting to minBet');
        return minBetNum;
    }

    // Log the calculated bet size
    logger.info(`Calculated Bet Size: ${betSize.toFixed(4)} BNB`);

    return betSize; // Return betSize as a number
}

/**
 * Makes a prediction and determines bet size based on confidence score.
 * @param {Array<number>} priceBuffer - Array of recent prices.
 * @returns {Object} { prediction: 'bull' | 'bear' | null, betSize: number }
 */
async function getPrediction(priceBuffer) {
    if (!Array.isArray(priceBuffer) || priceBuffer.length < 100) {
        logger.warn('Not enough data to make a prediction. Price buffer length is:');
        logger.warn(`${priceBuffer}, ${priceBuffer.length}`)
        return { prediction: null, betSize: BET_SIZES.minBet }; // Default to a small bet
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
        logger.debug(`MACD values: ${JSON.stringify(macd)}`);
        logger.debug(`Last MACD value: ${macd.MACD[macd.MACD.length - 1]}`);
        logger.debug(`Last Signal value: ${macd.signal[macd.signal.length - 1]}`);
        const sma20 = calculateSMA(priceBuffer, 20);
        const ema20 = calculateEMA(priceBuffer, 20);
        const bb = calculateBollingerBands(priceBuffer, 20, 2);
        const stoch = calculateStochasticOscillator(priceBuffer, 14);

        // Combine Random Forest prediction with technical indicators
        const technicalScore = calculateConfidence({
            RSI: rsi.length > 0 ? rsi[rsi.length - 1] : 50,
            MACD: macd.MACD.length > 0 ? macd.MACD[macd.MACD.length - 1] : 0,
            Signal: macd.signal.length > 0 ? macd.signal[macd.signal.length - 1] : 0,
            SMA20: sma20.length > 0 ? sma20[sma20.length - 1] : priceBuffer[priceBuffer.length - 1],
            EMA20: ema20.length > 0 ? ema20[ema20.length - 1] : priceBuffer[priceBuffer.length - 1],
            bollingerBands: bb.length > 0 ? bb[bb.length - 1] : { upper: 0, middle: 0, lower: 0 },
            stochastic: { 
                percentK: stoch.k.length > 0 ? stoch.k[stoch.k.length - 1] : 50, 
                percentD: stoch.d.length > 0 ? stoch.d[stoch.d.length - 1] : 50 
            },
            price: priceBuffer[priceBuffer.length - 1]
        });

        const combinedScore = (rfPrediction - 0.5) * 5 + technicalScore * 0.5;
        const confidenceScore = combinedScore / 2;
        const betSize = mapScoreToBetSize(Math.abs(confidenceScore));

        let predictionDirection = null; // Default prediction
        if (confidenceScore > config.bullConfidence) {
            predictionDirection = 'bull';
        } else if (confidenceScore < config.bearConfidence) {
            predictionDirection = 'bear';
        }

        logger.info(`Combined Prediction: ${combinedScore}, Confidence Score: ${confidenceScore}, Bet Size: ${betSize.toFixed(4)} BNB, Prediction: ${predictionDirection}`);
return { prediction: predictionDirection, betSize: Number(betSize) }; // Ensure betSize is a number
    } catch (error) {
        logger.error('Error in getPrediction:', error);
        return { prediction: null, betSize: BET_SIZES.minBet }; // Default to a small bet
    }
}

module.exports = { getPrediction };
