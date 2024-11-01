import { getPrediction } from './predictionLogic';
import { PredictionContract } from './contractUtils';
import { ethers } from 'ethers';

export class RoundManager {
  constructor() {
    this.currentRound = null;
    this.nextRound = null;
    this.pastRounds = [];
    this.contract = null;
    this.isRunning = false;
    this.provider = null;
    this.signer = null;
    this.priceBuffer = [];
    this.mode = 'paper';
    this.roundStartTime = null;
    this.roundEndPrices = new Map();
    this.predictions = new Map(); // Store predictions by epoch
  }

  async initialize(provider, signer = null) {
    this.provider = provider;
    this.signer = signer;
    this.contract = new PredictionContract(provider);

    // Get current round info
    const currentRound = await this.contract.getCurrentRound();
    if (currentRound) {
      this.currentRound = {
        ...currentRound,
        prediction: null,
        betSize: null,
        confidence: null,
        indicators: null,
        result: null,
        profitLoss: null
      };
      this.roundStartTime = Date.now();

      // Initialize next round
      const nextEpoch = ethers.BigNumber.from(currentRound.epoch).add(1).toString();
      this.nextRound = {
        epoch: nextEpoch,
        prediction: null,
        betSize: null,
        confidence: null,
        indicators: null
      };

      // Load past 100 rounds for historical data
      try {
        const currentEpoch = parseInt(currentRound.epoch);
        const pastRounds = await Promise.all(
          Array.from({ length: 100 }, (_, i) => currentEpoch - i - 1)
            .map(async (epoch) => {
              const roundInfo = await this.contract.getRoundInfo(epoch.toString());
              if (roundInfo && roundInfo.closePrice) {
                // Add close price to price buffer for ML
                const closePrice = parseFloat(roundInfo.closePrice);
                if (!isNaN(closePrice)) {
                  this.priceBuffer.unshift(closePrice); // Add to start to maintain chronological order
                }
                
                const storedPrediction = this.predictions.get(epoch.toString());
                const round = {
                  ...roundInfo,
                  prediction: storedPrediction?.prediction || null,
                  betSize: storedPrediction?.betSize || null,
                  confidence: storedPrediction?.confidence || null,
                  indicators: storedPrediction?.indicators || null,
                  result: null,
                  profitLoss: null
                };

                // Calculate result if we have both prices and a prediction
                if (round.prediction && round.lockPrice && round.closePrice) {
                  const won = round.prediction === 'bull' ? 
                    parseFloat(round.closePrice) > parseFloat(round.lockPrice) :
                    parseFloat(round.closePrice) < parseFloat(round.lockPrice);
                  
                  round.result = won ? 'win' : 'loss';
                  round.profitLoss = won ? 
                    round.betSize * 0.98 : // 2% platform fee
                    -round.betSize;
                }

                return round;
              }
              return null;
            })
        );
        this.pastRounds = pastRounds.filter(round => round !== null);
        
        // Keep only last 100 prices in buffer
        if (this.priceBuffer.length > 100) {
          this.priceBuffer = this.priceBuffer.slice(-100);
        }
        
        console.log('Loaded past rounds:', this.pastRounds.length);
        console.log('Price buffer size:', this.priceBuffer.length);

        // Make initial prediction if we have enough data
        if (this.priceBuffer.length >= 20) {
          const predictionResult = await this.makePrediction();
          if (predictionResult && this.nextRound) {
            this.nextRound.prediction = predictionResult.prediction;
            this.nextRound.betSize = predictionResult.betSize;
            this.nextRound.confidence = predictionResult.confidence;
            this.nextRound.indicators = predictionResult.indicators;
            this.predictions.set(this.nextRound.epoch, predictionResult);
            console.log('Initial prediction made:', predictionResult);
          }
        }
      } catch (error) {
        console.error('Error loading past rounds:', error);
      }
    }

    // Set up event listeners
    this.contract.onRoundStart(this.handleRoundStart.bind(this));
    this.contract.onRoundEnd(this.handleRoundEnd.bind(this));
    this.contract.onBet(this.handleBet.bind(this));

    console.log('RoundManager initialized:', {
      currentRound: this.currentRound?.epoch,
      nextRound: this.nextRound?.epoch,
      mode: this.mode,
      isRunning: this.isRunning,
      pastRounds: this.pastRounds.length,
      priceBuffer: this.priceBuffer.length
    });
  }

