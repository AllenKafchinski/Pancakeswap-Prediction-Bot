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

async function constructPriceBuffer(roundId) {
    return new Promise((resolve, reject) => {
        const db = new sqlite3.Database('./historicalData.db', sqlite3.OPEN_READONLY);
        
        const query = `
            SELECT * 
            FROM rounds 
            WHERE roundId = ?
        `;
        
        db.get(query, [roundId], (err, row) => {
            if (err) {
                logger.error(`Error fetching data for round ${roundId}:`, err);
                db.close();
                reject(err);
            } else if (!row) {
                logger.warn(`No data found for round ${roundId}`);
                db.close();
                resolve(null);
            } else {
                db.close();
                logger.info(`Full row data for round ${roundId}: ${JSON.stringify(row)}`);
                if (row.priceBuffer === undefined) {
                    logger.warn(`priceBuffer is undefined for round ${roundId}`);
                    resolve(null);
                } else {
                    logger.info(`Raw priceBuffer for round ${roundId}: ${row.priceBuffer}`);
                    try {
                        const priceBuffer = JSON.parse(row.priceBuffer);
                        if (Array.isArray(priceBuffer)) {
                            logger.info(`Parsed priceBuffer length for round ${roundId}: ${priceBuffer.length}`);
                            resolve(priceBuffer);
                        } else {
                            logger.warn(`Invalid price buffer format for round ${roundId}. Type: ${typeof priceBuffer}`);
                            resolve(null);
                        }
                    } catch (parseError) {
                        logger.error(`Error parsing price buffer for round ${roundId}:`, parseError);
                        resolve(null);
                    }
                }
            }
        });
    });
}

