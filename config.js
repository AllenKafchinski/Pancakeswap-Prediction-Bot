// config.js
require('dotenv').config();

module.exports = {
    privateKey: process.env.PRIVATE_KEY,
    quicknodeWsUrl: process.env.QUICKNODE_WS_URL,
    quicknodeRpcUrl: process.env.QUICKNODE_RPC_URL,
    predictionContractAddress: process.env.PREDICTION_CONTRACT_ADDRESS,
    oracleContractAddress: process.env.ORACLE_CONTRACT_ADDRESS, 
    betMin: process.env.BET_MIN,
    betMax: process.env.BET_MAX,
    minConfidence: process.env.MIN_CONFIDENCE,
    maxConfidence: process.env.MAX_CONFIDENCE,
    bearConfidence: process.env.BEAR_CONFIDENCE,
    bullConfidence: process.env.BULL_CONFIDENCE,
    mode: process.env.MODE || 'paper' // 'live' or 'paper'
};
