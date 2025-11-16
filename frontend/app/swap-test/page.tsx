'use client'

import { useState, useEffect } from 'react'
import { useAccount, useWalletClient, useChainId } from 'wagmi'
import { ArrowDown, RefreshCw, Wallet, CheckCircle, XCircle, Globe, Zap, Info } from 'lucide-react'
import apiClient from '@/utils/api'
import { formatUnits, parseUnits } from 'viem'

/**
 * Test Swap Page
 * 
 * Tests the new architecture where:
 * - User always starts and finishes on the same chain
 * - Backend routes internally via Arc if beneficial
 * - All cross-chain activity is hidden from user
 */
export default function SwapTestPage() {
  const { address, isConnected } = useAccount()
  const { data: walletClient } = useWalletClient()
  const chainId = useChainId()
  
  // Token addresses (from env)
  const [tokenIn, setTokenIn] = useState('')
  const [tokenOut, setTokenOut] = useState('')
  const [amountIn, setAmountIn] = useState('')
  
  // Balances
  const [balanceIn, setBalanceIn] = useState('0')
  const [balanceOut, setBalanceOut] = useState('0')
  
  // Quote state
  const [quote, setQuote] = useState<any>(null)
  const [loadingQuote, setLoadingQuote] = useState(false)
  const [quoteError, setQuoteError] = useState('')
  
  // Swap state
  const [swapping, setSwapping] = useState(false)
  const [swapResult, setSwapResult] = useState<any>(null)
  const [swapError, setSwapError] = useState('')
  
  // Chain detection
  const [userChain, setUserChain] = useState<string>('')
  
  // Detect chain from chainId (Arc and Base only for now)
  useEffect(() => {
    const chainMap: Record<number, string> = {
      5042002: 'arc',
      84532: 'base'
    }
    setUserChain(chainMap[chainId] || '')
  }, [chainId])
  
  // Load token addresses from env based on chain
  useEffect(() => {
    if (!userChain) return
    
    const tokenMap: Record<string, { in: string; out: string }> = {
      arc: {
        in: process.env.NEXT_PUBLIC_ARC_USDC_ADDRESS || '',
        out: process.env.NEXT_PUBLIC_ARC_FLX_TOKEN || ''
      },
      base: {
        in: process.env.NEXT_PUBLIC_BASE_SEPOLIA_USDC_ADDRESS || '',
        out: process.env.NEXT_PUBLIC_BASE_SEPOLIA_FLX_TOKEN || ''
      }
    }
    
    const tokens = tokenMap[userChain]
    if (tokens) {
      setTokenIn(tokens.in)
      setTokenOut(tokens.out)
    }
  }, [userChain])
  
  // Get quote when amount changes
  useEffect(() => {
    if (!amountIn || parseFloat(amountIn) <= 0 || !tokenIn || !tokenOut || !userChain) {
      setQuote(null)
      return
    }
    
    const timeoutId = setTimeout(async () => {
      await fetchQuote()
    }, 500)
    
    return () => clearTimeout(timeoutId)
  }, [amountIn, tokenIn, tokenOut, userChain])
  
  const fetchQuote = async () => {
    if (!amountIn || parseFloat(amountIn) <= 0 || !tokenIn || !tokenOut || !userChain) return
    
    setLoadingQuote(true)
    setQuoteError('')
    
    try {
      // Determine decimals (USDC = 6, FLX = 18)
      const isUSDC = tokenIn.toLowerCase().includes('usdc') || 
                     tokenIn === '0x3600000000000000000000000000000000000000'
      const decimals = isUSDC ? 6 : 18
      const amountInRaw = parseUnits(amountIn, decimals).toString()
      
      const quoteData = await apiClient.getQuote({
        tokenIn,
        tokenOut,
        amountIn: amountInRaw,
        sourceChain: userChain
      })
      
      setQuote(quoteData)
    } catch (err: any) {
      console.error('Quote error:', err)
      setQuoteError(err.message || 'Failed to get quote')
      setQuote(null)
    } finally {
      setLoadingQuote(false)
    }
  }
  
  const executeSwap = async () => {
    if (!amountIn || !tokenIn || !tokenOut || !userChain || !address || !quote) return
    
    setSwapping(true)
    setSwapError('')
    setSwapResult(null)
    
    try {
      // Determine decimals
      const isUSDC = tokenIn.toLowerCase().includes('usdc') || 
                     tokenIn === '0x3600000000000000000000000000000000000000'
      const decimals = isUSDC ? 6 : 18
      const amountInRaw = parseUnits(amountIn, decimals).toString()
      
      // Calculate min amount out with slippage
      const slippage = 0.01 // 1%
      const minAmountOut = quote.estimatedOutput 
        ? (BigInt(quote.estimatedOutput) * BigInt(100 - slippage * 100) / 100n).toString()
        : '0'
      
      const result = await apiClient.executeSwap({
        tokenIn,
        tokenOut,
        amountIn: amountInRaw,
        minAmountOut,
        userChain,
        userAddress: address
      })
      
      setSwapResult(result.data)
    } catch (err: any) {
      console.error('Swap error:', err)
      setSwapError(err.response?.data?.error || err.message || 'Swap failed')
    } finally {
      setSwapping(false)
    }
  }
  
  const formatTokenAmount = (amount: string, decimals: number) => {
    try {
      return formatUnits(BigInt(amount), decimals)
    } catch {
      return '0'
    }
  }
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 p-4">
      <div className="max-w-2xl mx-auto">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 mb-6">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
              Test Swap
            </h1>
            <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
              <Globe className="w-4 h-4" />
              <span>Chain: {userChain || 'Not connected'}</span>
            </div>
          </div>
          
          {/* Info Banner */}
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-6">
            <div className="flex items-start gap-3">
              <Info className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5" />
              <div className="text-sm text-blue-800 dark:text-blue-300">
                <p className="font-semibold mb-1">How it works:</p>
                <ul className="list-disc list-inside space-y-1">
                  <li>You swap on your current chain (e.g., Base)</li>
                  <li>Backend routes internally via Arc if beneficial</li>
                  <li>You receive tokens on the same chain you started</li>
                  <li>All cross-chain activity is hidden</li>
                </ul>
              </div>
            </div>
          </div>
          
          {/* Wallet Connection */}
          {!isConnected ? (
            <div className="text-center py-8">
              <Wallet className="w-12 h-12 mx-auto text-gray-400 mb-4" />
              <p className="text-gray-600 dark:text-gray-400 mb-4">
                Connect your wallet to start swapping
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-500">
                Make sure you're on a supported chain (Base Sepolia or Arc Testnet)
              </p>
            </div>
          ) : (
            <>
              {/* Swap Form */}
              <div className="space-y-4">
                {/* Token In */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    From
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={tokenIn}
                      onChange={(e) => setTokenIn(e.target.value)}
                      placeholder="Token In Address"
                      className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                    <div className="absolute right-3 top-3 text-xs text-gray-500">
                      Balance: {balanceIn}
                    </div>
                  </div>
                </div>
                
                {/* Amount */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Amount
                  </label>
                  <input
                    type="number"
                    value={amountIn}
                    onChange={(e) => setAmountIn(e.target.value)}
                    placeholder="0.0"
                    step="0.000001"
                    className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>
                
                <div className="flex justify-center">
                  <ArrowDown className="w-6 h-6 text-gray-400" />
                </div>
                
                {/* Token Out */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    To
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={tokenOut}
                      onChange={(e) => setTokenOut(e.target.value)}
                      placeholder="Token Out Address"
                      className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                    <div className="absolute right-3 top-3 text-xs text-gray-500">
                      Balance: {balanceOut}
                    </div>
                  </div>
                </div>
                
                {/* Quote Display */}
                {loadingQuote && (
                  <div className="flex items-center justify-center py-4">
                    <RefreshCw className="w-5 h-5 animate-spin text-blue-600" />
                    <span className="ml-2 text-sm text-gray-600 dark:text-gray-400">
                      Calculating best route...
                    </span>
                  </div>
                )}
                
                {quoteError && (
                  <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
                    <p className="text-sm text-red-800 dark:text-red-300">{quoteError}</p>
                  </div>
                )}
                
                {quote && (
                  <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-green-800 dark:text-green-300">
                        Expected Output
                      </span>
                      <span className="text-lg font-bold text-green-900 dark:text-green-200">
                        {formatTokenAmount(quote.estimatedOutput || '0', 18)}
                      </span>
                    </div>
                    
                    {quote.selectedRoute && (
                      <div className="mt-3 space-y-2 text-xs text-green-700 dark:text-green-400">
                        <div className="flex items-center justify-between">
                          <span>Strategy:</span>
                          <span className="font-semibold">
                            {quote.requiresMultiChain ? 'VIA_ARC' : 'LOCAL_ONLY'}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>Chains:</span>
                          <span>{quote.selectedRoute.chains?.join(' → ') || 'N/A'}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>Gas Cost:</span>
                          <span>{quote.totalGasCostFormatted || 'N/A'}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>Net Output:</span>
                          <span className="font-semibold">
                            {formatTokenAmount(quote.netOutput || '0', 18)}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                )}
                
                {/* Swap Button */}
                <button
                  onClick={executeSwap}
                  disabled={!quote || swapping || !amountIn || parseFloat(amountIn) <= 0}
                  className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors"
                >
                  {swapping ? (
                    <span className="flex items-center justify-center">
                      <RefreshCw className="w-5 h-5 animate-spin mr-2" />
                      Executing Swap...
                    </span>
                  ) : (
                    'Execute Swap'
                  )}
                </button>
                
                {/* Swap Result */}
                {swapResult && (
                  <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <CheckCircle className="w-5 h-5 text-green-600" />
                      <span className="font-semibold text-green-800 dark:text-green-300">
                        Swap Complete!
                      </span>
                    </div>
                    <div className="text-sm text-green-700 dark:text-green-400 space-y-1">
                      <div>Strategy: {swapResult.strategy}</div>
                      <div>Output: {formatTokenAmount(swapResult.output || '0', 18)}</div>
                      {swapResult.txHash && (
                        <div>TX: {swapResult.txHash}</div>
                      )}
                    </div>
                    
                    {swapResult.steps && swapResult.steps.length > 0 && (
                      <div className="mt-4 space-y-2">
                        <p className="text-xs font-semibold text-green-800 dark:text-green-300">
                          Execution Steps:
                        </p>
                        {swapResult.steps.map((step: any, i: number) => (
                          <div key={i} className="flex items-center gap-2 text-xs">
                            {step.status === 'complete' ? (
                              <CheckCircle className="w-4 h-4 text-green-600" />
                            ) : step.status === 'failed' ? (
                              <XCircle className="w-4 h-4 text-red-600" />
                            ) : (
                              <RefreshCw className="w-4 h-4 animate-spin text-blue-600" />
                            )}
                            <span>{step.step}</span>
                            <span className="text-gray-500">({step.status})</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                
                {swapError && (
                  <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
                    <p className="text-sm text-red-800 dark:text-red-300">{swapError}</p>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

