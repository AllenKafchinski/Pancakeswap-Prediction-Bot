// index.js

const { ethers } = require('ethers');
const fs = require('fs');
const config = require('./config');
const logger = require('./logger');
const profitTracker = require('./profitTracker');
const { getPrediction } = require('./prediction'); // Your prediction module
const oracleABI = JSON.parse(fs.readFileSync('./ABIS/oracleABI.json', 'utf8'));
const PREDICTION_ABI = JSON.parse(fs.readFileSync('./ABIS/contractABI.json', 'utf8'));

// Initialize Provider
const provider = new ethers.providers.JsonRpcProvider(config.quicknodeRpcUrl);

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
    if (config.mode === 'paper') {
        logger.info(`[PAPER] Simulated ${prediction} bet with size ${betSize.toFixed(4)} BNB for Round ID: ${roundId}`);
        return 'paper-transaction-hash';
    }

    try {
        // Initialize the wallet and contract
        const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
        const predictionContract = new ethers.Contract(config.predictionContractAddress, PREDICTION_ABI, wallet);

        // Convert betSize to wei, ensuring no fractional component
        const betAmount = ethers.utils.parseEther(betSize.toFixed(18));

        // Determine which function to call based on the prediction
        const betFunction = prediction === 'bull' ? predictionContract.betBull : predictionContract.betBear;

        // Check if betting is allowed for this round
        const epoch = await predictionContract.currentEpoch();
        if (epoch.toString() !== roundId) {
            logger.warn(`Current epoch ${epoch.toString()} does not match roundId ${roundId}. Skipping bet.`);
            return null;
        }

        // Place the bet
        const tx = await betFunction(roundId, { value: betAmount, gasLimit: 500000 });
        
        // Wait for the transaction to be mined
        const receipt = await tx.wait();

        logger.info(`Placed a ${prediction} bet with size ${betSize.toFixed(4)} BNB for Round ID: ${roundId}. Transaction hash: ${receipt.transactionHash}`);
        
        return receipt.transactionHash;
    } catch (error) {
        logger.error(`Error placing bet for Round ID ${roundId}: ${error}`);
        return null;
    }
}

/**
 * Monitors the current round and places bets.
 */
