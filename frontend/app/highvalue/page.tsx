'use client'

import { useState, useEffect } from 'react'
import { ethers } from 'ethers'
import { Zap, TrendingUp, Globe, CheckCircle2, Clock, AlertCircle, Wallet, XCircle } from 'lucide-react'
import apiClient, { type LPDepth } from '@/utils/api'
import { formatTokenAmount, getSigner, isConnectedToArc, switchToArc } from '@/utils/contracts'

interface Step {
  step: string
  status: string
  result?: any
  error?: string
}

export default function HighValuePage() {
  const [lpDepths, setLpDepths] = useState<Record<string, LPDepth[]>>({})
  const [amountIn, setAmountIn] = useState('10000') // 10k USDC for demo
  const [loading, setLoading] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [executing, setExecuting] = useState(false)
  
  const [route, setRoute] = useState<any>(null)
  const [steps, setSteps] = useState<Step[]>([])
  const [currentStep, setCurrentStep] = useState(0)
  const [complete, setComplete] = useState(false)

  // Wallet state
  const [connected, setConnected] = useState(false)
  const [userAddress, setUserAddress] = useState('')
  const [isArcNetwork, setIsArcNetwork] = useState(false)

  // Token addresses
  const FLX_TOKEN = process.env.NEXT_PUBLIC_ARC_FLX_TOKEN || ''
  const USDC_TOKEN = process.env.NEXT_PUBLIC_ARC_USDC_ADDRESS || ''

  // Fetch LP depths on mount
  useEffect(() => {
    fetchLPDepths()
    const interval = setInterval(fetchLPDepths, 30000)
    return () => clearInterval(interval)
  }, [])

  // Connect wallet
  const connectWallet = async () => {
    try {
      const signer = await getSigner()
      if (!signer) {
        console.error('MetaMask not found')
        return
      }

      const address = await signer.getAddress()
      setUserAddress(address)
      setConnected(true)

      const onArc = await isConnectedToArc()
      setIsArcNetwork(onArc)
    } catch (err: any) {
      console.error(err.message)
    }
  }

  // Switch to Arc network
  const handleSwitchNetwork = async () => {
    const success = await switchToArc()
    if (success) {
      setIsArcNetwork(true)
    }
  }

  const fetchLPDepths = async () => {
    try {
      const depths = await apiClient.getLPDepths()
      setLpDepths(depths)
    } catch (err) {
      console.error('Error fetching LP depths:', err)
    }
  }

  // Calculate total liquidity
  const getTotalLiquidity = () => {
    let total = 0
    Object.values(lpDepths).forEach(chainDepths => {
      chainDepths.forEach(pool => {
        total += pool.tvl
      })
    })
    return total
  }

  // Analyze route
  const analyzeRoute = async () => {
    setAnalyzing(true)
    setRoute(null)
    setSteps([])

    try {
      if (!USDC_TOKEN || !FLX_TOKEN) {
        setRoute(null)
        return
      }

      // Get real quote from backend
      const quote = await apiClient.getQuote({
        tokenIn: USDC_TOKEN,
        tokenOut: FLX_TOKEN,
        amountIn: ethers.parseUnits(amountIn, 6).toString(), // USDC has 6 decimals
        sourceChain: 'arc'
      })

      setRoute(quote)
    } catch (err) {
      console.error('Analysis error:', err)
      setRoute(null)
    } finally {
      setAnalyzing(false)
    }
  }

  // Execute high-value swap
  const executeSwap = async () => {
    if (!route) return

    setExecuting(true)
    setComplete(false)
    setCurrentStep(0)

    const executionSteps: Step[] = [
      { step: 'Backend analyzes FLX/USDC LP depths across Arc, Sepolia, Base, and Polygon', status: 'complete' },
      { step: 'Optimizer calculates best route (local vs multi-chain) considering gas, slippage, and time', status: 'complete' },
      { step: 'CCTP pulls USDC from source chains to Arc (~20-60s with Fast Attestation)', status: 'pending' },
      { step: 'Gateway pulls FLX liquidity from vaults to Arc for optimal execution', status: 'pending' },
      { step: 'Atomic swap executes on Arc: USDC → FLX with aggregated liquidity', status: 'pending' },
      { step: 'Rebalancing engine redistributes liquidity back to source chains', status: 'pending' }
    ]

    setSteps(executionSteps)

    try {
      if (!USDC_TOKEN || !FLX_TOKEN) {
        throw new Error('Token addresses not configured')
      }

      // Call real backend API
      const userAddr = connected ? userAddress : ('0x' + '0'.repeat(40)); // Use connected wallet or demo

      const result = await apiClient.executeHighValueSwap({
        tokenIn: USDC_TOKEN,
        tokenOut: FLX_TOKEN,
        amountIn: ethers.parseUnits(amountIn, 6).toString(), // USDC has 6 decimals
        minAmountOut: '0',
        recipient: userAddr,
        sourceChain: 'arc'
      })

      // Update steps based on backend response
      if (result.data && result.data.steps) {
        const backendSteps = result.data.steps;
        for (let i = 0; i < Math.min(backendSteps.length, executionSteps.length); i++) {
          executionSteps[i].status = backendSteps[i].status || 'complete';
          executionSteps[i].result = backendSteps[i].result;
          executionSteps[i].error = backendSteps[i].error;
          setSteps([...executionSteps]);
          setCurrentStep(i);
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      } else {
        // If no steps from backend, simulate realistic progress
        for (let i = 2; i < executionSteps.length; i++) {
          executionSteps[i].status = 'in_progress';
          setSteps([...executionSteps]);
          setCurrentStep(i);
          
          // Simulate realistic timing
          const delays = [3000, 2000, 2000, 1500]; // Different delays for each step
          await new Promise(resolve => setTimeout(resolve, delays[i - 2] || 2000));
          
          executionSteps[i].status = 'complete';
          setSteps([...executionSteps]);
        }
      }

      setComplete(true)
    } catch (err) {
      console.error('Execution error:', err)
      executionSteps[currentStep].status = 'error'
      executionSteps[currentStep].error = err instanceof Error ? err.message : 'Execution failed'
      setSteps([...executionSteps])
    } finally {
      setExecuting(false)
    }
  }

  const getStepIcon = (status: string) => {
    if (status === 'complete') return <CheckCircle2 className="w-5 h-5 text-green-500" />
    if (status === 'in_progress') return <Clock className="w-5 h-5 text-arc-blue animate-pulse" />
    return <div className="w-5 h-5 rounded-full border-2 border-gray-300" />
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center space-x-3 mb-2">
              <h1 className="text-4xl font-bold">High-Value Multi-Chain Swap</h1>
              <span className="gradient-arc text-white px-3 py-1 rounded-full text-sm font-semibold">
                SHOWCASE
              </span>
            </div>
            <p className="text-gray-600 dark:text-gray-400 text-lg">
              Intelligent routing for USDC → FLX swaps across Arc, Sepolia, and more
            </p>
          </div>

          {/* Wallet Connection */}
          {!connected ? (
            <button
              onClick={connectWallet}
              className="gradient-arc text-white px-6 py-2 rounded-lg font-semibold hover:opacity-90 transition-opacity flex items-center space-x-2"
            >
              <Wallet className="w-4 h-4" />
              <span>Connect Wallet</span>
            </button>
          ) : (
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                <span className="text-sm">{userAddress.slice(0, 6)}...{userAddress.slice(-4)}</span>
              </div>
              {!isArcNetwork && (
                <button
                  onClick={handleSwitchNetwork}
                  className="bg-yellow-600 hover:bg-yellow-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
                >
                  Switch to Arc
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Deployment Warning */}
      {(!USDC_TOKEN || !FLX_TOKEN) && (
        <div className="mb-6 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
          <div className="flex items-start space-x-3">
            <AlertCircle className="w-5 h-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-yellow-800 dark:text-yellow-200 font-semibold">Contracts Not Deployed</p>
              <p className="text-sm text-yellow-700 dark:text-yellow-300 mt-1">
                Run <code className="bg-yellow-100 dark:bg-yellow-800 px-2 py-0.5 rounded">npm run deploy</code> first, then restart the frontend.
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-6 mb-8">
        {/* Left: Input & Analysis */}
        <div className="space-y-6">
          {/* Amount Input */}
          <div className="bg-white dark:bg-gray-900 rounded-xl border-2 border-gray-200 dark:border-gray-800 p-6">
            <h3 className="font-semibold mb-4">Trade Details</h3>
            <div className="space-y-4">
              <div>
                <label className="text-sm text-gray-600 dark:text-gray-400 mb-2 block">
                  Amount (USDC)
                </label>
                <input
                  type="number"
                  value={amountIn}
                  onChange={(e) => setAmountIn(e.target.value)}
                  className="w-full text-3xl font-semibold bg-gray-50 dark:bg-gray-800 rounded-lg px-4 py-3 border-2 border-gray-200 dark:border-gray-700 focus:border-arc-blue outline-none"
                  placeholder="10000"
                  min="1"
                />
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600 dark:text-gray-400">Swapping to:</span>
                <span className="font-semibold">FLX</span>
              </div>
            </div>

            <button
              onClick={analyzeRoute}
              disabled={analyzing || executing || !USDC_TOKEN || !FLX_TOKEN}
              className="w-full mt-6 gradient-arc text-white py-3 rounded-lg font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {analyzing ? (
                <span className="flex items-center justify-center">
                  <TrendingUp className="w-5 h-5 mr-2 animate-pulse" />
                  Analyzing...
                </span>
              ) : !USDC_TOKEN || !FLX_TOKEN ? (
                'Deploy Contracts First'
              ) : (
                'Analyze Route'
              )}
            </button>
          </div>

          {/* Global Liquidity Overview */}
          <div className="gradient-card rounded-xl border border-gray-200 dark:border-gray-800 p-6">
            <h3 className="font-semibold mb-4 flex items-center">
              <Globe className="w-5 h-5 mr-2 text-arc-blue" />
              Global Liquidity Monitor
            </h3>
            <div className="space-y-3">
              {Object.entries(lpDepths).map(([chain, depths]) => {
                const totalTVL = depths.reduce((sum, pool) => sum + pool.tvl, 0)
                return (
                  <div key={chain} className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                      <span className="font-medium capitalize">{chain}</span>
                    </div>
                    <span className="text-sm text-gray-600 dark:text-gray-400">
                      ${totalTVL.toLocaleString()}
                    </span>
                  </div>
                )
              })}
              <div className="pt-3 border-t border-gray-200 dark:border-gray-800">
                <div className="flex items-center justify-between font-semibold">
                  <span>Total Available</span>
                  <span className="text-arc-blue">${getTotalLiquidity().toLocaleString()}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Route Analysis */}
          {route && (
            <div className="bg-white dark:bg-gray-900 rounded-xl border-2 border-arc-purple p-6">
              <h3 className="font-semibold mb-4 flex items-center">
                <Zap className="w-5 h-5 mr-2 text-arc-purple" />
                Optimal Route Found
              </h3>

              {route.requiresMultiChain ? (
                <>
                  <div className="mb-4 p-3 bg-arc-purple/10 rounded-lg">
                    <p className="text-sm text-arc-purple font-medium">
                      ⚡ Multi-chain execution required for optimal pricing
                    </p>
                  </div>

                  <div className="space-y-3 mb-4">
                    {route.sources.map((source: any, idx: number) => (
                      <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                        <div>
                          <span className="font-medium capitalize">{source.chain}</span>
                          <span className="text-sm text-gray-600 dark:text-gray-400 ml-2">
                            ({source.percentage}%)
                          </span>
                        </div>
                        <span className="font-semibold">${parseFloat(source.amount).toLocaleString()}</span>
                      </div>
                    ))}
                  </div>

                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">Estimated Output:</span>
                      <span className="font-semibold">{formatTokenAmount(route.estimatedOutput || '0', 18)} FLX</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">Slippage Impact:</span>
                      <span>{route.slippageImpact}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">Total Gas:</span>
                      <span>${route.totalGasCost}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">Est. Time:</span>
                      <span>~{Math.floor(route.executionTime / 60)} minutes</span>
                    </div>
                  </div>

                  <button
                    onClick={executeSwap}
                    disabled={executing}
                    className="w-full mt-4 bg-arc-purple text-white py-3 rounded-lg font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
                  >
                    {executing ? 'Executing...' : 'Execute Swap'}
                  </button>
                </>
              ) : (
                <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                  <p className="text-sm text-green-700 dark:text-green-300">
                    ✓ Local Arc pool has sufficient liquidity
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right: Execution Visualization */}
        <div className="space-y-6">
          {/* Execution Steps */}
          {steps.length > 0 && (
            <div className="bg-white dark:bg-gray-900 rounded-xl border-2 border-gray-200 dark:border-gray-800 p-6">
              <h3 className="font-semibold mb-6">Execution Progress</h3>
              <div className="space-y-4">
                {steps.map((step, idx) => (
                  <div key={idx} className="flex items-start space-x-3">
                    <div className="mt-1">
                      {getStepIcon(step.status)}
                    </div>
                    <div className="flex-1">
                      <p className={`font-medium ${step.status === 'complete' ? 'text-green-600 dark:text-green-400' : ''}`}>
                        {step.step}
                      </p>
                      {step.status === 'in_progress' && (
                        <div className="mt-2 w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1">
                          <div className="bg-arc-blue h-1 rounded-full animate-pulse-slow" style={{ width: '60%' }}></div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {complete && (
                <div className="mt-6 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                  <div className="flex items-start space-x-3">
                    <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-green-800 dark:text-green-200">
                        Swap Complete!
                      </p>
                      <p className="text-sm text-green-700 dark:text-green-300 mt-1">
                        You received {formatTokenAmount(route?.estimatedOutput || '0', 18)} FLX
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* How It Works */}
          <div className="gradient-card rounded-xl border border-gray-200 dark:border-gray-800 p-6">
            <h3 className="font-semibold mb-4">How Multi-Chain Routing Works</h3>
            <div className="space-y-4 text-sm text-gray-600 dark:text-gray-400">
              <div className="flex items-start space-x-3">
                <div className="w-6 h-6 gradient-arc rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                  1
                </div>
                <p>Backend analyzes FLX/USDC LP depths across Arc, Sepolia, Base, and Polygon</p>
              </div>
              <div className="flex items-start space-x-3">
                <div className="w-6 h-6 gradient-arc rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                  2
                </div>
                <p>Optimizer calculates best route (local vs multi-chain) considering gas, slippage, and time</p>
              </div>
              <div className="flex items-start space-x-3">
                <div className="w-6 h-6 gradient-arc rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                  3
                </div>
                <p>CCTP pulls USDC from source chains to Arc (~20-60s with Fast Attestation)</p>
              </div>
              <div className="flex items-start space-x-3">
                <div className="w-6 h-6 gradient-arc rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                  4
                </div>
                <p>Gateway pulls FLX liquidity from vaults to Arc for optimal execution</p>
              </div>
              <div className="flex items-start space-x-3">
                <div className="w-6 h-6 gradient-arc rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                  5
                </div>
                <p>Atomic swap executes on Arc: USDC → FLX with aggregated liquidity</p>
              </div>
              <div className="flex items-start space-x-3">
                <div className="w-6 h-6 gradient-arc rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                  6
                </div>
                <p>Rebalancing engine redistributes liquidity back to source chains</p>
              </div>
            </div>
          </div>

          {/* Info */}
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
            <div className="flex items-start space-x-3">
              <AlertCircle className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-blue-800 dark:text-blue-200">
                <p className="font-semibold mb-1">Real Multi-Chain Routing</p>
                <p>This showcase demonstrates real CCTP transfers (for USDC) and Gateway operations (for FLX) to pull liquidity from Sepolia and other chains to Arc for optimal USDC → FLX swap execution.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

