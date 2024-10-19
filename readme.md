# Crypto Prediction Bot

## Overview
This bot is designed to predict cryptocurrency price movements and place bets based on those predictions. It uses historical data, technical indicators, and machine learning techniques to make informed decisions.

## Features
- Real-time monitoring of cryptocurrency rounds
- Backtesting capability using historical data
- Technical indicator calculations (RSI, MACD, SMA, EMA, Bollinger Bands, Stochastic Oscillator)
- Machine learning prediction using Random Forest algorithm
- Automated bet placement based on confidence scores
- Profit tracking and performance analysis

## Installation
Clone the repository:
```
git clone https://github.com/yourusername/crypto-prediction-bot.git
cd crypto-prediction-bot    
```
Install dependencies:
```
npm install
```
Set up your environment variables in the .env.example file; rename it to .env and fill in the values.

## Usage

### Running the Bot
To start the bot in live mode:
```
node index.js
```

### Backtesting
To run a backtest simulation:
First, collect the historical data:
```
node backtest.js
```
Then, run the backtest simulation:
```
node backtestSimulator.js
```

#Configuration

The bot's behavior can be customized by modifying the following files:

- `prediction.js`: Adjust prediction logic and bet size parameters

- `indicators.js`: Fine-tune technical indicator calculations

- `randomForests.js`: Modify machine learning model parameters


## File Structure


- `index.js`: Main entry point for live trading

- `backtestSimulator.js`: Simulates trading on historical data

- `prediction.js`: Contains prediction logic and bet size calculations

- `indicators.js`: Implements technical indicators

- `randomForests.js`: Implements Random Forest machine learning prediction model

- `profitTracker.js`: Tracks and analyzes betting performance

- `logger.js`: Handles logging throughout the application

## Key Components

### Prediction Model
The prediction model uses historical data to train a Random Forest algorithm. It calculates various technical indicators and uses them as features to predict the price movement.

### Betting Logic
The betting logic is implemented in the `prediction.js` file. It uses the trained model to make predictions and places bets based on the confidence scores.

### Live Monitoring
The bot continuously monitors the cryptocurrency rounds and places bets based on the predictions. It uses the `prediction.js` file to make betting decisions and the `profitTracker.js` file to track and analyze the betting performance.

### Backtesting
The backtesting feature allows you to simulate trading on historical data. It uses the `backtest.js` file to collect historical data and the `backtestSimulator.js` file to run the backtest simulation.

## Performance Metrics
The bot tracks various performance metrics, including:

- Total number of bets
- Win/Loss ratio
- Total Profit/Loss
- Win rate percentage

These metrics are displayed after running a backtest simulation.

## Disclaimer
This bot is for educational purposes only. Use it at your own risk. The author is not responsible for any losses incurred. Cryptocurrency trading involves significant risk. Always do your own research and never invest more than you can afford to lose.

## Contributing
Contributions are welcome! If you have any suggestions or improvements, please open an issue or submit a pull request.

## License

This project is licensed under the MIT License - see the LICENSE file for details.