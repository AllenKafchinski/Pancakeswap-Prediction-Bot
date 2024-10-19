// index.js

const { ethers } = require('ethers');
const config = require('./config');
const logger = require('./logger');
const profitTracker = require('./profitTracker');
const { getPrediction } = require('./prediction'); // Your prediction module
const oracleABI = JSON.parse(fs.readFileSync('./ABIS/oracleABI.json', 'utf8'));
const PREDICTION_ABI = JSON.parse(fs.readFileSync('./ABIS/predictionABI.json', 'utf8'));

// Initialize Provider
const provider = new ethers.providers.JsonRpcProvider(config.rpcUrl);

// Initialize Oracle Contract Instance
const oracleContract = new ethers.Contract(config.oracleContractAddress, oracleABI, provider);

/**
 * Fetches the current round data.
 * @returns {Promise<Object>} Current round data.
 */
async function getCurrentRoundData() {
    try {
        const roundData = await oracleContract.latestRoundData();
        return {
            roundId: roundData.roundId.toString(),
            price: Number(ethers.utils.formatUnits(roundData.answer, await oracleContract.decimals())),
            updatedAt: Number(roundData.updatedAt.toString())
        };
    } catch (error) {
        logger.error(`Error fetching current round data: ${error}`);
        return null;
    }
}

/**
 * Places a bet based on the prediction.
 * @param {string} prediction - 'bull' or 'bear'.
 * @param {number} betSize - Bet size in BNB.
 * @param {string} roundId - Current Round ID.
 */
async function placeBet(prediction, betSize, roundId) {
    try {
        // Implement your bet placement logic here.
        // Example:
        // const tx = await predictionContract.bet(prediction, { value: ethers.utils.parseEther(betSize.toString()) });
        // await tx.wait();
        logger.info(`Placed a ${prediction} bet with size ${betSize.toFixed(4)} BNB for Round ID: ${roundId}.`);
    } catch (error) {
        logger.error(`Error placing bet for Round ID ${roundId}: ${error}`);
    }
}

/**
 * Monitors the current round and schedules bets.
 */
async function monitorRounds() {
    let lastRoundId = null;
    let pendingClaims = new Set();
    while (true) {
        const currentRound = await getCurrentRoundData();
        if (!currentRound) {
            await sleep(500); // Wait for 0.5 second before retrying
            continue;
        }
        if (currentRound.roundId !== lastRoundId) {
            lastRoundId = currentRound.roundId;
            logger.info(`Detected new Round ID: ${currentRound.roundId} at ${new Date(currentRound.updatedAt * 1000).toLocaleString()}`);
            
            // Check for finished rounds and claim winnings
            for (const roundId of pendingClaims) {
                const roundResult = await getRoundResult(roundId);
                if (roundResult.finished) {
                    const betDetails = await profitTracker.getBetDetails(roundId);
                    if (betDetails && roundResult.winner === betDetails.prediction) {
                        const claimTxHash = await claimWinnings(roundId);
                        if (claimTxHash) {
                            await profitTracker.updateBetOutcome(betDetails.id, 'win', betDetails.betAmount * 0.95); // Assuming 95% payout
                            pendingClaims.delete(roundId);
                        }
                    } else {
                        await profitTracker.updateBetOutcome(betDetails.id, 'lose', -betDetails.betAmount);
                        pendingClaims.delete(roundId);
                    }
                }
            }

            // Calculate the time to wait before placing the bet
            const roundDuration = 300; // 5 minutes in seconds
            const betPlacementTime = roundDuration - 15; // Place bet 15 seconds before round end
            const betTime = (currentRound.updatedAt + betPlacementTime) * 1000; // Convert to milliseconds
            const currentTime = Date.now();
            const delay = betTime - currentTime;

            if (delay > 0) {
                logger.info(`Scheduling bet in ${(delay / 1000).toFixed(2)} seconds.`);
                setTimeout(async () => {
                    // Fetch recent price data
                    const priceBuffer = await fetchRecentPrices(currentRound.roundId, 50);
                    if (priceBuffer.length < 50) {
                        logger.warn(`Insufficient price data for Round ID: ${currentRound.roundId}`);
                        return;
                    }

                    // Make prediction
                    const { prediction, betSize } = await getPrediction(priceBuffer);
                    if (prediction && betSize > 0) {
                        await placeBet(prediction, betSize, currentRound.roundId);
                        // Record the bet in the database
                        const betId = await profitTracker.recordBet(
                            parseInt(currentRound.roundId, 10),
                            prediction,
                            betSize,
                            currentRound.price
                        );
                        logger.info(`Scheduled bet placed. Bet ID: ${betId}, Prediction: ${prediction}, Size: ${betSize.toFixed(4)} BNB.`);
                        pendingClaims.add(currentRound.roundId);
                    } else {
                        logger.warn(`No valid prediction to place a bet for Round ID: ${currentRound.roundId}`);
                    }
                }, delay);
            } else {
                logger.warn(`Bet placement time has already passed for Round ID: ${currentRound.roundId}`);
            }
        }

        // Wait before checking for new rounds again
        await sleep(1000); // Check every 1 second
    }
}

/**
 * Fetches recent price data up to a specific Round ID.
 * @param {string} roundId - The Round ID up to which to fetch prices.
 * @param {number} limit - Number of past rounds to fetch.
 * @returns {Promise<Array<number>>} Array of prices.
 */
async function fetchRecentPrices(roundId, limit = 50) {
    const prices = [];
    let currentRoundId = ethers.BigNumber.from(roundId);

    for (let i = 0; i < limit; i++) {
        try {
            const roundData = await oracleContract.getRoundData(currentRoundId);
            const decimals = await oracleContract.decimals();
            const price = Number(ethers.utils.formatUnits(roundData.answer, decimals));
            prices.unshift(price); // Add to the beginning of the array
            currentRoundId = currentRoundId.sub(1);
        } catch (error) {
            logger.error(`Error fetching Round ID ${currentRoundId.toString()}: ${error}`);
            break; // Exit the loop on persistent errors
        }
    }

    return prices;
}

async function getRoundResult(roundId) {
    try {
        const provider = new ethers.providers.JsonRpcProvider(process.env.RPC_URL);
        const predictionContract = new ethers.Contract(process.env.PREDICTION_CONTRACT_ADDRESS, PREDICTION_ABI, provider);

        const round = await predictionContract.rounds(roundId);
        const finished = round.oracleCalled;
        const winner = round.closePrice > round.lockPrice ? 'bull' : 'bear';

        return { finished, winner };
    } catch (error) {
        logger.error(`Error getting round result for ${roundId}:`, error);
        return { finished: false, winner: null };
    }
}

async function claimWinnings(roundId) {
    try {
        const provider = new ethers.providers.JsonRpcProvider(process.env.RPC_URL);
        const signer = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
        const predictionContract = new ethers.Contract(process.env.PREDICTION_CONTRACT_ADDRESS, PREDICTION_ABI, signer);

        const tx = await predictionContract.claim([roundId]);
        const receipt = await tx.wait();

        logger.info(`Claimed winnings for round ${roundId}. Transaction hash: ${receipt.transactionHash}`);
        return receipt.transactionHash;
    } catch (error) {
        logger.error(`Error claiming winnings for round ${roundId}:`, error);
        return null;
    }
}

/**
 * Sleep for a specified number of milliseconds.
 * @param {number} ms - Milliseconds to sleep.
 * @returns {Promise<void>}
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Start monitoring rounds
monitorRounds().catch(error => {
    logger.error(`Error in monitorRounds: ${error}`);
});
