const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const logger = require('./logger');

// Initialize Database
const dbPath = path.resolve(__dirname, 'profitability.db');
const db = new sqlite3.Database(dbPath);

// Create Bets Table if Not Exists
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS bets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        epoch INTEGER,
        prediction TEXT,
        betSize REAL,
        outcome TEXT,
        profitBNB REAL,
        roundId TEXT,
        startingPrice REAL
    )`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_roundId ON bets (roundId)`);
    
    // Add this line
    addPaperTradeColumn().catch(err => logger.error('Error adding paperTrade column:', err));
});

/**
 * Records multiple bets in the database in a single transaction.
 * @param {Array<Object>} bets - Array of bet objects.
 * @returns {Promise<void>}
 */
function recordBets(bets) {
    return new Promise((resolve, reject) => {
        const chunkSize = 1000;
        const chunks = [];
        
        for (let i = 0; i < bets.length; i += chunkSize) {
            chunks.push(bets.slice(i, i + chunkSize));
        }

        db.serialize(() => {
            db.run('BEGIN TRANSACTION');

            // First, try to insert with paperTrade
            const stmtWithPaperTrade = db.prepare(`INSERT INTO bets (epoch, prediction, betSize, outcome, profitBNB, roundId, startingPrice, paperTrade) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
            
            const insertBet = (bet) => {
                return new Promise((resolve, reject) => {
                    stmtWithPaperTrade.run(
                        bet.epoch,
                        bet.prediction,
                        bet.betSize,
                        bet.outcome,
                        bet.profitBNB,
                        bet.roundId,
                        bet.startingPrice,
                        bet.paperTrade ? 1 : 0,
                        (err) => {
                            if (err) {
                                // If error is due to missing column, fall back to old insert
                                if (err.message.includes('no column named paperTrade')) {
                                    const stmtWithoutPaperTrade = db.prepare(`INSERT INTO bets (epoch, prediction, betSize, outcome, profitBNB, roundId, startingPrice) VALUES (?, ?, ?, ?, ?, ?, ?)`);
                                    stmtWithoutPaperTrade.run(
                                        bet.epoch,
                                        bet.prediction,
                                        bet.betSize,
                                        bet.outcome,
                                        bet.profitBNB,
                                        bet.roundId,
                                        bet.startingPrice,
                                        (err) => {
                                            if (err) {
                                                reject(err);
                                            } else {
                                                resolve();
                                            }
                                        }
                                    );
                                    stmtWithoutPaperTrade.finalize();
                                } else {
                                    reject(err);
                                }
                            } else {
                                resolve();
                            }
                        }
                    );
                });
            };

            Promise.all(chunks.flatMap(chunk => chunk.map(insertBet)))
                .then(() => {
                    stmtWithPaperTrade.finalize();
                    db.run('COMMIT', (err) => {
                        if (err) {
                            logger.error(`Commit error: ${err.message}`);
                            reject(err);
                        } else {
                            resolve();
                        }
                    });
                })
                .catch(err => {
                    logger.error(`Error inserting bets: ${err.message}`);
                    db.run('ROLLBACK', (rollbackErr) => {
                        if (rollbackErr) {
                            logger.error(`Rollback error: ${rollbackErr.message}`);
                        }
                        reject(err);
                    });
                });
        });
    });
}

/**
 * Updates the outcome and profit of a bet.
 * @param {number} id - The ID of the bet to update.
 * @param {string} outcome - The outcome of the bet ('win' or 'lose').
 * @param {number} profitBNB - The profit (or loss) in BNB.
 * @returns {Promise<void>}
 */
function updateBetOutcome(id, outcome, profitBNB) {
    return new Promise((resolve, reject) => {
        db.run(
            'UPDATE bets SET outcome = ?, profitBNB = ? WHERE id = ?',
            [outcome, profitBNB, id],
            (err) => {
                if (err) {
                    logger.error(`Error updating bet outcome: ${err.message}`);
                    reject(err);
                } else {
                    resolve();
                }
            }
        );
    });
}

// Don't forget to export this function
module.exports = {
    // ... other exports
    updateBetOutcome,
};

/**
 * Retrieves a summary of profitability.
 * @returns {Promise<Object>} Summary object.
 */
function getSummary() {
    return new Promise((resolve, reject) => {
        db.get(`SELECT COUNT(*) as totalBets, 
                        SUM(CASE WHEN outcome = 'win' THEN 1 ELSE 0 END) as totalWins, 
                        SUM(CASE WHEN outcome = 'lose' THEN 1 ELSE 0 END) as totalLosses, 
                        SUM(profitBNB) as totalProfitBNB
                FROM bets`, (err, row) => {
            if (err) {
                logger.error(`Error getting summary: ${err.message}`);
                reject(err);
            } else {
                resolve({
                    totalBets: row.totalBets,
                    totalWins: row.totalWins,
                    totalLosses: row.totalLosses,
                    totalProfitBNB: row.totalProfitBNB || 0
                });
            }
        });
    });
}

function addPaperTradeColumn() {
    return new Promise((resolve, reject) => {
        db.run(`ALTER TABLE bets ADD COLUMN paperTrade BOOLEAN DEFAULT 0`, (err) => {
            if (err) {
                // If the error is because the column already exists, we can ignore it
                if (err.message.includes('duplicate column name')) {
                    resolve();
                } else {
                    reject(err);
                }
            } else {
                resolve();
            }
        });
    });
}

/**
 * Retrieves bet details for a specific round.
 * @param {string} roundId - The round ID to fetch details for.
 * @returns {Promise<Object>} Bet details.
 */
function getBetDetails(roundId) {
    return new Promise((resolve, reject) => {
        db.get(`SELECT * FROM bets WHERE roundId = ?`, [roundId], (err, row) => {
            if (err) {
                logger.error(`Error getting bet details: ${err.message}`);
                reject(err);
            } else {
                resolve(row);
            }
        });
    });
}

function updateActualProfit(roundId, actualProfitBNB) {
    return new Promise((resolve, reject) => {
        db.run(
            'UPDATE bets SET actualProfitBNB = ? WHERE roundId = ?',
            [actualProfitBNB, roundId],
            (err) => {
                if (err) {
                    logger.error(`Error updating actual profit: ${err.message}`);
                    reject(err);
                } else {
                    resolve();
                }
            }
        );
    });
}

/**
 * Closes the database connection.
 * @returns {Promise<void>}
 */
function closeDatabase() {
    return new Promise((resolve, reject) => {
        db.close((err) => {
            if (err) {
                logger.error(`Error closing the database: ${err.message}`);
                reject(err);
            } else {
                logger.info("Database connection closed.");
                resolve();
            }
        });
    });
}

module.exports = { recordBets, getSummary, getBetDetails, closeDatabase, updateActualProfit, updateBetOutcome };