async function runBacktestWorker(startOffset, endOffset) {
    logger.info(`Worker started processing from offset ${startOffset} to ${endOffset}`);
    let offset = startOffset;
    const betRecords = [];

    const db = new sqlite3.Database('./historicalData.db', sqlite3.OPEN_READONLY, (err) => {
        if (err) {
            logger.error('Error opening database in worker:', err.message);
            return;
        }
        logger.info('Connected to the historicalData database in worker.');
    });

    try {
        logger.debug(`Starting main processing loop`);
        while (offset < endOffset) {
            if (!checkMemoryUsage()) {
                logger.debug(`Memory usage high, waiting before processing more data.`);
                await new Promise(resolve => setTimeout(resolve, 100));
                continue;
            }

            logger.debug(`Fetching rows from offset ${offset}`);
            const rows = await new Promise((resolve, reject) => {
                const query = `SELECT * FROM rounds ORDER BY roundId ASC LIMIT ${CHUNK_SIZE} OFFSET ${offset}`;
                logger.debug(`Executing query: ${query}`);
                db.all(query, [], (err, rows) => {
                    if (err) {
                        logger.error('Error fetching rows:', err.message);
                        reject(err);
                    } else {
                        logger.debug(`Fetched ${rows.length} rows`);
                        // Log the first few rows
                        if (offset === startOffset) {
                            logger.info('First few rows:');
                            rows.slice(0, 5).forEach(row => {
                                logger.info(JSON.stringify(row));
                            });
                        }
                        resolve(rows);
                    }
                });
            });

            if (rows.length === 0) {
                logger.info(`No more rows to process starting from offset ${offset}`);
                break;
            }

            logger.debug(`Processing ${rows.length} rows`);
            let loggedRounds = 0;
            const MAX_LOGGED_ROUNDS = 5;
            const priceHistory = [];

            for (const row of rows) {
                try {
                    if (loggedRounds < MAX_LOGGED_ROUNDS) {
                        logger.info(`Processing round ${row.roundId}. Raw data: ${JSON.stringify(row)}`);
                        loggedRounds++;
                    }
                    
                    // Add the current price to the price history
                    priceHistory.push(parseFloat(row.price));
                    
                    // Keep only the last 100 prices
                    if (priceHistory.length > 100) {
                        priceHistory.shift();
                    }
                    
                    if (priceHistory.length < 100) {
                        logger.debug(`Insufficient price history for Round ID: ${row.roundId}. History length: ${priceHistory.length}. Skipping this round.`);
                        continue;
                    }

                    logger.debug(`Getting prediction for Round ID: ${row.roundId}`);
                    const predictionResult = await getPrediction(priceHistory);
                    const { prediction, betSize } = predictionResult;

                    const epoch = parseInt(row.roundId, 10);
                    const startingPrice = row.price;
                    const endingPrice = row.endingPrice || row.price;
                    const outcome = prediction === (endingPrice > startingPrice ? 'bull' : 'bear') ? 'win' : 'lose';
                    const profitBNB = outcome === 'win' ? betSize * 0.95 : -betSize;

                    betRecords.push({ epoch, prediction, betSize, outcome, profitBNB, roundId: row.roundId, startingPrice });
                    
                    logger.debug(`Processed round: ${row.roundId}, Prediction: ${prediction}, Outcome: ${outcome}`);
                } catch (error) {
                    logger.error(`Error processing round ${row.roundId}:`, error);
                }
            }

            if (betRecords.length >= 100) {
                logger.debug(`Recording ${betRecords.length} bets`);
                await profitTracker.recordBets(betRecords);
                betRecords.length = 0;
            }

            offset += rows.length;
            if (parentPort) {
                parentPort.postMessage({ type: 'progress', processed: rows.length });
            }
        }

        if (betRecords.length > 0) {
            logger.debug(`Recording final ${betRecords.length} bets`);
            await profitTracker.recordBets(betRecords);
        }

        logger.info(`Worker finished processing from offset ${startOffset} to ${endOffset}`);
        if (parentPort) {
            parentPort.postMessage({ type: 'done', processedCount: offset - startOffset });
        }
    } catch (error) {
        logger.error('Error in runBacktestWorker:', error);
    } finally {
        db.close((err) => {
            if (err) {
                logger.error('Error closing database in worker:', err.message);
            } else {
                logger.info('Database connection closed in worker.');
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

    // Log the table structure
    await new Promise((resolve, reject) => {
        db.all("PRAGMA table_info(rounds)", [], (err, rows) => {
            if (err) {
                logger.error('Error getting table info:', err.message);
                reject(err);
            } else {
                logger.info('Table structure:');
                rows.forEach(row => {
                    logger.info(`${row.name} (${row.type})`);
                });
                resolve();
            }
        });
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
        logger.info(`Creating worker ${i + 1} with startOffset ${startOffset} and endOffset ${endOffset}`);
        const worker = new Worker(__filename, { workerData: { startOffset, endOffset } });
        workers.push(worker);

        worker.on('message', (message) => {
            if (message.type === 'progress') {
                logger.info(`Worker ${i + 1} processed ${message.processed} rounds...`);
            } else if (message.type === 'done') {
                logger.info(`Worker ${i + 1} completed processing ${message.processedCount} rounds.`);
            }
        });

        worker.on('error', (error) => {
            logger.error(`Worker ${i + 1} error:`, error);
        });

        worker.on('exit', (code) => {
            if (code !== 0) {
                logger.error(`Worker ${i + 1} stopped with exit code ${code}`);
            } else {
                logger.info(`Worker ${i + 1} exited successfully`);
            }
        });
    }

    logger.info(`Waiting for all workers to complete...`);
    await Promise.all(workers.map(worker => new Promise(resolve => {
        worker.on('exit', (code) => {
            logger.info(`Worker exited with code ${code}`);
            resolve();
        });
    })));

    logger.info('All workers have completed. Backtest simulation finished.');

    const summary = await profitTracker.getSummary();
    logger.info('=== Backtest Profitability Summary ===');
    logger.info(`Total Bets: ${summary.totalBets}`);
    logger.info(`Total Wins: ${summary.totalWins}`);
    logger.info(`Total Losses: ${summary.totalLosses}`);
    logger.info(`Total Profit: ${summary.totalProfitBNB.toFixed(4)} BNB`);
    logger.info(`Win Rate: ${((summary.totalWins / summary.totalBets) * 100).toFixed(2)}%`);
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