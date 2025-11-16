'use client'

import { useState, useEffect } from 'react'
import { ethers } from 'ethers'
import { Plus, Minus, RefreshCw, Wallet, CheckCircle2, XCircle, Database } from 'lucide-react'
import { depositToVault, withdrawFromVault, getVaultInfo, getUserVaults } from '@/utils/vaults'
import { getSigner, getTokenBalance, formatTokenAmount, parseTokenAmount } from '@/utils/contracts'

const CHAINS = [
  { id: 'arc', name: 'Arc Testnet', chainId: 5042002, rpc: process.env.NEXT_PUBLIC_ARC_RPC_URL || 'https://rpc.testnet.arc.network', nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 }, explorer: 'https://testnet.arcscan.net' },
  { id: 'base', name: 'Base Sepolia', chainId: 84532, rpc: process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org', nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 }, explorer: 'https://sepolia.basescan.org' },
  { id: 'polygon-amoy', name: 'Polygon Amoy', chainId: 80002, rpc: process.env.NEXT_PUBLIC_POLYGON_AMOY_RPC_URL || 'https://rpc-amoy.polygon.technology', nativeCurrency: { name: 'MATIC', symbol: 'MATIC', decimals: 18 }, explorer: 'https://amoy.polygonscan.com' },
  { id: 'arbitrum-sepolia', name: 'Arbitrum Sepolia', chainId: 421614, rpc: process.env.NEXT_PUBLIC_ARBITRUM_SEPOLIA_RPC_URL || 'https://sepolia-rollup.arbitrum.io/rpc', nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 }, explorer: 'https://sepolia.arbiscan.io' },
  { id: 'avalanche-fuji', name: 'Avalanche Fuji', chainId: 43113, rpc: process.env.NEXT_PUBLIC_AVALANCHE_FUJI_RPC_URL || 'https://api.avax-test.network/ext/bc/C/rpc', nativeCurrency: { name: 'AVAX', symbol: 'AVAX', decimals: 18 }, explorer: 'https://testnet.snowtrace.io' },
  { id: 'optimism-sepolia', name: 'Optimism Sepolia', chainId: 11155420, rpc: process.env.NEXT_PUBLIC_OPTIMISM_SEPOLIA_RPC_URL || 'https://sepolia.optimism.io', nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 }, explorer: 'https://sepolia-optimistic.etherscan.io' },
  { id: 'codex-testnet', name: 'Codex Testnet', chainId: 812242, rpc: process.env.NEXT_PUBLIC_CODEX_TESTNET_RPC_URL || 'https://812242.rpc.thirdweb.com', nativeCurrency: { name: 'CDX', symbol: 'CDX', decimals: 18 }, explorer: 'https://explorer.codex-stg.xyz' },
  { id: 'unichain-sepolia', name: 'Unichain Sepolia', chainId: 1301, rpc: process.env.NEXT_PUBLIC_UNICHAIN_SEPOLIA_RPC_URL || 'https://sepolia.unichain.io', nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 }, explorer: '' }
];

