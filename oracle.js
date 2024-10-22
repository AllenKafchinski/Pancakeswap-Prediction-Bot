// oracle.js
const { ethers } = require('ethers');
const fs = require('fs');
const logger = require('./logger');
const config = require('./config');

// Load Oracle Contract ABI (AggregatorV3Interface)
const oracleABI = JSON.parse(fs.readFileSync('./ABIS/oracleABI.json', 'utf8'));

// Initialize Provider
const provider = new ethers.providers.WebSocketProvider(config.quicknodeWsUrl);

// Add WebSocket Event Listeners (optional, can be removed since no events are emitted)
// provider._websocket.on('open', () => {
//     logger.info('Connected to QuickNode WebSocket.');
// });

// provider._websocket.on('error', (err) => {
//     logger.error(`WebSocket Error: ${err}`);
// });

// provider._websocket.on('close', () => {
//     logger.error('WebSocket connection closed.');
// });

// Initialize Oracle Contract Instance
const oracleContract = new ethers.Contract(config.oracleContractAddress, oracleABI, provider);

// Debug: Check available functions in the contract
console.log('Available Functions in Oracle Contract:', oracleContract.functions);
console.log('Oracle Contract Initialized:', oracleContract.address);
console.log('Has latestRoundData:', typeof oracleContract.latestRoundData === 'function');

/**
 * Fetches the latest price from the Oracle.
 * @returns {Promise<number|null>} Latest price in USD.
 */
async function getLatestPrice() {
    try {
        const roundData = await oracleContract.latestRoundData();
        const decimals = await oracleContract.decimals();
        const price = Number(ethers.utils.formatUnits(roundData.answer, decimals));
        logger.info(`Latest Price: ${price} USD`);
        return price;
    } catch (error) {
        logger.error(`Error fetching latest price: ${error}`);
        return null;
    }
}


/**
 * Fetches historical prices between startRound and endRound.
 * @param {ethers.BigNumber} startRound - Starting round ID.
 * @param {ethers.BigNumber} endRound - Ending round ID.
 * @returns {Promise<Array<{roundId: string, price: number, timestamp: number}>>} Array of price data.
 */
async function getHistoricalPrices(startRound, endRound) {
    const prices = [];
    try {
        startRound = ethers.BigNumber.from(startRound.toString());
        endRound = ethers.BigNumber.from(endRound.toString());

        for (let currentRound = startRound; currentRound.lte(endRound); currentRound = currentRound.add(1)) {
            try {
                const roundData = await oracleContract.getRoundData(currentRound);
                const decimals = await oracleContract.decimals();
                const price = Number(ethers.utils.formatUnits(roundData.answer, decimals));
                const timestamp = roundData.updatedAt.toNumber();
                prices.push({ 
                    roundId: currentRound.toString(), 
                    price, 
                    timestamp 
                });
            } catch (error) {
                logger.error(`Error fetching roundData for roundId ${currentRound.toString()}: ${error}`);
            }
        }

        logger.info(`Fetched historical prices from round ${startRound.toString()} to ${endRound.toString()}`);
    } catch (error) {
        logger.error(`Error fetching historical prices: ${error}`);
    }
    return prices;
}

/**
 * Listens for new price updates via the 'AnswerUpdated' event.
 * Note: This contract is a proxy and does not emit events. This function is disabled.
 * @param {Function} callback - Function to execute on new price.
 */
// function listenForNewPrices(callback) {
//     oracleContract.on('AnswerUpdated', (current, roundId, updatedAt) => {
//         oracleContract.decimals().then(decimals => {
//             const price = Number(ethers.utils.formatUnits(current, decimals));
//             logger.info(`New Price Update: ${price} USD at Round ${roundId.toNumber()}, Timestamp ${updatedAt.toNumber()}`);
//             if (callback) callback(price);
//         }).catch(error => {
//             logger.error(`Error fetching decimals: ${error}`);
//         });
//     });
// }

module.exports = {
    getLatestPrice,
    getHistoricalPrices,
    oracleContract // Exporting the contract instance
};
