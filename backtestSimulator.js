const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const os = require('os');
const sqlite3 = require('sqlite3').verbose();
const logger = require('./logger');
const profitTracker = require('./profitTracker');
const { getPrediction } = require('./prediction');

const BATCH_SIZE = 500;
const MAX_RAM_USAGE = 0.7;
const GC_INTERVAL = 5000;

// SQLite optimization settings
const SQLITE_CONFIG = {
    memory: true,
    cache: 'shared'
};

function checkMemoryUsage() {
    const usedMemory = process.memoryUsage().heapUsed;
    const totalMemory = os.totalmem();
    const usageRatio = usedMemory / totalMemory;
    
    if (usageRatio > MAX_RAM_USAGE) {
        logger.warn(`High memory usage detected: ${(usageRatio * 100).toFixed(2)}%`);
        forceGarbageCollection();
    }
    return usageRatio < MAX_RAM_USAGE;
}

function forceGarbageCollection() {
    if (global.gc) {
        global.gc();
        logger.info('Garbage collection executed');
    } else {
        logger.warn('Garbage collection is not exposed. Start node with --expose-gc flag');
    }
}

class CircularBuffer {
    constructor(size) {
        this.size = size;
        this.buffer = new Float64Array(size);
        this.pointer = 0;
        this.length = 0;
    }

    push(item) {
        this.buffer[this.pointer] = item;
        this.pointer = (this.pointer + 1) % this.size;
        if (this.length < this.size) this.length++;
    }

    toArray() {
        const result = new Float64Array(this.length);
        const start = (this.pointer - this.length + this.size) % this.size;
        for (let i = 0; i < this.length; i++) {
            result[i] = this.buffer[(start + i) % this.size];
        }
        return Array.from(result);
    }

    clear() {
        this.buffer = new Float64Array(this.size);
        this.pointer = 0;
        this.length = 0;
    }
}

async function runBacktestWorker(startOffset, endOffset, workerId) {
    logger.info(`Worker ${workerId} started processing from offset ${startOffset} to ${endOffset}`);
    
    // Open progress database with write permissions
    const progressDb = new sqlite3.Database('./backtestProgress.db', sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
        if (err) {
            logger.error(`Worker ${workerId}: Error opening progress database:`, err.message);
            throw err;
        }
    });

    // Open historical data in read-only mode
    const db = new sqlite3.Database('./historicalData.db', sqlite3.OPEN_READONLY, (err) => {
        if (err) {
            logger.error(`Worker ${workerId}: Error opening historical database:`, err.message);
            throw err;
        }
    });

    try {
        // Create progress table if it doesn't exist
        await new Promise((resolve, reject) => {
            progressDb.run(`CREATE TABLE IF NOT EXISTS backtest_progress (
                workerId INTEGER PRIMARY KEY,
                lastProcessedOffset INTEGER,
                endOffset INTEGER,
                processedCount INTEGER DEFAULT 0
            )`, err => err ? reject(err) : resolve());
        });

        const lastProgress = await new Promise((resolve, reject) => {
            progressDb.get('SELECT lastProcessedOffset, processedCount FROM backtest_progress WHERE workerId = ?', 
                [workerId], 
                (err, row) => err ? reject(err) : resolve(row));
        });
        
        let offset = lastProgress ? lastProgress.lastProcessedOffset : startOffset;
        let processedCount = lastProgress ? lastProgress.processedCount : 0;
        
        if (!lastProgress) {
            await new Promise((resolve, reject) => {
                progressDb.run('INSERT INTO backtest_progress (workerId, lastProcessedOffset, endOffset, processedCount) VALUES (?, ?, ?, ?)',
                    [workerId, offset, endOffset, processedCount],
                    err => err ? reject(err) : resolve());
            });
        }

        const priceHistory = new CircularBuffer(100);
        let lastUpdateTime = Date.now();
        let betRecords = [];

        while (offset < endOffset) {
            if (!checkMemoryUsage()) {
                await new Promise(resolve => setTimeout(resolve, 1000));
                continue;
            }

            const rows = await new Promise((resolve, reject) => {
                db.all(`SELECT * FROM rounds ORDER BY roundId ASC LIMIT ${BATCH_SIZE} OFFSET ${offset}`,
                    (err, rows) => err ? reject(err) : resolve(rows));
            });

            if (rows.length === 0) break;

            for (const row of rows) {
                priceHistory.push(parseFloat(row.price));
                
                if (priceHistory.length === 100) {
                    const { prediction, betSize } = await getPrediction(priceHistory.toArray());
                    if (prediction && betSize > 0) {
                        const epoch = parseInt(row.roundId, 10);
                        const startingPrice = parseFloat(row.price);
                        const endingPrice = parseFloat(row.endingPrice || row.price);
                        const outcome = prediction === (endingPrice > startingPrice ? 'bull' : 'bear') ? 'win' : 'lose';
                        const profitBNB = outcome === 'win' ? betSize * 0.95 : -betSize;

                        betRecords.push({ 
                            epoch, 
                            prediction, 
                            betSize, 
                            outcome, 
                            profitBNB, 
                            roundId: row.roundId, 
                            startingPrice 
                        });
                        
                        processedCount++;
                    }
                }

                if (betRecords.length >= BATCH_SIZE / 2) {
                    await profitTracker.recordBets(betRecords);
                    betRecords = [];
                }
            }

            offset += rows.length;
            
            await new Promise((resolve, reject) => {
                progressDb.run('UPDATE backtest_progress SET lastProcessedOffset = ?, processedCount = ? WHERE workerId = ?',
                    [offset, processedCount, workerId],
                    err => err ? reject(err) : resolve());
            });

            if (Date.now() - lastUpdateTime > 5000) {
                if (parentPort) {
                    parentPort.postMessage({ type: 'progress', processed: processedCount, workerId });
                }
                lastUpdateTime = Date.now();
            }

            if (processedCount % GC_INTERVAL === 0) {
                forceGarbageCollection();
                priceHistory.clear();
            }
        }

        if (betRecords.length > 0) {
            await profitTracker.recordBets(betRecords);
        }

        await new Promise((resolve, reject) => {
            progressDb.run('DELETE FROM backtest_progress WHERE workerId = ?',
                [workerId],
                err => err ? reject(err) : resolve());
        });

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
        await new Promise(resolve => db.close(resolve));
        await new Promise(resolve => progressDb.close(resolve));
    }
}

