import React from 'react';
import Header from './components/Header';
import LivePrediction from './components/LivePrediction';
import StrategyConfig from './components/StrategyConfig';

function App() {
  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <Header />
      <div className="container mx-auto px-4 py-8 space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <LivePrediction />
          </div>
          <div className="space-y-6">
            <StrategyConfig />
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
