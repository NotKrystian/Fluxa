/**
 * Vault Aggregator Service
 * Handles draining and repopulating vaults via gateways for cross-chain swaps
 */

import { ethers } from 'ethers';

export class VaultAggregator {
  constructor() {
    console.log('[VaultAggregator] Initializing...');
    
    this.chains = {
      arc: {
        name: 'Arc Testnet',
        chainId: 5042002,
        rpcUrl: process.env.ARC_RPC_URL,
        gateway: process.env.ARC_GATEWAY,
        vault: process.env.ARC_FLX_VAULT
      },
      base: {
        name: 'Base Sepolia',
        chainId: 84532,
        rpcUrl: process.env.BASE_SEPOLIA_RPC_URL,
        gateway: process.env.BASE_GATEWAY,
        vault: process.env.BASE_SEPOLIA_FLX_VAULT
      }
    };

    // Gateway ABI
    this.gatewayAbi = [
      'function aggregateLiquidity(uint32 destChain) external returns (uint256 flxAmount, uint256 usdcAmount)',
      'function repopulateVault(uint256 flxAmount, uint256 usdcAmount) external',
      'function vault() external view returns (address)',
      'event LiquidityAggregationInitiated(uint32 indexed destChain, uint256 flxAmount, uint256 usdcAmount)',
      'event LiquidityRepopulated(uint256 flxAmount, uint256 usdcAmount)'
    ];

    // Coordinator wallet
    const privKey = process.env.PRIVATE_KEY || process.env.COORDINATOR_PRIVATE_KEY;
    if (!privKey) {
      console.error('❌ PRIVATE_KEY not found in .env');
      return;
    }

    // Initialize providers and wallets
    this.providers = {};
    this.wallets = {};
    this.gateways = {};

    for (const [key, config] of Object.entries(this.chains)) {
      if (config.rpcUrl && config.gateway) {
        this.providers[key] = new ethers.JsonRpcProvider(config.rpcUrl);
        this.wallets[key] = new ethers.Wallet(privKey, this.providers[key]);
        this.gateways[key] = new ethers.Contract(
          config.gateway,
          this.gatewayAbi,
          this.wallets[key]
        );
        console.log(`  ✓ ${config.name} connected`);
      }
    }

    console.log('✓ VaultAggregator initialized\n');
  }

  /**
   * Drain vault liquidity from a source chain to Arc
   */
  async drainVault(sourceChain) {
    console.log(`\n${'═'.repeat(80)}`);
    console.log(`🏦 DRAINING VAULT: ${sourceChain.toUpperCase()} → ARC`);
    console.log(`${'═'.repeat(80)}`);
    console.log(`⏰ ${new Date().toISOString()}`);

    const config = this.chains[sourceChain];
    if (!config) {
      throw new Error(`Chain ${sourceChain} not configured`);
    }

    const gateway = this.gateways[sourceChain];
    if (!gateway) {
      throw new Error(`Gateway not initialized for ${sourceChain}`);
    }

    try {
      // 1. Check vault
      console.log(`\n📍 Gateway: ${config.gateway}`);
      const vaultAddress = await gateway.vault();
      console.log(`📍 Vault: ${vaultAddress}`);

      if (vaultAddress === ethers.ZeroAddress) {
        throw new Error('No vault configured in gateway');
      }

      // 2. Call aggregateLiquidity
      const ARC_CHAIN_ID = 5042002;
      console.log(`\n📤 CONTRACT CALL: gateway.aggregateLiquidity(${ARC_CHAIN_ID})`);
      console.log(`   Function: Drain vault and send liquidity to Arc`);
      console.log(`   Signer: ${this.wallets[sourceChain].address}`);
      console.log(`   ⏰ ${new Date().toISOString()}`);

      const tx = await gateway.aggregateLiquidity(ARC_CHAIN_ID);
      
      console.log(`\n✅ TRANSACTION SENT`);
      console.log(`   TX Hash: ${tx.hash}`);
      console.log(`   Block: pending`);
      console.log(`   ⏰ ${new Date().toISOString()}`);
      console.log(`\n⏳ Waiting for confirmation...`);

      const receipt = await tx.wait();
      
      console.log(`\n✅ TRANSACTION CONFIRMED`);
      console.log(`   Block: ${receipt.blockNumber}`);
      console.log(`   Gas Used: ${receipt.gasUsed.toString()}`);
      console.log(`   Status: ${receipt.status === 1 ? 'Success' : 'Failed'}`);
      console.log(`   ⏰ ${new Date().toISOString()}`);

      // Parse events
      console.log(`\n📋 EVENTS:`);
      for (const log of receipt.logs) {
        try {
          const parsed = gateway.interface.parseLog(log);
          if (parsed) {
            console.log(`   • ${parsed.name}`);
            if (parsed.name === 'LiquidityAggregationInitiated') {
              console.log(`     - FLX Amount: ${ethers.formatEther(parsed.args.flxAmount)}`);
              console.log(`     - USDC Amount: ${ethers.formatUnits(parsed.args.usdcAmount, 6)}`);
              console.log(`     - Dest Chain: ${parsed.args.destChain}`);
            }
          }
        } catch (e) {
          // Not a gateway event
        }
      }

      console.log(`\n${'═'.repeat(80)}`);
      console.log(`✅ VAULT DRAINED SUCCESSFULLY`);
      console.log(`${'═'.repeat(80)}\n`);

      return {
        success: true,
        chain: sourceChain,
        txHash: tx.hash,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed.toString()
      };

    } catch (error) {
      console.error(`\n${'❌'.repeat(80)}`);
      console.error(`ERROR DRAINING VAULT`);
      console.error(`${'❌'.repeat(80)}`);
      console.error(`Chain: ${sourceChain}`);
      console.error(`Error: ${error.message}`);
      console.error(`⏰ ${new Date().toISOString()}`);
      console.error(`${'═'.repeat(80)}\n`);
      throw error;
    }
  }

