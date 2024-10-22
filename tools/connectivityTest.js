// connectivityTest.js

const { ethers } = require('ethers');
const config = require('../config');

(async () => {
    try {
        const provider = new ethers.providers.WebSocketProvider(config.quicknodeWsUrl);
        const blockNumber = await provider.getBlockNumber();
        console.log(`Connected to network. Current block number: ${blockNumber}`);
    } catch (error) {
        console.error(`Error connecting to provider: ${error}`);
    }
})();
