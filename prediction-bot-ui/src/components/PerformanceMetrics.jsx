import React from 'react';
import { 
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
  BanknotesIcon,
  ScaleIcon
} from '@heroicons/react/24/outline';

const PerformanceMetrics = ({ rounds }) => {
  // Calculate performance metrics
  const stats = React.useMemo(() => {
    if (!rounds || rounds.length === 0) {
      return {
        totalRounds: 0,
        wins: 0,
        losses: 0,
        winRate: 0,
        totalProfit: 0,
        bullWins: 0,
        bearWins: 0,
        avgWin: 0,
        avgLoss: 0,
        bestWin: 0,
        worstLoss: 0
      };
    }

    const roundsWithPredictions = rounds.filter(r => r.prediction && r.result);
    const wins = roundsWithPredictions.filter(r => r.result === 'win');
    const losses = roundsWithPredictions.filter(r => r.result === 'loss');
    const bullWins = wins.filter(r => r.prediction === 'bull');
    const bearWins = wins.filter(r => r.prediction === 'bear');
    
    const totalProfit = roundsWithPredictions.reduce((sum, r) => sum + (r.profitLoss || 0), 0);
    const winProfits = wins.map(r => r.profitLoss || 0);
    const lossProfits = losses.map(r => r.profitLoss || 0);

    return {
      totalRounds: roundsWithPredictions.length,
      wins: wins.length,
      losses: losses.length,
      winRate: roundsWithPredictions.length > 0 ? (wins.length / roundsWithPredictions.length) * 100 : 0,
      totalProfit,
      bullWins: bullWins.length,
      bearWins: bearWins.length,
      avgWin: winProfits.length > 0 ? winProfits.reduce((a, b) => a + b, 0) / winProfits.length : 0,
      avgLoss: lossProfits.length > 0 ? lossProfits.reduce((a, b) => a + b, 0) / lossProfits.length : 0,
      bestWin: winProfits.length > 0 ? Math.max(...winProfits) : 0,
      worstLoss: lossProfits.length > 0 ? Math.min(...lossProfits) : 0
    };
  }, [rounds]);

  const MetricCard = ({ title, value, icon: Icon, color }) => (
    <div className="bg-secondary-700 rounded-lg p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-gray-400 text-sm">{title}</span>
        <Icon className={`h-5 w-5 ${color}`} />
      </div>
      <div className="text-xl font-bold">{value}</div>
    </div>
  );

  return (
    <div className="card">
      <h2 className="text-xl font-bold mb-6">Performance Metrics</h2>
      
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <MetricCard
          title="Total Rounds"
          value={stats.totalRounds}
          icon={ScaleIcon}
          color="text-blue-400"
        />
        <MetricCard
          title="Win Rate"
          value={`${stats.winRate.toFixed(1)}%`}
          icon={ArrowTrendingUpIcon}
          color="text-green-400"
        />
        <MetricCard
          title="Total Profit"
          value={`${stats.totalProfit.toFixed(3)} BNB`}
          icon={BanknotesIcon}
          color={stats.totalProfit >= 0 ? 'text-green-400' : 'text-red-400'}
        />
        <MetricCard
          title="Best Win"
          value={`${stats.bestWin.toFixed(3)} BNB`}
          icon={ArrowTrendingUpIcon}
          color="text-green-400"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-secondary-700 rounded-lg p-4">
          <h3 className="text-gray-400 mb-4">Win/Loss Distribution</h3>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <div className="flex items-center">
                <div className="w-3 h-3 rounded-full bg-green-500 mr-2"></div>
                <span>Wins</span>
              </div>
              <span className="font-bold">{stats.wins}</span>
            </div>
            <div className="flex justify-between items-center">
              <div className="flex items-center">
                <div className="w-3 h-3 rounded-full bg-red-500 mr-2"></div>
                <span>Losses</span>
              </div>
              <span className="font-bold">{stats.losses}</span>
            </div>
            <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
              <div 
                className="h-full bg-green-500" 
                style={{ 
                  width: `${stats.totalRounds > 0 ? (stats.wins / stats.totalRounds) * 100 : 0}%` 
                }}
              ></div>
            </div>
          </div>
        </div>

        <div className="bg-secondary-700 rounded-lg p-4">
          <h3 className="text-gray-400 mb-4">Direction Performance</h3>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <div className="flex items-center">
                <ArrowTrendingUpIcon className="h-5 w-5 text-green-500 mr-2" />
                <span>UP Wins</span>
              </div>
              <span className="font-bold">{stats.bullWins}</span>
            </div>
            <div className="flex justify-between items-center">
              <div className="flex items-center">
                <ArrowTrendingDownIcon className="h-5 w-5 text-red-500 mr-2" />
                <span>DOWN Wins</span>
              </div>
              <span className="font-bold">{stats.bearWins}</span>
            </div>
            <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
              <div 
                className="h-full bg-green-500" 
                style={{ 
                  width: `${stats.wins > 0 ? (stats.bullWins / stats.wins) * 100 : 0}%` 
                }}
              ></div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mt-4">
        <div className="bg-green-900/20 border border-green-600 rounded-lg p-4">
          <h3 className="text-gray-400 mb-2">Average Win</h3>
          <div className="text-xl font-bold text-green-400">
            +{stats.avgWin.toFixed(3)} BNB
          </div>
        </div>
        <div className="bg-red-900/20 border border-red-600 rounded-lg p-4">
          <h3 className="text-gray-400 mb-2">Average Loss</h3>
          <div className="text-xl font-bold text-red-400">
            {stats.avgLoss.toFixed(3)} BNB
          </div>
        </div>
      </div>
    </div>
  );
};

export default PerformanceMetrics;
