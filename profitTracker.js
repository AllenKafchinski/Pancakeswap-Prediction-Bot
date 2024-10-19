// profitTracker.js

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

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
});

/**
 * Records a new bet in the database.
 * @param {number} epoch - Round epoch.
 * @param {string} prediction - 'bull' or 'bear'.
 * @param {number} betSize - Bet size in BNB.
 * @param {string} roundId - Round ID.
 * @param {number} startingPrice - Starting price.
 * @returns {Promise<number>} Bet ID.
 */
function recordBet(epoch, prediction, betSize, outcome, roundId, startingPrice) {
    return new Promise((resolve, reject) => {
        const stmt = db.prepare(`INSERT INTO bets (epoch, prediction, betSize, outcome, profitBNB, roundId, startingPrice) VALUES (?, ?, ?, ?, ?, ?, ?)`);
        stmt.run(epoch, prediction, betSize, null, null, roundId, startingPrice, function(err) {
            if (err) {
                reject(err);
            } else {
                resolve(this.lastID);
            }
        });
        stmt.finalize();
    });
}

/**
 * Records multiple bets in the database in a single transaction.
 * @param {Array<Object>} bets - Array of bet objects.
 * @returns {Promise<void>}
 */
function recordBets(bets) {
    return new Promise((resolve, reject) => {
        db.serialize(() => {
            db.run('BEGIN TRANSACTION');
            const stmt = db.prepare(`INSERT INTO bets (epoch, prediction, betSize, outcome, profitBNB, roundId, startingPrice) VALUES (?, ?, ?, ?, ?, ?, ?)`);
            
            for (const bet of bets) {
                stmt.run(bet.epoch, bet.prediction, bet.betSize, bet.outcome, bet.profitBNB, bet.roundId, bet.startingPrice, (err) => {
                    if (err) {
                        reject(err);
                    }
                });
            }

            stmt.finalize((err) => {
                if (err) {
                    db.run('ROLLBACK');
                    reject(err);
                } else {
                    db.run('COMMIT', (commitErr) => {
                        if (commitErr) {
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
 * Updates the outcome and profit/loss of a bet.
 * @param {number} betId - Bet ID.
 * @param {string} outcome - 'win' or 'lose'.
 * @param {number} profitBNB - Profit or loss in BNB.
 * @returns {Promise<void>}
 */
function updateBetOutcome(betId, outcome, profitBNB) {
    return new Promise((resolve, reject) => {
        const stmt = db.prepare(`UPDATE bets SET outcome = ?, profitBNB = ? WHERE id = ?`);
        stmt.run(outcome, profitBNB, betId, function(err) {
            if (err) {
                reject(err);
            } else {
                resolve();
            }
        });
        stmt.finalize();
    });
}

/**
 * Retrieves a summary of profitability.
 * @returns {Promise<Object>} Summary object.
 */
function getSummary() {
    return new Promise((resolve, reject) => {
        db.serialize(() => {
            db.get(`SELECT COUNT(*) as totalBets, 
                            SUM(CASE WHEN outcome = 'win' THEN 1 ELSE 0 END) as totalWins, 
                            SUM(CASE WHEN outcome = 'lose' THEN 1 ELSE 0 END) as totalLosses, 
                            SUM(profitBNB) as totalProfitBNB
                    FROM bets`, (err, row) => {
                if (err) {
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
    });
}

function getBetDetails(roundId) {
    return new Promise((resolve, reject) => {
        db.get(`SELECT * FROM bets WHERE roundId = ?`, [roundId], (err, row) => {
            if (err) {
                reject(err);
            } else {
                resolve(row);
            }
        });
    });
}

module.exports = { recordBet, updateBetOutcome, getSummary, getBetDetails, recordBets };
