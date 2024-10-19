const tf = require('@tensorflow/tfjs-node');

class RandomForestPredictor {
    constructor(nEstimators = 100, maxDepth = 5) {
        this.nEstimators = nEstimators;
        this.maxDepth = maxDepth;
        this.models = [];
    }

    async train(features, labels) {
        for (let i = 0; i < this.nEstimators; i++) {
            const model = tf.sequential();
            model.add(tf.layers.dense({ units: 64, activation: 'relu', inputShape: [features[0].length] }));
            model.add(tf.layers.dense({ units: 32, activation: 'relu' }));
            model.add(tf.layers.dense({ units: 1, activation: 'sigmoid' }));
            
            model.compile({ optimizer: 'adam', loss: 'binaryCrossentropy', metrics: ['accuracy'] });
            
            const xs = tf.tensor2d(features);
            const ys = tf.tensor2d(labels, [labels.length, 1]);
            
            await model.fit(xs, ys, { epochs: 10, verbose: 0 });
            
            this.models.push(model);
            
            xs.dispose();
            ys.dispose();
        }
    }

    async predict(features) {
        const predictions = await Promise.all(this.models.map(model => {
            const xs = tf.tensor2d(features, [features.length, features[0].length]);
            const prediction = model.predict(xs);
            xs.dispose();
            return prediction;
        }));
        
        const avgPrediction = tf.tidy(() => {
            const stacked = tf.stack(predictions);
            return stacked.mean(0);
        });
        
        const result = await avgPrediction.array();
        avgPrediction.dispose();
        predictions.forEach(p => p.dispose());
        
        return result[0][0];
    }
}

function prepareFeatures(priceBuffer) {
    if (!Array.isArray(priceBuffer) || priceBuffer.length < 50) {
        console.warn('Invalid priceBuffer: insufficient data');
        return [];
    }
    const features = [];
    if (priceBuffer.length === 51) {
        // Handle single window case
        const window = priceBuffer.slice(0, 50);
        const returns = window.slice(1).map((price, index) => (price - window[index]) / window[index]);
        const volatility = Math.sqrt(returns.reduce((sum, ret) => sum + ret * ret, 0) / returns.length);
        const momentum = (window[window.length - 1] - window[0]) / window[0];
        features.push([...window, volatility, momentum]);
    } else {
        // Handle multiple windows case
        for (let i = 0; i < priceBuffer.length - 50; i++) {
            const window = priceBuffer.slice(i, i + 50);
            const returns = window.slice(1).map((price, index) => (price - window[index]) / window[index]);
            const volatility = Math.sqrt(returns.reduce((sum, ret) => sum + ret * ret, 0) / returns.length);
            const momentum = (window[window.length - 1] - window[0]) / window[0];
            features.push([...window, volatility, momentum]);
        }
    }
    return features;
}
function prepareLabels(priceBuffer) {
    const labels = [];
    for (let i = 50; i < priceBuffer.length; i++) {
        labels.push(priceBuffer[i] > priceBuffer[i - 1] ? 1 : 0);
    }
    return labels;
}

module.exports = { RandomForestPredictor, prepareFeatures, prepareLabels };