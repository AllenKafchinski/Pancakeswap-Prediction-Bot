const { ethers } = require('ethers');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const config = require('./config');
const logger = require('./logger');

// Load Oracle Contract ABI
const oracleABI = require('./ABIS/oracleABI.json');

// Initialize Provider
const provider = new ethers.providers.JsonRpcProvider(config.quicknodeRpcUrl);

// Initialize Oracle Contract Instance
const oracleContract = new ethers.Contract(config.oracleContractAddress, oracleABI, provider);

// Initialize SQLite Database
const dbPath = path.resolve(__dirname, 'historicalData.db');
const db = new sqlite3.Database(dbPath);

// Create the table if it doesn't exist
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS rounds (
    roundId TEXT PRIMARY KEY,
    price REAL,
    updatedAt TEXT,
    priceBuffer TEXT
  )`);
});

/**
 * Sleep for a specified number of milliseconds.
 * @param {number} ms - Milliseconds to sleep.
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
 * Fetches historical round data between two round IDs and stores it in the SQLite database.
 * @param {ethers.BigNumber} startRoundId - Starting Round ID (inclusive).
 * @param {ethers.BigNumber} endRoundId - Ending Round ID (inclusive).
 * @returns {Promise<void>}
 */
async function fetchHistoricalRounds(startRoundId, endRoundId) {
  let currentRoundId = startRoundId;
  while (currentRoundId.lte(endRoundId)) {
    const roundData = await fetchRoundDataWithRetry(oracleContract, currentRoundId);
    if (roundData) {
      const decimals = await oracleContract.decimals();
      const price = Number(ethers.utils.formatUnits(roundData.answer, decimals));
      const updatedAt = roundData.updatedAt.toString(); // Store as string to avoid overflow
      const priceBuffer = JSON.stringify([]); // Initialize priceBuffer as an empty array

      db.run(
        `INSERT OR REPLACE INTO rounds (roundId, price, updatedAt, priceBuffer) VALUES (?, ?, ?, ?)`,
        [currentRoundId.toString(), price, updatedAt, priceBuffer],
        (err) => {
          if (err) {
            logger.error(`Error inserting round ${currentRoundId.toString()}: ${err.message}`);
          } else {
            logger.info(`Fetched Round ID: ${currentRoundId.toString()}, Price: ${price} USD, UpdatedAt: ${updatedAt}`);
          }
        }
      );
    } else {
      logger.warn(`Skipping Round ID ${currentRoundId.toString()} due to persistent errors.`);
    }
    // Increment Round ID
    currentRoundId = currentRoundId.add(1);
    // Wait for 0.1 seconds before the next request
    await sleep(100);
  }
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

    await fetchHistoricalRounds(startRoundId, endRoundId);

    logger.info('Historical round data fetched and saved to the database.');
  } catch (error) {
    logger.error(`Error during backtest setup: ${error}`);
  }
})();
