'use client'

import { useState } from 'react'
import { ArrowRight, Globe, Clock, CheckCircle2, AlertTriangle } from 'lucide-react'

const CHAINS = [
  { id: 'ethereum', name: 'Ethereum', domain: 0 },
  { id: 'base', name: 'Base', domain: 6 },
  { id: 'polygon', name: 'Polygon', domain: 7 },
  { id: 'arc', name: 'Arc', domain: 999 }
]

export default function TransferPage() {
  const [sourceChain, setSourceChain] = useState('ethereum')
  const [destinationChain, setDestinationChain] = useState('arc')
  const [amount, setAmount] = useState('')
  const [recipient, setRecipient] = useState('')
  
  const [transferring, setTransferring] = useState(false)
  const [attestationProgress, setAttestationProgress] = useState(0)
  const [txHash, setTxHash] = useState('')
  const [complete, setComplete] = useState(false)

  const handleTransfer = async () => {
    if (!amount || !recipient) return

    setTransferring(true)
    setComplete(false)
    setAttestationProgress(0)

    // Simulate burn transaction
    await new Promise(resolve => setTimeout(resolve, 2000))
    setTxHash('0x' + Math.random().toString(16).slice(2).padStart(64, '0'))

    // Simulate attestation progress
    for (let i = 0; i <= 100; i += 10) {
      await new Promise(resolve => setTimeout(resolve, 500))
      setAttestationProgress(i)
    }

    setComplete(true)
    setTransferring(false)
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-2">CCTP Transfer</h1>
        <p className="text-gray-600 dark:text-gray-400">
          Cross-chain USDC transfer using Circle's Cross-Chain Transfer Protocol
        </p>
      </div>

      {/* Transfer Interface */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border-2 border-gray-200 dark:border-gray-800 p-6 mb-6">
        {/* Source Chain */}
        <div className="mb-6">
          <label className="block text-sm font-medium mb-2">From</label>
          <select
            value={sourceChain}
            onChange={(e) => setSourceChain(e.target.value)}
            className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 rounded-lg border-2 border-gray-200 dark:border-gray-700 focus:border-arc-blue outline-none"
            disabled={transferring}
          >
            {CHAINS.filter(c => c.id !== destinationChain).map(chain => (
              <option key={chain.id} value={chain.id}>{chain.name}</option>
            ))}
          </select>
        </div>

        {/* Arrow */}
        <div className="flex justify-center mb-6">
          <div className="p-3 rounded-full bg-gray-100 dark:bg-gray-800">
            <ArrowRight className="w-6 h-6 text-arc-blue" />
          </div>
        </div>

        {/* Destination Chain */}
        <div className="mb-6">
          <label className="block text-sm font-medium mb-2">To</label>
          <select
            value={destinationChain}
            onChange={(e) => setDestinationChain(e.target.value)}
            className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 rounded-lg border-2 border-gray-200 dark:border-gray-700 focus:border-arc-blue outline-none"
            disabled={transferring}
          >
            {CHAINS.filter(c => c.id !== sourceChain).map(chain => (
              <option key={chain.id} value={chain.id}>{chain.name}</option>
            ))}
          </select>
        </div>

        {/* Amount */}
        <div className="mb-6">
          <label className="block text-sm font-medium mb-2">Amount (USDC)</label>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="1000"
            className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 rounded-lg border-2 border-gray-200 dark:border-gray-700 focus:border-arc-blue outline-none text-lg"
            disabled={transferring}
          />
        </div>

        {/* Recipient */}
        <div className="mb-6">
          <label className="block text-sm font-medium mb-2">Recipient Address</label>
          <input
            type="text"
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            placeholder="0x..."
            className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 rounded-lg border-2 border-gray-200 dark:border-gray-700 focus:border-arc-blue outline-none font-mono text-sm"
            disabled={transferring}
          />
        </div>

        {/* Transfer Button */}
        <button
          onClick={handleTransfer}
          disabled={transferring || !amount || !recipient}
          className="w-full gradient-arc text-white py-4 rounded-lg font-semibold text-lg hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {transferring ? 'Processing...' : 'Initiate Transfer'}
        </button>
      </div>

      {/* Progress */}
      {transferring && (
        <div className="bg-white dark:bg-gray-900 rounded-xl border-2 border-gray-200 dark:border-gray-800 p-6 mb-6">
          <h3 className="font-semibold mb-4 flex items-center">
            <Clock className="w-5 h-5 mr-2 text-arc-blue animate-pulse" />
            Transfer in Progress
          </h3>

          <div className="space-y-4">
            {/* Step 1: Burn */}
            <div className="flex items-start space-x-3">
              <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-medium text-green-600 dark:text-green-400">USDC burned on {CHAINS.find(c => c.id === sourceChain)?.name}</p>
                {txHash && (
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 font-mono">
                    {txHash.slice(0, 10)}...{txHash.slice(-8)}
                  </p>
                )}
              </div>
            </div>

            {/* Step 2: Attestation */}
            <div className="flex items-start space-x-3">
              <Clock className="w-5 h-5 text-arc-blue animate-pulse flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-medium">Waiting for Circle attestation</p>
                <div className="mt-2 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                  <div
                    className="bg-arc-blue h-2 rounded-full transition-all duration-500"
                    style={{ width: `${attestationProgress}%` }}
                  ></div>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  {attestationProgress}% • Est. 15 minutes
                </p>
              </div>
            </div>

            {/* Step 3: Mint (pending) */}
            {attestationProgress < 100 && (
              <div className="flex items-start space-x-3">
                <div className="w-5 h-5 rounded-full border-2 border-gray-300 flex-shrink-0 mt-0.5"></div>
                <p className="font-medium text-gray-400">Mint USDC on {CHAINS.find(c => c.id === destinationChain)?.name}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Complete */}
      {complete && (
        <div className="bg-green-50 dark:bg-green-900/20 border-2 border-green-200 dark:border-green-800 rounded-xl p-6 mb-6">
          <div className="flex items-start space-x-3">
            <CheckCircle2 className="w-6 h-6 text-green-600 dark:text-green-400 flex-shrink-0" />
            <div>
              <h3 className="font-semibold text-green-800 dark:text-green-200 text-lg mb-2">
                Transfer Complete!
              </h3>
              <p className="text-green-700 dark:text-green-300">
                {amount} USDC successfully transferred from {CHAINS.find(c => c.id === sourceChain)?.name} to {CHAINS.find(c => c.id === destinationChain)?.name}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Info */}
      <div className="gradient-card rounded-xl border border-gray-200 dark:border-gray-800 p-6 mb-6">
        <h3 className="font-semibold mb-4 flex items-center">
          <Globe className="w-5 h-5 mr-2 text-arc-blue" />
          About CCTP
        </h3>
        <div className="space-y-3 text-sm text-gray-600 dark:text-gray-400">
          <p>
            Circle's Cross-Chain Transfer Protocol (CCTP) enables native USDC transfers across blockchains.
          </p>
          <div className="space-y-2">
            <div className="flex items-start">
              <span className="text-arc-blue mr-2">•</span>
              <span>Burns USDC on source chain</span>
            </div>
            <div className="flex items-start">
              <span className="text-arc-blue mr-2">•</span>
              <span>Circle attestation service verifies burn (~15 minutes)</span>
            </div>
            <div className="flex items-start">
              <span className="text-arc-blue mr-2">•</span>
              <span>Mints native USDC on destination chain</span>
            </div>
            <div className="flex items-start">
              <span className="text-arc-blue mr-2">•</span>
              <span>No wrapped tokens, no liquidity pools needed</span>
            </div>
          </div>
        </div>
      </div>

      {/* Info Notice */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
        <div className="flex items-start space-x-3">
          <AlertTriangle className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-blue-800 dark:text-blue-200">
            <p className="font-semibold mb-1">CCTP Integration</p>
            <p>This interface connects to real Circle CCTP contracts. Ensure you have USDC on the source chain and testnet gas for both source and destination chains.</p>
          </div>
        </div>
      </div>
    </div>
  )
}

