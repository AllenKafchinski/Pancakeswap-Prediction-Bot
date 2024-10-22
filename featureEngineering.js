const indicators = require('./indicators');

function generateDataset(historicalData) {
    const features = [];
    const labels = [];

    historicalData.forEach((data) => {
        features.push(indicators.calculateFeatures(data));
        labels.push(data.outcome);
    });

    return { features, labels };
}

function generateFeatures(data) {
    const features = [];

    // Extract data for indicators calculation
    const prices = data.prices;
    const volumes = data.volumes;

    // Calculate RSI (Relative Strength Index)
    const rsi = indicators.calculateRSI(prices);
    features.push(rsi);

    // Calculate MACD (Moving Average Convergence Divergence)
    const macd = indicators.calculateMACD(prices);
    features.push(macd.macd, macd.signal, macd.histogram);

    // Calculate SMA (Simple Moving Average)
    const sma = indicators.calculateSMA(prices, 20);
    features.push(sma);

    // Calculate EMA (Exponential Moving Average)
    const ema = indicators.calculateEMA(prices, 20);
    features.push(ema);

    // Calculate Bollinger Bands
    const bollingerBands = indicators.calculateBollingerBands(prices);
    features.push(bollingerBands.upper, bollingerBands.middle, bollingerBands.lower);

    // Calculate Stochastic Oscillator
    const stochastic = indicators.calculateStochastic(prices);
    features.push(stochastic.k, stochastic.d);

    return features;
}

module.exports = { generateDataset, generateFeatures };
