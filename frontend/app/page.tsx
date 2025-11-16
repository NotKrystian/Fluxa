'use client'

import Link from 'next/link'
import { ArrowRight, Zap, Globe, Wallet } from 'lucide-react'

export default function Home() {
  return (
    <div className="max-w-6xl mx-auto">
      {/* Hero Section */}
      <div className="text-center py-16">
        <h1 className="text-6xl font-bold mb-6 gradient-arc bg-clip-text text-transparent">
          Fluxa Protocol
        </h1>
        <p className="text-2xl text-gray-600 dark:text-gray-300 mb-4">
          Global Liquidity Routing Layer
        </p>
        <p className="text-lg text-gray-500 dark:text-gray-400 max-w-2xl mx-auto">
          Multi-chain liquidity aggregation with Arc as the intelligent execution hub.
          One interface for payments, swaps, and cross-chain transfers.
        </p>
      </div>

      {/* Key Features */}
      <div className="grid md:grid-cols-3 gap-6 mb-16">
        <div className="gradient-card p-6 rounded-xl border border-gray-200 dark:border-gray-800">
          <div className="w-12 h-12 gradient-arc rounded-lg flex items-center justify-center mb-4">
            <Zap className="w-6 h-6 text-white" />
          </div>
          <h3 className="text-xl font-semibold mb-2">Intelligent Routing</h3>
          <p className="text-gray-600 dark:text-gray-400">
            Analyzes liquidity across 4+ chains to find optimal execution routes
          </p>
        </div>

        <div className="gradient-card p-6 rounded-xl border border-gray-200 dark:border-gray-800">
          <div className="w-12 h-12 gradient-arc rounded-lg flex items-center justify-center mb-4">
            <Globe className="w-6 h-6 text-white" />
          </div>
          <h3 className="text-xl font-semibold mb-2">Multi-Chain Native</h3>
          <p className="text-gray-600 dark:text-gray-400">
            Aggregates liquidity from Arc, Ethereum, Base, and Polygon
          </p>
        </div>

        <div className="gradient-card p-6 rounded-xl border border-gray-200 dark:border-gray-800">
          <div className="w-12 h-12 gradient-arc rounded-lg flex items-center justify-center mb-4">
            <Wallet className="w-6 h-6 text-white" />
          </div>
          <h3 className="text-xl font-semibold mb-2">Circle Integration</h3>
          <p className="text-gray-600 dark:text-gray-400">
            CCTP for USDC, Gateway for ERC20s, Wallets for seamless UX
          </p>
        </div>
      </div>

      {/* Demo Options */}
      <div className="mb-16">
        <h2 className="text-3xl font-bold mb-8 text-center">Try the Demos</h2>
        
        <div className="grid md:grid-cols-2 gap-6">
          {/* Standard Swap */}
          <Link href="/swap" className="group">
            <div className="border-2 border-gray-200 dark:border-gray-800 hover:border-arc-blue rounded-xl p-8 transition-all hover:shadow-lg">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-2xl font-semibold">Arc Swap</h3>
                <ArrowRight className="w-6 h-6 group-hover:translate-x-2 transition-transform" />
              </div>
              <p className="text-gray-600 dark:text-gray-400 mb-4">
                Standard stablecoin swap on Arc using the local AMM pool
              </p>
              <div className="flex items-center space-x-2 text-sm text-arc-blue">
                <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                <span>Working • Testnet Deployed</span>
              </div>
            </div>
          </Link>

          {/* CCTP Transfer */}
          <Link href="/transfer" className="group">
            <div className="border-2 border-gray-200 dark:border-gray-800 hover:border-arc-blue rounded-xl p-8 transition-all hover:shadow-lg">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-2xl font-semibold">CCTP Transfer</h3>
                <ArrowRight className="w-6 h-6 group-hover:translate-x-2 transition-transform" />
              </div>
              <p className="text-gray-600 dark:text-gray-400 mb-4">
                Cross-chain USDC transfer using Circle's CCTP protocol
              </p>
              <div className="flex items-center space-x-2 text-sm text-arc-purple">
                <span className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse"></span>
                <span>Demo Mode • Backend Ready</span>
              </div>
            </div>
          </Link>

          {/* Circle Wallet */}
          <Link href="/wallet" className="group">
            <div className="border-2 border-gray-200 dark:border-gray-800 hover:border-arc-blue rounded-xl p-8 transition-all hover:shadow-lg">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-2xl font-semibold">Circle Wallet</h3>
                <ArrowRight className="w-6 h-6 group-hover:translate-x-2 transition-transform" />
              </div>
              <p className="text-gray-600 dark:text-gray-400 mb-4">
                Embedded wallet experience without MetaMask
              </p>
              <div className="flex items-center space-x-2 text-sm text-arc-purple">
                <span className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse"></span>
                <span>Demo Mode • SDK Integration</span>
              </div>
            </div>
          </Link>

          {/* High-Value Swap - FEATURED */}
          <Link href="/highvalue" className="group">
            <div className="border-2 border-arc-purple hover:border-arc-blue rounded-xl p-8 transition-all hover:shadow-xl gradient-card relative overflow-hidden">
              <div className="absolute top-0 right-0 bg-arc-purple text-white text-xs px-3 py-1 rounded-bl-lg font-semibold">
                SHOWCASE
              </div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-2xl font-semibold">High-Value Multi-Chain Swap</h3>
                <ArrowRight className="w-6 h-6 group-hover:translate-x-2 transition-transform" />
              </div>
              <p className="text-gray-600 dark:text-gray-400 mb-4">
                Large trade with multi-chain liquidity aggregation and routing visualization
              </p>
              <div className="flex items-center space-x-2 text-sm text-arc-purple font-semibold">
                <Zap className="w-4 h-4" />
                <span>Full Stack Demo • Routing Engine Active</span>
              </div>
            </div>
          </Link>
        </div>
      </div>

      {/* Architecture Overview */}
      <div className="gradient-card p-8 rounded-xl border border-gray-200 dark:border-gray-800">
        <h2 className="text-2xl font-bold mb-6">How It Works</h2>
        <div className="grid md:grid-cols-3 gap-8">
          <div>
            <div className="text-4xl font-bold text-arc-blue mb-2">1</div>
            <h3 className="font-semibold mb-2">Monitor Global Liquidity</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Backend tracks LP depths across Arc, Ethereum, Base, and Polygon in real-time
            </p>
          </div>
          <div>
            <div className="text-4xl font-bold text-arc-purple mb-2">2</div>
            <h3 className="font-semibold mb-2">Optimize Routing</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              AI calculates best execution route considering gas costs, slippage, and time
            </p>
          </div>
          <div>
            <div className="text-4xl font-bold text-arc-green mb-2">3</div>
            <h3 className="font-semibold mb-2">Execute on Arc</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Pull liquidity via CCTP/Gateway, execute atomic swap, rebalance LPs
            </p>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mt-8">
        <div className="text-center p-4">
          <div className="text-3xl font-bold text-arc-blue">8</div>
          <div className="text-sm text-gray-600 dark:text-gray-400">Chains</div>
        </div>
        <div className="text-center p-4">
          <div className="text-3xl font-bold text-arc-purple">~15min</div>
          <div className="text-sm text-gray-600 dark:text-gray-400">CCTP Time</div>
        </div>
        <div className="text-center p-4">
          <div className="text-3xl font-bold text-arc-green">0.3%</div>
          <div className="text-sm text-gray-600 dark:text-gray-400">Swap Fee</div>
        </div>
        <div className="text-center p-4">
          <div className="text-3xl font-bold gradient-arc bg-clip-text text-transparent">∞</div>
          <div className="text-sm text-gray-600 dark:text-gray-400">Liquidity</div>
        </div>
      </div>
    </div>
  )
}

