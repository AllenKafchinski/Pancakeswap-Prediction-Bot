// backtest.js

const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');
const config = require('./config'); // Ensure your config includes provider and oracle details
const logger = require('./logger'); // Your logging utility

// Load Oracle Contract ABI
const oracleABI = JSON.parse(fs.readFileSync('./ABIS/oracleABI.json', 'utf8'));

// Initialize Provider
const provider = new ethers.providers.JsonRpcProvider(config.quicknodeRpcUrl); // Use JsonRpcProvider for backtesting

// Initialize Oracle Contract Instance
const oracleContract = new ethers.Contract(config.oracleContractAddress, oracleABI, provider);

/**
 * Sleep for a specified number of milliseconds.
 * @param {number} ms - Milliseconds to sleep.
 * @returns {Promise<void>}
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Fetches round data with retry logic.
 * @param {ethers.Contract} oracleContract - The Oracle contract instance.
 * @param {ethers.BigNumber} roundId - The Round ID to fetch.
 * @param {number} retries - Number of retry attempts.
 * @param {number} delayMs - Delay between retries in milliseconds.
 * @returns {Promise<Object|null>} The round data or null if failed.
 */
async function fetchRoundDataWithRetry(oracleContract, roundId, retries = 3, delayMs = 100) {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const roundData = await oracleContract.getRoundData(roundId);
            return roundData;
        } catch (error) {
            logger.error(`Attempt ${attempt} - Error fetching Round ID ${roundId.toString()}: ${error}`);
            if (attempt < retries) {
                logger.info(`Retrying Round ID ${roundId.toString()} after ${delayMs}ms...`);
                await sleep(delayMs);
            } else {
                logger.error(`Failed to fetch Round ID ${roundId.toString()} after ${retries} attempts.`);
                return null; // Skip this Round ID
            }
        }
    }
    return null;
}

/**
 * Fetches historical round data between two round IDs.
 * @param {ethers.BigNumber} startRoundId - Starting Round ID (inclusive).
 * @param {ethers.BigNumber} endRoundId - Ending Round ID (inclusive).
 * @returns {Promise<Array>} Array of round data objects.
 */
async function fetchHistoricalRounds(startRoundId, endRoundId) {
    const historicalRounds = [];
    let currentRoundId = startRoundId;
    while (currentRoundId.lte(endRoundId)) {
        const roundData = await fetchRoundDataWithRetry(oracleContract, currentRoundId);
        if (roundData) {
            const decimals = await oracleContract.decimals();
            const price = Number(ethers.utils.formatUnits(roundData.answer, decimals));
            const updatedAt = roundData.updatedAt.toString(); // Store as string to avoid overflow
            historicalRounds.push({
                roundId: currentRoundId.toString(),
                price,
                updatedAt
            });
            logger.info(`Fetched Round ID: ${currentRoundId.toString()}, Price: ${price} USD, UpdatedAt: ${updatedAt}`);
        } else {
            logger.warn(`Skipping Round ID ${currentRoundId.toString()} due to persistent errors.`);
        }
        // Increment Round ID
        currentRoundId = currentRoundId.add(1);
        // Wait for 0.1 seconds before the next request
        await sleep(100);
    }
    return historicalRounds;
}

// Example Usage:
(async () => {
    try {
        // Fetch the latest Round ID first
        const latestRoundData = await oracleContract.latestRoundData();
        const latestRoundId = latestRoundData.roundId;
        logger.info(`Latest Round ID: ${latestRoundId.toString()}`);

        // Define how many past rounds you want to backtest
        const numberOfRounds = 5000; // Adjust as needed

        // Calculate start and end Round IDs
        const startRoundId = latestRoundId.sub(ethers.BigNumber.from(numberOfRounds));
        const endRoundId = latestRoundId;

        logger.info(`Fetching historical rounds from ${startRoundId.toString()} to ${endRoundId.toString()}...`);

        const historicalData = await fetchHistoricalRounds(startRoundId, endRoundId);

        // Save to a JSON file for later use
        fs.writeFileSync(path.resolve(__dirname, 'historicalRounds.json'), JSON.stringify(historicalData, null, 2));
        logger.info('Historical round data fetched and saved.');
    } catch (error) {
        logger.error(`Error during backtest setup: ${error}`);
    }
})();
