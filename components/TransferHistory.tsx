"use client"

import type React from "react"
import type { ApiPromise } from "@polkadot/api"
import type { InjectedAccountWithMeta } from "@polkadot/extension-inject/types"
import { Clock } from "lucide-react"

interface TransferHistoryProps {
  selectedAccount: InjectedAccountWithMeta | null;
  polkadotApi: ApiPromise | null;
  uniqueApi: ApiPromise | null;
}

export const TransferHistory: React.FC<TransferHistoryProps> = ({ 
  selectedAccount, 
  polkadotApi, 
  uniqueApi 
}) => {
  if (!selectedAccount) return null;

  return (
    <div className="max-w-2xl mx-auto p-6 bg-white rounded-lg shadow-lg">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-900">DOT Transfer History</h2>
      </div>

      <div className="text-center py-8">
        <Clock className="h-12 w-12 text-gray-400 mx-auto mb-4" />
        <p className="text-gray-500">Transfer history coming soon</p>
        <p className="text-sm text-gray-400 mt-2">
          This feature will show your recent DOT transfers between Polkadot and Unique networks.
        </p>
      </div>
    </div>
  );
};

export default TransferHistory;