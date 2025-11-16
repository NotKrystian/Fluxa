'use client'

import { useState, useEffect } from 'react'
import { ethers } from 'ethers'
import { ArrowRight, RefreshCw, CheckCircle, XCircle, TrendingUp, Zap, Info, ArrowLeftRight } from 'lucide-react'
import SwapProgressTracker, { SwapProgress } from './SwapProgressTracker'

interface LPInfo {
  chain: string
  vaultAddress: string
  flxBalance: string
  usdcBalance: string
  price: number // USDC per FLX
  tvl: number
}

interface RouteOption {
  name: string
  chains: string[]
  expectedOutput: number
  gasCost: number
  netOutput: number
  priceImpact: number
  breakdown: string[]
}

interface SmartSwapRouterProps {
  userAddress: string | null
  arcVaultAddress: string | null
  baseVaultAddress: string | null
}

export default function SmartSwapRouter({ userAddress, arcVaultAddress, baseVaultAddress }: SmartSwapRouterProps) {
  // Swap state
  const [swapDirection, setSwapDirection] = useState<'FLX_TO_USDC' | 'USDC_TO_FLX'>('FLX_TO_USDC')
  const [swapAmount, setSwapAmount] = useState('')
  const [swapping, setSwapping] = useState(false)
  const [swapStatus, setSwapStatus] = useState<any>(null)
  const [swapError, setSwapError] = useState('')
  const [swapProgress, setSwapProgress] = useState<SwapProgress | null>(null)

  // LP data
  const [lpData, setLpData] = useState<LPInfo[]>([])
  const [loadingLPs, setLoadingLPs] = useState(false)

  // Routing
  const [routeOptions, setRouteOptions] = useState<RouteOption[]>([])
  const [selectedRoute, setSelectedRoute] = useState<RouteOption | null>(null)
  const [calculatingRoutes, setCalculatingRoutes] = useState(false)
  
  // Backend URL
  const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001'

  // Gas estimates (in USD)
  const GAS_ESTIMATES = {
    arc: 0.01,    // USDC
    base: 0.005,  // ETH equivalent
    polygon: 0.01,
    arbitrum: 0.003,
    optimism: 0.003,
    avalanche: 0.01
  }

  // Fetch LP data from all chains
  const fetchLPData = async () => {
    if (!arcVaultAddress && !baseVaultAddress) {
      console.log('[LP Fetch] No vaults available yet')
      return
    }

    setLoadingLPs(true)
    console.log('\n========================================')
    console.log('🔍 FETCHING LP DATA FROM ALL CHAINS')
    console.log('========================================\n')

    try {
      const lps: LPInfo[] = []

      // Fetch Arc LP
      if (arcVaultAddress) {
        console.log('[Arc LP] Fetching data...')
        try {
          const arcRpcUrl = process.env.NEXT_PUBLIC_ARC_RPC_URL || 'https://hidden-cosmological-thunder.arc-testnet.quiknode.pro/e18d2b4649fda2fd51ef9f5a2c1d7d8fd132c886'
          const arcProvider = new ethers.JsonRpcProvider(arcRpcUrl)
          console.log(`[Arc LP] Using RPC: ${arcRpcUrl.substring(0, 50)}...`)
          const arcVault = new ethers.Contract(
            arcVaultAddress,
            ['function totalProjectToken() view returns (uint256)', 'function totalUSDC() view returns (uint256)'],
            arcProvider
          )

          const flxBalance = await arcVault.totalProjectToken()
          const usdcBalance = await arcVault.totalUSDC()
          const flxBalanceFormatted = ethers.formatUnits(flxBalance, 18)
          const usdcBalanceFormatted = ethers.formatUnits(usdcBalance, 6)
          const price = parseFloat(usdcBalanceFormatted) / parseFloat(flxBalanceFormatted)
          const tvl = parseFloat(usdcBalanceFormatted) * 2

          console.log(`[Arc LP] FLX Balance: ${flxBalanceFormatted}`)
          console.log(`[Arc LP] USDC Balance: ${usdcBalanceFormatted}`)
          console.log(`[Arc LP] FLX Price: $${price.toFixed(4)} USDC`)
          console.log(`[Arc LP] TVL: $${tvl.toFixed(2)}`)

          lps.push({
            chain: 'arc',
            vaultAddress: arcVaultAddress,
            flxBalance: flxBalanceFormatted,
            usdcBalance: usdcBalanceFormatted,
            price,
            tvl
          })
        } catch (err: any) {
          console.error('[Arc LP] Error fetching:', err.message)
        }
      }

      // Fetch Base LP
      if (baseVaultAddress) {
        console.log('\n[Base LP] Fetching data...')
        try {
          const baseRpcUrl = process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org'
          const baseProvider = new ethers.JsonRpcProvider(baseRpcUrl)
          console.log(`[Base LP] Using RPC: ${baseRpcUrl.substring(0, 50)}...`)
          const baseVault = new ethers.Contract(
            baseVaultAddress,
            ['function totalProjectToken() view returns (uint256)', 'function totalUSDC() view returns (uint256)'],
            baseProvider
          )

          const wflxBalance = await baseVault.totalProjectToken()
          const usdcBalance = await baseVault.totalUSDC()
          const wflxBalanceFormatted = ethers.formatUnits(wflxBalance, 18)
          const usdcBalanceFormatted = ethers.formatUnits(usdcBalance, 6)
          const price = parseFloat(usdcBalanceFormatted) / parseFloat(wflxBalanceFormatted)
          const tvl = parseFloat(usdcBalanceFormatted) * 2

          console.log(`[Base LP] wFLX Balance: ${wflxBalanceFormatted}`)
          console.log(`[Base LP] USDC Balance: ${usdcBalanceFormatted}`)
          console.log(`[Base LP] wFLX Price: $${price.toFixed(4)} USDC`)
          console.log(`[Base LP] TVL: $${tvl.toFixed(2)}`)

          lps.push({
            chain: 'base',
            vaultAddress: baseVaultAddress,
            flxBalance: wflxBalanceFormatted,
            usdcBalance: usdcBalanceFormatted,
            price,
            tvl
          })
        } catch (err: any) {
          console.error('[Base LP] Error fetching:', err.message)
        }
      }

      setLpData(lps)
      console.log(`\n✅ Fetched ${lps.length} LP(s)`)
      console.log('========================================\n')
    } catch (err) {
      console.error('[LP Fetch] Error:', err)
    } finally {
      setLoadingLPs(false)
    }
  }

  // Calculate all routing options
  const calculateRoutes = async () => {
    if (!swapAmount || parseFloat(swapAmount) <= 0) {
      return
    }

    if (lpData.length === 0) {
      console.log('[Routes] No LP data available')
      return
    }

    setCalculatingRoutes(true)
    console.log('\n========================================')
    console.log('🧮 CALCULATING ALL ROUTING OPTIONS')
    console.log('========================================')
    console.log(`Input: ${swapAmount} ${swapDirection === 'FLX_TO_USDC' ? 'FLX' : 'USDC'}`)
    console.log(`Direction: ${swapDirection === 'FLX_TO_USDC' ? 'FLX → USDC' : 'USDC → FLX'}`)
    console.log(`Available LPs: ${lpData.map(lp => lp.chain).join(', ')}`)
    console.log('========================================\n')

    try {
      const routes: RouteOption[] = []
      const amount = parseFloat(swapAmount)
      const isFLXtoUSDC = swapDirection === 'FLX_TO_USDC'

      // Option 1: Local only (Arc or Base)
      for (const lp of lpData) {
        console.log(`\n[Route ${routes.length + 1}] LOCAL ONLY: ${lp.chain}`)
        console.log('─'.repeat(50))

        const output = calculateSwapOutput(amount, lp, isFLXtoUSDC)
        const gasCost = GAS_ESTIMATES[lp.chain as keyof typeof GAS_ESTIMATES] || 0.01
        const netOutput = isFLXtoUSDC ? output - gasCost : output

        const priceImpact = calculatePriceImpact(amount, lp, isFLXtoUSDC)

        console.log(`Input: ${amount} ${isFLXtoUSDC ? 'FLX' : 'USDC'}`)
        console.log(`LP: ${lp.chain} (FLX: ${parseFloat(lp.flxBalance).toFixed(2)}, USDC: ${parseFloat(lp.usdcBalance).toFixed(2)})`)
        console.log(`Price: $${lp.price.toFixed(4)} per FLX`)
        console.log(`Expected Output: ${output.toFixed(6)} ${isFLXtoUSDC ? 'USDC' : 'FLX'}`)
        console.log(`Gas Cost: $${gasCost.toFixed(6)}`)
        console.log(`Net Output: ${netOutput.toFixed(6)} ${isFLXtoUSDC ? 'USDC' : 'FLX'}`)
        console.log(`Price Impact: ${priceImpact.toFixed(2)}%`)

        routes.push({
          name: `Local Only (${lp.chain})`,
          chains: [lp.chain],
          expectedOutput: output,
          gasCost,
          netOutput,
          priceImpact,
          breakdown: [
            `Swap ${amount.toFixed(2)} ${isFLXtoUSDC ? 'FLX' : 'USDC'} on ${lp.chain}`,
            `Receive ${output.toFixed(6)} ${isFLXtoUSDC ? 'USDC' : 'FLX'}`,
            `Gas: -$${gasCost.toFixed(4)}`,
            `Net: ${netOutput.toFixed(6)} ${isFLXtoUSDC ? 'USDC' : 'FLX'}`
          ]
        })
      }

      // Option 2: Multi-chain combinations (if we have more than 1 LP)
      if (lpData.length > 1) {
        console.log(`\n[Route ${routes.length + 1}] MULTI-CHAIN: All LPs`)
        console.log('─'.repeat(50))

        // For multi-chain, we aggregate liquidity
        const totalFLX = lpData.reduce((sum, lp) => sum + parseFloat(lp.flxBalance), 0)
        const totalUSDC = lpData.reduce((sum, lp) => sum + parseFloat(lp.usdcBalance), 0)
        const avgPrice = totalUSDC / totalFLX

        console.log(`Aggregated Liquidity:`)
        console.log(`  Total FLX: ${totalFLX.toFixed(2)}`)
        console.log(`  Total USDC: ${totalUSDC.toFixed(2)}`)
        console.log(`  Average Price: $${avgPrice.toFixed(4)} per FLX`)

        // Calculate output using aggregated pool
        const aggregatedLP: LPInfo = {
          chain: 'aggregated',
          vaultAddress: '',
          flxBalance: totalFLX.toString(),
          usdcBalance: totalUSDC.toString(),
          price: avgPrice,
          tvl: totalUSDC * 2
        }

        const output = calculateSwapOutput(amount, aggregatedLP, isFLXtoUSDC)
        
        // Calculate total gas cost (need to bridge to all chains)
        const totalGasCost = lpData.reduce((sum, lp) => {
          return sum + (GAS_ESTIMATES[lp.chain as keyof typeof GAS_ESTIMATES] || 0.01)
        }, 0)

        const netOutput = isFLXtoUSDC ? output - totalGasCost : output
        const priceImpact = calculatePriceImpact(amount, aggregatedLP, isFLXtoUSDC)

        console.log(`Expected Output: ${output.toFixed(6)} ${isFLXtoUSDC ? 'USDC' : 'FLX'}`)
        console.log(`Total Gas Cost: $${totalGasCost.toFixed(6)} (across ${lpData.length} chains)`)
        console.log(`Net Output: ${netOutput.toFixed(6)} ${isFLXtoUSDC ? 'USDC' : 'FLX'}`)
        console.log(`Price Impact: ${priceImpact.toFixed(2)}%`)

        const chainList = lpData.map(lp => lp.chain).join(' + ')
        routes.push({
          name: `Multi-Chain (${chainList})`,
          chains: lpData.map(lp => lp.chain),
          expectedOutput: output,
          gasCost: totalGasCost,
          netOutput,
          priceImpact,
          breakdown: [
            `Aggregate liquidity from ${lpData.length} chains`,
            `Bridge to Arc via CCTP (USDC) + Gateway (FLX)`,
            `Swap ${amount.toFixed(2)} ${isFLXtoUSDC ? 'FLX' : 'USDC'} on Arc`,
            `Receive ${output.toFixed(6)} ${isFLXtoUSDC ? 'USDC' : 'FLX'}`,
            `Gas: -$${totalGasCost.toFixed(4)} (${lpData.length} chains)`,
            `Rebase pools to same price`,
            `Net: ${netOutput.toFixed(6)} ${isFLXtoUSDC ? 'USDC' : 'FLX'}`
          ]
        })
      }

      // Sort by net output (best first)
      routes.sort((a, b) => b.netOutput - a.netOutput)

      console.log('\n========================================')
      console.log('📊 ROUTE COMPARISON')
      console.log('========================================')
      routes.forEach((route, i) => {
        console.log(`\n${i + 1}. ${route.name}`)
        console.log(`   Net Output: ${route.netOutput.toFixed(6)} ${isFLXtoUSDC ? 'USDC' : 'FLX'}`)
        console.log(`   Gas Cost: $${route.gasCost.toFixed(4)}`)
        console.log(`   Price Impact: ${route.priceImpact.toFixed(2)}%`)
      })

      console.log(`\n✅ BEST ROUTE: ${routes[0].name}`)
      console.log(`   Reason: Highest net output (${routes[0].netOutput.toFixed(6)} ${isFLXtoUSDC ? 'USDC' : 'FLX'})`)
      console.log('========================================\n')

      setRouteOptions(routes)
      setSelectedRoute(routes[0])
    } catch (err) {
      console.error('[Routes] Error calculating:', err)
    } finally {
      setCalculatingRoutes(false)
    }
  }

  // Calculate swap output using constant product formula
  const calculateSwapOutput = (amountIn: number, lp: LPInfo, isFLXtoUSDC: boolean): number => {
    const flxReserve = parseFloat(lp.flxBalance)
    const usdcReserve = parseFloat(lp.usdcBalance)

    if (flxReserve === 0 || usdcReserve === 0) {
      return 0
    }

    const FEE = 0.003 // 0.30%

    if (isFLXtoUSDC) {
      // Swap FLX for USDC
      const amountInAfterFee = amountIn * (1 - FEE)
      const numerator = amountInAfterFee * usdcReserve
      const denominator = flxReserve + amountInAfterFee
      return numerator / denominator
    } else {
      // Swap USDC for FLX
      const amountInAfterFee = amountIn * (1 - FEE)
      const numerator = amountInAfterFee * flxReserve
      const denominator = usdcReserve + amountInAfterFee
      return numerator / denominator
    }
  }

  // Calculate price impact
  const calculatePriceImpact = (amountIn: number, lp: LPInfo, isFLXtoUSDC: boolean): number => {
    const flxReserve = parseFloat(lp.flxBalance)
    const usdcReserve = parseFloat(lp.usdcBalance)

    if (flxReserve === 0 || usdcReserve === 0) {
      return 0
    }

    const currentPrice = usdcReserve / flxReserve

    if (isFLXtoUSDC) {
      const newFlxReserve = flxReserve + amountIn
      const output = calculateSwapOutput(amountIn, lp, isFLXtoUSDC)
      const newUsdcReserve = usdcReserve - output
      const newPrice = newUsdcReserve / newFlxReserve
      return ((currentPrice - newPrice) / currentPrice) * 100
    } else {
      const newUsdcReserve = usdcReserve + amountIn
      const output = calculateSwapOutput(amountIn, lp, isFLXtoUSDC)
      const newFlxReserve = flxReserve - output
      const newPrice = newUsdcReserve / newFlxReserve
      return ((newPrice - currentPrice) / currentPrice) * 100
    }
  }

  // Execute swap
  const executeSwap = async () => {
    if (!selectedRoute || !userAddress || !swapAmount) {
      setSwapError('Missing required data for swap execution')
      console.error('❌ Missing data:', { selectedRoute, userAddress, swapAmount })
      return
    }

    try {
      setSwapping(true)
      setSwapError('')
      
      console.log('\n')
      console.log('═'.repeat(60))
      console.log('🚀 SWAP EXECUTION INITIATED')
      console.log('═'.repeat(60))
      console.log(`📍 User Address: ${userAddress}`)
      console.log(`🔄 Direction: ${swapDirection === 'FLX_TO_USDC' ? 'FLX → USDC' : 'USDC → FLX'}`)
      console.log(`💰 Input Amount: ${swapAmount} ${swapDirection === 'FLX_TO_USDC' ? 'FLX' : 'USDC'}`)
      console.log(`🎯 Expected Output: ${selectedRoute.expectedOutput.toFixed(6)} ${swapDirection === 'FLX_TO_USDC' ? 'USDC' : 'FLX'}`)
      console.log(`⛓️  Route: ${selectedRoute.name}`)
      console.log(`🌐 Chains Involved: ${selectedRoute.chains.join(' → ')}`)
      console.log(`⛽ Gas Cost: $${selectedRoute.gasCost.toFixed(4)}`)
      console.log(`📊 Net Output: ${selectedRoute.netOutput.toFixed(6)} ${swapDirection === 'FLX_TO_USDC' ? 'USDC' : 'FLX'}`)
      console.log(`💥 Price Impact: ${selectedRoute.priceImpact.toFixed(2)}%`)
      console.log('─'.repeat(60))

      const tokenIn = swapDirection === 'FLX_TO_USDC' ? 'FLX' : 'USDC'
      const tokenOut = swapDirection === 'FLX_TO_USDC' ? 'USDC' : 'FLX'
      const amountInWei = ethers.parseUnits(swapAmount, 18).toString()

      // Determine user's current chain (for now, default to arc)
      const userChain = 'arc' // TODO: Get from wallet provider

      console.log('\n📤 Preparing API request to backend...')
      console.log(`  Backend URL: ${BACKEND_URL}/api/swap/execute`)
      console.log(`  Token In: ${tokenIn}`)
      console.log(`  Token Out: ${tokenOut}`)
      console.log(`  Amount (wei): ${amountInWei}`)
      console.log(`  User Chain: ${userChain}`)
      console.log(`  Slippage Tolerance: 1%`)

      // Call backend to execute swap
      console.log('\n⏳ Calling backend API...')
      const response = await fetch(`${BACKEND_URL}/api/swap/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          route: selectedRoute,
          userAddress,
          userChain,
          amountIn: amountInWei,
          tokenIn,
          tokenOut,
          slippageTolerance: 0.01
        })
      })

      console.log(`📡 Backend response status: ${response.status} ${response.statusText}`)

      if (!response.ok) {
        const errorText = await response.text()
        console.error('❌ Backend error response:', errorText)
        throw new Error(`Swap execution failed: ${response.statusText}`)
      }

      const data = await response.json()
      console.log('\n✅ Backend response received:')
      console.log('  Swap ID:', data.data.swapId)
      console.log('  Initial Status:', data.data.progress.status)
      console.log('  Total Steps:', data.data.progress.totalSteps)
      console.log('  Current Step:', data.data.progress.currentStep)

      // Set initial progress
      setSwapProgress(data.data.progress)
      console.log('\n🔄 Starting progress polling (every 2 seconds)...')

      let pollCount = 0

      // Poll for progress updates
      const pollInterval = setInterval(async () => {
        pollCount++
        console.log(`\n📊 Progress Poll #${pollCount}`)
        try {
          const progressResponse = await fetch(`${BACKEND_URL}/api/swap/progress/${data.data.swapId}`)
          const progressData = await progressResponse.json()
          
          if (progressData.success) {
            console.log(`  Status: ${progressData.data.status}`)
            console.log(`  Step: ${progressData.data.currentStep}/${progressData.data.totalSteps}`)
            
            setSwapProgress(progressData.data)
            
            // Stop polling when complete or failed
            if (progressData.data.status === 'complete' || progressData.data.status === 'failed') {
              clearInterval(pollInterval)
              setSwapping(false)
              
              if (progressData.data.status === 'complete') {
                console.log('\n✅ SWAP COMPLETE!')
                console.log('═'.repeat(60))
                console.log(`🎉 Successfully swapped ${swapAmount} ${tokenIn} → ${tokenOut}`)
                console.log(`📊 Final output: ${selectedRoute.expectedOutput.toFixed(6)} ${tokenOut}`)
                console.log('═'.repeat(60))
                setSwapStatus({ success: true, message: 'Swap completed successfully!' })
                // Refresh LP data
                fetchLPData()
              } else {
                console.error('\n❌ SWAP FAILED!')
                console.error('═'.repeat(60))
                console.error(`Error: ${progressData.data.error || 'Unknown error'}`)
                console.error('═'.repeat(60))
              }
            }
          } else {
            console.warn('  ⚠️  Progress poll returned unsuccessful')
          }
        } catch (err) {
          console.error('  ❌ Error polling progress:', err)
        }
      }, 2000) // Poll every 2 seconds

      // Timeout after 5 minutes
      setTimeout(() => {
        clearInterval(pollInterval)
        if (swapping) {
          console.error('\n⏱️  SWAP TIMEOUT!')
          console.error('═'.repeat(60))
          console.error('Swap took longer than 5 minutes')
          console.error('═'.repeat(60))
          setSwapError('Swap timed out')
          setSwapping(false)
        }
      }, 300000)

    } catch (error: any) {
      console.error('\n❌ SWAP EXECUTION ERROR!')
      console.error('═'.repeat(60))
      console.error('Error:', error)
      console.error('Message:', error.message)
      console.error('Stack:', error.stack)
      console.error('═'.repeat(60))
      setSwapError(error.message || 'Failed to execute swap')
      setSwapping(false)
    }
  }

  // Toggle swap direction
  const toggleSwapDirection = () => {
    setSwapDirection(prev => prev === 'FLX_TO_USDC' ? 'USDC_TO_FLX' : 'FLX_TO_USDC')
    setSwapAmount('')
    setRouteOptions([])
    setSelectedRoute(null)
  }

  // Auto-calculate routes when amount changes
  useEffect(() => {
    if (swapAmount && parseFloat(swapAmount) > 0 && lpData.length > 0) {
      const timer = setTimeout(() => {
        calculateRoutes()
      }, 500) // Debounce
      return () => clearTimeout(timer)
    }
  }, [swapAmount, lpData, swapDirection])

  // Fetch LP data on mount
  useEffect(() => {
    fetchLPData()
  }, [arcVaultAddress, baseVaultAddress])

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Zap className="w-5 h-5 text-yellow-600" />
          <h2 className="text-xl font-semibold">🚀 Smart Swap Router</h2>
        </div>
        <button
          onClick={fetchLPData}
          disabled={loadingLPs}
          className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          title="Refresh LP data"
        >
          <RefreshCw className={`w-4 h-4 ${loadingLPs ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
        Automatically finds the best route across all available liquidity pools
      </p>

      {/* LP Status */}
      <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
        <div className="flex items-center gap-2 mb-2">
          <Info className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
            Available Liquidity: {lpData.length} pool(s)
          </span>
        </div>
        {lpData.length > 0 && (
          <div className="text-xs text-blue-600 dark:text-blue-400 space-y-1">
            {lpData.map(lp => (
              <div key={lp.chain} className="flex justify-between">
                <span className="capitalize">{lp.chain}:</span>
                <span>{parseFloat(lp.flxBalance).toFixed(2)} FLX, {parseFloat(lp.usdcBalance).toFixed(2)} USDC (${lp.price.toFixed(4)}/FLX)</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Swap Direction Toggle */}
      <div className="mb-4 flex items-center justify-center gap-2">
        <span className={`text-sm font-medium ${swapDirection === 'FLX_TO_USDC' ? 'text-purple-600' : 'text-gray-400'}`}>
          FLX
        </span>
        <button
          onClick={toggleSwapDirection}
          className="p-2 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
        >
          <ArrowLeftRight className="w-4 h-4" />
        </button>
        <span className={`text-sm font-medium ${swapDirection === 'USDC_TO_FLX' ? 'text-green-600' : 'text-gray-400'}`}>
          USDC
        </span>
      </div>

      {/* Swap Input */}
      <div className="mb-4">
        <label className="block text-sm font-medium mb-1">
          Amount ({swapDirection === 'FLX_TO_USDC' ? 'FLX' : 'USDC'})
        </label>
        <input
          type="number"
          value={swapAmount}
          onChange={(e) => setSwapAmount(e.target.value)}
          placeholder="100.0"
          step="0.01"
          className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700"
        />
      </div>

      {/* Routing Options */}
      {calculatingRoutes && (
        <div className="mb-4 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg flex items-center gap-3">
          <RefreshCw className="w-5 h-5 animate-spin text-blue-600" />
          <span className="text-sm">Calculating all routing options...</span>
        </div>
      )}

      {selectedRoute && !calculatingRoutes && (
        <div className="mb-4 space-y-3">
          {/* Best Route */}
          <div className="p-4 bg-green-50 dark:bg-green-900/20 border-2 border-green-500 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="w-5 h-5 text-green-600" />
              <span className="font-semibold text-green-700 dark:text-green-300">
                🏆 Best Route: {selectedRoute.name}
              </span>
            </div>
            <div className="text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-400">Expected Output:</span>
                <span className="font-mono font-bold text-green-700 dark:text-green-300">
                  {selectedRoute.expectedOutput.toFixed(6)} {swapDirection === 'FLX_TO_USDC' ? 'USDC' : 'FLX'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-400">Gas Cost:</span>
                <span className="font-mono text-red-600 dark:text-red-400">-${selectedRoute.gasCost.toFixed(4)}</span>
              </div>
              <div className="flex justify-between border-t pt-1 mt-1">
                <span className="font-medium text-gray-700 dark:text-gray-300">Net Output:</span>
                <span className="font-mono font-bold text-green-700 dark:text-green-300">
                  {selectedRoute.netOutput.toFixed(6)} {swapDirection === 'FLX_TO_USDC' ? 'USDC' : 'FLX'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-400">Price Impact:</span>
                <span className={`font-mono ${selectedRoute.priceImpact > 2 ? 'text-red-600' : 'text-yellow-600'}`}>
                  {selectedRoute.priceImpact.toFixed(2)}%
                </span>
              </div>
            </div>

            {/* Breakdown */}
            <div className="mt-3 pt-3 border-t border-green-200 dark:border-green-800">
              <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">Execution Steps:</p>
              <div className="space-y-1">
                {selectedRoute.breakdown.map((step, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs text-gray-600 dark:text-gray-400">
                    <span className="text-green-600 dark:text-green-400">{i + 1}.</span>
                    <span>{step}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Other Routes */}
          {routeOptions.length > 1 && (
            <details className="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
              <summary className="cursor-pointer text-sm font-medium text-gray-700 dark:text-gray-300">
                View All Routes ({routeOptions.length})
              </summary>
              <div className="mt-3 space-y-2">
                {routeOptions.slice(1).map((route, i) => (
                  <div key={i} className="p-3 bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-600">
                    <div className="text-sm font-medium mb-1">{route.name}</div>
                    <div className="text-xs space-y-0.5 text-gray-600 dark:text-gray-400">
                      <div className="flex justify-between">
                        <span>Net Output:</span>
                        <span className="font-mono">{route.netOutput.toFixed(6)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Gas Cost:</span>
                        <span className="font-mono text-red-600">-${route.gasCost.toFixed(4)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Difference:</span>
                        <span className="font-mono text-red-600">
                          {(route.netOutput - selectedRoute.netOutput).toFixed(6)} worse
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      )}

      {/* Execute Swap Button */}
      <button
        onClick={executeSwap}
        disabled={!selectedRoute || swapping || !userAddress}
        className="w-full px-4 py-3 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-lg hover:from-purple-700 hover:to-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium flex items-center justify-center gap-2"
      >
        {swapping ? (
          <>
            <RefreshCw className="w-5 h-5 animate-spin" />
            Executing Swap...
          </>
        ) : (
          <>
            <Zap className="w-5 h-5" />
            Execute Best Route
          </>
        )}
      </button>

      {!userAddress && (
        <p className="mt-2 text-xs text-center text-gray-500">Connect wallet to swap</p>
      )}

      {/* Swap Progress Tracker - Overlay Modal */}
      {swapProgress && (
        <SwapProgressTracker
          progress={swapProgress}
          onComplete={() => {
            setSwapProgress(null)
            setSwapAmount('')
            setRouteOptions([])
            setSelectedRoute(null)
          }}
          onError={(error) => {
            setSwapError(error)
            setSwapProgress(null)
          }}
        />
      )}
    </div>
  )
}

