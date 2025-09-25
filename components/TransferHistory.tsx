"use client"

import React, { useState, useEffect, useCallback } from "react" // Import useCallback
import type { InjectedAccountWithMeta } from "@polkadot/extension-inject/types"
import { Clock, ArrowRight, RefreshCw } from "lucide-react" // Import the RefreshCw icon

interface TransferHistoryProps {
  selectedAccount: InjectedAccountWithMeta | null;
}

// Interfaces for typing the Subscan API response
interface XcmAsset {
  symbol: string;
  amount: string;
  decimals: number;
}

interface XcmTransfer {
  message_hash: string;
  from_chain: string;
  dest_para_id: number;
  origin_block_timestamp: number;
  status: 'success' | 'fail' | string; // Make the status type more flexible for other potential values
  assets: XcmAsset[];
}

// Helper function to format the balance from its smallest unit (e.g., Plancks)
const formatAmount = (amount: string, decimals: number): string => {
  const amountBigInt = BigInt(amount);
  const divisor = BigInt(10 ** decimals);
  const integerPart = amountBigInt / divisor;
  // Keep 4 decimal places for the fractional part
  const fractionalPart = (amountBigInt % divisor).toString().padStart(decimals, '0').slice(0, 4);
  return `${integerPart}.${fractionalPart}`;
};

export const TransferHistory: React.FC<TransferHistoryProps> = ({ selectedAccount }) => {
  const [history, setHistory] = useState<XcmTransfer[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Wrap the fetch logic in useCallback to avoid recreating the function on every render
  const fetchHistory = useCallback(async () => {
    if (!selectedAccount) return;

    setIsLoading(true);
    try {
      const response = await fetch('https://polkadot.webapi.subscan.io/api/scan/xcm/list', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          filter_para_id: 2037, // ParaID for Unique Network
          row: 20,
          page: 0,
          address: selectedAccount.address,
          message_type: "transfer"
        })
      });

      if (!response.ok) {
        throw new Error(`API call failed with status: ${response.status}`);
      }

      const data = await response.json();
      
      // Check for a successful response and the presence of the transaction list
      if (data.code === 0 && data.data.list) {
        setHistory(data.data.list);
      } else {
        console.warn("API response was successful but contained no list:", data.message);
        setHistory([]);
      }
    } catch (error) {
      console.error("Failed to fetch transfer history:", error);
      setHistory([]); // Reset history on error
    } finally {
      setIsLoading(false);
    }
  }, [selectedAccount]); // Dependency on selectedAccount ensures the function is updated if the account changes

  // Initial data fetch on component mount
  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  if (!selectedAccount) return null;

  return (
    <div className="max-w-2xl mx-auto p-6 bg-white rounded-lg shadow-lg">
      {/* --- START: Refresh Button Implementation --- */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-900">DOT Transfer History</h2>
        <button
          onClick={fetchHistory}
          disabled={isLoading}
          className="p-2 rounded-full text-gray-500 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
          aria-label="Refresh history"
        >
          <RefreshCw className={`h-5 w-5 ${isLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>
      {/* --- END: Refresh Button Implementation --- */}
      
      {isLoading ? (
        <p className="text-center text-gray-500 py-8">Loading history...</p>
      ) : history.length > 0 ? (
        <div className="space-y-4">
          {history.map((item) => (
            <div key={item.message_hash} className="p-4 border rounded-lg hover:bg-gray-50 transition-colors">
              <div className="flex justify-between items-center mb-2">
                <div className="flex items-center space-x-3">
                  <span className="font-bold text-lg text-gray-800">
                    {/* Added a check to ensure the assets array is not empty */}
                    {item.assets.length > 0 
                      ? `${formatAmount(item.assets[0].amount, item.assets[0].decimals)} ${item.assets[0].symbol}`
                      : 'Unknown Amount'}
                  </span>
                  <div className={`px-2 py-0.5 rounded-full text-xs font-semibold capitalize ${
                    item.status === 'success' 
                      ? 'bg-green-100 text-green-800' 
                      : 'bg-red-100 text-red-800'
                  }`}>
                    {item.status}
                  </div>
                </div>
                <div className="text-sm text-gray-500">
                  {new Date(item.origin_block_timestamp * 1000).toLocaleString()}
                </div>
              </div>
              <div className="flex items-center text-sm text-gray-600 capitalize">
                <span>From: {item.from_chain}</span>
                <ArrowRight className="w-4 h-4 mx-2" />
                <span>To Parachain: {item.dest_para_id}</span>
              </div>
              <a 
                href={`https://polkadot.subscan.io/xcm_message/${item.message_hash}`} 
                target="_blank" 
                rel="noopener noreferrer" 
                className="text-blue-600 hover:underline text-xs mt-2 inline-block"
              >
                View on Subscan
              </a>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-8">
          <Clock className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-500">No transfer history found.</p>
          <p className="text-sm text-gray-400 mt-2">
            This account has not sent or received DOT via XCM to/from Unique Network.
          </p>
        </div>
      )}
    </div>
  );
};

export default TransferHistory;