  /**
   * Repopulate vault after swap
   */
  async repopulateVault(destChain, flxAmount, usdcAmount) {
    console.log(`\n${'═'.repeat(80)}`);
    console.log(`🔙 REPOPULATING VAULT: ${destChain.toUpperCase()}`);
    console.log(`${'═'.repeat(80)}`);
    console.log(`⏰ ${new Date().toISOString()}`);
    console.log(`FLX Amount: ${ethers.formatEther(flxAmount)}`);
    console.log(`USDC Amount: ${ethers.formatUnits(usdcAmount, 6)}`);

    const config = this.chains[destChain];
    if (!config) {
      throw new Error(`Chain ${destChain} not configured`);
    }

    const gateway = this.gateways[destChain];
    if (!gateway) {
      throw new Error(`Gateway not initialized for ${destChain}`);
    }

    try {
      console.log(`\n📤 CONTRACT CALL: gateway.repopulateVault(${flxAmount}, ${usdcAmount})`);
      console.log(`   Function: Return liquidity to vault`);
      console.log(`   Signer: ${this.wallets[destChain].address}`);
      console.log(`   ⏰ ${new Date().toISOString()}`);

      const tx = await gateway.repopulateVault(flxAmount, usdcAmount);
      
      console.log(`\n✅ TRANSACTION SENT`);
      console.log(`   TX Hash: ${tx.hash}`);
      console.log(`   ⏰ ${new Date().toISOString()}`);
      console.log(`\n⏳ Waiting for confirmation...`);

      const receipt = await tx.wait();
      
      console.log(`\n✅ TRANSACTION CONFIRMED`);
      console.log(`   Block: ${receipt.blockNumber}`);
      console.log(`   Gas Used: ${receipt.gasUsed.toString()}`);
      console.log(`   ⏰ ${new Date().toISOString()}`);

      console.log(`\n${'═'.repeat(80)}`);
      console.log(`✅ VAULT REPOPULATED SUCCESSFULLY`);
      console.log(`${'═'.repeat(80)}\n`);

      return {
        success: true,
        chain: destChain,
        txHash: tx.hash,
        blockNumber: receipt.blockNumber
      };

    } catch (error) {
      console.error(`\n${'❌'.repeat(80)}`);
      console.error(`ERROR REPOPULATING VAULT`);
      console.error(`${'❌'.repeat(80)}`);
      console.error(`Chain: ${destChain}`);
      console.error(`Error: ${error.message}`);
      console.error(`⏰ ${new Date().toISOString()}`);
      console.error(`${'═'.repeat(80)}\n`);
      throw error;
    }
  }

  /**
   * Aggregate liquidity from multiple chains
   */
  async aggregateFromMultipleChains(chains) {
    console.log(`\n${'═'.repeat(80)}`);
    console.log(`🌍 MULTI-CHAIN AGGREGATION`);
    console.log(`${'═'.repeat(80)}`);
    console.log(`⏰ ${new Date().toISOString()}`);
    console.log(`Chains: ${chains.join(', ')}`);

    const results = [];

    for (const chain of chains) {
      if (chain === 'arc') continue; // Don't drain Arc, we aggregate TO Arc

      try {
        const result = await this.drainVault(chain);
        results.push(result);
      } catch (error) {
        console.error(`Failed to drain ${chain}:`, error.message);
        // Continue with other chains
      }
    }

    console.log(`\n${'═'.repeat(80)}`);
    console.log(`✅ AGGREGATION COMPLETE: ${results.length}/${chains.filter(c => c !== 'arc').length} chains`);
    console.log(`${'═'.repeat(80)}\n`);

    return results;
  }
}

export default VaultAggregator;