  async makePrediction() {
    if (!this.isRunning) {
      console.log('Bot is not running, skipping prediction');
      return null;
    }

    // Start with minimal data requirements
    if (this.priceBuffer.length < 20) {
      console.log('Not enough price data for prediction:', this.priceBuffer.length);
      return null;
    }

    console.log('Making prediction with price buffer:', this.priceBuffer.length);
    const predictionResult = await getPrediction(this.priceBuffer);
    console.log('Prediction result:', predictionResult);

    // Store prediction for next round
    if (predictionResult && this.nextRound) {
      this.predictions.set(this.nextRound.epoch, predictionResult);
    }

    return predictionResult;
  }

  async checkCurrentRound() {
    try {
      const currentRound = await this.contract.getCurrentRound();
      if (currentRound && (!this.currentRound || currentRound.epoch !== this.currentRound.epoch)) {
        console.log('New round detected:', currentRound.epoch);
        
        // Move current round to history if it exists
        if (this.currentRound) {
          // Get final round info before moving to history
          const finalRoundInfo = await this.contract.getRoundInfo(this.currentRound.epoch);
          const storedPrediction = this.predictions.get(this.currentRound.epoch);
          const updatedCurrentRound = {
            ...this.currentRound,
            ...finalRoundInfo,
            prediction: storedPrediction?.prediction || this.currentRound.prediction,
            betSize: storedPrediction?.betSize || this.currentRound.betSize,
            confidence: storedPrediction?.confidence || this.currentRound.confidence,
            indicators: storedPrediction?.indicators || this.currentRound.indicators
          };

          // Calculate result if we have both prices and a prediction
          if (updatedCurrentRound.prediction && updatedCurrentRound.lockPrice && updatedCurrentRound.closePrice) {
            const won = updatedCurrentRound.prediction === 'bull' ? 
              parseFloat(updatedCurrentRound.closePrice) > parseFloat(updatedCurrentRound.lockPrice) :
              parseFloat(updatedCurrentRound.closePrice) < parseFloat(updatedCurrentRound.lockPrice);
            
            updatedCurrentRound.result = won ? 'win' : 'loss';
            updatedCurrentRound.profitLoss = won ? 
              updatedCurrentRound.betSize * 0.98 : // 2% platform fee
              -updatedCurrentRound.betSize;
          }

          this.pastRounds.unshift(updatedCurrentRound);
          if (this.pastRounds.length > 100) {
            this.pastRounds.pop();
          }
          console.log('Added round to history:', updatedCurrentRound.epoch);
        }

        // Update current round
        const storedPrediction = this.predictions.get(currentRound.epoch);
        this.currentRound = {
          ...currentRound,
          prediction: storedPrediction?.prediction || null,
          betSize: storedPrediction?.betSize || null,
          confidence: storedPrediction?.confidence || null,
          indicators: storedPrediction?.indicators || null,
          result: null,
          profitLoss: null
        };

        // Reset round timer
        this.roundStartTime = Date.now();

        // Initialize next round
        const nextEpoch = ethers.BigNumber.from(currentRound.epoch).add(1).toString();
        const nextStoredPrediction = this.predictions.get(nextEpoch);
        this.nextRound = {
          epoch: nextEpoch,
          prediction: nextStoredPrediction?.prediction || null,
          betSize: nextStoredPrediction?.betSize || null,
          confidence: nextStoredPrediction?.confidence || null,
          indicators: nextStoredPrediction?.indicators || null
        };

        // Make prediction for next round if bot is running
        if (this.isRunning) {
          const predictionResult = await this.makePrediction();
          if (predictionResult) {
            this.nextRound.prediction = predictionResult.prediction;
            this.nextRound.betSize = predictionResult.betSize;
            this.nextRound.confidence = predictionResult.confidence;
            this.nextRound.indicators = predictionResult.indicators;

            if (this.mode === 'live' && this.signer) {
              await this.contract.placeBet(
                this.nextRound.epoch,
                predictionResult.prediction,
                predictionResult.betSize,
                this.signer
              );
            }
          }
        }
      }
      return this.currentRound;
    } catch (error) {
      console.error('Error checking current round:', error);
      return null;
    }
  }

  async handleRoundStart(epoch) {
    console.log('Round starting:', epoch);
    await this.checkCurrentRound();
  }

