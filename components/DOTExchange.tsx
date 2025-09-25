"use client"

import type React from "react"
import { useState, useEffect, useCallback } from "react"
import { ApiPromise, WsProvider } from "@polkadot/api"
import { web3Accounts, web3Enable, web3FromAddress } from "@polkadot/extension-dapp"
import type { InjectedAccountWithMeta } from "@polkadot/extension-inject/types"
import { formatBalance } from "@polkadot/util"
import { u8aToHex } from "@polkadot/util"
import { decodeAddress } from "@polkadot/util-crypto"
import BigNumber from "bignumber.js"
import toast, { Toaster } from "react-hot-toast"
import { ArrowUpDown, Wallet, Loader2, AlertCircle } from "lucide-react"

// Correct decimals constants as per blockchain specs
const DOT_DECIMALS = 10  // DOT always has 10 decimals on all chains
const UNQ_DECIMALS = 18  // UNQ has 18 decimals (Unique native token)

// DOT foreign asset collection ID on Unique Network
const DOT_FOREIGN_ASSET_COLLECTION_ID = 437

const MIN_DOT_TRANSFER = 0.1
const MAX_DOT_TRANSFER = 1000

interface NetworkConfig {
  name: string
  wsUrl: string
  chainId?: number
  decimals: number
  symbol: string
}

const NETWORKS: Record<string, NetworkConfig> = {
  polkadot: {
    name: "Polkadot Relay",
    wsUrl: "wss://rpc.polkadot.io",
    decimals: DOT_DECIMALS,
    symbol: "DOT",
  },
  unique: {
    name: "Unique Network",
    wsUrl: "wss://ws.unique.network",
    chainId: 2037,
    decimals: UNQ_DECIMALS,
    symbol: "UNQ",
  },
}

interface Balance {
  free: string
  reserved: string
  total: string
  raw: {
    free: string
    reserved: string
  }
}

interface ForeignAssetBalance {
  balance: string
  raw: string
}

interface TransactionStatus {
  status: "pending" | "success" | "error" | "idle"
  message?: string
  hash?: string
}

interface DOTExchangeProps {
  onStateChange?: (account: InjectedAccountWithMeta | null, polkadotApi: ApiPromise | null, uniqueApi: ApiPromise | null) => void
}