async function runBacktest() {
    logger.info('Starting backtest simulation...');
    
    // Open progress database with write permissions
    const progressDb = new sqlite3.Database('./backtestProgress.db', sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE);
    
    await new Promise((resolve, reject) => {
        progressDb.run(`CREATE TABLE IF NOT EXISTS backtest_progress (
            workerId INTEGER PRIMARY KEY,
            lastProcessedOffset INTEGER,
            endOffset INTEGER,
            processedCount INTEGER DEFAULT 0
        )`, err => err ? reject(err) : resolve());
    });

    const db = new sqlite3.Database('./historicalData.db', sqlite3.OPEN_READONLY);

    try {
        const incompleteWork = await new Promise((resolve, reject) => {
            progressDb.all('SELECT * FROM backtest_progress', [], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });

        const totalRounds = await new Promise((resolve, reject) => {
            db.get('SELECT COUNT(*) as count FROM rounds', (err, row) => {
                if (err) reject(err);
                else {
                    logger.info(`Total rounds in database: ${row.count}`);
                    resolve(row.count);
                }
            });
        });

        db.close();

        const numCPUs = Math.max(1, os.cpus().length - 1);
        const roundsPerWorker = Math.ceil(totalRounds / numCPUs);

        const workers = [];
        
        if (incompleteWork && incompleteWork.length > 0) {
            logger.info('Found incomplete backtest work. Resuming from last position...');
            
            for (const work of incompleteWork) {
                const worker = new Worker(__filename, {
                    workerData: {
                        startOffset: work.lastProcessedOffset,
                        endOffset: work.endOffset,
                        workerId: work.workerId
                    }
                });
                setupWorkerHandlers(worker, work.workerId);
                workers.push(worker);
            }
        } else {
            for (let i = 0; i < numCPUs; i++) {
                const startOffset = i * roundsPerWorker;
                const endOffset = Math.min((i + 1) * roundsPerWorker, totalRounds);
                const workerId = i + 1;
                const worker = new Worker(__filename, { 
                    workerData: { startOffset, endOffset, workerId } 
                });
                setupWorkerHandlers(worker, workerId);
                workers.push(worker);
            }
        }

        await Promise.all(workers.map(worker => 
            new Promise(resolve => worker.on('exit', resolve))
        ));

        logger.info('All workers have completed. Generating final summary...');
        const finalSummary = await profitTracker.getSummary();
        logger.info('=== Final Backtest Results ===');
        logger.info(`Total Bets: ${finalSummary.totalBets}`);
        logger.info(`Win Rate: ${((finalSummary.totalWins / finalSummary.totalBets) * 100).toFixed(2)}%`);
        logger.info(`Total Profit: ${finalSummary.totalProfitBNB.toFixed(4)} BNB`);

    } finally {
        progressDb.close();
    }
}

function setupWorkerHandlers(worker, workerId) {
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
        }
    });
}

if (isMainThread) {
    runBacktest().catch(error => {
        logger.error('Unhandled error in backtestSimulator.js:', error);
    });
} else {
    const { startOffset, endOffset, workerId } = workerData;
    runBacktestWorker(startOffset, endOffset, workerId).catch(error => {
        logger.error(`Worker ${workerId} encountered an error:`, error);
    });
}
