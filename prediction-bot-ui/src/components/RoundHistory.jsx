import React, { useState, useEffect } from 'react';
import { ArrowTrendingUpIcon, ArrowTrendingDownIcon } from '@heroicons/react/24/solid';
import { roundManager } from '../utils/roundUtils';

const RoundHistory = ({ rounds }) => {
  const [processedRounds, setProcessedRounds] = useState([]);

  useEffect(() => {
    // Process rounds to ensure all data is available
    const processRounds = async () => {
      const processed = await Promise.all(rounds.map(async round => {
        if (!round) return null;

        // If prices are $0.00, wait 5 minutes and check again
        if ((!round.lockPrice || !round.closePrice) && round.epoch) {
          return new Promise(resolve => {
            setTimeout(async () => {
              const updatedRound = await roundManager.contract.getRoundInfo(round.epoch);
              resolve({
                ...round,
                lockPrice: updatedRound.lockPrice || round.lockPrice,
                closePrice: updatedRound.closePrice || round.closePrice
              });
            }, 5 * 60 * 1000); // 5 minutes
          });
        }

        // Calculate result if we have both prices
        if (round.lockPrice && round.closePrice) {
          const lockPrice = parseFloat(round.lockPrice);
          const closePrice = parseFloat(round.closePrice);
          const result = closePrice > lockPrice ? 'bull' : 'bear';

          // If we have a prediction, calculate win/loss
          if (round.prediction) {
            const won = round.prediction === result;
            round.result = won ? 'win' : 'loss';
            
            // Calculate profit/loss if we have bet size
            if (round.betSize) {
              const totalAmount = parseFloat(round.totalAmount || 0);
              const bullAmount = parseFloat(round.bullAmount || 0);
              const bearAmount = parseFloat(round.bearAmount || 0);
              const betSize = parseFloat(round.betSize);
              
              if (won) {
                const poolAmount = result === 'bull' ? bearAmount : bullAmount;
                const winningAmount = (betSize / (result === 'bull' ? bullAmount : bearAmount)) * poolAmount;
                round.profitLoss = winningAmount * 0.97; // Account for 3% platform fee
              } else {
                round.profitLoss = -betSize;
              }
            }
          }
        }
        return round;
      }));
      setProcessedRounds(processed.filter(round => round !== null));
    };

    processRounds();
  }, [rounds]);

  if (!processedRounds || processedRounds.length === 0) {
    return (
      <div className="card">
        <h2 className="text-xl font-bold mb-4">Round History</h2>
        <div className="text-gray-400 text-center py-4">No rounds played yet</div>
      </div>
    );
  }

  const formatPrice = (price) => {
    if (!price) return '$0.00';
    const parsedPrice = parseFloat(price);
    return isNaN(parsedPrice) ? '$0.00' : `$${parsedPrice.toFixed(2)}`;
  };

  const formatBNB = (amount) => {
    if (!amount) return '-';
    const parsedAmount = parseFloat(amount);
    return isNaN(parsedAmount) ? '-' : `${parsedAmount.toFixed(3)} BNB`;
  };

  return (
    <div className="card">
      <h2 className="text-xl font-bold mb-4">Round History</h2>
      <div className="overflow-x-auto">
        <div className="max-h-[400px] overflow-y-auto">
          <table className="w-full">
            <thead className="sticky top-0 bg-gray-900 z-10">
              <tr className="text-left text-gray-400">
                <th className="pb-4">Round</th>
                <th className="pb-4">Prediction</th>
                <th className="pb-4">Lock Price</th>
                <th className="pb-4">Close Price</th>
                <th className="pb-4">Bet Size</th>
                <th className="pb-4">Pool Size</th>
                <th className="pb-4">Result</th>
                <th className="pb-4">P/L</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {processedRounds.map((round) => (
                <tr key={round.epoch} className="text-sm">
                  <td className="py-3">#{round.epoch || '-'}</td>
                  <td className="py-3">
                    {round.prediction ? (
                      <div className="flex items-center">
                        {round.prediction === 'bull' ? (
                          <>
                            <ArrowTrendingUpIcon className="h-4 w-4 text-green-500 mr-1" />
                            <span className="text-green-400">UP</span>
                          </>
                        ) : (
                          <>
                            <ArrowTrendingDownIcon className="h-4 w-4 text-red-500 mr-1" />
                            <span className="text-red-400">DOWN</span>
                          </>
                        )}
                      </div>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </td>
                  <td className="py-3">{formatPrice(round.lockPrice)}</td>
                  <td className="py-3">{formatPrice(round.closePrice)}</td>
                  <td className="py-3">{formatBNB(round.betSize)}</td>
                  <td className="py-3">{formatBNB(round.totalAmount)}</td>
                  <td className="py-3">
                    {round.result ? (
                      <span className={round.result === 'win' ? 'text-green-400' : 'text-red-400'}>
                        {round.result.toUpperCase()}
                      </span>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </td>
                  <td className="py-3">
                    {round.profitLoss !== undefined && round.profitLoss !== null ? (
                      <span className={round.profitLoss > 0 ? 'text-green-400' : 'text-red-400'}>
                        {round.profitLoss > 0 ? '+' : ''}{round.profitLoss.toFixed(3)} BNB
                      </span>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default RoundHistory;
