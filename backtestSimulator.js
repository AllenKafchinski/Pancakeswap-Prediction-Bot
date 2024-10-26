const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const os = require('os');
const sqlite3 = require('sqlite3').verbose();
const logger = require('./logger');
const profitTracker = require('./profitTracker');
const { getPrediction } = require('./prediction');

const CHUNK_SIZE = 500;
const MAX_RAM_USAGE = 0.9; // 90% of total RAM

function checkMemoryUsage() {
    const usedMemory = process.memoryUsage().heapUsed;
    const totalMemory = os.totalmem();
    return (usedMemory / totalMemory) < MAX_RAM_USAGE;
}

if (!isMainThread) {
    const { startOffset, endOffset, workerId } = workerData;
    runBacktestWorker(startOffset, endOffset, workerId).catch(error => {
        logger.error(`Worker ${workerId} encountered an error:`, error);
    });
}

async function runBacktestWorker(startOffset, endOffset, workerId) {
    logger.info(`Worker ${workerId} started processing from offset ${startOffset} to ${endOffset}`);
    let offset = startOffset;
    let betRecords = [];
    const priceHistory = [];
    const BATCH_SIZE = 1000;
    let processedCount = 0;
    let lastUpdateTime = Date.now();

    const db = new sqlite3.Database('./historicalData.db', sqlite3.OPEN_READONLY, (err) => {
        if (err) {
            logger.error(`Worker ${workerId}: Error opening database:`, err.message);
            throw err;
        }
        logger.info(`Worker ${workerId}: Connected to the historicalData database.`);
    });

    try {
        while (offset < endOffset) {
            if (!checkMemoryUsage()) {
                logger.debug(`Worker ${workerId}: Memory usage high, waiting before processing more data.`);
                await new Promise(resolve => setTimeout(resolve, 100));
                continue;
            }

            const rows = await new Promise((resolve, reject) => {
                const query = `SELECT * FROM rounds ORDER BY roundId ASC LIMIT ${BATCH_SIZE} OFFSET ${offset}`;
                db.all(query, [], (err, rows) => {
                    if (err) {
                        logger.error(`Worker ${workerId}: Error fetching rows:`, err.message);
                        reject(err);
                    } else {
                        resolve(rows);
                    }
                });
            });

            if (rows.length === 0) break;

            for (const row of rows) {
                priceHistory.push(parseFloat(row.price));
                if (priceHistory.length > 100) priceHistory.shift();
                
                if (priceHistory.length === 100) {
                    const { prediction, betSize } = await getPrediction(priceHistory);
                    if (prediction && betSize > 0) {
                        const epoch = parseInt(row.roundId, 10);
                        const startingPrice = parseFloat(row.price);
                        const endingPrice = parseFloat(row.endingPrice || row.price);
                        const outcome = prediction === (endingPrice >= startingPrice ? 'bull' : 'bear') ? 'win' : 'lose';
                        const profitBNB = outcome === 'win' ? 
                            (prediction === 'bull' && endingPrice === startingPrice ? 0 : betSize * 0.95) : 
                            -betSize;

                        betRecords.push({ 
                            epoch, 
                            prediction, 
                            betSize, 
                            outcome, 
                            profitBNB, 
                            roundId: row.roundId, 
                            startingPrice 
                        });
                        
                        logger.debug(`Worker ${workerId}: Processed round ${row.roundId}, Prediction: ${prediction}, Outcome: ${outcome}, Profit: ${profitBNB.toFixed(4)} BNB`);
                        processedCount++;
                    }
                }
            }

            if (betRecords.length >= BATCH_SIZE) {
                await profitTracker.recordBets(betRecords);
                betRecords = [];
            }

            offset += rows.length;
            if (Date.now() - lastUpdateTime > 5000) { // Update every 5 seconds
                if (parentPort) {
                    parentPort.postMessage({ type: 'progress', processed: processedCount, workerId });
                }
                lastUpdateTime = Date.now();
            }
        }

        if (betRecords.length > 0) {
            await profitTracker.recordBets(betRecords);
        }

        logger.info(`Worker ${workerId} finished processing ${processedCount} rounds.`);
        if (parentPort) {
            parentPort.postMessage({ type: 'done', processedCount, workerId });
        }
    } catch (error) {
        logger.error(`Worker ${workerId} error:`, error);
        if (parentPort) {
            parentPort.postMessage({ type: 'error', error: error.message, workerId });
        }
    } finally {
        db.close((err) => {
            if (err) {
                logger.error(`Worker ${workerId}: Error closing database:`, err.message);
            } else {
                logger.info(`Worker ${workerId}: Database connection closed.`);
            }
        });
    }
}

