/**
 * Gateway Coordinator Service
 * 
 * Manages Circle Gateway for ERC20 custody and cross-chain transport.
 * Handles deposits, withdrawals, and balance queries.
 */

import axios from 'axios';
import { ethers } from 'ethers';

export class GatewayCoordinator {
  constructor(tokenRegistry) {
    this.tokenRegistry = tokenRegistry; // TokenRegistry for validating operations
    this.apiKey = process.env.CIRCLE_GATEWAY_API_KEY;
    this.apiUrl = process.env.CIRCLE_GATEWAY_API_URL || 'https://api-sandbox.circle.com/v1/gateway';
    
    this.balanceCache = new Map();
    this.cacheTimeout = 10000; // 10 seconds
    
    // Circle Gateway configuration
    this.useRealGateway = !!this.apiKey;
    
    // Gateway Wallet addresses on each chain (on-chain contracts)
    // Default addresses from Circle's deployments
    this.gatewayAddresses = {
      ethereum: process.env.ETHEREUM_GATEWAY_WALLET || '0x0077777d7EBA4688BDeF3E311b846F25870A19B9', // Sepolia
      sepolia: process.env.SEPOLIA_GATEWAY_WALLET || '0x0077777d7EBA4688BDeF3E311b846F25870A19B9', // Sepolia
      base: process.env.BASE_GATEWAY_WALLET || process.env.BASE_SEPOLIA_GATEWAY_WALLET || ethers.ZeroAddress,
      basesepolia: process.env.BASE_SEPOLIA_GATEWAY_WALLET || process.env.BASE_GATEWAY_WALLET || ethers.ZeroAddress,
      'base-sepolia': process.env.BASE_SEPOLIA_GATEWAY_WALLET || process.env.BASE_GATEWAY_WALLET || ethers.ZeroAddress,
      polygon: process.env.POLYGON_GATEWAY_WALLET || process.env.POLYGON_AMOY_GATEWAY_WALLET || ethers.ZeroAddress,
      'polygon-amoy': process.env.POLYGON_AMOY_GATEWAY_WALLET || process.env.POLYGON_GATEWAY_WALLET || ethers.ZeroAddress,
      'arbitrum-sepolia': process.env.ARBITRUM_SEPOLIA_GATEWAY_WALLET || process.env.ARBITRUM_GATEWAY_WALLET || ethers.ZeroAddress,
      'avalanche-fuji': process.env.AVALANCHE_FUJI_GATEWAY_WALLET || process.env.AVALANCHE_GATEWAY_WALLET || ethers.ZeroAddress,
      'optimism-sepolia': process.env.OPTIMISM_SEPOLIA_GATEWAY_WALLET || process.env.OPTIMISM_GATEWAY_WALLET || ethers.ZeroAddress,
      'codex-testnet': process.env.CODEX_TESTNET_GATEWAY_WALLET || process.env.CODEX_GATEWAY_WALLET || ethers.ZeroAddress,
      'unichain-sepolia': process.env.UNICHAIN_SEPOLIA_GATEWAY_WALLET || process.env.UNICHAIN_GATEWAY_WALLET || ethers.ZeroAddress,
      arc: process.env.ARC_GATEWAY_WALLET || '0x0077777d7EBA4688BDeF3E311b846F25870A19B9' // Arc testnet
    };
    
    // Supported chains for Gateway operations
    this.supportedChains = ['arc', 'base', 'basesepolia', 'base-sepolia', 'polygon', 'polygon-amoy', 'arbitrum-sepolia', 'avalanche-fuji', 'optimism-sepolia', 'codex-testnet', 'unichain-sepolia'];

    // Private key for signing transactions
    this.privateKey = process.env.GATEWAY_PRIVATE_KEY || process.env.CCTP_PRIVATE_KEY;
    
    console.log(this.useRealGateway ? 
      '✓ Real Circle Gateway API configured' : 
      '⚠ No Circle API key - operations will fail without real Gateway'
    );
  }

