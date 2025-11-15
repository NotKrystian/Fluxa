'use client'

import { useState, useEffect } from 'react'
import { ethers } from 'ethers'
import { Plus, Minus, RefreshCw, Wallet, CheckCircle2, XCircle, Database } from 'lucide-react'
import { depositToVault, withdrawFromVault, getVaultInfo } from '@/utils/vaults'
import { getSigner, getTokenBalance, formatTokenAmount, parseTokenAmount } from '@/utils/contracts'

const CHAINS = [
  { id: 'sepolia', name: 'Ethereum Sepolia', chainId: 11155111, rpc: 'https://ethereum-sepolia-rpc.publicnode.com' },
  { id: 'arc', name: 'Arc Testnet', chainId: 5042002, rpc: 'https://rpc.testnet.arc.network' }
];

export default function VaultsPage() {
  const [selectedChain, setSelectedChain] = useState('arc')
  const [connected, setConnected] = useState(false)
  const [userAddress, setUserAddress] = useState('')
  const [currentChainId, setCurrentChainId] = useState<number | null>(null)
  
  const [vaultAddress, setVaultAddress] = useState('')
  const [vaultInfo, setVaultInfo] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  
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

  // Load vault address from env based on selected chain
  // Note: Next.js requires direct references to process.env, dynamic access doesn't work
  useEffect(() => {
    let addr = '';
    
    if (selectedChain === 'arc') {
      addr = process.env.NEXT_PUBLIC_ARC_FLX_VAULT || '';
    } else if (selectedChain === 'sepolia') {
      addr = process.env.NEXT_PUBLIC_SEPOLIA_FLX_VAULT || '';
    }
    
    console.log(`Loading vault for ${selectedChain}:`, {
      address: addr || 'NOT SET',
      expectedChainId: CHAINS.find(c => c.id === selectedChain)?.chainId,
      envVar: selectedChain === 'arc' ? 'NEXT_PUBLIC_ARC_FLX_VAULT' : 'NEXT_PUBLIC_SEPOLIA_FLX_VAULT'
    });
    
    setVaultAddress(addr);
    setVaultInfo(null); // Clear vault info when chain changes
  }, [selectedChain]);

  // Load vault info when vault address or user changes
  useEffect(() => {
    if (connected && userAddress && vaultAddress) {
      loadVaultInfo(userAddress);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, userAddress, vaultAddress]);

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
    if (!vaultAddress) {
      console.log('No vault address set, skipping load');
      return;
    }
    
    setLoading(true);
    setError('');
    console.log(`Loading vault info for ${vaultAddress} on ${selectedChain}...`);
    
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

      const info = await getVaultInfo(vaultAddress, user, provider);
      
      if (info) {
        setVaultInfo(info);
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
                    nativeCurrency: {
                      name: selectedChain === 'arc' ? 'USDC' : 'ETH',
                      symbol: selectedChain === 'arc' ? 'USDC' : 'ETH',
                      decimals: selectedChain === 'arc' ? 6 : 18,
                    },
                    rpcUrls: [chain.rpc],
                    blockExplorerUrls: selectedChain === 'arc' 
                      ? ['https://testnet.arcscan.net'] 
                      : ['https://sepolia.etherscan.io'],
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

        {connected && vaultAddress && (
          <button
            onClick={() => {
              loadVaultInfo(userAddress);
              updateTokenBalances(userAddress);
            }}
            disabled={loading}
            className="p-2 rounded-lg border border-gray-300 hover:border-arc-blue transition-colors"
            title="Refresh vault info"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        )}
      </div>

      {!vaultAddress && (
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-6 mb-6">
          <div className="flex items-start space-x-3 mb-4">
            <XCircle className="w-5 h-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-yellow-800 dark:text-yellow-200 font-semibold">
                No vault address for {CHAINS.find(c => c.id === selectedChain)?.name}
              </p>
              <p className="text-sm text-yellow-700 dark:text-yellow-300 mt-1">
                Looking for: NEXT_PUBLIC_{selectedChain.toUpperCase()}_FLX_VAULT
              </p>
              <p className="text-sm text-yellow-700 dark:text-yellow-300 mt-1">
                Follow these steps to deploy vaults:
              </p>
            </div>
          </div>
          
          <div className="ml-8 space-y-3 text-sm text-yellow-800 dark:text-yellow-200">
            <div className="p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded">
              <p className="font-semibold text-red-800 dark:text-red-200">⚠️ FRONTEND NOT RESTARTED</p>
              <p className="text-xs mt-1 text-red-700 dark:text-red-300">
                Vaults are already deployed! The frontend just needs to be restarted.
              </p>
            </div>

            <p><strong>Solution:</strong> Restart the frontend dev server:</p>
            <code className="block bg-yellow-100 dark:bg-yellow-800 p-2 rounded text-xs ml-4">
              # Stop frontend (Ctrl+C), then:<br/>
              cd frontend && npm run dev
            </code>
            
            <p className="mt-2 text-xs">
              Next.js only loads environment variables at startup. Since deployment created <code className="bg-yellow-100 dark:bg-yellow-800 px-1 rounded">frontend/.env.local</code> with vault addresses, you must restart to see them.
            </p>

            <details className="mt-3">
              <summary className="cursor-pointer font-semibold">Or deploy from scratch:</summary>
              <div className="mt-2 ml-4 space-y-2">
                <p><strong>1.</strong> Add Arc USDC to <code className="bg-yellow-100 dark:bg-yellow-800 px-2 py-0.5 rounded">.env</code>:</p>
                <code className="block bg-yellow-100 dark:bg-yellow-800 p-2 rounded text-xs">
                  ARC_USDC_ADDRESS=0x3600000000000000000000000000000000000000
                </code>
                
                <p className="mt-2"><strong>2.</strong> Run deployment:</p>
                <code className="block bg-yellow-100 dark:bg-yellow-800 p-2 rounded text-xs">
                  npm run deploy
                </code>
                
                <p className="mt-2"><strong>3.</strong> Restart frontend:</p>
                <code className="block bg-yellow-100 dark:bg-yellow-800 p-2 rounded text-xs">
                  cd frontend && npm run dev
                </code>
              </div>
            </details>
          </div>
        </div>
      )}

      {/* Loading State */}
      {loading && vaultAddress && !vaultInfo && (
        <div className="gradient-card rounded-xl border border-gray-200 dark:border-gray-800 p-8 mb-6 text-center">
          <RefreshCw className="w-12 h-12 mx-auto mb-4 text-arc-blue animate-spin" />
          <p className="text-gray-600 dark:text-gray-400">Loading vault information...</p>
        </div>
      )}

      {/* Vault Overview */}
      {vaultInfo && (
        <div className="gradient-card rounded-xl border border-gray-200 dark:border-gray-800 p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4 flex items-center">
            <Database className="w-6 h-6 mr-2 text-arc-blue" />
            FLX Vault - {CHAINS.find(c => c.id === selectedChain)?.name}
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
            <strong>Multi-Chain Liquidity:</strong> Vaults exist on both Sepolia and Arc. Deposit on either chain, and governance can use your liquidity for optimal routing while you maintain full withdrawal rights.
          </p>
        </div>
      </div>
    </div>
  )
}
