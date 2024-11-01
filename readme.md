# Pancakeswap Prediction Bot

## Overview
This bot is designed to predict cryptocurrency price movements and place bets based on those predictions on [Pancakeswap's Prediction game](https://pancakeswap.finance/prediction?token=BNB). It uses technical indicators to analyze price movements and make informed betting decisions, with a user-friendly UI for monitoring and control.

## Features
- Real-time monitoring of WBNB/BUSD price from PancakeSwap liquidity pool
- Technical indicator calculations (RSI, MACD, SMA, EMA, Bollinger Bands, Stochastic Oscillator)
- Automated bet placement based on confidence scores
- User-friendly web interface for monitoring and control
- Real-time round tracking and synchronization
- Historical round performance tracking
- Wallet integration for live betting

## Installation
Clone the repository:
```
git clone https://github.com/AllenKafchinski/Pancakeswap-Prediction-Bot
cd Pancakeswap-Prediction-Bot    
```
Install dependencies:
```
npm install
```

## Usage

### Running the Bot UI
To start the bot interface:
```
cd prediction-bot-ui
npm install
npm start
```

The UI will be available at `http://localhost:3000`

### Using the Interface

1. Connect your wallet using the "Connect Wallet" button
2. Configure your strategy parameters in the Strategy Configuration panel
3. Start the bot using the "Start Bot" button
4. Monitor performance in real-time through the interface

## Components

### Web Interface

- `LivePrediction`: Displays current round information, price chart, and active predictions
- `RoundHistory`: Shows past rounds with their results
- `StrategyConfig`: Configure bet sizes and strategy parameters
- `PerformanceMetrics`: Track bot performance statistics

### Core Logic

- `predictionLogic.js`: Core prediction algorithm using technical analysis
- `indicatorUtils.js`: Technical indicator calculations
- `contractUtils.js`: PancakeSwap contract interactions
- `roundUtils.js`: Round management and tracking
- `priceUtils.js`: Real-time price data handling

## Technical Analysis

The bot uses several technical indicators to make predictions:

- RSI (Relative Strength Index)
- MACD (Moving Average Convergence Divergence)
- Bollinger Bands
- Stochastic Oscillator
- SMA/EMA (Simple/Exponential Moving Averages)

These indicators are combined to generate a confidence score, which determines:
1. Whether to place a bet (UP or DOWN)
2. Bet size based on confidence level

## Performance Tracking

The interface tracks various performance metrics in real-time:

- Total number of rounds played
- Win/Loss ratio
- Total Profit/Loss
- Current winning/losing streak
- Average bet size
- ROI percentage

## Smart Contract Integration

The bot interacts with two main contracts:
- PancakeSwap Prediction Contract: For round information and betting
- WBNB/BUSD Pair Contract: For real-time price data

## Disclaimer
This bot is for educational purposes only. Use it at your own risk. The author is not responsible for any losses incurred. Cryptocurrency trading involves significant risk. Always do your own research and never invest more than you can afford to lose.

## Contributing
Contributions are welcome! If you have any suggestions or improvements, please open an issue or submit a pull request.

## License
This project is licensed under the MIT License - see the LICENSE file for details.