export default function VaultsPage() {
  const [selectedChain, setSelectedChain] = useState('arc')
  const [connected, setConnected] = useState(false)
  const [userAddress, setUserAddress] = useState('')
  const [currentChainId, setCurrentChainId] = useState<number | null>(null)
  
  const [vaultAddress, setVaultAddress] = useState('')
  const [selectedVault, setSelectedVault] = useState<string | null>(null)
  const [vaultInfo, setVaultInfo] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [loadingVaults, setLoadingVaults] = useState(false)
  const [userVaults, setUserVaults] = useState<Array<{ vault: string; projectToken: string; tokenBalance: string; tokenSymbol: string; tokenName: string }>>([])
  
  const [depositTokenAmount, setDepositTokenAmount] = useState('')
  const [depositUsdcAmount, setDepositUsdcAmount] = useState('')
  const [withdrawShares, setWithdrawShares] = useState('')
  
  const [depositing, setDepositing] = useState(false)
  const [withdrawing, setWithdrawing] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')

  // Token balances
  const [flxBalance, setFlxBalance] = useState('0')
  const [usdcBalance, setUsdcBalance] = useState('0')

  // Get VaultFactory address from env based on selected chain
  const getVaultFactoryAddress = (chainId: string): string => {
    // Direct access to process.env (Next.js requirement)
    if (chainId === 'arc') {
      return process.env.NEXT_PUBLIC_ARC_VAULT_FACTORY || '';
    } else if (chainId === 'base' || chainId === 'base-sepolia') {
      return process.env.NEXT_PUBLIC_BASE_VAULT_FACTORY || process.env.NEXT_PUBLIC_BASE_SEPOLIA_VAULT_FACTORY || '';
    } else if (chainId === 'polygon-amoy') {
      return process.env.NEXT_PUBLIC_POLYGON_AMOY_VAULT_FACTORY || '';
    } else if (chainId === 'arbitrum-sepolia') {
      return process.env.NEXT_PUBLIC_ARBITRUM_SEPOLIA_VAULT_FACTORY || '';
    } else if (chainId === 'avalanche-fuji') {
      return process.env.NEXT_PUBLIC_AVALANCHE_FUJI_VAULT_FACTORY || '';
    } else if (chainId === 'optimism-sepolia') {
      return process.env.NEXT_PUBLIC_OPTIMISM_SEPOLIA_VAULT_FACTORY || '';
    } else if (chainId === 'codex-testnet') {
      return process.env.NEXT_PUBLIC_CODEX_TESTNET_VAULT_FACTORY || '';
    } else if (chainId === 'unichain-sepolia') {
      return process.env.NEXT_PUBLIC_UNICHAIN_SEPOLIA_VAULT_FACTORY || '';
    }
    return '';
  };

  // Load user's vaults when chain or user changes
  useEffect(() => {
    // Clear selected vault when chain changes (prevents using wrong chain's vault)
    setSelectedVault(null);
    setVaultInfo(null);
    
    if (connected && userAddress) {
      loadUserVaults();
    } else {
      setUserVaults([]);
      setSelectedVault(null);
      setVaultInfo(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, userAddress, selectedChain]);

  // Load user vaults from VaultFactory
  const loadUserVaults = async () => {
    if (!userAddress) return;

    setLoadingVaults(true);
    setError('');
    
    try {
      const chain = CHAINS.find(c => c.id === selectedChain);
      if (!chain) {
        setError('Invalid chain selected');
        return;
      }

      const vaultFactoryAddress = getVaultFactoryAddress(selectedChain);
      if (!vaultFactoryAddress) {
        const envVarNames = selectedChain === 'base' 
          ? 'NEXT_PUBLIC_BASE_VAULT_FACTORY or NEXT_PUBLIC_BASE_SEPOLIA_VAULT_FACTORY'
          : `NEXT_PUBLIC_${selectedChain.toUpperCase().replace(/-/g, '_')}_VAULT_FACTORY`;
        console.warn(`VaultFactory not configured for ${selectedChain}`);
        console.warn(`Looking for: ${envVarNames}`);
        setError(`VaultFactory not configured. Please set ${envVarNames} in your .env.local file.`);
        setUserVaults([]);
        return;
      }

      const provider = new ethers.JsonRpcProvider(chain.rpc);
      const vaults = await getUserVaults(vaultFactoryAddress, userAddress, provider);
      
      setUserVaults(vaults);
      
      // Auto-select first vault if available
      if (vaults.length > 0) {
        // Always update to first vault (in case chain changed)
        setSelectedVault(vaults[0].vault);
      } else {
        // Clear selection if no vaults found
        setSelectedVault(null);
        setVaultInfo(null);
      }
    } catch (err: any) {
      console.error('Error loading user vaults:', err);
      setError(`Error loading vaults: ${err.message || 'Unknown error'}`);
      setUserVaults([]);
    } finally {
      setLoadingVaults(false);
    }
  };

  // Load vault info when selected vault or user changes
  useEffect(() => {
    if (connected && userAddress && selectedVault) {
      // Verify selectedVault is valid for current chain
      const isValidVault = userVaults.some(v => v.vault === selectedVault);
      if (isValidVault) {
        loadVaultInfo(userAddress);
      } else {
        // Invalid vault for this chain, clear it
        setSelectedVault(null);
        setVaultInfo(null);
      }
    } else {
      setVaultInfo(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, userAddress, selectedVault, userVaults]);

  // Update balances when vault info is loaded
  useEffect(() => {
    if (vaultInfo && userAddress) {
      updateTokenBalances(userAddress);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vaultInfo, userAddress]);

  // Connect wallet
  const connectWallet = async () => {
    try {
      const signer = await getSigner();
      if (!signer) {
        setError('MetaMask not found');
        return;
      }

      const address = await signer.getAddress();
      const network = await signer.provider?.getNetwork();
      const chainId = network ? Number(network.chainId) : null;
      
      setUserAddress(address);
      setCurrentChainId(chainId);
      setConnected(true);
      setError('');
      setStatus('✅ Wallet connected');
      
      // Check if on correct network
      const chain = CHAINS.find(c => c.id === selectedChain);
      if (chain && chainId !== chain.chainId) {
        setError(`⚠️ Wrong network! Switch to ${chain.name} (ChainId ${chain.chainId})`);
      }
      
      // Clear status after 3 seconds
      setTimeout(() => setStatus(''), 3000);
    } catch (err: any) {
      setError(err.message);
    }
  };

  // Load vault info
  const loadVaultInfo = async (user: string) => {
    if (!selectedVault) {
      console.log('No vault selected, skipping load');
      return;
    }
    
    setLoading(true);
    setError('');
    console.log(`Loading vault info for ${selectedVault} on ${selectedChain}...`);
    
    try {
      const chain = CHAINS.find(c => c.id === selectedChain);
      if (!chain) {
        setError('Invalid chain selected');
        return;
      }

      const provider = new ethers.JsonRpcProvider(chain.rpc);
      
      // Check network connection
      const network = await provider.getNetwork();
      console.log(`Connected to network: ${network.name} (chainId: ${network.chainId})`);
      
      if (Number(network.chainId) !== chain.chainId) {
        setError(`RPC returned wrong chain ID: expected ${chain.chainId}, got ${network.chainId}`);
        return;
      }

      const info = await getVaultInfo(selectedVault, user, provider);
      
      if (info) {
        setVaultInfo(info);
        setVaultAddress(selectedVault); // Set for backward compatibility with deposit/withdraw
        console.log('Vault info loaded successfully');
      } else {
        setError('Failed to load vault info');
      }
    } catch (err: any) {
      console.error('Error loading vault info:', err);
      setError(`Error: ${err.message || 'Failed to load vault'}`);
    } finally {
      setLoading(false);
    }
  };

  // Update token balances
  const updateTokenBalances = async (user: string) => {
    if (!vaultInfo) return;

    try {
      const chain = CHAINS.find(c => c.id === selectedChain);
      if (!chain) return;

      const provider = new ethers.JsonRpcProvider(chain.rpc);
      
      const flxBal = await getTokenBalance(vaultInfo.projectToken, user, provider);
      const usdcBal = await getTokenBalance(vaultInfo.usdc, user, provider);
      
      setFlxBalance(formatTokenAmount(flxBal, 18));
      setUsdcBalance(formatTokenAmount(usdcBal, 6));
    } catch (err: any) {
      console.error('Error updating balances:', err);
    }
  };

  // Handle deposit
  const handleDeposit = async () => {
    if (!connected || !vaultAddress) {
      setError('Please connect wallet first');
      return;
    }

    if (!depositTokenAmount || !depositUsdcAmount) {
      setError('Enter both amounts');
      return;
    }

    setDepositing(true);
    setError('');
    setStatus('');

    try {
      const signer = await getSigner();
      if (!signer) throw new Error('No signer');

      // Verify network matches selected chain
      // Also check MetaMask's actual chainId (more reliable)
      const network = await signer.provider?.getNetwork();
      const chain = CHAINS.find(c => c.id === selectedChain);
      
      // Get MetaMask's actual chainId
      let metamaskChainId: number | null = null;
      if (typeof window !== 'undefined' && (window as any).ethereum) {
        try {
          const chainIdHex = await (window as any).ethereum.request({ method: 'eth_chainId' });
          metamaskChainId = parseInt(chainIdHex, 16);
          console.log('MetaMask chainId:', metamaskChainId);
        } catch (err) {
          console.warn('Could not get MetaMask chainId:', err);
        }
      }
      
      // Check both provider network and MetaMask chainId
      const providerChainId = network ? Number(network.chainId) : null;
      const actualChainId = metamaskChainId || providerChainId;
      
      if (chain && actualChainId && actualChainId !== chain.chainId) {
        const switchNetwork = window.confirm(
          `You're on the wrong network!\n\n` +
          `Current: ChainId ${actualChainId}\n` +
          `Required: ${chain.name} (ChainId ${chain.chainId})\n\n` +
          `Would you like to switch to ${chain.name}?`
        );
        
        if (switchNetwork) {
          try {
            await (window as any).ethereum.request({
              method: 'wallet_switchEthereumChain',
              params: [{ chainId: `0x${chain.chainId.toString(16)}` }],
            });
            setStatus('Switched network. Please try depositing again.');
            setDepositing(false);
            return;
          } catch (switchError: any) {
            // Chain doesn't exist, try to add it
            if (switchError.code === 4902) {
              try {
                await (window as any).ethereum.request({
                  method: 'wallet_addEthereumChain',
                  params: [{
                    chainId: `0x${chain.chainId.toString(16)}`,
                    chainName: chain.name,
                    nativeCurrency: chain.nativeCurrency || {
                      name: 'ETH',
                      symbol: 'ETH',
                      decimals: 18,
                    },
                    rpcUrls: [chain.rpc],
                    blockExplorerUrls: chain.explorer ? [chain.explorer] : [],
                  }],
                });
                setStatus('Network added. Please try depositing again.');
                setDepositing(false);
                return;
              } catch (addError) {
                setError(`Failed to add network: ${addError}`);
                setDepositing(false);
                return;
              }
            } else {
              setError(`Failed to switch network: ${switchError.message}`);
              setDepositing(false);
              return;
            }
          }
        } else {
          setError(`Please switch to ${chain.name} (ChainId ${chain.chainId}) in MetaMask.`);
          setDepositing(false);
          return;
        }
      }

      // Get decimals for project token (18) and USDC (6)
      const tokenAmount = parseTokenAmount(depositTokenAmount, 18);
      const usdcAmount = parseTokenAmount(depositUsdcAmount, 6);
      const minShares = 0n; // Can add slippage protection

      console.log('Deposit attempt:', {
        vaultAddress,
        selectedChain,
        expectedChainId: chain?.chainId,
        currentChainId: network ? Number(network.chainId) : null,
        tokenAmount: tokenAmount.toString(),
        usdcAmount: usdcAmount.toString()
      });

      setStatus('Verifying vault contract...');
      const result = await depositToVault(
        vaultAddress,
        tokenAmount,
        usdcAmount,
        minShares,
        signer,
        chain?.chainId // Pass expected chain ID
      );

      if (result.success) {
        setStatus(`✅ Deposit successful! TX: ${result.txHash}`);
        setDepositTokenAmount('');
        setDepositUsdcAmount('');
        await loadVaultInfo(userAddress);
        await updateTokenBalances(userAddress);
      } else {
        setError(result.error || 'Deposit failed');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setDepositing(false);
    }
  };

  // Handle withdraw
  const handleWithdraw = async () => {
    if (!connected || !vaultAddress) {
      setError('Please connect wallet first');
      return;
    }

    if (!withdrawShares) {
      setError('Enter shares to burn');
      return;
    }

    setWithdrawing(true);
    setError('');
    setStatus('');

    try {
      const signer = await getSigner();
      if (!signer) throw new Error('No signer');

      const shares = parseTokenAmount(withdrawShares, 18);
      const minToken = 0n; // Can add slippage protection
      const minUsdc = 0n;

      setStatus('Withdrawing from vault...');
      const result = await withdrawFromVault(
        vaultAddress,
        shares,
        minToken,
        minUsdc,
        signer
      );

      if (result.success) {
        setStatus(`✅ Withdrawal successful! TX: ${result.txHash}`);
        setWithdrawShares('');
        await loadVaultInfo(userAddress);
        await updateTokenBalances(userAddress);
      } else {
        setError(result.error || 'Withdrawal failed');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setWithdrawing(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-2">Liquidity Vaults</h1>
        <p className="text-gray-600 dark:text-gray-400">
          Real multi-chain liquidity management with full withdrawal rights
        </p>
      </div>

      {/* Chain Selector */}
      <div className="mb-6 flex items-center space-x-4">
        <label className="font-medium">Chain:</label>
        <select
          value={selectedChain}
          onChange={(e) => setSelectedChain(e.target.value)}
          className="px-4 py-2 bg-white dark:bg-gray-900 rounded-lg border-2 border-gray-200 dark:border-gray-700"
        >
          {CHAINS.map(chain => (
            <option key={chain.id} value={chain.id}>{chain.name}</option>
          ))}
        </select>
        
        {!connected ? (
          <button
            onClick={connectWallet}
            className="gradient-arc text-white px-6 py-2 rounded-lg font-semibold"
          >
            Connect Wallet
          </button>
        ) : (
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 bg-green-500 rounded-full"></div>
              <span className="text-sm">{userAddress.slice(0, 6)}...{userAddress.slice(-4)}</span>
            </div>
            {(() => {
              const chain = CHAINS.find(c => c.id === selectedChain);
              const isCorrectNetwork = chain && currentChainId === chain.chainId;
              return (
                <div className={`flex items-center space-x-2 px-3 py-1 rounded-full text-xs ${
                  isCorrectNetwork 
                    ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300' 
                    : 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300'
                }`}>
                  <div className={`w-2 h-2 rounded-full ${isCorrectNetwork ? 'bg-green-500' : 'bg-yellow-500'}`}></div>
                  <span>
                    {isCorrectNetwork 
                      ? `On ${chain?.name}` 
                      : `Wrong network (${currentChainId})`}
                  </span>
                </div>
              );
            })()}
          </div>
        )}

        {connected && (
          <button
            onClick={() => {
              loadUserVaults();
              if (selectedVault) {
                loadVaultInfo(userAddress);
                updateTokenBalances(userAddress);
              }
            }}
            disabled={loadingVaults || loading}
            className="p-2 rounded-lg border border-gray-300 hover:border-arc-blue transition-colors"
            title="Refresh vaults"
          >
            <RefreshCw className={`w-4 h-4 ${loadingVaults || loading ? 'animate-spin' : ''}`} />
          </button>
        )}
      </div>

      {/* User Vaults List */}
      {connected && userAddress && (
        <div className="mb-6 bg-white dark:bg-gray-900 rounded-xl border-2 border-gray-200 dark:border-gray-800 p-6">
          <h2 className="text-xl font-semibold mb-4">Your Vaults</h2>
          {loadingVaults ? (
            <div className="text-center py-8 text-gray-600 dark:text-gray-400">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" />
              <p>Loading your vaults...</p>
            </div>
          ) : userVaults.length === 0 ? (
            <div className="text-center py-8 text-gray-600 dark:text-gray-400">
              <Database className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No vaults found on {CHAINS.find(c => c.id === selectedChain)?.name}</p>
              {error && error.includes('VaultFactory not configured') ? (
                <div className="mt-4 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                  <p className="text-sm text-yellow-800 dark:text-yellow-200 font-semibold">{error}</p>
                  <p className="text-xs text-yellow-700 dark:text-yellow-300 mt-2">
                    Add it to <code className="bg-yellow-100 dark:bg-yellow-900 px-1 rounded">frontend/.env.local</code>
                  </p>
                </div>
              ) : (
                <p className="text-sm mt-2">Make sure VaultFactory is configured for this chain</p>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {userVaults.map((vault) => (
                <button
                  key={vault.vault}
                  onClick={() => setSelectedVault(vault.vault)}
                  className={`w-full text-left p-4 rounded-lg border-2 transition-all ${
                    selectedVault === vault.vault
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                      : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="font-semibold text-lg">{vault.tokenName} ({vault.tokenSymbol})</div>
                      <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                        Balance: {formatTokenAmount(BigInt(vault.tokenBalance), 18)} {vault.tokenSymbol}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-500 mt-1 font-mono">
                        Vault: {vault.vault.slice(0, 6)}...{vault.vault.slice(-4)}
                      </div>
                    </div>
                    {selectedVault === vault.vault && (
                      <CheckCircle2 className="w-5 h-5 text-blue-500" />
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {connected && !selectedVault && userVaults.length === 0 && !loadingVaults && (
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-6 mb-6">
          <div className="flex items-start space-x-3 mb-4">
            <XCircle className="w-5 h-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-yellow-800 dark:text-yellow-200 font-semibold">
                No vaults found for tokens you hold on {CHAINS.find(c => c.id === selectedChain)?.name}
              </p>
              <p className="text-sm text-yellow-700 dark:text-yellow-300 mt-1">
                Make sure VaultFactory is configured. Looking for: {(() => {
                  const envVarMap: Record<string, string> = {
                    'arc': 'NEXT_PUBLIC_ARC_VAULT_FACTORY',
                    'base': 'NEXT_PUBLIC_BASE_VAULT_FACTORY or NEXT_PUBLIC_BASE_SEPOLIA_VAULT_FACTORY',
                    'polygon-amoy': 'NEXT_PUBLIC_POLYGON_AMOY_VAULT_FACTORY',
                    'arbitrum-sepolia': 'NEXT_PUBLIC_ARBITRUM_SEPOLIA_VAULT_FACTORY',
                    'avalanche-fuji': 'NEXT_PUBLIC_AVALANCHE_FUJI_VAULT_FACTORY',
                    'optimism-sepolia': 'NEXT_PUBLIC_OPTIMISM_SEPOLIA_VAULT_FACTORY',
                    'codex-testnet': 'NEXT_PUBLIC_CODEX_TESTNET_VAULT_FACTORY',
                    'unichain-sepolia': 'NEXT_PUBLIC_UNICHAIN_SEPOLIA_VAULT_FACTORY'
                  };
                  return envVarMap[selectedChain] || `NEXT_PUBLIC_${selectedChain.toUpperCase().replace(/-/g, '_')}_VAULT_FACTORY`;
                })()}
              </p>
              <p className="text-sm text-yellow-700 dark:text-yellow-300 mt-2">
                The vaults page automatically detects tokens you hold and shows their associated vaults. 
                If you have tokens but no vaults appear, the VaultFactory may not be deployed or configured for this chain.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Loading State */}
      {loading && selectedVault && !vaultInfo && (
        <div className="gradient-card rounded-xl border border-gray-200 dark:border-gray-800 p-8 mb-6 text-center">
          <RefreshCw className="w-12 h-12 mx-auto mb-4 text-arc-blue animate-spin" />
          <p className="text-gray-600 dark:text-gray-400">Loading vault information...</p>
        </div>
      )}

      {/* Vault Overview */}
      {vaultInfo && selectedVault && (
        <div className="gradient-card rounded-xl border border-gray-200 dark:border-gray-800 p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4 flex items-center">
            <Database className="w-6 h-6 mr-2 text-arc-blue" />
            {(() => {
              const vault = userVaults.find(v => v.vault === selectedVault);
              return vault ? `${vault.tokenName} Vault` : 'Vault';
            })()} - {CHAINS.find(c => c.id === selectedChain)?.name}
          </h2>

          <div className="grid md:grid-cols-3 gap-4 mb-4">
            <div className="bg-white dark:bg-gray-900 p-4 rounded-lg">
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Total FLX</p>
              <p className="text-2xl font-bold text-arc-blue">
                {formatTokenAmount(vaultInfo.totalProjectToken, 18)}
              </p>
            </div>
            <div className="bg-white dark:bg-gray-900 p-4 rounded-lg">
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Total USDC</p>
              <p className="text-2xl font-bold text-arc-green">
                {formatTokenAmount(vaultInfo.totalUSDC, 6)}
              </p>
            </div>
            <div className="bg-white dark:bg-gray-900 p-4 rounded-lg">
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Your Shares</p>
              <p className="text-2xl font-bold text-arc-purple">
                {formatTokenAmount(vaultInfo.userShares, 18)}
              </p>
            </div>
          </div>

          <div className="text-sm text-gray-600 dark:text-gray-400">
            <p>Vault: {vaultAddress}</p>
            <p className="mt-1">Governance: {vaultInfo.governance || 'Loading...'}</p>
          </div>

          {/* Token Addresses */}
          <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-900 rounded-lg text-xs">
            <p className="text-gray-600 dark:text-gray-400 mb-1">
              FLX Token: {vaultInfo.projectToken}
            </p>
            <p className="text-gray-600 dark:text-gray-400">
              USDC: {vaultInfo.usdc}
            </p>
          </div>
        </div>
      )}

      {/* Deposit/Withdraw */}
      {connected && vaultAddress && (
        <div className="grid md:grid-cols-2 gap-6 mb-6">
          {/* Deposit */}
          <div className="bg-white dark:bg-gray-900 rounded-xl border-2 border-gray-200 dark:border-gray-800 p-6">
            <div className="flex items-center space-x-2 mb-4">
              <Plus className="w-5 h-5 text-green-500" />
              <h3 className="text-lg font-semibold">Deposit Liquidity</h3>
            </div>

            <div className="space-y-4 mb-4">
              <div>
                <div className="flex justify-between mb-2">
                  <label className="block text-sm font-medium">FLX Amount</label>
                  <span className="text-xs text-gray-600 dark:text-gray-400">
                    Balance: {flxBalance}
                  </span>
                </div>
                <input
                  type="number"
                  value={depositTokenAmount}
                  onChange={(e) => setDepositTokenAmount(e.target.value)}
                  placeholder="1000"
                  className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 rounded-lg border-2 border-gray-200 dark:border-gray-700 focus:border-arc-blue outline-none"
                  disabled={depositing}
                />
              </div>

              <div>
                <div className="flex justify-between mb-2">
                  <label className="block text-sm font-medium">USDC Amount</label>
                  <span className="text-xs text-gray-600 dark:text-gray-400">
                    Balance: {usdcBalance}
                  </span>
                </div>
                <input
                  type="number"
                  value={depositUsdcAmount}
                  onChange={(e) => setDepositUsdcAmount(e.target.value)}
                  placeholder="1000"
                  className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 rounded-lg border-2 border-gray-200 dark:border-gray-700 focus:border-arc-blue outline-none"
                  disabled={depositing}
                />
              </div>
            </div>

            <button
              onClick={handleDeposit}
              disabled={depositing || !depositTokenAmount || !depositUsdcAmount}
              className="w-full bg-green-600 hover:bg-green-700 text-white py-3 rounded-lg font-semibold transition-colors disabled:opacity-50 flex items-center justify-center space-x-2"
            >
              {depositing ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Depositing...</span>
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4" />
                  <span>Deposit Liquidity</span>
                </>
              )}
            </button>
          </div>

          {/* Withdraw */}
          <div className="bg-white dark:bg-gray-900 rounded-xl border-2 border-gray-200 dark:border-gray-800 p-6">
            <div className="flex items-center space-x-2 mb-4">
              <Minus className="w-5 h-5 text-red-500" />
              <h3 className="text-lg font-semibold">Withdraw Liquidity</h3>
            </div>

            <div className="space-y-4 mb-4">
              <div>
                <label className="block text-sm font-medium mb-2">Vault Shares</label>
                <input
                  type="number"
                  value={withdrawShares}
                  onChange={(e) => setWithdrawShares(e.target.value)}
                  placeholder="100"
                  className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 rounded-lg border-2 border-gray-200 dark:border-gray-700 focus:border-arc-purple outline-none"
                  disabled={withdrawing}
                />
                {vaultInfo && (
                  <p className="mt-2 text-xs text-gray-600 dark:text-gray-400">
                    Available: {formatTokenAmount(vaultInfo.userShares, 18)} shares
                  </p>
                )}
              </div>
            </div>

            <button
              onClick={handleWithdraw}
              disabled={withdrawing || !withdrawShares}
              className="w-full bg-red-600 hover:bg-red-700 text-white py-3 rounded-lg font-semibold transition-colors disabled:opacity-50 flex items-center justify-center space-x-2"
            >
              {withdrawing ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Withdrawing...</span>
                </>
              ) : (
                <>
                  <Minus className="w-4 h-4" />
                  <span>Withdraw Liquidity</span>
                </>
              )}
            </button>

            <div className="mt-3 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
              <p className="text-xs text-green-700 dark:text-green-300 flex items-start">
                <CheckCircle2 className="w-4 h-4 mr-1 flex-shrink-0 mt-0.5" />
                <span>Withdrawals cannot be blocked by governance</span>
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Status Messages */}
      {status && (
        <div className="mb-4 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg flex items-start space-x-3">
          <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
          <p className="text-green-800 dark:text-green-200">{status}</p>
        </div>
      )}

      {error && (
        <div className="mb-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-start space-x-3">
          <XCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
          <p className="text-red-800 dark:text-red-200">{error}</p>
        </div>
      )}

      {/* Info */}
      <div className="gradient-card rounded-xl border border-gray-200 dark:border-gray-800 p-6">
        <h3 className="font-semibold mb-4">How Liquidity Vaults Work</h3>
        <div className="grid md:grid-cols-2 gap-6 text-sm text-gray-600 dark:text-gray-400">
          <div>
            <h4 className="font-semibold text-green-600 dark:text-green-400 mb-2">Your Rights (Cannot Be Blocked)</h4>
            <div className="space-y-1">
              <p>• Deposit FLX + USDC to receive vault shares</p>
              <p>• Withdraw anytime by burning shares</p>
              <p>• Shares are ERC20 tokens you own</p>
              <p>• Proportional ownership guaranteed</p>
              <p>• Governance cannot block withdrawals</p>
            </div>
          </div>
          <div>
            <h4 className="font-semibold text-arc-purple mb-2">Governance Rights (Strategy Only)</h4>
            <div className="space-y-1">
              <p>• Combine LP pools across chains</p>
              <p>• Rebalance liquidity allocation</p>
              <p>• Optimize liquidity depth</p>
              <p>• Move liquidity between chains</p>
              <p>• Cannot take funds or block withdrawals</p>
            </div>
          </div>
        </div>
        
        <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
          <p className="text-sm text-blue-800 dark:text-blue-200">
            <strong>Multi-Chain Liquidity:</strong> Vaults exist on all supported chains (Arc, Base Sepolia, Polygon Amoy, Arbitrum Sepolia, Avalanche Fuji, Optimism Sepolia, Codex Testnet, Unichain Sepolia). Deposit on any chain, and governance can use your liquidity for optimal routing while you maintain full withdrawal rights.
          </p>
        </div>
      </div>
    </div>
  )
}