  /**
   * Validate that Gateway routing follows Arc-only rules:
   * - From other chains → Arc (allowed)
   * - From Arc → other chains (allowed)
   * - Between two non-Arc chains (NOT allowed)
   */
  validateRouting(sourceChain, destinationChain) {
    const isArcSource = sourceChain === 'arc';
    const isArcDestination = destinationChain === 'arc';
    
    // Both must be Arc (local transfer - not Gateway)
    if (isArcSource && isArcDestination) {
      throw new Error('Gateway routing: Both source and destination cannot be Arc. Use local transfer instead.');
    }
    
    // One must be Arc, the other must not be
    if (!isArcSource && !isArcDestination) {
      throw new Error(`Gateway routing: Direct transfers between ${sourceChain} and ${destinationChain} are not allowed. All transfers must involve Arc (${sourceChain} → Arc → ${destinationChain}).`);
    }
    
    // Valid: one is Arc, the other is not
    return true;
  }

  /**
   * Validate token is registered in registry for Gateway operations
   */
  async validateToken(tokenId, chainId) {
    if (!this.tokenRegistry) {
      throw new Error('TokenRegistry not configured');
    }

    const isRegistered = await this.tokenRegistry.isTokenRegistered(tokenId, chainId);
    if (!isRegistered) {
      throw new Error(`Token ${tokenId} not registered on chain ${chainId}`);
    }

    return true;
  }

  /**
   * Get Gateway balance for a depositor and token (REAL Circle Gateway API)
   */
  async getBalance(depositor, token) {
    const cacheKey = `${depositor}:${token}`;
    const cached = this.balanceCache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.balance;
    }

