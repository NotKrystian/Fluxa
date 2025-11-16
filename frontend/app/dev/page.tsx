'use client'

import { useState, useEffect } from 'react'
import { Database, Plus, Loader2, CheckCircle2, AlertCircle, Key, ExternalLink, Factory } from 'lucide-react'
import { apiClient } from '@/utils/api'

interface Chain {
  key: string
  name: string
  chainId: number
  explorer: string
}

interface VaultCreationResult {
  chain: string
  deployerAddress: string
  token?: {
    address: string
    name?: string
    symbol?: string
    deployed: boolean
  }
  vault?: {
    address: string
    name: string
    symbol: string
    transactionHash: string
  }
}

export default function DevPage() {
  const [availableChains, setAvailableChains] = useState<Chain[]>([])
  const [selectedChain, setSelectedChain] = useState<string>('arc')
  const [privateKey, setPrivateKey] = useState('')
  const [activeTab, setActiveTab] = useState<'factory' | 'vault'>('factory')
  const [factoryType, setFactoryType] = useState<'vault' | 'amm'>('vault')
  
  // Token options
  const [useExistingToken, setUseExistingToken] = useState(false)
  const [tokenAddress, setTokenAddress] = useState('')
  const [tokenName, setTokenName] = useState('My Token')
  const [tokenSymbol, setTokenSymbol] = useState('TOKEN')
  
  // Vault options
  const [vaultName, setVaultName] = useState('Vault Shares')
  const [vaultSymbol, setVaultSymbol] = useState('vTOKEN')
  
  // State
  const [deployingFactory, setDeployingFactory] = useState(false)
  const [creating, setCreating] = useState(false)
  const [factoryResult, setFactoryResult] = useState<any>(null)
  const [result, setResult] = useState<VaultCreationResult | null>(null)
  const [error, setError] = useState('')

  // Load available chains
  useEffect(() => {
    const loadChains = async () => {
      try {
        const chains = await apiClient.getAvailableChains()
        setAvailableChains(chains)
        if (chains.length > 0 && !selectedChain) {
          setSelectedChain(chains[0].key)
        }
      } catch (error) {
        console.error('Error loading chains:', error)
      }
    }
    loadChains()
  }, [])

  // Auto-generate vault name/symbol from token
  useEffect(() => {
    if (!useExistingToken && tokenSymbol) {
      setVaultName(`${tokenSymbol} Vault Shares`)
      setVaultSymbol(`v${tokenSymbol}`)
    }
  }, [tokenSymbol, useExistingToken])

  const handleDeployFactory = async () => {
    if (!privateKey || privateKey.trim().length === 0) {
      setError('Private key is required')
      return
    }

    setDeployingFactory(true)
    setError('')
    setFactoryResult(null)

    try {
      const response = await apiClient.deployFactory({
        chain: selectedChain,
        factoryType: factoryType,
        privateKey
      })

      if (response.success) {
        setFactoryResult(response.data)
      } else {
        setError(response.error || 'Failed to deploy VaultFactory')
      }
    } catch (err: any) {
      console.error('Error deploying factory:', err)
      setError(err.response?.data?.error || err.message || 'Failed to deploy VaultFactory')
    } finally {
      setDeployingFactory(false)
    }
  }

  const handleCreateVault = async () => {
    if (!privateKey || privateKey.trim().length === 0) {
      setError('Private key is required')
      return
    }

    if (!vaultName || !vaultSymbol) {
      setError('Vault name and symbol are required')
      return
    }

    if (useExistingToken && !tokenAddress) {
      setError('Token address is required when using existing token')
      return
    }

    if (!useExistingToken && (!tokenName || !tokenSymbol)) {
      setError('Token name and symbol are required when deploying new token')
      return
    }

    setCreating(true)
    setError('')
    setResult(null)

    try {
      const response = await apiClient.createVault({
        chain: selectedChain,
        tokenAddress: useExistingToken ? tokenAddress : undefined,
        tokenName: useExistingToken ? undefined : tokenName,
        tokenSymbol: useExistingToken ? undefined : tokenSymbol,
        vaultName,
        vaultSymbol,
        privateKey
      })

      if (response.success) {
        setResult(response.data)
      } else {
        setError(response.error || 'Failed to create vault')
      }
    } catch (err: any) {
      console.error('Error creating vault:', err)
      setError(err.response?.data?.error || err.message || 'Failed to create vault')
    } finally {
      setCreating(false)
    }
  }

  const selectedChainInfo = availableChains.find(c => c.key === selectedChain)

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-2">Dev Tools</h1>
        <p className="text-gray-600 dark:text-gray-400">
          Deploy VaultFactory and create liquidity vaults for tokens on any chain
        </p>
      </div>

      {/* Tab Selector */}
      <div className="mb-6 flex space-x-4 border-b border-gray-200 dark:border-gray-700">
        <button
          onClick={() => setActiveTab('factory')}
          className={`px-4 py-2 font-medium transition-colors ${
            activeTab === 'factory'
              ? 'border-b-2 border-blue-500 text-blue-600 dark:text-blue-400'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
          }`}
        >
          <Factory className="w-4 h-4 inline mr-2" />
          Deploy VaultFactory
        </button>
        <button
          onClick={() => setActiveTab('vault')}
          className={`px-4 py-2 font-medium transition-colors ${
            activeTab === 'vault'
              ? 'border-b-2 border-blue-500 text-blue-600 dark:text-blue-400'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
          }`}
        >
          <Database className="w-4 h-4 inline mr-2" />
          Create Vault
        </button>
      </div>

      {/* Chain Selection */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border-2 border-gray-200 dark:border-gray-800 p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">Select Chain</h2>
        <select
          value={selectedChain}
          onChange={(e) => setSelectedChain(e.target.value)}
          className="w-full px-4 py-2 bg-white dark:bg-gray-800 rounded-lg border-2 border-gray-200 dark:border-gray-700"
        >
          {availableChains.map(chain => (
            <option key={chain.key} value={chain.key}>{chain.name}</option>
          ))}
        </select>
      </div>

      {/* Private Key */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border-2 border-gray-200 dark:border-gray-800 p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4 flex items-center">
          <Key className="w-5 h-5 mr-2" />
          Private Key
        </h2>
        <input
          type="password"
          value={privateKey}
          onChange={(e) => setPrivateKey(e.target.value)}
          placeholder="0x..."
          className="w-full px-4 py-2 bg-white dark:bg-gray-800 rounded-lg border-2 border-gray-200 dark:border-gray-700 font-mono text-sm"
        />
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
          Private key will be used to sign transactions. Make sure the wallet has enough gas tokens.
        </p>
      </div>

      {/* Factory Deployment Tab */}
      {activeTab === 'factory' && (
        <>
          <div className="bg-white dark:bg-gray-900 rounded-xl border-2 border-gray-200 dark:border-gray-800 p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4">Deploy Factory</h2>
            
            <div className="mb-4">
              <label className="block text-sm font-medium mb-2">Factory Type</label>
              <div className="flex space-x-4">
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="radio"
                    value="vault"
                    checked={factoryType === 'vault'}
                    onChange={(e) => setFactoryType(e.target.value as 'vault' | 'amm')}
                    className="w-4 h-4"
                  />
                  <span>VaultFactory</span>
                </label>
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="radio"
                    value="amm"
                    checked={factoryType === 'amm'}
                    onChange={(e) => setFactoryType(e.target.value as 'vault' | 'amm')}
                    className="w-4 h-4"
                  />
                  <span>ArcAMMFactory</span>
                </label>
              </div>
            </div>

            {factoryType === 'vault' ? (
              <>
                <p className="text-gray-600 dark:text-gray-400 mb-4">
                  Deploy a new VaultFactory contract on {selectedChainInfo?.name}. This factory will be used to create vaults for tokens.
                </p>
                <p className="text-sm text-yellow-600 dark:text-yellow-400 mb-4">
                  ⚠️ Make sure to save the VaultFactory address after deployment and set it as {`${selectedChain.toUpperCase().replace(/-/g, '_')}_VAULT_FACTORY`} in your .env file.
                </p>
              </>
            ) : (
              <>
                <p className="text-gray-600 dark:text-gray-400 mb-4">
                  Deploy a new ArcAMMFactory contract on {selectedChainInfo?.name}. This factory will be used to create AMM pools for token pairs.
                </p>
                <p className="text-sm text-yellow-600 dark:text-yellow-400 mb-4">
                  ⚠️ Make sure to save the ArcAMMFactory address after deployment and set it as {`${selectedChain.toUpperCase().replace(/-/g, '_')}_AMM_FACTORY`} in your .env file.
                </p>
              </>
            )}
          </div>

          <button
            onClick={handleDeployFactory}
            disabled={deployingFactory || !privateKey}
            className="w-full bg-gradient-to-r from-purple-500 to-pink-500 text-white py-4 rounded-xl font-semibold text-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
          >
            {deployingFactory ? (
              <>
                <Loader2 className="w-6 h-6 animate-spin" />
                <span>Deploying {factoryType === 'vault' ? 'VaultFactory' : 'ArcAMMFactory'}...</span>
              </>
            ) : (
              <>
                <Factory className="w-6 h-6" />
                <span>Deploy {factoryType === 'vault' ? 'VaultFactory' : 'ArcAMMFactory'}</span>
              </>
            )}
          </button>
        </>
      )}

      {/* Vault Creation Tab */}
      {activeTab === 'vault' && (
        <>
          {/* Token Configuration */}
          <div className="bg-white dark:bg-gray-900 rounded-xl border-2 border-gray-200 dark:border-gray-800 p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4">Token Configuration</h2>
            
            <div className="mb-4">
              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={useExistingToken}
                  onChange={(e) => setUseExistingToken(e.target.checked)}
                  className="w-5 h-5"
                />
                <span>Use existing token address</span>
              </label>
            </div>

            {useExistingToken ? (
              <div>
                <label className="block text-sm font-medium mb-2">Token Address</label>
                <input
                  type="text"
                  value={tokenAddress}
                  onChange={(e) => setTokenAddress(e.target.value)}
                  placeholder="0x..."
                  className="w-full px-4 py-2 bg-white dark:bg-gray-800 rounded-lg border-2 border-gray-200 dark:border-gray-700 font-mono text-sm"
                />
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Token Name</label>
                  <input
                    type="text"
                    value={tokenName}
                    onChange={(e) => setTokenName(e.target.value)}
                    placeholder="My Token"
                    className="w-full px-4 py-2 bg-white dark:bg-gray-800 rounded-lg border-2 border-gray-200 dark:border-gray-700"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Token Symbol</label>
                  <input
                    type="text"
                    value={tokenSymbol}
                    onChange={(e) => setTokenSymbol(e.target.value)}
                    placeholder="TOKEN"
                    className="w-full px-4 py-2 bg-white dark:bg-gray-800 rounded-lg border-2 border-gray-200 dark:border-gray-700"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Vault Configuration */}
          <div className="bg-white dark:bg-gray-900 rounded-xl border-2 border-gray-200 dark:border-gray-800 p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4">Vault Configuration</h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Vault Shares Name</label>
                <input
                  type="text"
                  value={vaultName}
                  onChange={(e) => setVaultName(e.target.value)}
                  placeholder="Vault Shares"
                  className="w-full px-4 py-2 bg-white dark:bg-gray-800 rounded-lg border-2 border-gray-200 dark:border-gray-700"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Vault Shares Symbol</label>
                <input
                  type="text"
                  value={vaultSymbol}
                  onChange={(e) => setVaultSymbol(e.target.value)}
                  placeholder="vTOKEN"
                  className="w-full px-4 py-2 bg-white dark:bg-gray-800 rounded-lg border-2 border-gray-200 dark:border-gray-700"
                />
              </div>
            </div>
          </div>

          {/* Create Button */}
          <button
            onClick={handleCreateVault}
            disabled={creating || !privateKey || !vaultName || !vaultSymbol}
            className="w-full bg-gradient-to-r from-blue-500 to-purple-500 text-white py-4 rounded-xl font-semibold text-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
          >
            {creating ? (
              <>
                <Loader2 className="w-6 h-6 animate-spin" />
                <span>Creating Vault...</span>
              </>
            ) : (
              <>
                <Plus className="w-6 h-6" />
                <span>Create Vault</span>
              </>
            )}
          </button>
        </>
      )}

      {/* Error Display */}
      {error && (
        <div className="mt-6 bg-red-50 dark:bg-red-900/20 border-2 border-red-200 dark:border-red-800 rounded-xl p-6">
          <div className="flex items-start space-x-3">
            <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-red-800 dark:text-red-200">Error</h3>
              <p className="text-sm text-red-700 dark:text-red-300 mt-1">{error}</p>
            </div>
          </div>
        </div>
      )}

      {/* Factory Deployment Success */}
      {factoryResult && (
        <div className="mt-6 bg-green-50 dark:bg-green-900/20 border-2 border-green-200 dark:border-green-800 rounded-xl p-6">
          <div className="flex items-start space-x-3 mb-4">
            <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-green-800 dark:text-green-200">
                {factoryResult.factoryType === 'vault' ? 'VaultFactory' : 'ArcAMMFactory'} Deployed Successfully!
              </h3>
            </div>
          </div>

          <div className="space-y-4 text-sm">
            <div>
              <div className="font-medium text-gray-700 dark:text-gray-300 mb-2">Chain:</div>
              <div className="text-gray-600 dark:text-gray-400">{factoryResult.chain}</div>
            </div>

            <div>
              <div className="font-medium text-gray-700 dark:text-gray-300 mb-2">
                {factoryResult.factoryType === 'vault' ? 'VaultFactory' : 'ArcAMMFactory'} Address:
              </div>
              <div className="text-gray-600 dark:text-gray-400 font-mono break-all mb-2">
                {factoryResult.factoryAddress}
              </div>
              {factoryResult.explorer && (
                <a
                  href={`${factoryResult.explorer}/address/${factoryResult.factoryAddress}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-500 hover:underline inline-flex items-center space-x-1"
                >
                  <span>View on Explorer</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>

            <div>
              <div className="font-medium text-gray-700 dark:text-gray-300 mb-2">Deployer Address:</div>
              <div className="text-gray-600 dark:text-gray-400 font-mono">{factoryResult.deployerAddress}</div>
            </div>

            {factoryResult.usdcAddress && (
              <div>
                <div className="font-medium text-gray-700 dark:text-gray-300 mb-2">USDC Address:</div>
                <div className="text-gray-600 dark:text-gray-400 font-mono">{factoryResult.usdcAddress}</div>
              </div>
            )}

            <div className="mt-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
              <p className="text-sm text-yellow-800 dark:text-yellow-200 font-semibold mb-1">
                ⚠️ Important: Save this address!
              </p>
              <p className="text-xs text-yellow-700 dark:text-yellow-300">
                Add to your <code className="bg-yellow-100 dark:bg-yellow-800 px-1 rounded">.env</code> file:
              </p>
              <code className="block bg-yellow-100 dark:bg-yellow-800 p-2 rounded text-xs mt-2 font-mono">
                {selectedChain.toUpperCase().replace(/-/g, '_')}_{factoryResult.factoryType === 'vault' ? 'VAULT' : 'AMM'}_FACTORY={factoryResult.factoryAddress}
              </code>
            </div>
          </div>
        </div>
      )}

      {/* Success Display */}
      {result && (
        <div className="mt-6 bg-green-50 dark:bg-green-900/20 border-2 border-green-200 dark:border-green-800 rounded-xl p-6">
          <div className="flex items-start space-x-3 mb-4">
            <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-green-800 dark:text-green-200">Vault Created Successfully!</h3>
            </div>
          </div>

          <div className="space-y-4 text-sm">
            <div>
              <div className="font-medium text-gray-700 dark:text-gray-300 mb-2">Chain:</div>
              <div className="text-gray-600 dark:text-gray-400">{result.chain}</div>
            </div>

            <div>
              <div className="font-medium text-gray-700 dark:text-gray-300 mb-2">Deployer Address:</div>
              <div className="text-gray-600 dark:text-gray-400 font-mono">{result.deployerAddress}</div>
            </div>

            {result.token && (
              <div>
                <div className="font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Token {result.token.deployed ? '(Deployed)' : '(Existing)'}:
                </div>
                <div className="space-y-1">
                  <div className="text-gray-600 dark:text-gray-400 font-mono break-all">
                    {result.token.address}
                  </div>
                  {result.token.name && (
                    <div className="text-gray-600 dark:text-gray-400">
                      {result.token.name} ({result.token.symbol})
                    </div>
                  )}
                  {selectedChainInfo && (
                    <a
                      href={`${selectedChainInfo.explorer}/address/${result.token.address}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-500 hover:underline inline-flex items-center space-x-1"
                    >
                      <span>View on Explorer</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              </div>
            )}

            {result.vault && (
              <div>
                <div className="font-medium text-gray-700 dark:text-gray-300 mb-2">Vault:</div>
                <div className="space-y-1">
                  <div className="text-gray-600 dark:text-gray-400 font-mono break-all">
                    {result.vault.address}
                  </div>
                  <div className="text-gray-600 dark:text-gray-400">
                    {result.vault.name} ({result.vault.symbol})
                  </div>
                  {selectedChainInfo && (
                    <div className="space-y-1">
                      <a
                        href={`${selectedChainInfo.explorer}/address/${result.vault.address}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-500 hover:underline inline-flex items-center space-x-1"
                      >
                        <span>View Vault on Explorer</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                      <div className="text-xs text-gray-500 dark:text-gray-500">
                        <a
                          href={`${selectedChainInfo.explorer}/tx/${result.vault.transactionHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-500 hover:underline inline-flex items-center space-x-1"
                        >
                          <span>View Transaction</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Info */}
      <div className="mt-8 bg-gradient-to-r from-blue-50 to-purple-50 dark:from-gray-800 dark:to-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
        <h3 className="font-semibold mb-3">How It Works</h3>
        <div className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
          <p>
            This tool allows you to create liquidity vaults for tokens on any supported chain:
          </p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>Optionally deploy a new ERC20 token (if token address is not provided)</li>
            <li>Create a vault using the VaultFactory on the selected chain</li>
            <li>Vault will be automatically registered in the VaultFactory</li>
          </ul>
          <p className="mt-3">
            <strong>Requirements:</strong>
          </p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>VaultFactory must be deployed on the selected chain</li>
            <li>Private key wallet must have enough gas tokens (USDC for Arc, ETH for others)</li>
            <li>If using existing token, the token must be a valid ERC20 contract</li>
          </ul>
        </div>
      </div>
    </div>
  )
}

