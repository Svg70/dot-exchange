"use client"

import React, { useState, useEffect, useCallback } from "react"
import type { InjectedAccountWithMeta } from "@polkadot/extension-inject/types"
import { Clock, ArrowRight, RefreshCw } from "lucide-react"

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
  from_para_id?: number; // Para ID источника (может отсутствовать для Relay Chain)
  dest_para_id: number;
  origin_block_timestamp: number;
  status: 'success' | 'fail' | string;
  assets: XcmAsset[];
}

// Функция для определения реального источника трансфера
const getSourceChain = (transfer: XcmTransfer): string => {
  // Если есть from_para_id, определяем по нему
  if (transfer.from_para_id !== undefined && transfer.from_para_id !== null) {
    switch (transfer.from_para_id) {
      case 0:
        return "Polkadot Relay";
      case 1000:
        return "Asset Hub";
      case 2037:
        return "Unique Network";
      default:
        return `Parachain ${transfer.from_para_id}`;
    }
  }
  
  // Fallback на from_chain из API
  if (transfer.from_chain === "polkadot" || transfer.from_chain === "Polkadot") {
    return "Polkadot Relay";
  }
  
  return transfer.from_chain;
};

// Функция для определения назначения трансфера
const getDestinationChain = (destParaId: number): string => {
  switch (destParaId) {
    case 0:
      return "Polkadot Relay";
    case 1000:
      return "Asset Hub";
    case 2037:
      return "Unique Network";
    default:
      return `Parachain ${destParaId}`;
  }
};

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
  const [copiedHash, setCopiedHash] = useState<string | null>(null);

  // Function to copy hash to clipboard
  const copyHashToClipboard = async (hash: string) => {
    try {
      await navigator.clipboard.writeText(hash);
      setCopiedHash(hash);
      setTimeout(() => setCopiedHash(null), 2000); // Clear after 2 seconds
    } catch (error) {
      console.error('Failed to copy hash:', error);
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = hash;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopiedHash(hash);
      setTimeout(() => setCopiedHash(null), 2000);
    }
  };

  // Wrap the fetch logic in useCallback to avoid recreating the function on every render
  const fetchHistory = useCallback(async () => {
    if (!selectedAccount) return;

    setIsLoading(true);
    try {
      console.log("Fetching XCM transfer history for:", selectedAccount.address);
      
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
      console.log("XCM transfer history response:", data);
      
      // Check for a successful response and the presence of the transaction list
      if (data.code === 0 && data.data && data.data.list) {
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
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-900">DOT Transfer History</h2>
        <button
          onClick={fetchHistory}
          disabled={isLoading}
          className="p-2 rounded-full text-gray-500 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          aria-label="Refresh history"
        >
          <RefreshCw className={`h-5 w-5 ${isLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>
      
      {isLoading ? (
        <div className="text-center py-8">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
          <p className="text-center text-gray-500 mt-2">Loading history...</p>
        </div>
      ) : history.length > 0 ? (
        <div className="space-y-4">
          {history.map((item) => (
            <div key={item.message_hash} className="p-4 border rounded-lg hover:bg-gray-50 transition-colors">
              <div className="flex justify-between items-center mb-2">
                <div className="flex items-center space-x-3">
                  <span className="font-bold text-lg text-gray-800">
                    {/* Added a check to ensure the assets array is not empty */}
                    {item.assets && item.assets.length > 0 
                      ? `${formatAmount(item.assets[0].amount, item.assets[0].decimals)} ${item.assets[0].symbol}`
                      : 'Unknown Amount'}
                  </span>
                  <div className={`px-2 py-0.5 rounded-full text-xs font-semibold capitalize ${
                    item.status === 'success' 
                      ? 'bg-green-100 text-green-800' 
                      : item.status === 'fail'
                      ? 'bg-red-100 text-red-800'
                      : 'bg-yellow-100 text-yellow-800'
                  }`}>
                    {item.status}
                  </div>
                </div>
                <div className="text-sm text-gray-500">
                  {new Date(item.origin_block_timestamp * 1000).toLocaleString()}
                </div>
              </div>
              
              <div className="flex items-center text-sm text-gray-600">
                <span className="font-medium">From: {getSourceChain(item)}</span>
                <ArrowRight className="w-4 h-4 mx-2 text-gray-400" />
                <span className="font-medium">To: {getDestinationChain(item.dest_para_id)}</span>
              </div>
              
              <div className="flex flex-wrap gap-2 mt-3">
                {/* <a 
                  href={`https://polkadot.subscan.io/xcm_message/${item.message_hash}`} 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="text-blue-600 hover:text-blue-800 hover:underline text-xs px-2 py-1 bg-blue-50 rounded transition-colors"
                >
                  View XCM Details
                </a> */}
                
                {/* Asset Hub History Link */}
                {/* {(item.from_para_id === 1000 || item.dest_para_id === 1000) && (
                  <a 
                    href={`https://assethub-polkadot.subscan.io/account/${selectedAccount.address}?tab=xcm_transfer`} 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="text-green-600 hover:text-green-800 hover:underline text-xs px-2 py-1 bg-green-50 rounded transition-colors"
                  >
                    Asset Hub History
                  </a>
                )}
                 */}
                {/* Unique Network XCM History Link */}
                {(item.from_para_id === 2037 || item.dest_para_id === 2037) && (
                  <a 
                    href={`https://unique.subscan.io/account/${selectedAccount.address}?tab=xcm_transfer`} 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="text-purple-600 hover:text-purple-800 hover:underline text-xs px-2 py-1 bg-purple-50 rounded transition-colors"
                  >
                    Unique XCM History
                  </a>
                )}
                
                {/* Polkadot Relay History Link */}
                {(item.from_para_id === 0 || item.from_para_id === undefined || item.dest_para_id === 0) && (
                  <a 
                    href={`https://polkadot.subscan.io/account/${selectedAccount.address}?tab=xcm_transfer`} 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="text-pink-600 hover:text-pink-800 hover:underline text-xs px-2 py-1 bg-pink-50 rounded transition-colors"
                  >
                    Polkadot History
                  </a>
                )}
              </div>
              
              {/* Clickable hash for copying */}
              <div className="mt-2 text-xs font-mono">
                <button
                  onClick={() => copyHashToClipboard(item.message_hash)}
                  className="text-gray-400 hover:text-gray-600 transition-colors cursor-pointer hover:bg-gray-100 px-2 py-1 rounded"
                  title="Click to copy full hash"
                >
                  {copiedHash === item.message_hash ? (
                    <span className="text-green-600">✓ Copied! {item.message_hash}</span>
                  ) : (
                    <span>Hash: {item.message_hash}</span>
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-8">
          <Clock className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-500 text-lg font-medium">No transfer history found</p>
          <p className="text-sm text-gray-400 mt-2">
            This account has not sent or received DOT via XCM to/from Unique Network.
          </p>
          <button
            onClick={fetchHistory}
            className="mt-4 px-4 py-2 text-sm text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded transition-colors"
          >
            Refresh History
          </button>
        </div>
      )}
      
      {/* Footer info */}
      <div className="mt-6 pt-4 border-t border-gray-200 text-xs text-gray-500">
        <p>Showing XCM transfers involving Unique Network (Para ID: 2037)</p>
        <p className="mt-1">Data provided by Subscan API</p>
      </div>
    </div>
  );
};

export default TransferHistory;