  async handleRoundEnd(epoch, roundId, closePrice) {
    console.log('Round ending:', epoch, 'Close price:', closePrice);
    
    // Store round end price
    this.roundEndPrices.set(epoch, closePrice);
    
    // Find the round in our history
    const round = this.pastRounds.find(r => r.epoch === epoch) || 
                 (this.currentRound?.epoch === epoch ? this.currentRound : null);

    if (round) {
      // Get final round info
      const finalRoundInfo = await this.contract.getRoundInfo(epoch);
      const storedPrediction = this.predictions.get(epoch);
      Object.assign(round, finalRoundInfo, {
        prediction: storedPrediction?.prediction || round.prediction,
        betSize: storedPrediction?.betSize || round.betSize,
        confidence: storedPrediction?.confidence || round.confidence,
        indicators: storedPrediction?.indicators || round.indicators
      });
      
      // Calculate result if we made a prediction
      if (round.prediction && round.lockPrice && round.closePrice) {
        const won = round.prediction === 'bull' ? 
          parseFloat(round.closePrice) > parseFloat(round.lockPrice) :
          parseFloat(round.closePrice) < parseFloat(round.lockPrice);
        
        round.result = won ? 'win' : 'loss';
        round.profitLoss = won ? 
          round.betSize * 0.98 : // 2% platform fee
          -round.betSize;

        console.log('Round result:', {
          epoch: round.epoch,
          prediction: round.prediction,
          won,
          profitLoss: round.profitLoss,
          lockPrice: round.lockPrice,
          closePrice: round.closePrice
        });

        // Collect winnings in live mode
        if (won && this.mode === 'live' && this.signer) {
          try {
            await this.contract.claimWinnings(epoch, this.signer);
            console.log('Claimed winnings for round:', epoch);
          } catch (error) {
            console.error('Error claiming winnings:', error);
          }
        }
      } else {
        console.log('No prediction was made for round:', epoch);
      }
    }
  }

  handleBet(position, sender, epoch, amount) {
    // Update round amounts for the current round
    if (this.currentRound && this.currentRound.epoch === epoch) {
      if (position === 'bull') {
        this.currentRound.bullAmount = (parseFloat(this.currentRound.bullAmount) + parseFloat(amount)).toString();
      } else {
        this.currentRound.bearAmount = (parseFloat(this.currentRound.bearAmount) + parseFloat(amount)).toString();
      }
      this.currentRound.totalAmount = (parseFloat(this.currentRound.bullAmount) + parseFloat(this.currentRound.bearAmount)).toString();
    }
  }

  async updatePriceBuffer(price) {
    const now = Date.now();
    this.priceBuffer.push(price);
    if (this.priceBuffer.length > 100) {
      this.priceBuffer.shift();
    }

    // Update indicators for next round
    if (this.priceBuffer.length >= 20) {
      const predictionResult = await getPrediction(this.priceBuffer);
      if (this.nextRound) {
        this.nextRound.indicators = predictionResult.indicators;
      }
    }

    // Add isRoundEnd flag for chart
    const isRoundEnd = this.roundEndPrices.has(this.currentRound?.epoch);
    return {
      price,
      timestamp: now,
      isRoundEnd
    };
  }

  setMode(mode) {
    if (mode === 'live' && !this.signer) {
      throw new Error('Wallet connection required for live mode');
    }
    console.log('Setting mode:', mode);
    this.mode = mode;
  }

  startBot(signer = null) {
    if (this.mode === 'live') {
      if (!signer) {
        throw new Error('Signer required for live mode');
      }
      this.signer = signer;
    }
    console.log('Starting bot in', this.mode, 'mode');
    this.isRunning = true;

    // Make initial prediction
    this.makePrediction().then(predictionResult => {
      if (predictionResult && this.nextRound) {
        this.nextRound.prediction = predictionResult.prediction;
        this.nextRound.betSize = predictionResult.betSize;
        this.nextRound.confidence = predictionResult.confidence;
        this.nextRound.indicators = predictionResult.indicators;
        this.predictions.set(this.nextRound.epoch, predictionResult);
        console.log('Initial prediction made:', predictionResult);
      }
    });
  }

  stopBot() {
    console.log('Stopping bot');
    this.isRunning = false;
    if (this.mode === 'paper') {
      this.signer = null;
    }
  }

  getCurrentRound() {
    return this.currentRound;
  }

  getNextRound() {
    return this.nextRound;
  }

  getPastRounds() {
    return this.pastRounds;
  }

  getTimeLeft() {
    if (!this.currentRound || !this.roundStartTime) return '00:00';
    
    const now = Date.now();
    const roundLength = 5 * 60 * 1000; // 5 minutes in milliseconds
    const elapsed = now - this.roundStartTime;
    const timeLeft = Math.max(0, roundLength - elapsed);
    
    const minutes = Math.floor(timeLeft / 60000);
    const seconds = Math.floor((timeLeft % 60000) / 1000);
    
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }

  isBotRunning() {
    return this.isRunning;
  }

  getMode() {
    return this.mode;
  }

  getRoundEndPrices() {
    return this.roundEndPrices;
  }
}

// Create and export a single instance
const roundManager = new RoundManager();
export { roundManager };
