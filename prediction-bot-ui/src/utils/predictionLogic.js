import { analyzeTechnicals } from './indicatorUtils';
import { settingsStore } from './settingsStore';

/**
 * Makes a prediction and determines bet size based on confidence score.
 */
export async function getPrediction(priceBuffer) {
  if (!Array.isArray(priceBuffer) || priceBuffer.length < 100) {
    console.warn('Not enough data to make a prediction');
    return { prediction: null, betSize: 0 };
  }

  try {
    // Get current settings
    const settings = settingsStore.getSettings();

    // Calculate technical scores
    const scores = analyzeTechnicals(priceBuffer);
    console.log('Technical scores:', scores);

    // Calculate bet size based on confidence
    const betSize = mapScoreToBetSize(Math.abs(scores.totalScore), settings);

    // Determine prediction based on confidence thresholds
    let prediction = null;
    if (scores.totalScore > settings.bullConfidence) {
      prediction = 'bull';
    } else if (scores.totalScore < settings.bearConfidence) {
      prediction = 'bear';
    }

    // Always make a prediction based on score direction
    if (prediction === null) {
      prediction = scores.totalScore > 0 ? 'bull' : 'bear';
    }

    console.log('Prediction result:', {
      prediction,
      betSize,
      confidence: scores.totalScore,
      indicators: {
        rsiScore: scores.rsiScore,
        macdScore: scores.macdScore,
        bbScore: scores.bbScore,
        stochScore: scores.stochScore,
        maScore: scores.maScore,
        totalConfidence: scores.totalScore
      }
    });

    return { 
      prediction, 
      betSize, 
      confidence: scores.totalScore,
      indicators: {
        rsiScore: scores.rsiScore,
        macdScore: scores.macdScore,
        bbScore: scores.bbScore,
        stochScore: scores.stochScore,
        maScore: scores.maScore,
        totalConfidence: scores.totalScore
      }
    };
  } catch (error) {
    console.error('Error in getPrediction:', error);
    return { prediction: null, betSize: 0 };
  }
}

/**
 * Maps a confidence score to a bet size using sigmoid scaling.
 */
function mapScoreToBetSize(score, settings) {
  const { minBet, maxBet } = settings;

  // Use a sigmoid function for more aggressive betting on high confidence
  const normalized = 1 / (1 + Math.exp(-score * 5)); // Multiply by 5 to steepen the curve

  // Calculate bet size
  const betSize = minBet + normalized * (maxBet - minBet);

  // Ensure betSize is within bounds
  return Math.min(Math.max(betSize, minBet), maxBet);
}
