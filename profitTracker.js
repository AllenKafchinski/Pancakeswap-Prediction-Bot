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
});

/**
 * Records multiple bets in the database in a single transaction.
 * @param {Array<Object>} bets - Array of bet objects.
 * @returns {Promise<void>}
 */
function recordBets(bets) {
    return new Promise((resolve, reject) => {
        const chunkSize = 1000; // Adjust based on your needs
        const chunks = [];
        
        for (let i = 0; i < bets.length; i += chunkSize) {
            chunks.push(bets.slice(i, i + chunkSize));
        }

        db.serialize(() => {
            db.run('BEGIN TRANSACTION');

            const stmt = db.prepare(`INSERT INTO bets (epoch, prediction, betSize, outcome, profitBNB, roundId, startingPrice) VALUES (?, ?, ?, ?, ?, ?, ?)`);
            
            chunks.forEach(chunk => {
                chunk.forEach(bet => {
                    stmt.run(bet.epoch, bet.prediction, bet.betSize, bet.outcome, bet.profitBNB, bet.roundId, bet.startingPrice, (err) => {
                        if (err) {
                            logger.error(`Error inserting bet: ${err.message}`);
                        }
                    });
                });
            });

            stmt.finalize(err => {
                if (err) {
                    db.run('ROLLBACK', rollbackErr => {
                        if (rollbackErr) {
                            logger.error(`Rollback error: ${rollbackErr.message}`);
                        }
                        reject(err);
                    });
                } else {
                    db.run('COMMIT', commitErr => {
                        if (commitErr) {
                            logger.error(`Commit error: ${commitErr.message}`);
                            reject(commitErr);
                        } else {
                            resolve();
                        }
                    });
                }
            });
        });
    });
}

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

module.exports = { recordBets, getSummary, getBetDetails, closeDatabase };