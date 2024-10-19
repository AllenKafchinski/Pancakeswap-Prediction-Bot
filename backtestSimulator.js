//node backtestSimulator.js

const fs = require('fs');
const path = require('path');
const logger = require('./logger');
const { getPrediction } = require('./prediction'); // Ensure this path is correct
const profitTracker = require('./profitTracker'); // Ensure this path is correct


/**
 * Loads historical round data from a JSON file.
 * @returns {Array} Array of historical round data.
 */
function loadHistoricalData() {
    const dataPath = path.resolve(__dirname, 'historicalRounds.json');
    if (!fs.existsSync(dataPath)) {
        logger.error('Historical rounds data file not found.');
        process.exit(1);
    }
    const rawData = fs.readFileSync(dataPath);
    try {
        const data = JSON.parse(rawData);
        logger.info(`Loaded ${data.length} historical rounds.`);
        return data;
    } catch (parseError) {
        logger.error('Error parsing historicalRounds.json:', parseError);
        process.exit(1);
    }
}

/**
 * Simulates backtesting by processing historical round data.
 */
async function runBacktest() {
    logger.info('Starting backtest simulation...');
    const historicalRounds = loadHistoricalData();
    let priceBuffer = [];
    const betRecords = []; // Array to store bet records

    for (let i = 0; i < historicalRounds.length - 1; i++) {
        const currentRound = historicalRounds[i];
        const nextRound = historicalRounds[i + 1];
        const { roundId, price } = currentRound;
        const { price: endingPrice } = nextRound;

        priceBuffer.push(price);
        if (priceBuffer.length > 200) {
            priceBuffer.shift();
        }

        if (i % 10 === 0) {
            logger.info(`Processing Round ID: ${roundId} (${i + 1}/${historicalRounds.length - 1})`);
        }

        try {
            const { prediction, betSize } = await getPrediction(priceBuffer);
            if (!prediction || betSize === 0) {
                logger.warn(`No prediction made for Round ID: ${roundId}`);
                continue;
            }

            const epoch = parseInt(roundId, 10);
            const startingPrice = price;
            const outcome = prediction === (endingPrice > startingPrice ? 'bull' : 'bear') ? 'win' : 'lose';
            const profitBNB = outcome === 'win' ? betSize * 0.95 : -betSize;

            // Store bet record in array
            betRecords.push({ epoch, prediction, betSize, outcome, profitBNB, roundId, startingPrice });

        } catch (error) {
            logger.error(`Error processing Round ID ${roundId}:`, error);
        }
    }

    // Batch insert bet records into the database
    await profitTracker.recordBets(betRecords);

    // Retrieve and display summary
    try {
        const summary = await profitTracker.getSummary();
        logger.info(`=== Backtest Profitability Summary ===
Total Bets: ${summary.totalBets}
Total Wins: ${summary.totalWins}
Total Losses: ${summary.totalLosses}
Total Profit: ${summary.totalProfitBNB.toFixed(4)} BNB
Win Rate: ${summary.totalBets > 0 ? ((summary.totalWins / summary.totalBets) * 100).toFixed(2) : 0}%`);
    } catch (error) {
        logger.error('Error retrieving summary:', error);
    }

    logger.info('Backtest simulation completed.');
}

// Run the backtest
runBacktest().catch(error => {
    logger.error('Unhandled error in backtestSimulator.js:', error);
});
