// testRoundIds.js

const { ethers } = require('ethers');
const fs = require('fs');
const config = require('../config'); // Ensure this path is correct
const logger = require('../logger'); // Your logging utility

// Load Oracle Contract ABI
const oracleABI = JSON.parse(fs.readFileSync('./oracleABI.json', 'utf8'));

// Initialize Provider
const WSURL = config.quicknodeWsUrl;
const provider = new ethers.providers.WebSocketProvider(WSURL);
console.log('Provider initialized');

// Initialize Oracle Contract Instance
const oracleAddress = config.oracleContractAddress;
const oracleContract = new ethers.Contract(oracleAddress, oracleABI, provider);
console.log('Oracle Contract initialized');

(async () => {
    try {
        // Log the Oracle Address to verify it's correctly loaded
        console.log(`Oracle Address from config: ${oracleAddress}`);

        // Fetch the latest round data
        const latestRoundData = await oracleContract.latestRoundData();
        const latestRoundId = latestRoundData.roundId;
        console.log(`Latest Round ID: ${latestRoundId.toString()}`);
        console.log(`Latest Round Data:`, latestRoundData);

        // Calculate the previous round ID using BigNumber methods
        const previousRoundId = latestRoundId.sub(1);
        console.log(`Previous Round ID: ${previousRoundId.toString()}`);

        // Fetch the previous round data
        const previousRoundData = await oracleContract.getRoundData(previousRoundId);
        console.log(`Previous Round Data:`, previousRoundData);

        // Check if Round IDs are sequential using BigNumber comparison
        if (previousRoundData.roundId.eq(latestRoundId.sub(1))) {
            console.log('Round IDs are sequential.');
        } else {
            console.log('Round IDs are NOT sequential.');
        }
    } catch (error) {
        console.error(`Error fetching round data: ${error}`);
    }
})();

