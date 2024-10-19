// clearDatabase.js

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const logger = require('./logger'); // Your logging utility

const dbPath = path.resolve(__dirname, 'profitability.db');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        logger.error('Error opening database:', err.message);
        process.exit(1);
    } else {
        logger.info('Connected to the SQLite database.');
    }
});

db.serialize(() => {
    // Clear Bets Table
    db.run(`DELETE FROM Bets`, [], function(err) {
        if (err) {
            logger.error(`Error clearing Bets table: ${err.message}`);
        } else {
            logger.info(`Cleared Bets table.`);
        }
    });

    // Clear Summary Table
    db.run(`DELETE FROM Summary`, [], function(err) {
        if (err) {
            logger.error(`Error clearing Summary table: ${err.message}`);
        } else {
            logger.info(`Cleared Summary table.`);

            // Re-initialize the Summary row
            db.run(`
                INSERT OR IGNORE INTO Summary (id, totalBets, totalWins, totalLosses, totalProfitBNB)
                VALUES (1, 0, 0, 0, 0)
            `, [], (err) => {
                if (err) {
                    logger.error(`Error re-initializing Summary table: ${err.message}`);
                } else {
                    logger.info(`Re-initialized Summary table.`);
                }
            });
        }
    });
});

db.close((err) => {
    if (err) {
        logger.error(`Error closing database: ${err.message}`);
    } else {
        logger.info('Closed the database connection.');
    }
});
