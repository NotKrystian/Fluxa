'use client'

import { useState } from 'react'
import { Rocket, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react'

const CHAINS = [
  { id: 'sepolia', name: 'Ethereum Sepolia', chainId: 11155111, rpc: 'https://rpc.sepolia.org' },
  { id: 'arc', name: 'Arc Testnet', chainId: 5042002, rpc: 'https://rpc.testnet.arc.network' }
]

interface DeploymentResult {
  chain: string
  status: 'pending' | 'deploying' | 'success' | 'error'
  factory?: string
  usdc?: string
  testToken?: string
  testVault?: string
  error?: string
}

export default function DeployPage() {
  const [selectedChains, setSelectedChains] = useState<string[]>(['sepolia', 'arc'])
  const [deploying, setDeploying] = useState(false)
  const [deployments, setDeployments] = useState<Record<string, DeploymentResult>>({})

  const toggleChain = (chainId: string) => {
    if (selectedChains.includes(chainId)) {
      setSelectedChains(selectedChains.filter(id => id !== chainId))
    } else {
      setSelectedChains([...selectedChains, chainId])
    }
  }

  const startDeployment = async () => {
    alert('Deployment must be run via CLI:\n\n1. Run: npm run deploy\n\nThis will deploy contracts to Sepolia and Arc testnets and automatically update .env files.\n\n2. After deployment completes, RESTART the frontend dev server (Ctrl+C then npm run dev) to load new environment variables.\n\n3. Then refresh this page to see deployed contracts.')
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success':
        return <CheckCircle2 className="w-5 h-5 text-green-500" />
      case 'deploying':
        return <Loader2 className="w-5 h-5 text-arc-blue animate-spin" />
      case 'error':
        return <AlertCircle className="w-5 h-5 text-red-500" />
      default:
        return <div className="w-5 h-5 rounded-full border-2 border-gray-300" />
    }
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-2">Multi-Chain Deployment</h1>
        <p className="text-gray-600 dark:text-gray-400">
          Deploy LiquidityVault system across multiple chains
        </p>
      </div>

      {/* Chain Selection */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border-2 border-gray-200 dark:border-gray-800 p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">Select Chains</h2>
        <div className="space-y-3">
          {CHAINS.map(chain => (
            <label
              key={chain.id}
              className="flex items-center space-x-3 p-3 rounded-lg border-2 border-gray-200 dark:border-gray-800 hover:border-arc-blue transition-colors cursor-pointer"
            >
              <input
                type="checkbox"
                checked={selectedChains.includes(chain.id)}
                onChange={() => toggleChain(chain.id)}
                disabled={deploying}
                className="w-5 h-5 text-arc-blue rounded focus:ring-arc-blue"
              />
              <div className="flex-1">
                <div className="font-medium">{chain.name}</div>
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  Chain ID: {chain.chainId}
                </div>
              </div>
              {deployments[chain.id] && (
                <div>
                  {getStatusIcon(deployments[chain.id].status)}
                </div>
              )}
            </label>
          ))}
        </div>
      </div>

      {/* Deploy Button */}
      <button
        onClick={startDeployment}
        disabled={deploying || selectedChains.length === 0}
        className="w-full gradient-arc text-white py-4 rounded-xl font-semibold text-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
      >
        {deploying ? (
          <>
            <Loader2 className="w-6 h-6 animate-spin" />
            <span>Deploying...</span>
          </>
        ) : (
          <>
            <Rocket className="w-6 h-6" />
            <span>Deploy to {selectedChains.length} Chain{selectedChains.length !== 1 ? 's' : ''}</span>
          </>
        )}
      </button>

      {/* Deployment Results */}
      {Object.keys(deployments).length > 0 && (
        <div className="mt-8 space-y-4">
          <h2 className="text-2xl font-semibold">Deployment Results</h2>
          
          {Object.entries(deployments).map(([chainId, deployment]) => {
            const chain = CHAINS.find(c => c.id === chainId)
            if (!chain) return null

            return (
              <div
                key={chainId}
                className="bg-white dark:bg-gray-900 rounded-xl border-2 border-gray-200 dark:border-gray-800 p-6"
              >
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold">{chain.name}</h3>
                  {getStatusIcon(deployment.status)}
                </div>

                {deployment.status === 'deploying' && (
                  <div className="text-gray-600 dark:text-gray-400">
                    Deploying contracts...
                  </div>
                )}

                {deployment.status === 'success' && (
                  <div className="space-y-2 text-sm">
                    <div className="grid grid-cols-[120px_1fr] gap-2">
                      <span className="text-gray-600 dark:text-gray-400">Factory:</span>
                      <span className="font-mono text-xs break-all">{deployment.factory}</span>
                    </div>
                    <div className="grid grid-cols-[120px_1fr] gap-2">
                      <span className="text-gray-600 dark:text-gray-400">USDC:</span>
                      <span className="font-mono text-xs break-all">{deployment.usdc}</span>
                    </div>
                    <div className="grid grid-cols-[120px_1fr] gap-2">
                      <span className="text-gray-600 dark:text-gray-400">Test Token:</span>
                      <span className="font-mono text-xs break-all">{deployment.testToken}</span>
                    </div>
                    <div className="grid grid-cols-[120px_1fr] gap-2">
                      <span className="text-gray-600 dark:text-gray-400">Test Vault:</span>
                      <span className="font-mono text-xs break-all">{deployment.testVault}</span>
                    </div>
                  </div>
                )}

                {deployment.status === 'error' && (
                  <div className="text-red-600 dark:text-red-400">
                    {deployment.error || 'Deployment failed'}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Info */}
      <div className="mt-8 gradient-card rounded-xl border border-gray-200 dark:border-gray-800 p-6">
        <h3 className="font-semibold mb-3">What Gets Deployed</h3>
        <div className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
          <div className="flex items-start">
            <span className="text-arc-blue mr-2">•</span>
            <span><strong>VaultFactory:</strong> Factory contract for creating liquidity vaults</span>
          </div>
          <div className="flex items-start">
            <span className="text-arc-blue mr-2">•</span>
            <span><strong>USDC:</strong> Uses existing USDC or deploys mock (Arc only)</span>
          </div>
          <div className="flex items-start">
            <span className="text-arc-blue mr-2">•</span>
            <span><strong>Test Token:</strong> Sample project token for demonstration</span>
          </div>
          <div className="flex items-start">
            <span className="text-arc-blue mr-2">•</span>
            <span><strong>Test Vault:</strong> Sample liquidity vault for the test token</span>
          </div>
        </div>
      </div>

      {/* CLI Alternative */}
      <div className="mt-6 bg-gray-50 dark:bg-gray-900 rounded-lg p-4 border border-gray-200 dark:border-gray-800">
        <h4 className="font-semibold mb-2">Deploy via CLI</h4>
        <div className="space-y-2 text-sm">
          <code className="block bg-white dark:bg-gray-800 p-2 rounded">
            npm run deploy
          </code>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            ⚠️ After deployment, restart the frontend dev server to load new environment variables:
          </p>
          <code className="block bg-white dark:bg-gray-800 p-2 rounded">
            # Stop frontend (Ctrl+C), then restart:<br/>
            cd frontend && npm run dev
          </code>
        </div>
      </div>
    </div>
  )
}

