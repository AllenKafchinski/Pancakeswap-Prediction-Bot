import { ethers } from 'ethers';

const PAIR_CONTRACT = '0x16b9a82891338f9bA80E2D6970FddA79D1eb0daE';
const WBNB = '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c';
const BUSD = '0x55d398326f99059fF775485246999027B3197955';

// Minimal ABI for getReserves
const PAIR_ABI = [
  {
    "constant": true,
    "inputs": [],
    "name": "getReserves",
    "outputs": [
      {
        "internalType": "uint112",
        "name": "_reserve0",
        "type": "uint112"
      },
      {
        "internalType": "uint112",
        "name": "_reserve1",
        "type": "uint112"
      },
      {
        "internalType": "uint32",
        "name": "_blockTimestampLast",
        "type": "uint32"
      }
    ],
    "payable": false,
    "stateMutability": "view",
    "type": "function"
  }
];

// Keep 2h of minute data to ensure enough for indicators
const MAX_MINUTE_DATA = 120;

class PriceDataManager {
  constructor() {
    this.minuteData = [];
    this.lastUpdateTime = 0;
    console.log('PriceDataManager initialized');
  }

  async addMinutePrice(price, roundManager) {
    const timestamp = Date.now();
    // Only add new price if it's been at least 30 seconds since last update
    const timeSinceLastUpdate = timestamp - this.lastUpdateTime;
    if (timeSinceLastUpdate < 30000) {
      console.log('Skipping price update, too soon:', timeSinceLastUpdate / 1000, 'seconds');
      return;
    }

    console.log('Adding price:', price, 'at time:', new Date(timestamp).toISOString());
    
    // Get price data with round end flag
    const priceData = await roundManager.updatePriceBuffer(price);
    
    // Add new price data point
    this.minuteData.push(priceData);

    // Keep only last 2 hours of data
    if (this.minuteData.length > MAX_MINUTE_DATA) {
      this.minuteData = this.minuteData.slice(-MAX_MINUTE_DATA);
    }

    this.lastUpdateTime = timestamp;

    // Log data status
    console.log('Price data status:', {
      dataPoints: this.minuteData.length,
      latest: price,
      timestamp: new Date(timestamp).toISOString(),
      priceBuffer: this.getPriceBuffer().length,
      isRoundEnd: priceData.isRoundEnd
    });
  }

  getMinuteData() {
    return [...this.minuteData];
  }

  getLatestPrice() {
    return this.minuteData.length > 0 ? this.minuteData[this.minuteData.length - 1].price : null;
  }

  getPriceBuffer() {
    return this.minuteData.map(d => d.price);
  }
}

export const priceManager = new PriceDataManager();

export const getWBNBPrice = async (provider) => {
  try {
    const pairContract = new ethers.Contract(PAIR_CONTRACT, PAIR_ABI, provider);
    const [reserve0, reserve1] = await pairContract.getReserves();

    // BUSD is token0, WBNB is token1
    // Price = BUSD/WBNB
    const price = reserve0.mul(ethers.constants.WeiPerEther).div(reserve1);
    const priceValue = parseFloat(ethers.utils.formatUnits(price, 18));
    console.log('WBNB Price:', priceValue);
    return priceValue;
  } catch (error) {
    console.error('Error fetching WBNB price:', error);
    return null;
  }
};

export const startPricePolling = (provider, roundManager, onUpdate) => {
  console.log('Starting price polling');

  // Function to fetch and update price
  const updatePrice = async () => {
    const price = await getWBNBPrice(provider);
    if (price) {
      await priceManager.addMinutePrice(price, roundManager);
      onUpdate({
        currentPrice: price,
        minuteData: priceManager.getMinuteData(),
        priceBuffer: priceManager.getPriceBuffer()
      });
    }
  };

  // Initial price fetch
  updatePrice();

  // Poll every 15 seconds to ensure we don't miss price movements
  const interval = setInterval(updatePrice, 15000);

  // Return cleanup function
  return () => {
    console.log('Stopping price polling');
    clearInterval(interval);
  };
};