    try {
      if (!this.useRealGateway) {
        throw new Error('Circle Gateway API key not configured');
      }

      const response = await axios.get(
        `${this.apiUrl}/balances/${depositor}/${token}`,
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
            'accept': 'application/json'
          }
        }
      );

      const balance = response.data.data?.balance || '0';
      
      this.balanceCache.set(cacheKey, {
        balance,
        timestamp: Date.now()
      });

      return balance;
    } catch (error) {
      console.error('Gateway getBalance error:', error);
      throw new Error(`Failed to get Gateway balance: ${error.message}`);
    }
  }

  /**
   * Deposit token to Gateway from a specific chain
   * Can use either Circle Gateway API or on-chain Gateway Wallet contract
   */
  async deposit({ chain, token, amount, depositor, tokenId, chainId, useOnChain = false, signer = null }) {
    console.log(`Depositing ${amount} of ${token} to Gateway from ${chain} (${useOnChain ? 'on-chain' : 'API'})`);

    // Validate token is registered if tokenId provided
    if (tokenId && chainId) {
      await this.validateToken(tokenId, chainId);
    }

    // Use on-chain Gateway Wallet if requested and available
    if (useOnChain && this.gatewayAddresses[chain] && this.gatewayAddresses[chain] !== ethers.ZeroAddress) {
      return this.depositOnChain({ chain, token, amount, depositor, signer });
    }

    // Fall back to Circle Gateway API
    if (!this.useRealGateway) {
      throw new Error('Circle Gateway API key not configured and on-chain Gateway not available');
    }

    try {
      const response = await axios.post(
        `${this.apiUrl}/deposits`,
        {
          blockchain: chain,
          tokenAddress: token,
          amount: amount,
          destinationAddress: depositor
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
            'accept': 'application/json'
          }
        }
      );

      // Clear balance cache
      this.balanceCache.delete(`${depositor}:${token}`);

      return {
        id: response.data.data?.depositId,
        status: response.data.data?.status || 'pending',
        chain,
        token,
        amount,
        txHash: response.data.data?.transactionHash,
        method: 'api'
      };
    } catch (error) {
      console.error('Gateway deposit error:', error);
      throw new Error(`Failed to deposit to Gateway: ${error.message}`);
    }
  }

  /**
   * Deposit to on-chain Gateway Wallet contract
   */
  async depositOnChain({ chain, token, amount, depositor, signer = null }) {
    const provider = this.getProvider(chain);
    if (!provider) {
      throw new Error(`No RPC configured for ${chain}`);
    }

    const gatewayAddress = this.gatewayAddresses[chain];
    if (!gatewayAddress || gatewayAddress === ethers.ZeroAddress) {
      throw new Error(`Gateway Wallet not configured for ${chain}`);
    }

    try {
      // Get signer
      let walletSigner = signer;
      if (!walletSigner && this.privateKey) {
        walletSigner = new ethers.Wallet(this.privateKey, provider);
      } else if (!walletSigner) {
        throw new Error('No signer provided and GATEWAY_PRIVATE_KEY not configured');
      }

      // Get Gateway Wallet contract
      const gatewayWallet = new ethers.Contract(
        gatewayAddress,
        [
          'function deposit(address token, uint256 value) external',
          'function depositFor(address token, address depositor, uint256 value) external'
        ],
        walletSigner
      );

      // Get ERC20 token contract
      const tokenContract = new ethers.Contract(
        token,
        [
          'function approve(address spender, uint256 amount) external returns (bool)',
          'function allowance(address owner, address spender) external view returns (uint256)'
        ],
        walletSigner
      );

      // Approve token if needed
      const allowance = await tokenContract.allowance(walletSigner.address, gatewayAddress);
      if (allowance < amount) {
        console.log(`Approving ${token} to Gateway Wallet...`);
        const approveTx = await tokenContract.approve(gatewayAddress, ethers.MaxUint256);
        await approveTx.wait();
      }

      // Execute deposit
      let tx;
      if (depositor && depositor.toLowerCase() !== walletSigner.address.toLowerCase()) {
        // Use depositFor if depositor is different from sender
        tx = await gatewayWallet.depositFor(token, depositor, amount);
      } else {
        // Use regular deposit
        tx = await gatewayWallet.deposit(token, amount);
      }

      const receipt = await tx.wait();

      // Clear balance cache
      this.balanceCache.delete(`${depositor || walletSigner.address}:${token}`);

      return {
        txHash: tx.hash,
        status: 'complete',
        chain,
        token,
        amount: amount.toString(),
        depositor: depositor || walletSigner.address,
        method: 'onchain',
        receipt
      };
    } catch (error) {
      console.error('On-chain Gateway deposit error:', error);
      throw error;
    }
  }

  /**
   * Withdraw token from Gateway to a specific chain
   * Uses Circle Gateway API to mint tokens on destination chain
   * ENFORCES: Only withdrawals to/from Arc (routing validation)
   */
  async withdraw({ token, amount, targetChain, recipient, depositor, tokenId, chainId, useOnChain = false, signer = null }) {
    // Validate routing rules: must involve Arc
    // Note: Gateway withdrawals use API to mint on destination, so we validate the target chain
    if (targetChain !== 'arc' && !this.isArcChain(targetChain)) {
      // If withdrawing to a non-Arc chain, validate it's from Arc
      if (depositor && !this.isArcChain(depositor)) {
        this.validateRouting('arc', targetChain);
      }
    }

    console.log(`Withdrawing ${amount} of ${token} from Gateway to ${targetChain} (${useOnChain ? 'on-chain' : 'API'})`);

    // Validate token is registered if tokenId provided
    if (tokenId && chainId) {
      await this.validateToken(tokenId, chainId);
    }

    // Use on-chain Gateway Wallet if requested and available
    if (useOnChain && this.gatewayAddresses[targetChain] && this.gatewayAddresses[targetChain] !== ethers.ZeroAddress) {
      return this.withdrawOnChain({ chain: targetChain, token, amount, recipient, depositor, signer });
    }

    // Fall back to Circle Gateway API (mints on destination chain)
    if (!this.useRealGateway) {
      throw new Error('Circle Gateway API key not configured and on-chain Gateway not available');
    }

    try {
      const response = await axios.post(
        `${this.apiUrl}/withdrawals`,
        {
          blockchain: targetChain,
          tokenAddress: token,
          amount: amount,
          destinationAddress: recipient,
          sourceAddress: depositor
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
            'accept': 'application/json'
          }
        }
      );

      // Clear balance cache
      this.balanceCache.delete(`${depositor}:${token}`);

      return {
        id: response.data.data?.withdrawalId,
        status: response.data.data?.status || 'pending',
        targetChain,
        token,
        amount,
        txHash: response.data.data?.transactionHash,
        method: 'api'
      };
    } catch (error) {
      console.error('Gateway withdrawal error:', error);
      throw new Error(`Failed to withdraw from Gateway: ${error.message}`);
    }
  }

  /**
   * Withdraw from on-chain Gateway Wallet (if supported)
   * Note: Most Gateway implementations use API for withdrawals (minting on destination)
   */
  async withdrawOnChain({ chain, token, amount, recipient, depositor, signer = null }) {
    // On-chain withdrawals are typically not supported - Gateway uses API to mint on destination
    // This is a placeholder for future implementations
    throw new Error('On-chain Gateway withdrawals not yet supported. Use Circle Gateway API for withdrawals.');
  }

  /**
   * Check if address/chain is Arc
   */
  isArcChain(chainOrAddress) {
    if (typeof chainOrAddress === 'string') {
      return chainOrAddress.toLowerCase() === 'arc' || 
             chainOrAddress.toLowerCase().includes('arc');
    }
    return false;
  }

  /**
   * Withdraw token to Arc for swap execution
   * Validates routing (must be from another chain to Arc)
   */
  async withdrawToArc({ token, amount, depositor, recipient = null, signer = null }) {
    // Validate: withdrawing to Arc is always valid (from any chain)
    const recipientAddress = recipient || this.gatewayAddresses.arc || depositor;
    
    return this.withdraw({
      token,
      amount,
      targetChain: 'arc',
      recipient: recipientAddress,
      depositor,
      signer
    });
  }

  /**
   * Deposit from Arc to Gateway (for later withdrawal to other chains)
   */
  async depositFromArc({ token, amount, depositor, signer = null, useOnChain = true }) {
    // Validate: depositing from Arc is always valid (to Gateway for later withdrawal)
    return this.deposit({
      chain: 'arc',
      token,
      amount,
      depositor,
      useOnChain,
      signer
    });
  }

  /**
   * Check Gateway wallet balance on-chain
   */
  async getOnChainBalance(chain, token, depositor = null) {
    const provider = this.getProvider(chain);
    
    if (!provider || this.gatewayAddresses[chain] === ethers.ZeroAddress) {
      return '0';
    }

    try {
      const gatewayAddress = this.gatewayAddresses[chain];
      
      // If depositor is provided, check their balance in Gateway
      if (depositor) {
        const gatewayWallet = new ethers.Contract(
          gatewayAddress,
          [
            'function totalBalance(address token, address depositor) external view returns (uint256)',
            'function availableBalance(address token, address depositor) external view returns (uint256)'
          ],
          provider
        );

        try {
          const balance = await gatewayWallet.totalBalance(token, depositor);
          return balance.toString();
        } catch (e) {
          // Fall back to regular token balance
        }
      }

      // Otherwise, check Gateway wallet's token balance
      const tokenContract = new ethers.Contract(
        token,
        ['function balanceOf(address) view returns (uint256)'],
        provider
      );

      const balance = await tokenContract.balanceOf(gatewayAddress);
      return balance.toString();
    } catch (error) {
      console.error(`Error fetching on-chain balance for ${chain}:`, error);
      return '0';
    }
  }

  /**
   * Get signer for a chain
   */
  getSigner(chain) {
    const provider = this.getProvider(chain);
    if (!provider) {
      throw new Error(`No RPC configured for ${chain}`);
    }
    if (!this.privateKey) {
      throw new Error('GATEWAY_PRIVATE_KEY or CCTP_PRIVATE_KEY not configured');
    }
    return new ethers.Wallet(this.privateKey, provider);
  }

  /**
   * Check withdrawal status
   */
  async getWithdrawalStatus(withdrawalId) {
    try {
      if (!this.apiKey) {
        return this.simulateWithdrawalStatus(withdrawalId);
      }

      const response = await axios.get(
        `${this.apiUrl}/withdrawals/${withdrawalId}`,
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );

      return response.data;
    } catch (error) {
      console.error('Error fetching withdrawal status:', error);
      return this.simulateWithdrawalStatus(withdrawalId);
    }
  }

  /**
   * Get provider for a chain
   */
  getProvider(chain) {
    const rpcUrls = {
      ethereum: process.env.ETHEREUM_RPC_URL,
      sepolia: process.env.SEPOLIA_RPC_URL || process.env.ETHEREUM_RPC_URL || 'https://ethereum-sepolia-rpc.publicnode.com',
      base: process.env.BASE_RPC_URL,
      polygon: process.env.POLYGON_RPC_URL,
      arc: process.env.ARC_RPC_URL
    };

    const url = rpcUrls[chain];
    if (!url) {
      console.warn(`No RPC URL configured for ${chain}`);
      return null;
    }
    return new ethers.JsonRpcProvider(url);
  }

  // ============================================================================
  // Simulation Methods (for demo when API not configured)
  // ============================================================================

  simulateGetBalance(depositor, token) {
    // Return realistic demo balance
    const balance = ethers.parseUnits('10000', 6).toString(); // 10,000 USDC
    console.log(`[SIMULATED] Gateway balance for ${depositor}: ${ethers.formatUnits(balance, 6)}`);
    return balance;
  }

  simulateDeposit(chain, token, amount, depositor) {
    const id = 'sim_dep_' + Math.random().toString(36).slice(2);
    console.log(`[SIMULATED] Gateway deposit: ${amount} from ${chain}`);
    console.log(`[SIMULATED] Deposit ID: ${id}`);
    
    return {
      id,
      status: 'simulated_complete',
      chain,
      token,
      amount,
      simulated: true
    };
  }

  simulateWithdraw(token, amount, targetChain, recipient) {
    const id = 'sim_wd_' + Math.random().toString(36).slice(2);
    const txHash = '0x' + Math.random().toString(16).slice(2).padStart(64, '0');
    
    console.log(`[SIMULATED] Gateway withdrawal: ${amount} to ${targetChain}`);
    console.log(`[SIMULATED] Withdrawal ID: ${id}`);
    console.log(`[SIMULATED] TX Hash: ${txHash}`);
    
    return {
      id,
      status: 'simulated_complete',
      targetChain,
      token,
      amount,
      txHash,
      simulated: true
    };
  }

  simulateWithdrawalStatus(withdrawalId) {
    return {
      id: withdrawalId,
      status: 'complete',
      completedAt: new Date().toISOString(),
      simulated: true
    };
  }

  /**
   * Clear balance cache for a depositor
   */
  clearBalanceCache(depositor) {
    for (const key of this.balanceCache.keys()) {
      if (key.startsWith(`${depositor}:`)) {
        this.balanceCache.delete(key);
      }
    }
  }

  /**
   * Distribute wrapped tokens to multiple destination chains
   * Used for initial LP setup: deposit on source chain, withdraw on all destination chains
   * 
   * @param {Object} params
   * @param {string} params.sourceChain - Chain where tokens are deposited (typically Arc)
   * @param {string} params.tokenAddress - Token address on source chain
   * @param {string} params.amount - Total amount to distribute
   * @param {string[]} params.destinationChains - Array of chains to distribute to
   * @param {string} params.depositor - Address depositing tokens
   * @param {string} params.recipient - Address receiving wrapped tokens on destination chains
   * @returns {Promise<Object>} Distribution results per chain
   */
  async distributeWrappedTokens({ sourceChain, tokenAddress, amount, destinationChains, depositor, recipient }) {
    console.log(`\n[GATEWAY] Starting wrapped token distribution`);
    console.log(`  Source: ${sourceChain}`);
    console.log(`  Token: ${tokenAddress}`);
    console.log(`  Total Amount: ${amount}`);
    console.log(`  Destinations: ${destinationChains.join(', ')}`);
    
    const results = {
      deposit: null,
      withdrawals: {},
      errors: {}
    };
    
    try {
      // Step 1: Deposit tokens to Gateway on source chain
      console.log(`\n[GATEWAY] Step 1: Depositing ${amount} tokens to Gateway on ${sourceChain}...`);
      results.deposit = await this.deposit({
        chain: sourceChain,
        token: tokenAddress,
        amount: amount,
        depositor: depositor
      });
      console.log(`  ✓ Deposit successful: ${results.deposit.id || results.deposit.txHash}`);
      
      // Step 2: Withdraw wrapped tokens on each destination chain
      const amountPerChain = (BigInt(amount) / BigInt(destinationChains.length)).toString();
      console.log(`\n[GATEWAY] Step 2: Distributing ${amountPerChain} wrapped tokens to each destination chain...`);
      
      for (const destChain of destinationChains) {
        try {
          console.log(`  Withdrawing to ${destChain}...`);
          const withdrawal = await this.withdraw({
            token: tokenAddress,
            amount: amountPerChain,
            targetChain: destChain,
            recipient: recipient || depositor,
            depositor: depositor
          });
          results.withdrawals[destChain] = withdrawal;
          console.log(`  ✓ Withdrawal to ${destChain} successful: ${withdrawal.id || withdrawal.txHash}`);
        } catch (error) {
          console.error(`  ✗ Withdrawal to ${destChain} failed:`, error.message);
          results.errors[destChain] = error.message;
        }
      }
      
      console.log(`\n[GATEWAY] Distribution complete:`);
      console.log(`  Successful withdrawals: ${Object.keys(results.withdrawals).length}/${destinationChains.length}`);
      if (Object.keys(results.errors).length > 0) {
        console.log(`  Errors: ${Object.keys(results.errors).join(', ')}`);
      }
      
      return results;
    } catch (error) {
      console.error(`[GATEWAY] Distribution failed:`, error);
      throw error;
    }
  }
}