async function runBacktest() {
    logger.info('Starting backtest simulation...');

    const db = new sqlite3.Database('./historicalData.db', sqlite3.OPEN_READONLY, (err) => {
        if (err) {
            logger.error('Error opening database:', err.message);
            return;
        }
        logger.info('Connected to the historicalData database.');
    });

    const totalRounds = await new Promise((resolve, reject) => {
        db.get('SELECT COUNT(*) as count FROM rounds', (err, row) => {
            if (err) {
                logger.error('Error counting rounds:', err.message);
                reject(err);
            } else {
                logger.info(`Total rounds in database: ${row.count}`);
                resolve(row.count);
            }
        });
    });

    db.close();

    if (totalRounds === 0) {
        logger.warn('No rounds found in the database. Make sure to run backtest.js first to populate the database.');
        return;
    }

    const numCPUs = os.cpus().length;
    const roundsPerWorker = Math.ceil(totalRounds / numCPUs);

    const workers = [];
    for (let i = 0; i < numCPUs; i++) {
        const startOffset = i * roundsPerWorker;
        const endOffset = Math.min((i + 1) * roundsPerWorker, totalRounds);
        const workerId = i + 1;
        const worker = new Worker(__filename, { 
            workerData: { startOffset, endOffset, workerId } 
        });
        workers.push(worker);

        worker.on('message', (message) => {
            if (message.type === 'progress') {
                logger.info(`Worker ${message.workerId} processed ${message.processed} rounds...`);
            } else if (message.type === 'done') {
                logger.info(`Worker ${message.workerId} completed processing ${message.processedCount} rounds.`);
            }
        });

        worker.on('error', (error) => {
            logger.error(`Worker ${workerId} error:`, error);
        });

        worker.on('exit', (code) => {
            if (code !== 0) {
                logger.error(`Worker ${workerId} stopped with exit code ${code}`);
            } else {
                logger.info(`Worker ${workerId} exited successfully`);
            }
        });
    }

    let lastUpdateTime = Date.now();
    const updateInterval = 30000; // Update every 30 seconds

    logger.info(`Waiting for all workers to complete...`);
    await Promise.all(workers.map(worker => new Promise(resolve => {
        worker.on('exit', async (code) => {
            logger.info(`Worker exited with code ${code}`);
            if (Date.now() - lastUpdateTime > updateInterval) {
                const summary = await profitTracker.getSummary();
                logger.info('=== Interim Profitability Summary ===');
                logger.info(`Total Bets: ${summary.totalBets}`);
                logger.info(`Total Wins: ${summary.totalWins}`);
                logger.info(`Total Losses: ${summary.totalLosses}`);
                logger.info(`Total Profit: ${summary.totalProfitBNB.toFixed(4)} BNB`);
                logger.info(`Win Rate: ${((summary.totalWins / summary.totalBets) * 100).toFixed(2)}%`);
                lastUpdateTime = Date.now();
            }
            resolve();
        });
    })));

    logger.info('All workers have completed. Backtest simulation finished.');

    const finalSummary = await profitTracker.getSummary();
    logger.info('=== Final Backtest Profitability Summary ===');
    logger.info(`Total Bets: ${finalSummary.totalBets}`);
    logger.info(`Total Wins: ${finalSummary.totalWins}`);
    logger.info(`Total Losses: ${finalSummary.totalLosses}`);
    logger.info(`Total Profit: ${finalSummary.totalProfitBNB.toFixed(4)} BNB`);
    logger.info(`Win Rate: ${((finalSummary.totalWins / finalSummary.totalBets) * 100).toFixed(2)}%`);
}

// Run the backtest
if (isMainThread) {
    runBacktest().catch(error => {
        logger.error('Unhandled error in backtestSimulator.js:', error);
    });
} else {
    // This is a worker thread
    const { startOffset, endOffset } = workerData;
    runBacktestWorker(startOffset, endOffset).catch(error => {
        logger.error('Unhandled error in worker thread:', error);
    });
}