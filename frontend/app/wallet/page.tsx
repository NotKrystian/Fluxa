'use client'

import { useState } from 'react'
import { Wallet, Plus, Send, TrendingUp, CheckCircle2, AlertTriangle } from 'lucide-react'

export default function WalletPage() {
  const [hasWallet, setHasWallet] = useState(false)
  const [walletAddress, setWalletAddress] = useState('')
  const [balance, setBalance] = useState('10,000')
  const [creating, setCreating] = useState(false)

  const [swapAmount, setSwapAmount] = useState('')
  const [swapping, setSwapping] = useState(false)
  const [swapComplete, setSwapComplete] = useState(false)

  const createWallet = async () => {
    setCreating(true)
    
    // Simulate wallet creation
    await new Promise(resolve => setTimeout(resolve, 2000))
    
    const mockAddress = '0x' + Math.random().toString(16).slice(2, 42).padStart(40, '0')
    setWalletAddress(mockAddress)
    setHasWallet(true)
    setCreating(false)
  }

  const executeSwap = async () => {
    if (!swapAmount) return
    
    setSwapping(true)
    setSwapComplete(false)
    
    // Simulate swap
    await new Promise(resolve => setTimeout(resolve, 2000))
    
    const currentBalance = parseFloat(balance.replace(/,/g, ''))
    const newBalance = currentBalance - parseFloat(swapAmount)
    setBalance(newBalance.toLocaleString())
    
    setSwapComplete(true)
    setSwapping(false)
    setSwapAmount('')
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-2">Circle Wallet</h1>
        <p className="text-gray-600 dark:text-gray-400">
          Embedded wallet experience without MetaMask
        </p>
      </div>

      {!hasWallet ? (
        /* Create Wallet */
        <div className="bg-white dark:bg-gray-900 rounded-xl border-2 border-gray-200 dark:border-gray-800 p-8 text-center">
          <div className="w-20 h-20 gradient-arc rounded-full flex items-center justify-center mx-auto mb-6">
            <Wallet className="w-10 h-10 text-white" />
          </div>
          
          <h2 className="text-2xl font-bold mb-3">Create Your Wallet</h2>
          <p className="text-gray-600 dark:text-gray-400 mb-6 max-w-md mx-auto">
            Get started with an embedded wallet powered by Circle. No browser extension needed.
          </p>

          <button
            onClick={createWallet}
            disabled={creating}
            className="gradient-arc text-white px-8 py-4 rounded-lg font-semibold text-lg hover:opacity-90 transition-opacity disabled:opacity-50 inline-flex items-center space-x-2"
          >
            {creating ? (
              <>
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                <span>Creating...</span>
              </>
            ) : (
              <>
                <Plus className="w-5 h-5" />
                <span>Create Wallet</span>
              </>
            )}
          </button>

          <div className="mt-8 grid md:grid-cols-3 gap-4 text-left">
            <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <div className="text-2xl mb-2">🔒</div>
              <h3 className="font-semibold mb-1">Secure</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Your keys, your crypto
              </p>
            </div>
            <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <div className="text-2xl mb-2">⚡</div>
              <h3 className="font-semibold mb-1">Instant</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Create in seconds
              </p>
            </div>
            <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <div className="text-2xl mb-2">🌐</div>
              <h3 className="font-semibold mb-1">Universal</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Works everywhere
              </p>
            </div>
          </div>
        </div>
      ) : (
        /* Wallet Dashboard */
        <div className="space-y-6">
          {/* Wallet Info */}
          <div className="gradient-card rounded-xl border border-gray-200 dark:border-gray-800 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold flex items-center">
                <Wallet className="w-5 h-5 mr-2 text-arc-blue" />
                Your Wallet
              </h3>
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                <span className="text-sm text-green-600 dark:text-green-400">Active</span>
              </div>
            </div>

            <div className="mb-4 p-3 bg-white dark:bg-gray-900 rounded-lg">
              <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">Address</p>
              <p className="font-mono text-sm break-all">{walletAddress}</p>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div className="p-4 bg-white dark:bg-gray-900 rounded-lg">
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">USDC Balance</p>
                <p className="text-3xl font-bold gradient-arc bg-clip-text text-transparent">
                  ${balance}
                </p>
              </div>
              <div className="p-4 bg-white dark:bg-gray-900 rounded-lg">
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">EURC Balance</p>
                <p className="text-3xl font-bold text-gray-400">$0.00</p>
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="bg-white dark:bg-gray-900 rounded-xl border-2 border-gray-200 dark:border-gray-800 p-6">
            <h3 className="font-semibold mb-4">Quick Actions</h3>
            
            <div className="space-y-4">
              {/* Swap */}
              <div className="p-4 border-2 border-gray-200 dark:border-gray-800 rounded-lg hover:border-arc-blue transition-colors">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 gradient-arc rounded-full flex items-center justify-center">
                      <TrendingUp className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <h4 className="font-semibold">Swap Tokens</h4>
                      <p className="text-sm text-gray-600 dark:text-gray-400">Exchange USDC for EURC</p>
                    </div>
                  </div>
                </div>

                <div className="flex space-x-3">
                  <input
                    type="number"
                    value={swapAmount}
                    onChange={(e) => setSwapAmount(e.target.value)}
                    placeholder="Amount"
                    className="flex-1 px-3 py-2 bg-gray-50 dark:bg-gray-800 rounded border border-gray-300 dark:border-gray-700 outline-none focus:border-arc-blue"
                    disabled={swapping}
                  />
                  <button
                    onClick={executeSwap}
                    disabled={swapping || !swapAmount}
                    className="gradient-arc text-white px-6 py-2 rounded font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
                  >
                    {swapping ? 'Swapping...' : 'Swap'}
                  </button>
                </div>

                {swapComplete && (
                  <div className="mt-3 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded flex items-center space-x-2">
                    <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400" />
                    <p className="text-sm text-green-700 dark:text-green-300">
                      Swap successful!
                    </p>
                  </div>
                )}
              </div>

              {/* Send */}
              <div className="p-4 border-2 border-gray-200 dark:border-gray-800 rounded-lg hover:border-arc-purple transition-colors opacity-50">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-gray-200 dark:bg-gray-800 rounded-full flex items-center justify-center">
                    <Send className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-semibold">Send Payment</h4>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Transfer to another address</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Transaction History */}
          <div className="bg-white dark:bg-gray-900 rounded-xl border-2 border-gray-200 dark:border-gray-800 p-6">
            <h3 className="font-semibold mb-4">Recent Activity</h3>
            
            {swapComplete ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center">
                      <TrendingUp className="w-5 h-5 text-green-600 dark:text-green-400" />
                    </div>
                    <div>
                      <p className="font-medium">Swapped USDC → EURC</p>
                      <p className="text-sm text-gray-600 dark:text-gray-400">Just now</p>
                    </div>
                  </div>
                  <p className="font-semibold">-${swapAmount}</p>
                </div>
              </div>
            ) : (
              <p className="text-center text-gray-500 dark:text-gray-400 py-8">
                No transactions yet
              </p>
            )}
          </div>
        </div>
      )}

      {/* Info */}
      <div className="mt-8 gradient-card rounded-xl border border-gray-200 dark:border-gray-800 p-6">
        <h3 className="font-semibold mb-4">About Circle Wallets</h3>
        <div className="space-y-3 text-sm text-gray-600 dark:text-gray-400">
          <div className="flex items-start">
            <span className="text-arc-blue mr-2">•</span>
            <span>User-controlled wallets powered by Circle's SDK</span>
          </div>
          <div className="flex items-start">
            <span className="text-arc-blue mr-2">•</span>
            <span>No browser extension required - works in any web app</span>
          </div>
          <div className="flex items-start">
            <span className="text-arc-blue mr-2">•</span>
            <span>Seamless integration with Gateway for balance management</span>
          </div>
          <div className="flex items-start">
            <span className="text-arc-blue mr-2">•</span>
            <span>Execute transactions without leaving the interface</span>
          </div>
        </div>
      </div>

      {/* Info */}
      <div className="mt-6 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
        <div className="flex items-start space-x-3">
          <AlertTriangle className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-blue-800 dark:text-blue-200">
            <p className="font-semibold mb-1">Circle Wallets</p>
            <p>Circle Wallets SDK integration allows users to create and manage wallets without browser extensions. Configure your Circle API key to enable real wallet creation.</p>
          </div>
        </div>
      </div>
    </div>
  )
}

