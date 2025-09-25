"use client"

import React, { useState, useEffect } from "react"
import type { ApiPromise } from "@polkadot/api"
import type { InjectedAccountWithMeta } from "@polkadot/extension-inject/types"
import { Clock, ArrowRight } from "lucide-react"

interface TransferHistoryProps {
  selectedAccount: InjectedAccountWithMeta | null;
  // polkadotApi и uniqueApi могут понадобиться для других целей, но для истории используем API эксплорера
  polkadotApi: ApiPromise | null;
  uniqueApi: ApiPromise | null;
}

// Определяем тип для транзакции, чтобы работать с типизированными данными
interface SubscanTransfer {
  from: string;
  to: string;
  hash: string;
  block_timestamp: number;
  module: string;
  call: string;
  success: boolean;
  params: string; // Параметры обычно в формате JSON-строки
}

// Функция для парсинга суммы из параметров
const parseAmount = (params: string): string => {
  try {
    const parsedParams = JSON.parse(params);
    // Структура может отличаться, нужно смотреть реальный ответ API
    const amountParam = parsedParams.find((p: any) => p.name === 'value' || p.name === 'amount');
    if (amountParam) {
      // Сумма в планках, нужно будет отформатировать (1 DOT = 10^10 планк)
      const amountInPlancks = BigInt(amountParam.value);
      return (amountInPlancks / BigInt(10**10)).toString() + " DOT";
    }
    return "N/A";
  } catch (e) {
    return "N/A";
  }
};


export const TransferHistory: React.FC<TransferHistoryProps> = ({ 
  selectedAccount,
}) => {
  const [history, setHistory] = useState<SubscanTransfer[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!selectedAccount) return;

    const fetchHistory = async () => {
      setIsLoading(true);
      try {
        const response = await fetch('https://polkadot.api.subscan.io/api/scan/extrinsics', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            row: 20, // Количество записей
            page: 0,
            address: selectedAccount.address,
            // Ищем только XCM транзакции
            module: "xcm" 
          })
        });

        const data = await response.json();
        if (data.code === 0 && data.data.extrinsics) {
          // Фильтруем, чтобы оставить только интересующие нас вызовы (например, transfer_assets)
          const filteredTransfers = data.data.extrinsics.filter(
            (ext: SubscanTransfer) => ext.module.toLowerCase() === 'xcmpallet' || ext.module.toLowerCase() === 'xcm'
          );
          setHistory(filteredTransfers);
        }
      } catch (error) {
        console.error("Failed to fetch transfer history:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchHistory();
  }, [selectedAccount]);

  if (!selectedAccount) return null;

  if (isLoading) {
      return <div>Loading history...</div>
  }

  return (
    <div className="max-w-2xl mx-auto p-6 bg-white rounded-lg shadow-lg">
      <h2 className="text-2xl font-bold text-gray-900 mb-6">XCM Transfer History</h2>
      
      {history.length > 0 ? (
        <ul className="space-y-4">
          {history.map((item) => (
            <li key={item.hash} className="p-4 border rounded-lg">
              <p><strong>From:</strong> {item.from}</p>
              <p><strong>To ParaChain/Address:</strong> {item.to}</p> {/* Упрощено, `to` в XCM сложнее */}
              <p><strong>Call:</strong> {item.call}</p>
              <p><strong>Timestamp:</strong> {new Date(item.block_timestamp * 1000).toLocaleString()}</p>
              <a href={`https://polkadot.subscan.io/extrinsic/${item.hash}`} target="_blank" rel="noopener noreferrer" className="text-blue-500">
                View on Subscan
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <div className="text-center py-8">
          <Clock className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-500">No XCM transfer history found for this account.</p>
        </div>
      )}
    </div>
  );
};

export default TransferHistory;