async function monitorRounds() {
    let lastRoundId = null;
    let pendingBets = new Set();
    let priceBuffer = [];

    // Fetch initial 100 rounds
    const initialRound = await getCurrentRoundData();
    priceBuffer = await fetchRecentPrices(initialRound.roundId, 100);

    while (true) {
        const currentRound = await getCurrentRoundData();
        if (!currentRound) {
            await sleep(100);
            continue;
        }
        if (currentRound.roundId !== lastRoundId) {
            lastRoundId = currentRound.roundId;
            logger.info(`Detected new Round ID: ${currentRound.roundId} at ${new Date(currentRound.updatedAt * 1000).toLocaleString()}`);
            
            // Update priceBuffer with the new round data
            priceBuffer.push(currentRound.price);
            if (priceBuffer.length > 100) {
                priceBuffer.shift();
            }

            // Check and update outcomes for all pending bets
            const betsToRemove = [];
            for (const betRoundId of pendingBets) {
                const betDetails = await profitTracker.getBetDetails(betRoundId);
                if (betDetails && betDetails.outcome === null) {
                    const roundResult = await getRoundResult(betRoundId);
                    if (roundResult.finished) {
                        const outcome = betDetails.prediction === roundResult.winner ? 'win' : 'lose';
                        const profitBNB = outcome === 'win' ? (betDetails.prediction === 'bull' && roundResult.closePrice === roundResult.lockPrice ? 0 : betDetails.betSize * 0.95) : -betDetails.betSize;
                        
                        await profitTracker.updateBetOutcome(betDetails.id, outcome, profitBNB);
                        logger.info(`Updated bet result for Round ${betRoundId}: ${outcome.toUpperCase()}, Profit: ${profitBNB.toFixed(4)} BNB`);
                        betsToRemove.push(betRoundId);

                        if (outcome === 'win' && !config.mode === 'paper') {
                            await claimWinnings(betRoundId);
                        }
                    }
                } else {
                    betsToRemove.push(betRoundId);
                }
            }

            // Remove processed bets from pendingBets
            betsToRemove.forEach(betRoundId => pendingBets.delete(betRoundId));

            // Make prediction and place bet
            const { prediction, betSize } = await getPrediction(priceBuffer);
            if (prediction && betSize > 0) {
                const txHash = await placeBet(prediction, betSize, currentRound.roundId);
                if (txHash) {
                    await profitTracker.recordBets([{
                        epoch: parseInt(currentRound.roundId, 10),
                        prediction,
                        betSize,
                        outcome: null,
                        profitBNB: null,
                        roundId: currentRound.roundId,
                        startingPrice: currentRound.price,
                        paperTrade: config.mode === 'paper'
                    }]);
                    logger.info(`${config.mode === 'paper' ? '[PAPER] Simulated' : 'Placed'} bet. Prediction: ${prediction}, Size: ${betSize.toFixed(4)} BNB.`);
                    pendingBets.add(currentRound.roundId);

                    // Display current stats after placing a bet
                    const summary = await profitTracker.getSummary();
                    logger.info('=== Current Bot Stats ===');
                    logger.info(`Total Bets: ${summary.totalBets}`);
                    logger.info(`Total Wins: ${summary.totalWins}`);
                    logger.info(`Total Losses: ${summary.totalLosses}`);
                    logger.info(`Total Profit: ${summary.totalProfitBNB.toFixed(4)} BNB`);
                    logger.info(`Win Rate: ${((summary.totalWins / summary.totalBets) * 100).toFixed(2)}%`);
                } else {
                    logger.warn(`Failed to place ${config.mode === 'paper' ? 'paper' : 'real'} bet for Round ID: ${currentRound.roundId}`);
                }
            } else {
                logger.warn(`No valid prediction to place a bet for Round ID: ${currentRound.roundId}`);
            }
        }

        await sleep(1000); // Check every 1 second
    }
}

/**
 * Fetches recent price data up to a specific Round ID.
 * @param {string} roundId - The Round ID up to which to fetch prices.
 * @param {number} limit - Number of past rounds to fetch.
 * @returns {Promise<Array<number>>} Array of prices.
 */
async function fetchRecentPrices(roundId, limit = 100) {
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
            break; // Exit the loop if we can't fetch more historical data
        }
    }

    return prices;
}


async function getRoundResult(roundId) {
    try {
        const provider = new ethers.providers.JsonRpcProvider(config.quicknodeRpcUrl);
        const predictionContract = new ethers.Contract(process.env.PREDICTION_CONTRACT_ADDRESS, PREDICTION_ABI, provider);

        const round = await predictionContract.rounds(roundId);
        const finished = round.oracleCalled;
        const closePrice = ethers.utils.formatUnits(round.closePrice, 8);
        const lockPrice = ethers.utils.formatUnits(round.lockPrice, 8);
        const winner = parseFloat(closePrice) >= parseFloat(lockPrice) ? 'bull' : 'bear';

        return { finished, winner, closePrice: parseFloat(closePrice) };
    } catch (error) {
        logger.error(`Error getting round result for ${roundId}:`, error);
        return { finished: false, winner: null, closePrice: null };
    }
}

async function claimWinnings(roundId) {
    try {
        const provider = new ethers.providers.JsonRpcProvider(config.quicknodeRpcUrl);
        const signer = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
        const predictionContract = new ethers.Contract(process.env.PREDICTION_CONTRACT_ADDRESS, PREDICTION_ABI, signer);

        const balanceBefore = await signer.getBalance();
        const tx = await predictionContract.claim([roundId]);
        const receipt = await tx.wait();
        const balanceAfter = await signer.getBalance();

        const actualProfit = balanceAfter.sub(balanceBefore);
        await profitTracker.updateActualProfit(roundId, ethers.utils.formatEther(actualProfit));

        logger.info(`Claimed winnings for round ${roundId}. Actual profit: ${ethers.utils.formatEther(actualProfit)} BNB. Transaction hash: ${receipt.transactionHash}`);
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
