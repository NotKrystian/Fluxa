'use client'

import { useState, useEffect } from 'react'
import { Rocket, CheckCircle2, AlertCircle, Loader2, Wallet, Coins, CheckCircle, XCircle, Globe } from 'lucide-react'
import { apiClient } from '@/utils/api'
import { useAccount, useWalletClient } from 'wagmi'
import { parseUnits, formatUnits } from 'ethers'
import { DevModeOnly } from '@/components/DevModeOnly'
import { useSettings } from '@/contexts/SettingsContext'

interface Chain {
  key: string
  name: string
  chainId: number
  explorer: string
}

interface DeploymentResult {
  chain: string
  status: 'pending' | 'deploying' | 'success' | 'error'
  contracts?: {
    projectToken?: string
    vaultFactory?: string
    vault?: string
    ammFactory?: string
    router?: string
  }
  error?: string
}

export default function DeployPage() {
  const { address, isConnected } = useAccount()
  const { data: walletClient } = useWalletClient()
  
  const [availableChains, setAvailableChains] = useState<Chain[]>([])
  const [selectedChains, setSelectedChains] = useState<string[]>(['arc'])
  const [deploying, setDeploying] = useState(false)
  const [deployments, setDeployments] = useState<Record<string, DeploymentResult>>({})
  const [mounted, setMounted] = useState(false)
  const { devMode } = useSettings()
  
  // Form inputs
  const [tokenAddress, setTokenAddress] = useState('')
  const [tokenAmount, setTokenAmount] = useState('1000') // Human-readable
  const [usdcAmount, setUsdcAmount] = useState('1000') // Human-readable
  const [useWallet, setUseWallet] = useState(true)
  const [privateKey, setPrivateKey] = useState('')
  
  // Gas estimation state
  const [gasEstimates, setGasEstimates] = useState<Record<string, any>>({})
  const [checkingGas, setCheckingGas] = useState(false)
  
  // Gateway distribution state
  const [gatewaySourceChain, setGatewaySourceChain] = useState<string>('arc')
  const [gatewayTokenAddress, setGatewayTokenAddress] = useState<string>('')
  const [gatewayTokenAmount, setGatewayTokenAmount] = useState<string>('1000')
  const [gatewayDestinationChains, setGatewayDestinationChains] = useState<string[]>([])
  const [distributingGateway, setDistributingGateway] = useState(false)
  const [gatewayResult, setGatewayResult] = useState<any>(null)

  // Handle client-side only rendering to avoid hydration mismatch
  // This ensures server and client render the same initial content
  useEffect(() => {
    setMounted(true)
  }, [])
  
  // Only show wallet connection state after mount to avoid hydration issues
  const showWalletInfo = mounted && isConnected && address

  // Load available chains
  useEffect(() => {
    const loadChains = async () => {
      try {
        const chains = await apiClient.getAvailableChains()
        setAvailableChains(chains)
        // Default to Arc if available
        if (chains.find(c => c.key === 'arc')) {
          setSelectedChains(['arc'])
        }
      } catch (error) {
        console.error('Error loading chains:', error)
      }
    }
    loadChains()
  }, [])

  // Estimate gas costs when chains or private key changes
  useEffect(() => {
    // Prevent running during initial render
    if (!mounted) return
    
    const estimateGasCosts = async () => {
      if (selectedChains.length === 0 || !privateKey || privateKey.trim().length === 0) {
        setGasEstimates({})
        return
      }

      setCheckingGas(true)
      try {
        const estimates = await apiClient.estimateGasCosts({
          selectedChains,
          privateKey
        })
        setGasEstimates(estimates)
      } catch (error: any) {
        console.error('Error estimating gas:', error)
        setGasEstimates({})
      } finally {
        setCheckingGas(false)
      }
    }

    // Use setTimeout to ensure this runs after render
    const timeoutId = setTimeout(() => {
      estimateGasCosts()
    }, 0)

    return () => clearTimeout(timeoutId)
  }, [selectedChains, privateKey, mounted])

  const toggleChain = (chainKey: string) => {
    if (selectedChains.includes(chainKey)) {
      setSelectedChains(selectedChains.filter(key => key !== chainKey))
    } else {
      setSelectedChains([...selectedChains, chainKey])
    }
  }

  const getPrivateKeyFromWallet = async (): Promise<string> => {
    if (!walletClient || !address) {
      throw new Error('Wallet not connected')
    }
    
    // Note: In production, you should use a more secure method
    // This is a simplified approach - the private key should come from the user's wallet
    // For now, we'll require manual input or use a signing approach
    throw new Error('Please enter your private key manually or use wallet signing')
  }

  const startDeployment = async () => {
    if (selectedChains.length === 0) {
      alert('Please select at least one chain')
      return
    }

    if (!tokenAmount || parseFloat(tokenAmount) <= 0) {
      alert('Please enter a valid token amount')
      return
    }

    if (!usdcAmount || parseFloat(usdcAmount) <= 0) {
      alert('Please enter a valid USDC amount')
      return
    }

    if (!address) {
      alert('Please connect your wallet')
      return
    }

    if (!privateKey || privateKey.trim() === '') {
      alert('Please enter your private key. This is required to sign deployment transactions.')
      return
    }

    const deployPrivateKey = privateKey.trim()

    setDeploying(true)
    
    // Initialize deployment results
    const initialResults: Record<string, DeploymentResult> = {}
    selectedChains.forEach(chainKey => {
      initialResults[chainKey] = {
        chain: chainKey,
        status: 'deploying'
      }
    })
    setDeployments(initialResults)

    try {
      // Convert human-readable amounts to wei
      const tokenAmountWei = parseUnits(tokenAmount, 18).toString() // 18 decimals for tokens
      const usdcAmountWei = parseUnits(usdcAmount, 6).toString() // 6 decimals for USDC

      const result = await apiClient.deployContracts({
        selectedChains,
        tokenAddress: tokenAddress || undefined, // Optional - will deploy new token if not provided
        tokenAmount: tokenAmountWei,
        usdcAmount: usdcAmountWei,
        depositor: address,
        recipient: address,
        privateKey: deployPrivateKey
      })

      // Update deployment results
      const updatedResults: Record<string, DeploymentResult> = {}
      selectedChains.forEach(chainKey => {
        const chainResult = result.step1_contracts[chainKey]
        if (chainResult) {
          updatedResults[chainKey] = {
            chain: chainKey,
            status: chainResult.status === 'success' ? 'success' : 'error',
            contracts: chainResult.contracts,
            error: chainResult.error
          }
        } else {
          updatedResults[chainKey] = {
            chain: chainKey,
            status: 'error',
            error: 'No result returned'
          }
        }
      })
      setDeployments(updatedResults)
    } catch (error: any) {
      console.error('Deployment error:', error)
      const errorResults: Record<string, DeploymentResult> = {}
      selectedChains.forEach(chainKey => {
        errorResults[chainKey] = {
          chain: chainKey,
          status: 'error',
          error: error.message || 'Deployment failed'
        }
      })
      setDeployments(errorResults)
      alert(`Deployment failed: ${error.message}`)
    } finally {
      setDeploying(false)
    }
  }

  const handleDistributeGateway = async () => {
    if (!gatewayTokenAddress || !gatewayTokenAmount || gatewayDestinationChains.length === 0) {
      alert('Please fill in token address, amount, and select at least one destination chain')
      return
    }

    if (!privateKey || privateKey.trim().length === 0) {
      alert('Private key is required for Gateway distribution')
      return
    }

    setDistributingGateway(true)
    setGatewayResult(null)

    try {
      // Convert human-readable amount to token's smallest unit (assuming 18 decimals)
      const amountInWei = parseUnits(gatewayTokenAmount, 18).toString()

      const response = await apiClient.distributeGateway({
        sourceChain: gatewaySourceChain,
        tokenAddress: gatewayTokenAddress,
        amount: amountInWei,
        destinationChains: gatewayDestinationChains,
        privateKey
      })

      if (response.success) {
        setGatewayResult(response.data)
      } else {
        alert(`Gateway distribution failed: ${response.error}`)
      }
    } catch (error: any) {
      console.error('Error distributing Gateway tokens:', error)
      alert(`Error: ${error.message || 'Failed to distribute tokens'}`)
    } finally {
      setDistributingGateway(false)
    }
  }

  const toggleDestinationChain = (chainKey: string) => {
    if (gatewayDestinationChains.includes(chainKey)) {
      setGatewayDestinationChains(gatewayDestinationChains.filter(c => c !== chainKey))
    } else {
      setGatewayDestinationChains([...gatewayDestinationChains, chainKey])
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success':
        return <CheckCircle2 className="w-5 h-5 text-green-500" />
      case 'deploying':
        return <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
      case 'error':
        return <AlertCircle className="w-5 h-5 text-red-500" />
      default:
        return <div className="w-5 h-5 rounded-full border-2 border-gray-300" />
    }
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-2">Multi-Chain LP Deployment</h1>
        <p className="text-gray-600 dark:text-gray-400">
          Deploy liquidity pools across multiple chains using Gateway and CCTP
        </p>
      </div>

      {/* Wallet Connection */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border-2 border-gray-200 dark:border-gray-800 p-6 mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Wallet className="w-5 h-5" />
            <div>
              <div className="font-medium">Wallet</div>
              <div className="text-sm text-gray-600 dark:text-gray-400">
                <DevModeOnly 
                  fallback={<span>Not connected</span>}
                >
                  <span>{showWalletInfo ? address : 'Not connected'}</span>
                </DevModeOnly>
              </div>
            </div>
          </div>
          {!isConnected && (
            <div className="text-sm text-yellow-600 dark:text-yellow-400">
              Please connect your wallet to deploy
            </div>
          )}
        </div>
      </div>

      {/* Deployment Configuration */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border-2 border-gray-200 dark:border-gray-800 p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">Deployment Configuration</h2>
        
        <div className="space-y-4">
          {/* Token Address (Optional) - Dev Mode Only */}
          <DevModeOnly>
            <div>
              <label className="block text-sm font-medium mb-2">
                Token Address (Optional)
              </label>
              <input
                type="text"
                value={tokenAddress}
                onChange={(e) => setTokenAddress(e.target.value)}
                placeholder="0x... (leave empty to deploy new token on Arc)"
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800"
                disabled={deploying}
              />
              <p className="text-xs text-gray-500 mt-1">
                If empty, a new FLX token will be deployed on Arc
              </p>
            </div>
          </DevModeOnly>

          {/* Token Amount */}
          <div>
            <label className="block text-sm font-medium mb-2">
              Total Token Amount
            </label>
            <div className="relative">
              <input
                type="number"
                value={tokenAmount}
                onChange={(e) => setTokenAmount(e.target.value)}
                placeholder="1000"
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800"
                disabled={deploying}
              />
              <span className="absolute right-4 top-2.5 text-gray-500">FLX</span>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Total tokens to distribute across all chains
            </p>
          </div>

          {/* USDC Amount */}
          <div>
            <label className="block text-sm font-medium mb-2">
              Total USDC Amount
            </label>
            <div className="relative">
              <input
                type="number"
                value={usdcAmount}
                onChange={(e) => setUsdcAmount(e.target.value)}
                placeholder="1000"
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800"
                disabled={deploying}
              />
              <span className="absolute right-4 top-2.5 text-gray-500">USDC</span>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Total USDC to distribute equally across all chains
            </p>
          </div>

          {/* Private Key - Required for deployment */}
          <div>
            <label className="block text-sm font-medium mb-2">
              Private Key <span className="text-red-500">*</span>
            </label>
            <input
              type="password"
              value={privateKey}
              onChange={(e) => setPrivateKey(e.target.value)}
              placeholder="0x..."
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800"
              disabled={deploying}
            />
            <p className="text-xs text-gray-500 mt-1">
              Private key for signing deployment transactions
              <DevModeOnly>
                <span className="ml-2">(Required - this wallet will deploy contracts and pay gas fees)</span>
              </DevModeOnly>
            </p>
          </div>
        </div>
      </div>

      {/* Gas Estimation */}
      {selectedChains.length > 0 && privateKey && (
        <div className="bg-white dark:bg-gray-900 rounded-xl border-2 border-gray-200 dark:border-gray-800 p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Gas Requirements</h2>
          {checkingGas ? (
            <div className="flex items-center space-x-2 text-gray-600 dark:text-gray-400">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Checking gas requirements...</span>
            </div>
          ) : Object.keys(gasEstimates).length > 0 ? (
            <div className="space-y-3">
              {selectedChains.map(chainKey => {
                const estimate = gasEstimates[chainKey]
                if (!estimate || estimate.error) {
                  return (
                    <div key={chainKey} className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-800">
                      <span className="font-medium capitalize">{chainKey}</span>
                      <span className="text-red-500 text-sm">Error: {estimate?.error || 'Unknown error'}</span>
                    </div>
                  )
                }
                
                const hasEnough = estimate.hasEnough
                return (
                  <div
                    key={chainKey}
                    className={`flex items-center justify-between p-3 rounded-lg border-2 ${
                      hasEnough
                        ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
                        : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
                    }`}
                  >
                    <div className="flex items-center space-x-3">
                      {hasEnough ? (
                        <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
                      ) : (
                        <XCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
                      )}
                      <div>
                        <div className="font-medium capitalize">{estimate.chain}</div>
                        <DevModeOnly>
                          {estimate.walletAddress && (
                            <div className="text-xs text-gray-600 dark:text-gray-400">
                              Wallet: {estimate.walletAddress.slice(0, 6)}...{estimate.walletAddress.slice(-4)}
                            </div>
                          )}
                        </DevModeOnly>
                      </div>
                    </div>
                    <div className="text-right">
                      {devMode ? (
                        <div>
                          <div className={`text-sm font-medium ${hasEnough ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}`}>
                            {hasEnough ? '✓ Sufficient' : '✗ Insufficient'}
                          </div>
                          <div className="text-xs text-gray-600 dark:text-gray-400">
                            Have: {parseFloat(estimate.currentBalance).toFixed(4)} {estimate.nativeCurrency}
                          </div>
                          <div className="text-xs text-gray-600 dark:text-gray-400">
                            Need: ~{parseFloat(estimate.estimatedRequired).toFixed(4)} {estimate.nativeCurrency}
                          </div>
                        </div>
                      ) : (
                        <div className={`text-sm font-medium ${hasEnough ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}`}>
                          {hasEnough ? '✓ Ready' : '✗ Needs Funding'}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
              {Object.values(gasEstimates).some((e: any) => !e.hasEnough) && (
                <div className="mt-3 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                  <p className="text-sm text-yellow-800 dark:text-yellow-200">
                    ⚠️ Some chains have insufficient gas. Please fund the deployment wallet with the native token (USDC for Arc, ETH for Base, MATIC for Polygon) before deploying.
                  </p>
                </div>
              )}
            </div>
          ) : null}
        </div>
      )}

      {/* Chain Selection */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border-2 border-gray-200 dark:border-gray-800 p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">Select Chains</h2>
        <div className="space-y-3">
          {availableChains.map(chain => (
            <label
              key={chain.key}
              className="flex items-center space-x-3 p-3 rounded-lg border-2 border-gray-200 dark:border-gray-800 hover:border-blue-500 transition-colors cursor-pointer"
            >
              <input
                type="checkbox"
                checked={selectedChains.includes(chain.key)}
                onChange={() => toggleChain(chain.key)}
                disabled={deploying}
                className="w-5 h-5 text-blue-500 rounded focus:ring-blue-500"
              />
              <div className="flex-1">
                <div className="font-medium">{chain.name}</div>
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  Chain ID: {chain.chainId}
                </div>
              </div>
              {deployments[chain.key] && (
                <div>
                  {getStatusIcon(deployments[chain.key].status)}
                </div>
              )}
            </label>
          ))}
        </div>
      </div>

      {/* Deploy Button */}
      <button
        onClick={startDeployment}
        disabled={deploying || selectedChains.length === 0 || !isConnected}
        className="w-full bg-gradient-to-r from-blue-500 to-purple-500 text-white py-4 rounded-xl font-semibold text-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
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

      {/* Gateway Distribution Section */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border-2 border-gray-200 dark:border-gray-800 p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4 flex items-center">
          <Globe className="w-5 h-5 mr-2" />
          Gateway Token Distribution
        </h2>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          Wrap your tokens and distribute them to multiple chains using Circle Gateway. 
          Tokens will be deposited on the source chain and minted as wrapped tokens on destination chains.
        </p>

        <div className="space-y-4">
          {/* Source Chain */}
          <div>
            <label className="block text-sm font-medium mb-2">Source Chain</label>
            <select
              value={gatewaySourceChain}
              onChange={(e) => setGatewaySourceChain(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800"
              disabled={distributingGateway}
            >
              {availableChains.map(chain => (
                <option key={chain.key} value={chain.key}>{chain.name}</option>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-1">
              Chain where your tokens are located (you must own the tokens)
            </p>
          </div>

          {/* Token Address */}
          <div>
            <label className="block text-sm font-medium mb-2">Token Address</label>
            <input
              type="text"
              value={gatewayTokenAddress}
              onChange={(e) => setGatewayTokenAddress(e.target.value)}
              placeholder="0x..."
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 font-mono text-sm"
              disabled={distributingGateway}
            />
            <p className="text-xs text-gray-500 mt-1">
              Address of the token you want to wrap and distribute
            </p>
          </div>

          {/* Token Amount */}
          <div>
            <label className="block text-sm font-medium mb-2">Token Amount</label>
            <input
              type="text"
              value={gatewayTokenAmount}
              onChange={(e) => setGatewayTokenAmount(e.target.value)}
              placeholder="1000"
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800"
              disabled={distributingGateway}
            />
            <p className="text-xs text-gray-500 mt-1">
              Total amount to distribute (will be split equally across destination chains)
            </p>
          </div>

          {/* Destination Chains */}
          <div>
            <label className="block text-sm font-medium mb-2">Destination Chains</label>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-48 overflow-y-auto border border-gray-300 dark:border-gray-700 rounded-lg p-3">
              {availableChains
                .filter(chain => chain.key !== gatewaySourceChain)
                .map(chain => (
                  <label
                    key={chain.key}
                    className="flex items-center space-x-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 p-2 rounded"
                  >
                    <input
                      type="checkbox"
                      checked={gatewayDestinationChains.includes(chain.key)}
                      onChange={() => toggleDestinationChain(chain.key)}
                      disabled={distributingGateway}
                      className="w-4 h-4"
                    />
                    <span className="text-sm">{chain.name}</span>
                  </label>
                ))}
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Select chains where wrapped tokens should be minted
            </p>
          </div>

          {/* Private Key Note */}
          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3">
            <p className="text-xs text-yellow-800 dark:text-yellow-200">
              ⚠️ Make sure the private key corresponds to the wallet that owns the tokens on the source chain.
              The wallet must have enough tokens and gas for the deposit transaction.
            </p>
          </div>

          {/* Distribute Button */}
          <button
            onClick={handleDistributeGateway}
            disabled={distributingGateway || !gatewayTokenAddress || !gatewayTokenAmount || gatewayDestinationChains.length === 0 || !privateKey}
            className="w-full bg-gradient-to-r from-green-500 to-emerald-500 text-white py-3 rounded-xl font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
          >
            {distributingGateway ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Distributing Tokens...</span>
              </>
            ) : (
              <>
                <Globe className="w-5 h-5" />
                <span>Distribute via Gateway</span>
              </>
            )}
          </button>
        </div>

        {/* Gateway Results */}
        {gatewayResult && (
          <div className="mt-6 bg-green-50 dark:bg-green-900/20 border-2 border-green-200 dark:border-green-800 rounded-xl p-6">
            <div className="flex items-start space-x-3 mb-4">
              <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold text-green-800 dark:text-green-200">Gateway Distribution Complete!</h3>
              </div>
            </div>

            <div className="space-y-3 text-sm">
              <div>
                <div className="font-medium text-gray-700 dark:text-gray-300 mb-1">Source Chain:</div>
                <div className="text-gray-600 dark:text-gray-400">{gatewayResult.sourceChain}</div>
              </div>

              <div>
                <div className="font-medium text-gray-700 dark:text-gray-300 mb-1">Token Address:</div>
                <div className="text-gray-600 dark:text-gray-400 font-mono text-xs break-all">{gatewayResult.tokenAddress}</div>
              </div>

              <div>
                <div className="font-medium text-gray-700 dark:text-gray-300 mb-1">Total Amount:</div>
                <div className="text-gray-600 dark:text-gray-400">{formatUnits(gatewayResult.amount, 18)} tokens</div>
              </div>

              <div>
                <div className="font-medium text-gray-700 dark:text-gray-300 mb-1">Amount per Chain:</div>
                <div className="text-gray-600 dark:text-gray-400">{formatUnits(gatewayResult.amountPerChain, 18)} tokens</div>
              </div>

              {gatewayResult.deposit && (
                <div>
                  <div className="font-medium text-gray-700 dark:text-gray-300 mb-1">Deposit:</div>
                  <div className="text-gray-600 dark:text-gray-400">
                    {gatewayResult.deposit.txHash ? (
                      <span className="font-mono text-xs">TX: {gatewayResult.deposit.txHash}</span>
                    ) : (
                      <span>ID: {gatewayResult.deposit.id}</span>
                    )}
                  </div>
                </div>
              )}

              {Object.keys(gatewayResult.withdrawals || {}).length > 0 && (
                <div>
                  <div className="font-medium text-gray-700 dark:text-gray-300 mb-2">Successful Withdrawals:</div>
                  <div className="space-y-1">
                    {Object.entries(gatewayResult.withdrawals).map(([chain, withdrawal]: [string, any]) => (
                      <div key={chain} className="text-gray-600 dark:text-gray-400 text-xs">
                        <span className="font-medium">{chain}:</span>{' '}
                        {withdrawal.txHash ? (
                          <span className="font-mono">TX: {withdrawal.txHash}</span>
                        ) : (
                          <span>ID: {withdrawal.id}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {Object.keys(gatewayResult.errors || {}).length > 0 && (
                <div>
                  <div className="font-medium text-red-700 dark:text-red-300 mb-2">Errors:</div>
                  <div className="space-y-1">
                    {Object.entries(gatewayResult.errors).map(([chain, error]: [string, any]) => (
                      <div key={chain} className="text-red-600 dark:text-red-400 text-xs">
                        <span className="font-medium">{chain}:</span> {error}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Deployment Results */}
      {Object.keys(deployments).length > 0 && (
        <div className="mt-8 space-y-4">
          <h2 className="text-2xl font-semibold">Deployment Results</h2>
          
          {Object.entries(deployments).map(([chainKey, deployment]) => {
            const chain = availableChains.find(c => c.key === chainKey)
            if (!chain) return null

            return (
              <div
                key={chainKey}
                className="bg-white dark:bg-gray-900 rounded-xl border-2 border-gray-200 dark:border-gray-800 p-6"
              >
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold">{chain.name}</h3>
                  {getStatusIcon(deployment.status)}
                </div>

                {deployment.status === 'deploying' && (
                  <div className="text-gray-600 dark:text-gray-400">
                    Deploying contracts... This may take a few minutes.
                  </div>
                )}

                {deployment.status === 'success' && deployment.contracts && (
                  <div className="space-y-2 text-sm">
                    <DevModeOnly>
                      {deployment.contracts.projectToken && (
                        <div className="grid grid-cols-[140px_1fr] gap-2">
                          <span className="text-gray-600 dark:text-gray-400">Token:</span>
                          <a
                            href={`${chain.explorer}/address/${deployment.contracts.projectToken}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-mono text-xs break-all text-blue-500 hover:underline"
                          >
                            {deployment.contracts.projectToken}
                          </a>
                        </div>
                      )}
                      {deployment.contracts.router && (
                        <div className="grid grid-cols-[140px_1fr] gap-2">
                          <span className="text-gray-600 dark:text-gray-400">Router:</span>
                          <a
                            href={`${chain.explorer}/address/${deployment.contracts.router}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-mono text-xs break-all text-blue-500 hover:underline"
                          >
                            {deployment.contracts.router}
                          </a>
                        </div>
                      )}
                    </DevModeOnly>
                    {(!deployment.contracts.projectToken && !deployment.contracts.vaultFactory && !deployment.contracts.ammFactory && !deployment.contracts.router) && (
                      <div className="text-green-600 dark:text-green-400">
                        ✓ Contracts deployed successfully
                      </div>
                    )}
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
      <div className="mt-8 bg-gradient-to-r from-blue-50 to-purple-50 dark:from-gray-800 dark:to-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
        <h3 className="font-semibold mb-3">What the Deploy Tab Does</h3>
        <div className="space-y-3 text-sm text-gray-600 dark:text-gray-400">
          <p>
            The deploy tab deploys the core smart contracts needed for multi-chain routing:
          </p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li><strong>ArcMetaRouter</strong> - Handles cross-chain routing and swaps</li>
            <li><strong>MockERC20 (FLX Token)</strong> - Only deployed on Arc if no token address is provided</li>
          </ul>
          <p className="mt-3">
            <strong>Note:</strong> VaultFactory and ArcAMMFactory are assumed to be already deployed on each chain. 
            The deploy function only deploys the router and optionally a token.
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-500 mt-2">
            Future steps (not yet implemented): Gateway distribution, CCTP USDC distribution, and LP pool formation.
          </p>
        </div>
      </div>
    </div>
  )
}
