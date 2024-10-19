// config.js
require('dotenv').config();

module.exports = {
    privateKey: process.env.PRIVATE_KEY,
    quicknodeWsUrl: process.env.QUICKNODE_WS_URL,
    quicknodeRpcUrl: process.env.QUICKNODE_RPC_URL,
    predictionContractAddress: process.env.PREDICTION_CONTRACT_ADDRESS,
    oracleContractAddress: process.env.ORACLE_CONTRACT_ADDRESS, // Added Oracle Address
    betAmount: process.env.BET_AMOUNT || '0.001', // Default to 0.001 BNB
    mode: process.env.MODE || 'paper' // 'live' or 'paper'
};
