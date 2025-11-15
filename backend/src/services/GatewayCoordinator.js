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
    
    console.log(this.useRealGateway ? 
      '✓ Real Circle Gateway API configured' : 
      '⚠ No Circle API key - operations will fail without real Gateway'
    );
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
   */
  async deposit({ chain, token, amount, depositor, tokenId, chainId }) {
    console.log(`Depositing ${amount} of ${token} to Gateway from ${chain}`);

    // Validate token is registered if tokenId provided
    if (tokenId && chainId) {
      await this.validateToken(tokenId, chainId);
    }

    if (!this.useRealGateway) {
      throw new Error('Circle Gateway API key not configured');
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
        txHash: response.data.data?.transactionHash
      };
    } catch (error) {
      console.error('Gateway deposit error:', error);
      throw new Error(`Failed to deposit to Gateway: ${error.message}`);
    }
  }

  /**
   * Withdraw token from Gateway to a specific chain (REAL Circle Gateway API)
   */
  async withdraw({ token, amount, targetChain, recipient, depositor, tokenId, chainId }) {
    console.log(`Withdrawing ${amount} of ${token} from Gateway to ${targetChain}`);

    // Validate token is registered if tokenId provided
    if (tokenId && chainId) {
      await this.validateToken(tokenId, chainId);
    }

    if (!this.useRealGateway) {
      throw new Error('Circle Gateway API key not configured');
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
        txHash: response.data.data?.transactionHash
      };
    } catch (error) {
      console.error('Gateway withdrawal error:', error);
      throw new Error(`Failed to withdraw from Gateway: ${error.message}`);
    }
  }

  /**
   * Withdraw token to Arc for swap execution
   */
  async withdrawToArc({ token, amount, depositor }) {
    return this.withdraw({
      token,
      amount,
      targetChain: 'arc',
      recipient: this.gatewayAddresses.arc,
      depositor
    });
  }

  /**
   * Check Gateway wallet balance on-chain
   */
  async getOnChainBalance(chain, token) {
    const provider = this.getProvider(chain);
    
    if (!provider || this.gatewayAddresses[chain] === ethers.ZeroAddress) {
      return '0';
    }

    try {
      const tokenContract = new ethers.Contract(
        token,
        ['function balanceOf(address) view returns (uint256)'],
        provider
      );

      const balance = await tokenContract.balanceOf(this.gatewayAddresses[chain]);
      return balance.toString();
    } catch (error) {
      console.error(`Error fetching on-chain balance for ${chain}:`, error);
      return '0';
    }
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
      base: process.env.BASE_RPC_URL,
      polygon: process.env.POLYGON_RPC_URL,
      arc: process.env.ARC_RPC_URL
    };

    const url = rpcUrls[chain];
    return url ? new ethers.JsonRpcProvider(url) : null;
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
}

