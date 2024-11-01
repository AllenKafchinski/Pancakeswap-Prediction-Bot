import { ethers } from 'ethers';
import contractABI from '../abis/contractABI.json';

const PREDICTION_CONTRACT = '0x18B2A687610328590Bc8F2e5fEdDe3b582A49cdA';

export class PredictionContract {
  constructor(provider) {
    this.contract = new ethers.Contract(PREDICTION_CONTRACT, contractABI, provider);
    console.log('PredictionContract initialized');
  }

  async getCurrentRound() {
    try {
      const epoch = await this.contract.currentEpoch();
      console.log('Current epoch:', epoch.toString());
      const round = await this.contract.rounds(epoch);
      console.log('Current round info:', round);
      
      return {
        epoch: epoch.toString(),
        startTimestamp: round.startTimestamp.toNumber() * 1000,
        lockTimestamp: round.lockTimestamp.toNumber() * 1000,
        closeTimestamp: round.closeTimestamp.toNumber() * 1000,
        lockPrice: round.lockPrice ? ethers.utils.formatUnits(round.lockPrice, 8) : null,
        closePrice: round.closePrice ? ethers.utils.formatUnits(round.closePrice, 8) : null,
        totalAmount: round.totalAmount ? ethers.utils.formatEther(round.totalAmount) : '0',
        bullAmount: round.bullAmount ? ethers.utils.formatEther(round.bullAmount) : '0',
        bearAmount: round.bearAmount ? ethers.utils.formatEther(round.bearAmount) : '0',
        rewardAmount: round.rewardAmount ? ethers.utils.formatEther(round.rewardAmount) : '0',
        oracleCalled: round.oracleCalled
      };
    } catch (error) {
      console.error('Error getting current round:', error);
      return null;
    }
  }

  async getRoundInfo(epoch) {
    try {
      console.log('Getting info for round:', epoch);
      const round = await this.contract.rounds(epoch);
      console.log('Round info received:', round);
      
      return {
        epoch: epoch.toString(),
        startTimestamp: round.startTimestamp.toNumber() * 1000,
        lockTimestamp: round.lockTimestamp.toNumber() * 1000,
        closeTimestamp: round.closeTimestamp.toNumber() * 1000,
        lockPrice: round.lockPrice ? ethers.utils.formatUnits(round.lockPrice, 8) : null,
        closePrice: round.closePrice ? ethers.utils.formatUnits(round.closePrice, 8) : null,
        totalAmount: round.totalAmount ? ethers.utils.formatEther(round.totalAmount) : '0',
        bullAmount: round.bullAmount ? ethers.utils.formatEther(round.bullAmount) : '0',
        bearAmount: round.bearAmount ? ethers.utils.formatEther(round.bearAmount) : '0',
        rewardAmount: round.rewardAmount ? ethers.utils.formatEther(round.rewardAmount) : '0',
        oracleCalled: round.oracleCalled
      };
    } catch (error) {
      console.error('Error getting round info:', error);
      return null;
    }
  }

  async placeBet(epoch, position, amount, signer) {
    try {
      console.log('Placing bet:', {
        epoch,
        position,
        amount,
        signer: await signer.getAddress()
      });

      const contract = this.contract.connect(signer);
      const amountInWei = ethers.utils.parseEther(amount.toString());
      
      let tx;
      if (position === 'bull') {
        console.log('Placing bull bet...');
        tx = await contract.betBull(epoch, { value: amountInWei });
      } else {
        console.log('Placing bear bet...');
        tx = await contract.betBear(epoch, { value: amountInWei });
      }
      
      console.log('Waiting for transaction confirmation...');
      const receipt = await tx.wait();
      console.log('Bet placed successfully:', receipt);
      
      return true;
    } catch (error) {
      console.error('Error placing bet:', error);
      return false;
    }
  }

  async claimWinnings(epoch, signer) {
    try {
      console.log('Claiming winnings for round:', epoch);
      const contract = this.contract.connect(signer);
      
      // Get user's round data
      const [claimable] = await contract.claimable(epoch, await signer.getAddress());
      
      if (claimable) {
        const tx = await contract.claim([epoch]);
        console.log('Waiting for claim transaction confirmation...');
        const receipt = await tx.wait();
        console.log('Winnings claimed successfully:', receipt);
        return true;
      } else {
        console.log('No winnings to claim for round:', epoch);
        return false;
      }
    } catch (error) {
      console.error('Error claiming winnings:', error);
      return false;
    }
  }

  async getUserBets(address, cursor = 0, size = 1000) {
    try {
      console.log('Getting user bets:', address);
      const [epochs, bets, nextCursor] = await this.contract.getUserRounds(address, cursor, size);
      console.log('User bets received:', { epochs, bets, nextCursor });
      
      return {
        epochs: epochs.map(e => e.toString()),
        bets: bets.map(bet => ({
          position: bet.position === 0 ? 'bull' : 'bear',
          amount: ethers.utils.formatEther(bet.amount),
          claimed: bet.claimed
        })),
        nextCursor: nextCursor.toString()
      };
    } catch (error) {
      console.error('Error getting user bets:', error);
      return null;
    }
  }

  onRoundStart(callback) {
    console.log('Setting up StartRound event listener');
    this.contract.on('StartRound', (epoch) => {
      console.log('StartRound event received:', epoch.toString());
      callback(epoch.toString());
    });
  }

  onRoundEnd(callback) {
    console.log('Setting up EndRound event listener');
    this.contract.on('EndRound', (epoch, roundId, price) => {
      console.log('EndRound event received:', {
        epoch: epoch.toString(),
        roundId: roundId.toString(),
        price: ethers.utils.formatUnits(price, 8)
      });
      callback(epoch.toString(), roundId.toString(), ethers.utils.formatUnits(price, 8));
    });
  }

  onBet(callback) {
    console.log('Setting up Bet event listeners');
    this.contract.on('BetBull', (sender, epoch, amount) => {
      console.log('BetBull event received:', {
        sender,
        epoch: epoch.toString(),
        amount: ethers.utils.formatEther(amount)
      });
      callback('bull', sender, epoch.toString(), ethers.utils.formatEther(amount));
    });
    this.contract.on('BetBear', (sender, epoch, amount) => {
      console.log('BetBear event received:', {
        sender,
        epoch: epoch.toString(),
        amount: ethers.utils.formatEther(amount)
      });
      callback('bear', sender, epoch.toString(), ethers.utils.formatEther(amount));
    });
  }
}
