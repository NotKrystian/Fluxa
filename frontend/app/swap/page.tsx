'use client'

import { useState, useEffect } from 'react'
import { ethers } from 'ethers'
import { ArrowDown, RefreshCw, Wallet, CheckCircle, XCircle, Globe, Zap } from 'lucide-react'
import { 
  getSigner, 
  isConnectedToArc, 
  switchToArc,
  executeSwap,
  getTokenBalance,
  parseTokenAmount,
  formatTokenAmount,
  CONTRACTS,
  getArcProvider
} from '@/utils/contracts'
import apiClient from '@/utils/api'

export default function SwapPage() {
  const [connected, setConnected] = useState(false)
  const [userAddress, setUserAddress] = useState('')
  const [isArcNetwork, setIsArcNetwork] = useState(false)
  
  // Default: USDC → FLX (stablecoin to token)
  const [tokenIn, setTokenIn] = useState(() => {
    const usdc = CONTRACTS.USDC || process.env.NEXT_PUBLIC_ARC_USDC_ADDRESS || ''
    console.log('[SWAP] Initializing tokenIn (USDC):', usdc)
    return usdc
  })
  const [tokenOut, setTokenOut] = useState(() => {
    const flx = process.env.NEXT_PUBLIC_ARC_FLX_TOKEN || ''
    console.log('[SWAP] Initializing tokenOut (FLX):', flx)
    if (!flx) {
      console.warn('[SWAP] FLX token address not configured! Check NEXT_PUBLIC_ARC_FLX_TOKEN in .env.local')
    }
    return flx
  })
  const [amountIn, setAmountIn] = useState('')
  const [minAmountOut, setMinAmountOut] = useState('')
  const [slippage, setSlippage] = useState('1.0') // 1%
  
  const [balanceIn, setBalanceIn] = useState('0')
  const [balanceOut, setBalanceOut] = useState('0')
  
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState('')
  const [txHash, setTxHash] = useState('')
  const [error, setError] = useState('')
  
  // Routing state
  const [routingType, setRoutingType] = useState<'local' | 'multichain' | null>(null)
  const [quote, setQuote] = useState<any>(null)
  const [checkingRoute, setCheckingRoute] = useState(false)

  // Connect wallet
  const connectWallet = async () => {
    try {
      const signer = await getSigner()
      if (!signer) {
        setError('MetaMask not found')
        return
      }

      const address = await signer.getAddress()
      setUserAddress(address)
      setConnected(true)

      // Check network
      const onArc = await isConnectedToArc()
      setIsArcNetwork(onArc)

      if (!onArc) {
        setStatus('Please switch to Arc network')
      } else {
        await updateBalances(address)
      }
    } catch (err: any) {
      setError(err.message)
    }
  }

  // Switch network
  const handleSwitchNetwork = async () => {
    setLoading(true)
    const success = await switchToArc()
    if (success) {
      setIsArcNetwork(true)
      setStatus('Switched to Arc network')
      if (userAddress) {
        await updateBalances(userAddress)
      }
    } else {
      setError('Failed to switch network')
    }
    setLoading(false)
  }

  // Update balances
  const updateBalances = async (address: string) => {
    try {
      const provider = getArcProvider()
      const balIn = await getTokenBalance(tokenIn, address, provider)
      const balOut = await getTokenBalance(tokenOut, address, provider)
      
      // Use correct decimals for each token
      setBalanceIn(formatTokenAmount(balIn, getTokenDecimals(tokenIn)))
      setBalanceOut(formatTokenAmount(balOut, getTokenDecimals(tokenOut)))
    } catch (err: any) {
      console.error('Error updating balances:', err)
    }
  }

  // Calculate min amount out with slippage based on quote
  useEffect(() => {
    if (quote && amountIn && !isNaN(parseFloat(amountIn))) {
      // Get expected output from quote
      let expectedOutput = '0'
      
      if (quote.requiresMultiChain && quote.estimatedOutput) {
        expectedOutput = quote.estimatedOutput
      } else if (quote.single?.expectedOutput) {
        expectedOutput = quote.single.expectedOutput
      } else if (quote.estimatedOutput) {
        expectedOutput = quote.estimatedOutput
      }
      
      if (expectedOutput && expectedOutput !== '0') {
        const outputDecimals = getTokenDecimals(tokenOut)
        const expectedOutputFormatted = formatTokenAmount(expectedOutput, outputDecimals)
        const expectedOutputNum = parseFloat(expectedOutputFormatted)
        
        if (!isNaN(expectedOutputNum) && expectedOutputNum > 0) {
          const slippagePercent = parseFloat(slippage) / 100
          const minOut = expectedOutputNum * (1 - slippagePercent)
          // Handle up to 18 decimals, but format nicely
          const minOutStr = minOut.toString();
          setMinAmountOut(minOutStr)
        } else {
          setMinAmountOut('')
        }
      } else {
        setMinAmountOut('')
      }
    } else if (!quote && amountIn && !isNaN(parseFloat(amountIn))) {
      // Fallback: estimate 1:1 if no quote yet (will update when quote arrives)
      const amount = parseFloat(amountIn)
      const slippagePercent = parseFloat(slippage) / 100
      const minOut = amount * (1 - slippagePercent)
      const decimals = getTokenDecimals(tokenOut)
      setMinAmountOut(minOut.toString())
    } else {
      setMinAmountOut('')
    }
  }, [amountIn, slippage, tokenOut, quote])

  // Check routing when amount changes (debounced)
  useEffect(() => {
    if (!amountIn || parseFloat(amountIn) <= 0 || !connected || !isArcNetwork || !tokenIn || !tokenOut) {
      setRoutingType(null)
      setQuote(null)
      return
    }

    // Validate token addresses are different
    if (tokenIn.toLowerCase() === tokenOut.toLowerCase()) {
      console.error('[SWAP] Token In and Token Out are the same!', { tokenIn, tokenOut })
      setError('Token In and Token Out cannot be the same')
      return
    }

    const timeoutId = setTimeout(async () => {
      if (!amountIn || parseFloat(amountIn) <= 0) return
      
      setCheckingRoute(true)
      try {
        // Use correct decimals for input token
        const decimalsIn = getTokenDecimals(tokenIn)
        const amountInBigInt = parseTokenAmount(amountIn, decimalsIn)
        
        console.log('[SWAP] Requesting quote:', {
          tokenIn,
          tokenOut,
          amountIn: amountInBigInt.toString(),
          sourceChain: 'arc'
        })
        
        const quoteResult = await apiClient.getQuote({
          tokenIn: tokenIn,
          tokenOut: tokenOut,
          amountIn: amountInBigInt.toString(),
          sourceChain: 'arc'
        })
        
        setQuote(quoteResult)
        
        if (quoteResult.recommendation === 'multiChain' || quoteResult.requiresMultiChain) {
          setRoutingType('multichain')
        } else {
          setRoutingType('local')
        }
      } catch (err) {
        console.error('Error checking route:', err)
        setRoutingType('local')
      } finally {
        setCheckingRoute(false)
      }
    }, 500) // Debounce 500ms

    return () => clearTimeout(timeoutId)
  }, [amountIn, connected, isArcNetwork, tokenIn, tokenOut])

  // Check optimal route from backend
  const checkOptimalRoute = async () => {
    if (!amountIn || parseFloat(amountIn) <= 0) return
    
    setCheckingRoute(true)
    try {
      // Use correct decimals for input token
      const decimalsIn = getTokenDecimals(tokenIn)
      const amountInBigInt = parseTokenAmount(amountIn, decimalsIn)
      const quoteResult = await apiClient.getQuote({
        tokenIn: tokenIn,
        tokenOut: tokenOut,
        amountIn: amountInBigInt.toString(),
        sourceChain: 'arc'
      })
      
      setQuote(quoteResult)
      
      if (quoteResult.recommendation === 'multiChain' || quoteResult.requiresMultiChain) {
        setRoutingType('multichain')
      } else {
        setRoutingType('local')
      }
    } catch (err) {
      console.error('Error checking route:', err)
      // Default to local if check fails
      setRoutingType('local')
    } finally {
      setCheckingRoute(false)
    }
  }

  // Execute swap
  const handleSwap = async () => {
    if (!connected || !isArcNetwork) {
      setError('Please connect wallet and switch to Arc')
      return
    }

    if (!amountIn || parseFloat(amountIn) <= 0) {
      setError('Enter amount to swap')
      return
    }

    setLoading(true)
    setError('')
    setStatus('Preparing swap...')
    setTxHash('')

    try {
      const signer = await getSigner()
      if (!signer) throw new Error('Signer not available')

      // Use correct decimals for each token
      const decimalsIn = getTokenDecimals(tokenIn)
      const decimalsOut = getTokenDecimals(tokenOut)
      const amountInBigInt = parseTokenAmount(amountIn, decimalsIn)
      const minAmountOutBigInt = parseTokenAmount(minAmountOut, decimalsOut)

      // Check if multi-chain routing is recommended
      if (routingType === 'multichain' && quote?.requiresMultiChain) {
        // Use high-value swap endpoint for multi-chain routing
        setStatus('Executing multi-chain swap...')
        const result = await apiClient.executeHighValueSwap({
          tokenIn: tokenIn,
          tokenOut: tokenOut,
          amountIn: amountInBigInt.toString(),
          minAmountOut: minAmountOutBigInt.toString(),
          recipient: userAddress,
          sourceChain: 'arc',
          slippageTolerance: parseFloat(slippage) / 100
        })

        if (result.success) {
          setStatus('Multi-chain swap successful!')
          if (result.data?.txHash) {
            setTxHash(result.data.txHash)
          }
          setAmountIn('')
          setMinAmountOut('')
          
          // Update balances
          await updateBalances(userAddress)
        } else {
          setError(result.error || 'Multi-chain swap failed')
          setStatus('')
        }
      } else {
        // Use local swap
        setStatus('Executing local swap...')
        const result = await executeSwap(
          tokenIn,
          tokenOut,
          amountInBigInt,
          minAmountOutBigInt,
          userAddress,
          signer
        )

        if (result.success) {
          setStatus('Swap successful!')
          setTxHash(result.txHash || '')
          setAmountIn('')
          setMinAmountOut('')
          
          // Update balances
          await updateBalances(userAddress)
        } else {
          setError(result.error || 'Swap failed')
          setStatus('')
        }
      }
    } catch (err: any) {
      setError(err.message || 'Swap failed')
      setStatus('')
    } finally {
      setLoading(false)
    }
  }

  // Get token symbol for display
  const getTokenSymbol = (tokenAddress: string) => {
    if (!tokenAddress) return 'TOKEN'
    const addr = tokenAddress.toLowerCase()
    if (addr === CONTRACTS.USDC.toLowerCase()) return 'USDC'
    if (addr === CONTRACTS.EURC.toLowerCase()) return 'EURC'
    if (addr === (process.env.NEXT_PUBLIC_ARC_FLX_TOKEN || '').toLowerCase()) return 'FLX'
    return 'TOKEN'
  }

  // Get token decimals
  const getTokenDecimals = (tokenAddress: string): number => {
    if (!tokenAddress) return 18
    const addr = tokenAddress.toLowerCase()
    if (addr === CONTRACTS.USDC.toLowerCase()) return 6
    if (addr === CONTRACTS.EURC.toLowerCase()) return 6
    if (addr === (process.env.NEXT_PUBLIC_ARC_FLX_TOKEN || '').toLowerCase()) return 18
    return 18 // Default to 18 for tokens
  }

  // Flip tokens
  const flipTokens = async () => {
    const oldTokenIn = tokenIn
    const oldTokenOut = tokenOut
    const oldBalanceIn = balanceIn
    const oldBalanceOut = balanceOut
    
    // Swap addresses
    setTokenIn(oldTokenOut)
    setTokenOut(oldTokenIn)
    
    // Swap balances
    setBalanceIn(oldBalanceOut)
    setBalanceOut(oldBalanceIn)
    
    // Clear amount and quote
    setAmountIn('')
    setMinAmountOut('')
    setQuote(null)
    setRoutingType(null)
    
    // Update balances for new tokenIn if connected
    if (connected && userAddress && isArcNetwork) {
      await updateBalances(userAddress)
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-2">Arc Swap</h1>
        <p className="text-gray-600 dark:text-gray-400">
          Swap stablecoins using the Arc AMM
        </p>
      </div>

      {/* Wallet Connection */}
      {!connected ? (
        <div className="gradient-card p-8 rounded-xl border border-gray-200 dark:border-gray-800 text-center">
          <Wallet className="w-16 h-16 mx-auto mb-4 text-arc-blue" />
          <h3 className="text-xl font-semibold mb-2">Connect Wallet</h3>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            Connect your MetaMask to start swapping
          </p>
          <button
            onClick={connectWallet}
            className="gradient-arc text-white px-8 py-3 rounded-lg font-semibold hover:opacity-90 transition-opacity"
          >
            Connect MetaMask
          </button>
        </div>
      ) : !isArcNetwork ? (
        <div className="gradient-card p-8 rounded-xl border border-gray-200 dark:border-gray-800 text-center">
          <XCircle className="w-16 h-16 mx-auto mb-4 text-yellow-500" />
          <h3 className="text-xl font-semibold mb-2">Wrong Network</h3>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            Please switch to Arc Testnet
          </p>
          <button
            onClick={handleSwitchNetwork}
            disabled={loading}
            className="gradient-arc text-white px-8 py-3 rounded-lg font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {loading ? 'Switching...' : 'Switch to Arc'}
          </button>
        </div>
      ) : !CONTRACTS.USDC || !tokenOut || !CONTRACTS.ROUTER ? (
        <div className="gradient-card p-8 rounded-xl border border-gray-200 dark:border-gray-800 text-center">
          <XCircle className="w-16 h-16 mx-auto mb-4 text-yellow-500" />
          <h3 className="text-xl font-semibold mb-2">Contracts Not Deployed</h3>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            Please deploy contracts first using: <code className="bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">npm run deploy</code>
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-500 mb-4">
            ⚠️ After deployment, restart the frontend dev server to load environment variables.
          </p>
          {!tokenOut && (
            <p className="text-sm text-red-500 dark:text-red-400 mt-2">
              FLX token address not configured. Check NEXT_PUBLIC_ARC_FLX_TOKEN in .env.local
            </p>
          )}
        </div>
      ) : (
        <>
          {/* Routing Indicator */}
          {routingType && amountIn && parseFloat(amountIn) > 0 && quote && (
            <div className={`mb-4 p-4 rounded-lg border-2 ${
              routingType === 'multichain' 
                ? 'bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800' 
                : 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
            }`}>
              <div className="flex items-start space-x-3">
                {routingType === 'multichain' ? (
                  <Globe className="w-5 h-5 text-purple-600 dark:text-purple-400 mt-1" />
                ) : (
                  <Zap className="w-5 h-5 text-green-600 dark:text-green-400 mt-1" />
                )}
                <div className="flex-1">
                  <p className="font-semibold mb-2">
                    {routingType === 'multichain' ? 'Multi-Chain Routing Selected' : 'Local Swap (Arc Only)'}
                  </p>
                  
                  {/* Selected Route Details */}
                  {quote.selectedRoute && (
                    <div className="text-sm space-y-2 mb-3">
                      <div className="flex justify-between">
                        <span>Routing Through:</span>
                        <span className="font-medium">{quote.selectedRoute.chains?.join(' → ') || (routingType === 'multichain' ? 'Multiple Chains' : 'Arc')}</span>
                      </div>
                      {quote.selectedRoute.remoteChains && quote.selectedRoute.remoteChains.length > 0 && (
                        <div className="flex justify-between">
                          <span>Remote Chains:</span>
                          <span className="font-medium text-purple-600 dark:text-purple-400">{quote.selectedRoute.remoteChains.join(', ')}</span>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span>Pools Used:</span>
                        <span className="font-medium">{quote.selectedRoute.pools?.length || 0} pool(s)</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Gross Output:</span>
                        <span className="font-medium">{quote.estimatedOutputFormatted || formatTokenAmount(quote.estimatedOutput || '0', getTokenDecimals(tokenOut))} {getTokenSymbol(tokenOut)}</span>
                      </div>
                      {quote.netOutputFormatted && (
                        <div className="flex justify-between">
                          <span>Net Output (after gas):</span>
                          <span className="font-medium text-green-600 dark:text-green-400">{quote.netOutputFormatted} {getTokenSymbol(tokenOut)}</span>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span>Gas Cost:</span>
                        <span className="font-medium">{quote.totalGasCostFormatted || `$${quote.totalGasCost?.toFixed(4) || '0.0000'}`}</span>
                      </div>
                      {quote.gasCostTokenFormatted && (
                        <div className="flex justify-between text-xs text-gray-600 dark:text-gray-400">
                          <span>Gas Cost (in tokens):</span>
                          <span>{quote.gasCostTokenFormatted} {getTokenSymbol(tokenOut)}</span>
                        </div>
                      )}
                      
                      {/* Pool Details */}
                      {quote.selectedRoute.pools && quote.selectedRoute.pools.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-gray-300 dark:border-gray-700">
                          <p className="text-xs font-semibold mb-2">Pool Details:</p>
                          <div className="space-y-1">
                            {quote.selectedRoute.pools.map((pool: any, idx: number) => (
                              <div key={idx} className="text-xs flex justify-between">
                                <span className="capitalize">{pool.chain} Pool:</span>
                                <span>FLX Price: {pool.flxPrice} USDC/FLX</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* All Routing Options Evaluated */}
                  {quote.routingOptions && quote.routingOptions.length > 1 && (
                    <div className="mt-3 pt-3 border-t border-gray-300 dark:border-gray-700">
                      <p className="text-xs font-semibold mb-2">All Routing Options Evaluated ({quote.routingOptions.length} total):</p>
                      <div className="text-xs space-y-2 max-h-48 overflow-y-auto">
                        {quote.routingOptions.map((opt: any, idx: number) => {
                          const isBest = idx === 0;
                          return (
                            <div key={idx} className={`p-2 rounded ${isBest ? 'bg-green-100 dark:bg-green-900/20 border border-green-300 dark:border-green-700' : 'bg-gray-50 dark:bg-gray-800'}`}>
                              <div className="flex justify-between items-start mb-1">
                                <span className={`font-medium ${isBest ? 'text-green-700 dark:text-green-400' : 'text-gray-700 dark:text-gray-300'}`}>
                                  {isBest ? '🏆 ' : `${idx + 1}. `}{opt.name}
                                </span>
                                <span className={`font-semibold ${isBest ? 'text-green-700 dark:text-green-400' : 'text-gray-600 dark:text-gray-400'}`}>
                                  {opt.netOutputFormatted || formatTokenAmount(opt.netOutput, getTokenDecimals(tokenOut))} {getTokenSymbol(tokenOut)}
                                </span>
                              </div>
                              <div className="text-xs text-gray-600 dark:text-gray-400 space-y-0.5">
                                <div className="flex justify-between">
                                  <span>Chains:</span>
                                  <span>{opt.chains?.join(', ') || 'N/A'}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span>Pools:</span>
                                  <span>{opt.poolCount || 0}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span>Gross:</span>
                                  <span>{opt.grossOutputFormatted || formatTokenAmount(opt.grossOutput, getTokenDecimals(tokenOut))} {getTokenSymbol(tokenOut)}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span>Gas:</span>
                                  <span>{opt.gasCostUSDFormatted || `$${opt.gasCostUSD?.toFixed(4) || '0.0000'}`} ({opt.gasCostTokenFormatted || formatTokenAmount(opt.gasCostToken, getTokenDecimals(tokenOut))} {getTokenSymbol(tokenOut)})</span>
                                </div>
                                {opt.pools && opt.pools.length > 0 && (
                                  <div className="mt-1 pt-1 border-t border-gray-200 dark:border-gray-700">
                                    {opt.pools.map((pool: any, pIdx: number) => (
                                      <div key={pIdx} className="flex justify-between text-xs">
                                        <span className="capitalize">{pool.chain}:</span>
                                        <span>FLX: {pool.flxPrice} USDC/FLX</span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
                {checkingRoute && (
                  <RefreshCw className="w-4 h-4 animate-spin text-gray-400" />
                )}
              </div>
            </div>
          )}

          {/* Swap Interface */}
          <div className="bg-white dark:bg-gray-900 rounded-xl border-2 border-gray-200 dark:border-gray-800 p-6 mb-6">
            {/* From */}
            <div className="mb-4">
              <div className="flex justify-between mb-2">
                <span className="text-sm text-gray-600 dark:text-gray-400">From</span>
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  Balance: {balanceIn}
                </span>
              </div>
              <div className="flex items-center space-x-4">
                <input
                  type="number"
                  value={amountIn}
                  onChange={(e) => setAmountIn(e.target.value)}
                  placeholder="0.0"
                  className="flex-1 text-3xl font-semibold bg-transparent border-none outline-none"
                />
                <div className="flex items-center space-x-2 bg-gray-100 dark:bg-gray-800 px-4 py-2 rounded-lg">
                  <span className="font-semibold">{getTokenSymbol(tokenIn)}</span>
                </div>
              </div>
            </div>

            {/* Swap Arrow */}
            <div className="flex justify-center my-4">
              <button
                onClick={flipTokens}
                className="p-2 rounded-lg border-2 border-gray-200 dark:border-gray-800 hover:border-arc-blue transition-colors"
              >
                <ArrowDown className="w-5 h-5" />
              </button>
            </div>

            {/* To */}
            <div>
              <div className="flex justify-between mb-2">
                <span className="text-sm text-gray-600 dark:text-gray-400">To (estimated)</span>
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  Balance: {balanceOut}
                </span>
              </div>
              <div className="flex items-center space-x-4">
                <input
                  type="text"
                  value={quote && quote.estimatedOutput ? formatTokenAmount(quote.estimatedOutput, getTokenDecimals(tokenOut)) : (minAmountOut || '0.0')}
                  readOnly
                  placeholder="0.0"
                  className="flex-1 text-3xl font-semibold bg-transparent border-none outline-none"
                />
                <div className="flex items-center space-x-2 bg-gray-100 dark:bg-gray-800 px-4 py-2 rounded-lg">
                  <span className="font-semibold">{getTokenSymbol(tokenOut)}</span>
                </div>
              </div>
              {quote && quote.estimatedOutput && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Min: {minAmountOut || '0.0'} {getTokenSymbol(tokenOut)} (with {slippage}% slippage)
                </p>
              )}
            </div>
          </div>

          {/* Slippage Settings */}
          <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 mb-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Slippage Tolerance</span>
              <input
                type="number"
                value={slippage}
                onChange={(e) => setSlippage(e.target.value)}
                className="w-20 px-2 py-1 text-sm rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800"
                step="0.1"
                min="0.1"
                max="5"
              />
            </div>
            <div className="flex space-x-2">
              <button
                onClick={() => setSlippage('0.5')}
                className={`px-3 py-1 text-sm rounded transition-colors ${
                  slippage === '0.5'
                    ? 'bg-arc-blue text-white'
                    : 'bg-gray-200 dark:bg-gray-800 hover:bg-arc-blue hover:text-white'
                }`}
              >
                0.5%
              </button>
              <button
                onClick={() => setSlippage('1.0')}
                className={`px-3 py-1 text-sm rounded transition-colors ${
                  slippage === '1.0'
                    ? 'bg-arc-blue text-white'
                    : 'bg-gray-200 dark:bg-gray-800 hover:bg-arc-blue hover:text-white'
                }`}
              >
                1.0%
              </button>
              <button
                onClick={() => setSlippage('2.0')}
                className={`px-3 py-1 text-sm rounded transition-colors ${
                  slippage === '2.0'
                    ? 'bg-arc-blue text-white'
                    : 'bg-gray-200 dark:bg-gray-800 hover:bg-arc-blue hover:text-white'
                }`}
              >
                2.0%
              </button>
            </div>
          </div>

          {/* Swap Button */}
          <button
            onClick={handleSwap}
            disabled={loading || !amountIn || checkingRoute}
            className={`w-full py-4 rounded-xl font-semibold text-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed ${
              routingType === 'multichain' 
                ? 'bg-purple-600 hover:bg-purple-700 text-white' 
                : 'gradient-arc text-white'
            }`}
          >
            {loading ? (
              <span className="flex items-center justify-center">
                <RefreshCw className="w-5 h-5 mr-2 animate-spin" />
                {routingType === 'multichain' ? 'Executing Multi-Chain Swap...' : 'Swapping...'}
              </span>
            ) : checkingRoute ? (
              <span className="flex items-center justify-center">
                <RefreshCw className="w-5 h-5 mr-2 animate-spin" />
                Analyzing Route...
              </span>
            ) : routingType === 'multichain' ? (
              <span className="flex items-center justify-center">
                <Globe className="w-5 h-5 mr-2" />
                Execute Multi-Chain Swap
              </span>
            ) : (
              'Swap'
            )}
          </button>

          {/* Status Messages */}
          {status && !error && (
            <div className="mt-4 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg flex items-start space-x-3">
              <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-green-800 dark:text-green-200">{status}</p>
                {txHash && (
                  <a
                    href={`https://testnet.arcscan.net/tx/${txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-green-600 dark:text-green-400 hover:underline mt-1 block"
                  >
                    View transaction →
                  </a>
                )}
              </div>
            </div>
          )}

          {error && (
            <div className="mt-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-start space-x-3">
              <XCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-red-800 dark:text-red-200">{error}</p>
            </div>
          )}

          {/* Info */}
          <div className="mt-6 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
            <h3 className="font-semibold mb-2">Swap Details</h3>
            <div className="space-y-1 text-sm text-gray-600 dark:text-gray-400">
              <div className="flex justify-between">
                <span>Network:</span>
                <span className="font-medium text-arc-blue">Arc Testnet</span>
              </div>
              <div className="flex justify-between">
                <span>Route:</span>
                <span>{routingType === 'multichain' ? 'Multi-Chain (Auto-Selected)' : 'Local (Arc Only)'}</span>
              </div>
              <div className="flex justify-between">
                <span>Fee:</span>
                <span>0.30%</span>
              </div>
              <div className="flex justify-between">
                <span>Min received:</span>
                <span>{minAmountOut || '0.0'} {getTokenSymbol(tokenOut)}</span>
              </div>
              {quote?.sourcePools && quote.sourcePools.length > 0 && (
                <>
                  <div className="flex justify-between">
                    <span>Source Pools:</span>
                    <span>{quote.sourcePools.length} pool(s)</span>
                  </div>
                  {quote.cctpTransfers && quote.cctpTransfers.length > 0 && (
                    <div className="flex justify-between">
                      <span>CCTP Transfers:</span>
                      <span>{quote.cctpTransfers.length} transfer(s)</span>
                    </div>
                  )}
                  {quote.netOutput && (
                    <div className="flex justify-between">
                      <span>Net Output:</span>
                      <span className="font-medium text-green-600 dark:text-green-400">
                        {formatTokenAmount(quote.netOutput, getTokenDecimals(tokenOut))} {getTokenSymbol(tokenOut)}
                      </span>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </>
      )}

      {/* Info Box */}
      <div className="mt-8 gradient-card p-6 rounded-xl border border-gray-200 dark:border-gray-800">
        <h3 className="font-semibold mb-3">How it works</h3>
        <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
          <li className="flex items-start">
            <span className="text-arc-blue mr-2">•</span>
            <span>Automatically analyzes optimal routing based on trade size</span>
          </li>
          <li className="flex items-start">
            <span className="text-arc-blue mr-2">•</span>
            <span>Swap USDC → FLX (or any token pair) on Arc AMM</span>
          </li>
          <li className="flex items-start">
            <span className="text-arc-blue mr-2">•</span>
            <span>Small trades: Local swap (instant, low gas)</span>
          </li>
          <li className="flex items-start">
            <span className="text-arc-blue mr-2">•</span>
            <span>Large trades: Multi-chain routing via CCTP & Gateway (optimal pricing)</span>
          </li>
          <li className="flex items-start">
            <span className="text-arc-blue mr-2">•</span>
            <span>All swaps execute atomically with slippage protection</span>
          </li>
          <li className="flex items-start">
            <span className="text-arc-blue mr-2">•</span>
            <span>Routing decision is automatic - you just swap!</span>
          </li>
        </ul>
      </div>
    </div>
  )
}

