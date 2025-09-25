import React from 'react';
import DOTExchange from './components/DOTExchange';
import './App.css';

function App() {
  return (
    <div className="App">
      <div className="min-h-screen bg-gray-100 py-8">
        <div className="container mx-auto px-4">
          <DOTExchange />
        </div>
      </div>
    </div>
  );
}

export default App;
