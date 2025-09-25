'use client'

import { useState, useCallback } from 'react'
import type { InjectedAccountWithMeta } from '@polkadot/extension-inject/types'
import type { ApiPromise } from '@polkadot/api'
import dynamic from 'next/dynamic'

const DOTExchange = dynamic(() => import('../components/DOTExchange').then(mod => mod.DOTExchange), { ssr: false })
const TransferHistory = dynamic(() => import('../components/TransferHistory').then(mod => mod.TransferHistory), { ssr: false })

interface SharedState {
  selectedAccount: InjectedAccountWithMeta | null;
  polkadotApi: ApiPromise | null;
  uniqueApi: ApiPromise | null;
}

export default function Home() {
  const [sharedState, setSharedState] = useState<SharedState>({
    selectedAccount: null,
    polkadotApi: null,
    uniqueApi: null
  });

  const handleStateChange = useCallback((
    account: InjectedAccountWithMeta | null,
    polkadotApi: ApiPromise | null,
    uniqueApi: ApiPromise | null
  ) => {
    setSharedState({
      selectedAccount: account,
      polkadotApi: polkadotApi,
      uniqueApi: uniqueApi
    });
  }, []);

  return (
    <div className="min-h-screen bg-gray-100 py-8">
      <div className="container mx-auto px-4 space-y-8">
        <DOTExchange 
          onStateChange={handleStateChange}
        />
        <TransferHistory 
          selectedAccount={sharedState.selectedAccount}
          polkadotApi={sharedState.polkadotApi}
          uniqueApi={sharedState.uniqueApi}
        />
      </div>
    </div>
  )
}