export const DOTExchange: React.FC<DOTExchangeProps> = ({ onStateChange }) => {
  const [selectedAccount, setSelectedAccount] = useState<InjectedAccountWithMeta | null>(null)
  const [polkadotApi, setPolkadotApi] = useState<ApiPromise | null>(null)
  const [uniqueApi, setUniqueApi] = useState<ApiPromise | null>(null)

  const [polkadotBalance, setPolkadotBalance] = useState<Balance | null>(null)
  const [uniqueBalance, setUniqueBalance] = useState<Balance | null>(null)
  const [uniqueDotBalance, setUniqueDotBalance] = useState<ForeignAssetBalance | null>(null)

  const [transferAmount, setTransferAmount] = useState<string>("")
  const [transferDirection, setTransferDirection] = useState<"toUnique" | "toPolkadot">("toUnique")
  const [transactionStatus, setTransactionStatus] = useState<TransactionStatus>({ status: "idle" })

  const [isConnecting, setIsConnecting] = useState(false)
  const [connectionErrors, setConnectionErrors] = useState<string[]>([])
  const [isBrowser, setIsBrowser] = useState(false)

  // Check if we're in browser environment
  useEffect(() => {
    if (onStateChange) {
      onStateChange(selectedAccount, polkadotApi, uniqueApi)
    }
  }, [selectedAccount, polkadotApi, uniqueApi])

  useEffect(() => {
    setIsBrowser(typeof window !== 'undefined')
  }, [])

  // Function to get DOT balance on Unique Network
  const getDotBalanceOnUnique = useCallback(async () => {
    if (!uniqueApi || !selectedAccount) return null;

    try {
      const balance: any = await uniqueApi.query.common.balance(
        DOT_FOREIGN_ASSET_COLLECTION_ID,
        { Substrate: selectedAccount.address }
      );

      // Check if balance is not empty and greater than 0
      if (balance && !balance.isEmpty && balance.toString() !== '0') {
        return {
          balance: formatBalance(balance, { decimals: DOT_DECIMALS, withSi: false }),
          raw: balance.toString(),
        };
      }
      
      return {
        balance: "0",
        raw: "0",
      };
      
    } catch (error) {
      console.error("Error getting DOT balance on Unique:", error);
      return {
        balance: "0", 
        raw: "0",
      };
    }
  }, [uniqueApi, selectedAccount]);

  // Initialize APIs with better error handling
  const initializeAPIs = useCallback(async () => {
    if (!isBrowser) {
      console.log("Skipping API initialization - not in browser")
      return
    }

    const errors: string[] = []

    try {
      console.log("Initializing Polkadot API...")
      const polkadotProvider = new WsProvider(NETWORKS.polkadot.wsUrl)
      const polkadotApiInstance = await ApiPromise.create({ provider: polkadotProvider })
      setPolkadotApi(polkadotApiInstance)
      console.log("Polkadot API connected successfully")
    } catch (error) {
      console.error("Failed to connect to Polkadot:", error)
      errors.push("Failed to connect to Polkadot network")
    }

    try {
      console.log("Initializing Unique API...")
      const uniqueProvider = new WsProvider(NETWORKS.unique.wsUrl)
      const uniqueApiInstance = await ApiPromise.create({ provider: uniqueProvider })
      setUniqueApi(uniqueApiInstance)
      console.log("Unique API connected successfully")
    } catch (error) {
      console.error("Failed to connect to Unique:", error)
      errors.push("Failed to connect to Unique Network")
    }

    setConnectionErrors(errors)

    if (errors.length === 0) {
      toast.success("Connected to all networks")
    } else {
      toast.error(`Connection issues: ${errors.length} network(s) failed`)
    }
  }, [isBrowser])

  // Connect to Polkadot extension
  const connectWallet = async () => {
    setIsConnecting(true)

    try {
      if (typeof window === 'undefined') {
        throw new Error("Browser environment required")
      }

      console.log("Attempting to connect to Polkadot extension...")
      const extensions = await web3Enable("DOT Exchange")

      if (extensions.length === 0) {
        throw new Error("No Polkadot extension found. Please install Polkadot.js extension.")
      }

      console.log("Extension found, getting accounts...")
      const accountList = await web3Accounts()

      if (accountList.length === 0) {
        throw new Error("No accounts found in extension. Please create an account first.")
      }

      console.log("Found accounts:", accountList.length)
      setSelectedAccount(accountList[0])
      toast.success("Wallet connected successfully")
    } catch (error) {
      console.error("Failed to connect wallet:", error)
      toast.error(error instanceof Error ? error.message : "Failed to connect wallet")
    } finally {
      setIsConnecting(false)
    }
  }

  const fetchBalances = useCallback(async () => {
    if (!selectedAccount) return

    try {
      console.log("Fetching balances for account:", selectedAccount.address)

      // Polkadot balance - DOT with 10 decimals
      if (polkadotApi) {
        try {
          const polkadotAccountInfo: any = await polkadotApi.query.system.account(selectedAccount.address)

          const polkadotFree = polkadotAccountInfo.data.free
          const polkadotReserved = polkadotAccountInfo.data.reserved

          console.log("Polkadot DOT balances:", {
            free: polkadotFree.toString(),
            reserved: polkadotReserved.toString(),
            decimals: DOT_DECIMALS,
          })

          setPolkadotBalance({
            free: formatBalance(polkadotFree, { decimals: DOT_DECIMALS, withSi: false }),
            reserved: formatBalance(polkadotReserved, { decimals: DOT_DECIMALS, withSi: false }),
            total: formatBalance(polkadotFree.add(polkadotReserved), { decimals: DOT_DECIMALS, withSi: false }),
            raw: {
              free: polkadotFree.toString(),
              reserved: polkadotReserved.toString(),
            },
          })
        } catch (error) {
          console.error("Error fetching Polkadot balance:", error)
          toast.error("Failed to fetch Polkadot balance")
        }
      }

      // Unique Network balances
      if (uniqueApi) {
        try {
          const uniqueAccountInfo: any = await uniqueApi.query.system.account(selectedAccount.address)

          const uniqueFree = uniqueAccountInfo.data.free
          const uniqueReserved = uniqueAccountInfo.data.reserved

          console.log("Unique UNQ balances:", {
            free: uniqueFree.toString(),
            reserved: uniqueReserved.toString(),
            decimals: UNQ_DECIMALS,
          })

          setUniqueBalance({
            free: formatBalance(uniqueFree, { decimals: UNQ_DECIMALS, withSi: false }),
            reserved: formatBalance(uniqueReserved, { decimals: UNQ_DECIMALS, withSi: false }),
            total: formatBalance(uniqueFree.add(uniqueReserved), { decimals: UNQ_DECIMALS, withSi: false }),
            raw: {
              free: uniqueFree.toString(),
              reserved: uniqueReserved.toString(),
            },
          })

          // DOT foreign asset on Unique Network
          try {
            const dotBalance = await getDotBalanceOnUnique();
            setUniqueDotBalance(dotBalance);
            
            console.log("DOT balance on Unique Network:", {
              collectionId: DOT_FOREIGN_ASSET_COLLECTION_ID,
              balance: dotBalance?.balance,
              raw: dotBalance?.raw,
            });
          } catch (error) {
            console.error("Error fetching DOT balance on Unique:", error)
            setUniqueDotBalance({
              balance: "0",
              raw: "0",
            })
          }
        } catch (error) {
          console.error("Error fetching Unique balance:", error)
          toast.error("Failed to fetch Unique balance")
        }
      }
    } catch (error) {
      console.error("Failed to fetch balances:", error)
      toast.error("Failed to fetch balances: " + (error instanceof Error ? error.message : "Unknown error"))
    }
  }, [selectedAccount, polkadotApi, uniqueApi, getDotBalanceOnUnique])

  const executeTransfer = async () => {
    if (!selectedAccount || !transferAmount) return

    setTransactionStatus({ status: "pending", message: "Validating transfer..." })

    try {
      console.log("Starting transfer:", { direction: transferDirection, amount: transferAmount })

      const transferAmountNum = parseFloat(transferAmount)
      
      if (transferAmountNum < MIN_DOT_TRANSFER) {
        throw new Error(`Minimum transfer amount is ${MIN_DOT_TRANSFER} DOT`)
      }
      
      if (transferAmountNum > MAX_DOT_TRANSFER) {
        throw new Error(`Maximum transfer amount is ${MAX_DOT_TRANSFER} DOT`)
      }

      // Calculate amount with correct DOT decimals (10)
      const amount = new BigNumber(transferAmount).multipliedBy(
        new BigNumber(10).pow(DOT_DECIMALS)
      )

      console.log("Calculated amount:", {
        input: transferAmount,
        calculated: amount.toString(),
        decimals: DOT_DECIMALS
      })

      const injector = await web3FromAddress(selectedAccount.address)

      if (transferDirection === "toUnique") {
        // Validate balance for Polkadot to Unique transfer
        if (polkadotBalance) {
          const availableBalance = new BigNumber(polkadotBalance.raw.free)
          const feeEstimate = new BigNumber(10).pow(DOT_DECIMALS - 1) // 0.1 DOT estimate
          const requiredAmount = amount.plus(feeEstimate)
          
          if (availableBalance.lt(requiredAmount)) {
            throw new Error(
              `Insufficient balance. Available: ${polkadotBalance.free} DOT, Required: ~${formatBalance(
                requiredAmount.toString(),
                { decimals: DOT_DECIMALS, withSi: false }
              )} DOT (including fees)`
            )
          }
        }

        if (!polkadotApi) throw new Error("Polkadot API not connected")

        // Destination: Unique Network parachain (from relay chain perspective)
        const destination = {
          V4: {
            parents: 0,
            interior: { X1: [{ Parachain: NETWORKS.unique.chainId }] },
          },
        }

        // Beneficiary: account on Unique Network
        const addressBytes = decodeAddress(selectedAccount.address)
        const beneficiary = {
          V4: {
            parents: 0,
            interior: { X1: [{ AccountId32: { id: u8aToHex(addressBytes) } }] },
          },
        }

        // Assets: DOT from relay chain (parents: 0, interior: 'Here')
        const assets = {
          V4: [
            {
              id: {
                parents: 0,        // Relay chain perspective
                interior: 'Here',  // DOT on relay chain
              },
              fun: { Fungible: amount.toString() },
            },
          ],
        }

        console.log("XCM transfer configuration (Polkadot -> Unique):", {
          destination,
          beneficiary: beneficiary.V4.interior.X1[0].AccountId32.id,
          amount: amount.toString(),
          amountFormatted: formatBalance(amount.toString(), { decimals: DOT_DECIMALS, withSi: false })
        })

        // Use correct XCM method: transferAssets (NOT limitedReserveTransferAssets)
        const tx = polkadotApi.tx.xcmPallet.transferAssets(
          destination,
          beneficiary,
          assets,
          0,           // feeAssetItem
          "Unlimited", // weightLimit
        )

        setTransactionStatus({ status: "pending", message: "Signing transaction..." })

        console.log("Submitting transaction...")
        const unsub = await tx.signAndSend(selectedAccount.address, { signer: injector.signer }, (result) => {
          console.log("Transaction status:", result.status.type)

          if (result.status.isInBlock) {
            console.log("Transaction included in block:", result.status.asInBlock.toString())
            
            const success = result.events.some(({ event }) => 
              event.section === 'system' && event.method === 'ExtrinsicSuccess'
            )
            
            if (success) {
              setTransactionStatus({
                status: "success",
                message: `Successfully transferred ${transferAmount} DOT to Unique Network`,
                hash: result.txHash.toString(),
              })
              toast.success(`Transfer completed: ${transferAmount} DOT`)
            } else {
              setTransactionStatus({
                status: "error", 
                message: "Transaction failed - check blockchain explorer for details",
              })
              toast.error("Transfer failed")
            }
            
            unsub()

            // Refresh balances after successful transaction
            setTimeout(() => {
              fetchBalances()
              setTransferAmount("")
              setTimeout(() => setTransactionStatus({ status: "idle" }), 5000)
            }, 3000)
          } else if (result.isError) {
            console.error("Transaction error:", result)
            setTransactionStatus({
              status: "error",
              message: "Transaction failed",
            })
            toast.error("Transfer failed")
            unsub()
          }
        })

      } else {
        // Unique to Polkadot transfer
        if (!uniqueApi) throw new Error("Unique API not connected")

        // Validate DOT balance on Unique
        if (!uniqueDotBalance || new BigNumber(uniqueDotBalance.raw).lt(amount)) {
          throw new Error(
            `Insufficient DOT balance on Unique Network. Available: ${uniqueDotBalance?.balance || '0'} DOT`
          )
        }

        // Destination: Polkadot Relay Chain (from parachain perspective)
        const destination = {
          V4: {
            parents: 1,
            interior: 'Here', // Relay chain
          },
        }

        // Beneficiary: account on relay chain
        const addressBytes = decodeAddress(selectedAccount.address)
        const beneficiary = {
          V4: {
            parents: 0,
            interior: { X1: [{ AccountId32: { id: u8aToHex(addressBytes) } }] },
          },
        }

        // Assets: DOT foreign asset on Unique (parents: 1, interior: 'Here')
        const assets = {
          V4: [
            {
              id: {
                parents: 1,      // Relay chain from parachain perspective
                interior: 'Here', // DOT asset
              },
              fun: { Fungible: amount.toString() },
            },
          ],
        }

        console.log("XCM transfer configuration (Unique -> Polkadot):", {
          destination,
          beneficiary: beneficiary.V4.interior.X1[0].AccountId32.id,
          amount: amount.toString(),
          amountFormatted: formatBalance(amount.toString(), { decimals: DOT_DECIMALS, withSi: false })
        })

        const tx = uniqueApi.tx.xcmPallet.transferAssets(
          destination,
          beneficiary,
          assets,
          0,           // feeAssetItem
          "Unlimited", // weightLimit
        )

        setTransactionStatus({ status: "pending", message: "Signing reverse transfer..." })

        console.log("Submitting reverse transfer...")
        const unsub = await tx.signAndSend(selectedAccount.address, { signer: injector.signer }, (result) => {
          console.log("Reverse transfer status:", result.status.type)

          if (result.status.isInBlock) {
            console.log("Reverse transfer in block:", result.status.asInBlock.toString())
            
            const success = result.events.some(({ event }) => 
              event.section === 'system' && event.method === 'ExtrinsicSuccess'
            )
            
            if (success) {
              setTransactionStatus({
                status: "success",
                message: `Successfully transferred ${transferAmount} DOT back to Polkadot`,
                hash: result.txHash.toString(),
              })
              toast.success(`Reverse transfer completed: ${transferAmount} DOT`)
            } else {
              setTransactionStatus({
                status: "error", 
                message: "Reverse transfer failed",
              })
              toast.error("Reverse transfer failed")
            }
            
            unsub()

            setTimeout(() => {
              fetchBalances()
              setTransferAmount("")
              setTimeout(() => setTransactionStatus({ status: "idle" }), 5000)
            }, 3000)
          } else if (result.isError) {
            console.error("Reverse transfer error:", result)
            setTransactionStatus({
              status: "error",
              message: "Reverse transfer failed",
            })
            toast.error("Reverse transfer failed")
            unsub()
          }
        })
      }
    } catch (error) {
      console.error("Transfer failed:", error)
      setTransactionStatus({
        status: "error",
        message: error instanceof Error ? error.message : "Transfer failed",
      })
      toast.error(error instanceof Error ? error.message : "Transfer failed")
    }
  }

  useEffect(() => {
    if (isBrowser) {
      initializeAPIs()
    }
  }, [initializeAPIs, isBrowser])

  useEffect(() => {
    if (selectedAccount) {
      fetchBalances()
      const interval = setInterval(fetchBalances, 30000) // Refresh every 30 seconds
      return () => clearInterval(interval)
    }
  }, [selectedAccount, fetchBalances])

  const transferAmountNum = transferAmount ? parseFloat(transferAmount) : 0
  const isAmountValid = transferAmountNum >= MIN_DOT_TRANSFER && transferAmountNum <= MAX_DOT_TRANSFER

  const isBalanceSufficient = () => {
    if (!transferAmount) return true
    
    if (transferDirection === 'toUnique') {
      if (!polkadotBalance) return true
      const available = parseFloat(polkadotBalance.free.replace(/[,\s]/g, ''))
      const required = transferAmountNum + 0.1 // Add fee estimate
      return available >= required
    } else {
      if (!uniqueDotBalance) return true
      const available = parseFloat(uniqueDotBalance.balance.replace(/[,\s]/g, ''))
      return available >= transferAmountNum
    }
  }

  return (
    <div className="max-w-2xl mx-auto p-6 bg-white rounded-lg shadow-lg">
      <Toaster position="top-right" />

      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">DOT Exchange</h1>
        <p className="text-gray-600">Exchange DOT tokens between Polkadot and Unique Network</p>
        <div className="mt-2 text-xs text-gray-500">
          <span>DOT decimals: {DOT_DECIMALS} | UNQ decimals: {UNQ_DECIMALS} | DOT collection ID: {DOT_FOREIGN_ASSET_COLLECTION_ID}</span>
        </div>
      </div>

      {connectionErrors.length > 0 && (
        <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <div className="flex items-center mb-2">
            <AlertCircle className="h-4 w-4 mr-2 text-yellow-600" />
            <p className="text-sm font-medium text-yellow-800">Connection Issues:</p>
          </div>
          <ul className="text-sm text-yellow-700 list-disc list-inside">
            {connectionErrors.map((error, index) => (
              <li key={index}>{error}</li>
            ))}
          </ul>
        </div>
      )}

      {!selectedAccount ? (
        <div className="text-center mb-8">
          <button
            onClick={connectWallet}
            disabled={isConnecting}
            className="inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isConnecting ? (
              <>
                <Loader2 className="animate-spin -ml-1 mr-3 h-5 w-5" />
                Connecting...
              </>
            ) : (
              <>
                <Wallet className="-ml-1 mr-3 h-5 w-5" />
                Connect Wallet
              </>
            )}
          </button>
          <p className="text-sm text-gray-500 mt-2">Make sure you have Polkadot.js extension installed</p>
        </div>
      ) : (
        <>
          <div className="mb-6 p-4 bg-gray-50 rounded-lg">
            <p className="text-sm text-gray-600">Connected Account:</p>
            <p className="font-mono text-sm break-all">{selectedAccount.address}</p>
            <p className="text-sm text-gray-600 mt-1">{selectedAccount.meta.name}</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div className="p-4 border rounded-lg">
              <h3 className="font-semibold text-gray-900 mb-2">Polkadot Relay Chain</h3>
              {polkadotBalance ? (
                <div className="space-y-1">
                  <p className="text-2xl font-bold text-pink-600">{polkadotBalance.free} DOT</p>
                  <p className="text-sm text-gray-500">Available ({DOT_DECIMALS} decimals)</p>
                  {polkadotBalance.reserved !== "0" && (
                    <p className="text-xs text-gray-400">Reserved: {polkadotBalance.reserved} DOT</p>
                  )}
                </div>
              ) : (
                <div className="animate-pulse">
                  <div className="h-8 bg-gray-200 rounded mb-2"></div>
                  <div className="h-4 bg-gray-200 rounded"></div>
                </div>
              )}
            </div>

            <div className="p-4 border rounded-lg">
              <h3 className="font-semibold text-gray-900 mb-2">Unique Network</h3>
              {uniqueBalance ? (
                <div className="space-y-3">
                  <div>
                    <p className="text-2xl font-bold text-purple-600">{uniqueBalance.free} UNQ</p>
                    <p className="text-sm text-gray-500">Native Balance ({UNQ_DECIMALS} decimals)</p>
                    {uniqueBalance.reserved !== "0" && (
                      <p className="text-xs text-gray-400">Reserved: {uniqueBalance.reserved} UNQ</p>
                    )}
                  </div>

                  <div className="pt-2 border-t border-gray-200">
                    <p className="text-lg font-bold text-pink-600">
                      {uniqueDotBalance ? uniqueDotBalance.balance : "0"} DOT
                    </p>
                    <p className="text-sm text-gray-500">Foreign Asset (Collection #{DOT_FOREIGN_ASSET_COLLECTION_ID}, {DOT_DECIMALS} decimals)</p>
                  </div>
                </div>
              ) : (
                <div className="animate-pulse">
                  <div className="h-8 bg-gray-200 rounded mb-2"></div>
                  <div className="h-4 bg-gray-200 rounded"></div>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Transfer Direction</label>
              <div className="flex items-center space-x-4">
                <button
                  onClick={() => setTransferDirection("toUnique")}
                  className={`flex items-center px-4 py-2 rounded-md border ${
                    transferDirection === "toUnique"
                      ? "border-blue-500 bg-blue-50 text-blue-700"
                      : "border-gray-300 text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  Polkadot → Unique
                </button>
                <ArrowUpDown className="h-5 w-5 text-gray-400" />
                <button
                  onClick={() => setTransferDirection("toPolkadot")}
                  className={`flex items-center px-4 py-2 rounded-md border ${
                    transferDirection === "toPolkadot"
                      ? "border-blue-500 bg-blue-50 text-blue-700"
                      : "border-gray-300 text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  Unique → Polkadot
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Amount (DOT)</label>
              <input
                type="number"
                value={transferAmount}
                onChange={(e) => setTransferAmount(e.target.value)}
                placeholder="0.00"
                min={MIN_DOT_TRANSFER}
                max={MAX_DOT_TRANSFER}
                step="0.01"
                className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 ${
                  transferAmount && !isAmountValid
                    ? 'border-red-300 focus:ring-red-500 focus:border-red-500'
                    : 'border-gray-300'
                }`}
              />
              <div className="mt-1 flex justify-between text-xs text-gray-500">
                <span>Min: {MIN_DOT_TRANSFER} DOT</span>
                <span>Max: {MAX_DOT_TRANSFER} DOT</span>
              </div>
              
              {transferAmount && transferAmountNum < MIN_DOT_TRANSFER && (
                <p className="mt-1 text-xs text-red-600">
                  Minimum transfer amount is {MIN_DOT_TRANSFER} DOT (existential deposit + fees)
                </p>
              )}
              
              {transferAmount && transferAmountNum > MAX_DOT_TRANSFER && (
                <p className="mt-1 text-xs text-red-600">
                  Maximum transfer amount is {MAX_DOT_TRANSFER} DOT for security
                </p>
              )}
              
              {transferAmount && !isBalanceSufficient() && (
                <p className="mt-1 text-xs text-red-600">
                  {transferDirection === 'toUnique' 
                    ? `Insufficient balance. Available: ${polkadotBalance?.free || '0'} DOT, Required: ~${(transferAmountNum + 0.1).toFixed(2)} DOT (including fees)`
                    : `Insufficient DOT balance on Unique. Available: ${uniqueDotBalance?.balance || '0'} DOT`
                  }
                </p>
              )}
            </div>

            {transactionStatus.status !== "idle" && (
              <div
                className={`p-4 rounded-md ${
                  transactionStatus.status === "success"
                    ? "bg-green-50 border border-green-200"
                    : transactionStatus.status === "error"
                      ? "bg-red-50 border border-red-200"
                      : "bg-yellow-50 border border-yellow-200"
                }`}
              >
                <div className="flex items-center">
                  {transactionStatus.status === "pending" && (
                    <Loader2 className="animate-spin h-4 w-4 mr-2 text-yellow-600" />
                  )}
                  {transactionStatus.status === "error" && <AlertCircle className="h-4 w-4 mr-2 text-red-600" />}
                  <p
                    className={`text-sm ${
                      transactionStatus.status === "success"
                        ? "text-green-800"
                        : transactionStatus.status === "error"
                          ? "text-red-800"
                          : "text-yellow-800"
                    }`}
                  >
                    {transactionStatus.message}
                  </p>
                </div>
                {transactionStatus.hash && (
                  <>
                    <p className="text-xs text-gray-500 mt-1 font-mono">Hash: {transactionStatus.hash}</p>
                    <a 
                      href={`https://polkadot.subscan.io/extrinsic/${transactionStatus.hash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-600 hover:text-blue-800 mt-1 inline-flex items-center"
                    >
                      View on Subscan Explorer →
                    </a>
                  </>
                )}
              </div>
            )}

            <button
              onClick={executeTransfer}
              disabled={!transferAmount || !isAmountValid || !isBalanceSufficient() || transactionStatus.status === "pending"}
              className="w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {transactionStatus.status === "pending" ? (
                <>
                  <Loader2 className="animate-spin -ml-1 mr-3 h-5 w-5" />
                  Processing...
                </>
              ) : (
                "Execute Transfer"
              )}
            </button>
          </div>
        </>
      )}

      <div className="mt-8 pt-6 border-t border-gray-200">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div className="flex items-center">
            <div className={`w-2 h-2 rounded-full mr-2 ${polkadotApi ? "bg-green-500" : "bg-red-500"}`}></div>
            <span className="text-gray-600">Polkadot: {polkadotApi ? "Connected" : "Disconnected"}</span>
          </div>
          <div className="flex items-center">
            <div className={`w-2 h-2 rounded-full mr-2 ${uniqueApi ? "bg-green-500" : "bg-red-500"}`}></div>
            <span className="text-gray-600">Unique: {uniqueApi ? "Connected" : "Disconnected"}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

export default DOTExchange