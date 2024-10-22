// removeJsonRounds.js

const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');
const logger = require('../logger');

// Load JSON Data
const jsonDataPath = path.resolve(__dirname, 'historicalRounds.json');
const jsonData = JSON.parse(fs.readFileSync(jsonDataPath, 'utf8'));

// Initialize SQLite Database
const dbPath = path.resolve(__dirname, 'historicalData.db');
const db = new sqlite3.Database(dbPath);

// Extract round IDs from JSON Data
const roundIdsToRemove = jsonData.map((round) => round.roundId);

// Remove rounds from the database
db.serialize(() => {
  const placeholders = roundIdsToRemove.map(() => '?').join(', ');
  const removeStmt = `DELETE FROM rounds WHERE roundId IN (${placeholders})`;

  db.run(removeStmt, roundIdsToRemove, function (err) {
    if (err) {
      logger.error(`Error removing rounds: ${err.message}`);
    } else {
      logger.info(`Successfully removed ${this.changes} rounds from the database.`);
    }
  });

  logger.info('Round removal process completed.');
});

// Close the database connection after all removals are done
db.close((err) => {
  if (err) {
    logger.error(`Error closing the database: ${err.message}`);
  } else {
    logger.info('Database connection closed.');
  }
});
