/**
 * LP Pool Migration Service
 * 
 * Temporarily migrates LP pools from remote chains to Arc for transaction execution.
 * After execution, pools are rebased to maintain equal FLX prices across all chains.
 * 
 * Process:
 * 1. Remove liquidity from remote chain pools
 * 2. Transfer tokens via Gateway to Arc
 * 3. Transfer USDC via CCTP to Arc
 * 4. Add liquidity to Arc pool
 */

import { ethers } from 'ethers';

export class LPMigrationService {
  constructor(lpMonitor, cctpCoordinator, gatewayCoordinator) {
    this.lpMonitor = lpMonitor;
    this.cctpCoordinator = cctpCoordinator;
    this.gatewayCoordinator = gatewayCoordinator;
    
    this.activeMigrations = new Map();
    this.migrationHistory = [];
  }

  /**
   * Migrate liquidity from remote chains to Arc for swap execution
   * 
   * @param {Object} route - Route object from RouteOptimizer
   * @param {string} recipient - Address to receive migrated liquidity on Arc
   * @returns {Promise<Object>} Migration results
   */
  async migratePoolsToArc(route, recipient) {
    const migrationId = `migration_${Date.now()}`;
    
    console.log(`\n${'='.repeat(60)}`);
    console.log(`[LP MIGRATION] Starting migration: ${migrationId}`);
    console.log(`${'='.repeat(60)}\n`);
    
    const migration = {
      id: migrationId,
      timestamp: Date.now(),
      route,
      recipient,
      status: 'in_progress',
      steps: [],
      results: {}
    };

    this.activeMigrations.set(migrationId, migration);

    try {
      // Get remote chains from route
      const remoteChains = route.selectedRoute?.remoteChains || [];
      
      if (remoteChains.length === 0) {
        console.log('[LP MIGRATION] No remote chains to migrate - using local Arc pool only');
        migration.status = 'skipped';
        migration.reason = 'No remote chains in route';
        return migration;
      }

      console.log(`[LP MIGRATION] Migrating pools from ${remoteChains.length} remote chain(s): ${remoteChains.join(', ')}`);

      // Step 1: Remove liquidity from remote chain pools
      migration.steps.push({ step: 'remove_liquidity', status: 'in_progress' });
      const removeLiquidityResults = await this.removeLiquidityFromRemotePools(route, recipient);
      migration.results.removeLiquidity = removeLiquidityResults;
      migration.steps.push({ step: 'remove_liquidity', status: 'complete', results: removeLiquidityResults });

      // Step 2: Transfer tokens via Gateway to Arc
      migration.steps.push({ step: 'gateway_transfer', status: 'in_progress' });
      const gatewayResults = await this.transferTokensViaGateway(removeLiquidityResults, recipient);
      migration.results.gateway = gatewayResults;
      migration.steps.push({ step: 'gateway_transfer', status: 'complete', results: gatewayResults });

      // Step 3: Transfer USDC via CCTP to Arc
      migration.steps.push({ step: 'cctp_transfer', status: 'in_progress' });
      const cctpResults = await this.transferUSDCViaCCTP(removeLiquidityResults, recipient);
      migration.results.cctp = cctpResults;
      migration.steps.push({ step: 'cctp_transfer', status: 'complete', results: cctpResults });

      // Step 4: Add liquidity to Arc pool
      migration.steps.push({ step: 'add_liquidity_arc', status: 'in_progress' });
      const addLiquidityResult = await this.addLiquidityToArcPool(
        gatewayResults,
        cctpResults,
        recipient
      );
      migration.results.addLiquidity = addLiquidityResult;
      migration.steps.push({ step: 'add_liquidity_arc', status: 'complete', results: addLiquidityResult });

      migration.status = 'completed';
      migration.endTime = Date.now();
      migration.elapsed = (migration.endTime - migration.timestamp) / 1000;

      console.log(`\n[LP MIGRATION] ✅ Migration completed in ${migration.elapsed.toFixed(2)}s`);
      console.log(`[LP MIGRATION] Total tokens migrated: ${this.formatAmount(addLiquidityResult.totalTokens, 18)} FLX`);
      console.log(`[LP MIGRATION] Total USDC migrated: ${this.formatAmount(addLiquidityResult.totalUSDC, 6)} USDC`);

      this.migrationHistory.push(migration);
      if (this.migrationHistory.length > 100) {
        this.migrationHistory.shift();
      }

      return migration;
    } catch (error) {
      console.error(`[LP MIGRATION] ❌ Migration failed:`, error);
      migration.status = 'failed';
      migration.error = error.message;
      migration.endTime = Date.now();
      
      this.migrationHistory.push(migration);
      throw error;
    } finally {
      this.activeMigrations.delete(migrationId);
    }
  }

  /**
   * Remove liquidity from remote chain pools
   */
  async removeLiquidityFromRemotePools(route, recipient) {
    const results = {};
    const remotePools = route.selectedRoute?.pools?.filter(p => p.chain !== 'arc') || [];

    console.log(`[LP MIGRATION] Removing liquidity from ${remotePools.length} remote pool(s)...`);

    for (const pool of remotePools) {
      try {
        console.log(`  Removing liquidity from ${pool.chain} pool: ${pool.address}`);
        
        // Get pool contract
        const provider = this.getProvider(pool.chain);
        if (!provider) {
          throw new Error(`No provider for chain: ${pool.chain}`);
        }

        const deployer = new ethers.Wallet(
          process.env.PRIVATE_KEY || process.env.CCTP_PRIVATE_KEY,
          provider
        );

        // Get LP token balance (how much LP the deployer owns)
        const poolContract = new ethers.Contract(
          pool.address,
          [
            'function balanceOf(address) view returns (uint256)',
            'function removeLiquidity(uint256 amount0Min, uint256 amount1Min, address to, uint256 deadline) returns (uint256 amount0, uint256 amount1)',
            'function getReserves() view returns (uint112 reserve0, uint112 reserve1)',
            'function token0() view returns (address)',
            'function token1() view returns (address)'
          ],
          deployer
        );

        const lpBalance = await poolContract.balanceOf(deployer.address);
        
        if (lpBalance === 0n) {
          console.log(`    ⚠️  No LP tokens owned on ${pool.chain} - skipping`);
          results[pool.chain] = {
            status: 'skipped',
            reason: 'No LP tokens owned'
          };
          continue;
        }

        // Remove all liquidity (use 0 min amounts for simplicity - in production, calculate proper amounts)
        const deadline = Math.floor(Date.now() / 1000) + 600; // 10 minutes
        const removeTx = await poolContract.removeLiquidity(
          0n, // amount0Min
          0n, // amount1Min
          recipient, // to
          deadline
        );
        
        const receipt = await removeTx.wait();
        
        // Parse events to get actual amounts removed
        const [token0, token1] = await Promise.all([
          poolContract.token0(),
          poolContract.token1()
        ]);

        // Find Burn event in receipt
        let amount0 = 0n;
        let amount1 = 0n;
        
        for (const log of receipt.logs) {
          try {
            const parsed = poolContract.interface.parseLog(log);
            if (parsed && parsed.name === 'Burn') {
              amount0 = parsed.args.amount0 || 0n;
              amount1 = parsed.args.amount1 || 0n;
              break;
            }
          } catch (e) {
            // Not the event we're looking for
          }
        }

        // If events not found, estimate from reserves and LP balance
        if (amount0 === 0n && amount1 === 0n) {
          const [reserve0, reserve1] = await poolContract.getReserves();
          const totalSupply = await poolContract.totalSupply();
          amount0 = (reserve0 * lpBalance) / totalSupply;
          amount1 = (reserve1 * lpBalance) / totalSupply;
        }

        results[pool.chain] = {
          status: 'success',
          txHash: receipt.hash,
          token0,
          token1,
          amount0: amount0.toString(),
          amount1: amount1.toString(),
          lpRemoved: lpBalance.toString()
        };

        console.log(`    ✅ Removed ${this.formatAmount(amount0, 18)} token0, ${this.formatAmount(amount1, 6)} token1`);
      } catch (error) {
        console.error(`    ❌ Failed to remove liquidity from ${pool.chain}:`, error.message);
        results[pool.chain] = {
          status: 'failed',
          error: error.message
        };
      }
    }

    return results;
  }

  /**
   * Transfer tokens via Gateway to Arc
   */
  async transferTokensViaGateway(removeLiquidityResults, recipient) {
    const results = {};

    console.log(`[LP MIGRATION] Transferring tokens via Gateway to Arc...`);

    for (const [chain, result] of Object.entries(removeLiquidityResults)) {
      if (result.status !== 'success') continue;

      try {
        // Determine which token is FLX (token0 or token1)
        // In our pools, token0 is typically FLX, token1 is USDC
        const flxToken = result.token0; // Assuming token0 is FLX
        const flxAmount = result.amount0;

        if (flxAmount === 0n || BigInt(flxAmount) === 0n) {
          console.log(`  ⚠️  No FLX to transfer from ${chain}`);
          continue;
        }

        console.log(`  Transferring ${this.formatAmount(flxAmount, 18)} FLX from ${chain} to Arc...`);

        // Withdraw via Gateway to Arc
        const withdrawal = await this.gatewayCoordinator.withdrawToArc({
          token: flxToken,
          amount: flxAmount.toString(),
          depositor: recipient, // Assuming recipient is the depositor
          recipient: recipient
        });

        results[chain] = {
          status: 'success',
          token: flxToken,
          amount: flxAmount.toString(),
          withdrawal
        };

        console.log(`    ✅ Gateway withdrawal initiated: ${withdrawal.id || withdrawal.txHash}`);
      } catch (error) {
        console.error(`    ❌ Failed to transfer tokens from ${chain}:`, error.message);
        results[chain] = {
          status: 'failed',
          error: error.message
        };
      }
    }

    return results;
  }

  /**
   * Transfer USDC via CCTP to Arc
   */
  async transferUSDCViaCCTP(removeLiquidityResults, recipient) {
    const results = {};

    console.log(`[LP MIGRATION] Transferring USDC via CCTP to Arc...`);

    for (const [chain, result] of Object.entries(removeLiquidityResults)) {
      if (result.status !== 'success') continue;

      try {
        // token1 is typically USDC
        const usdcAmount = result.amount1;

        if (usdcAmount === 0n || BigInt(usdcAmount) === 0n) {
          console.log(`  ⚠️  No USDC to transfer from ${chain}`);
          continue;
        }

        console.log(`  Transferring ${this.formatAmount(usdcAmount, 6)} USDC from ${chain} to Arc...`);

        // Create CCTP transfer
        const transfer = await this.cctpCoordinator.createPendingTransfer({
          sourceChain: chain,
          destinationChain: 'arc',
          amount: usdcAmount.toString(),
          recipient: recipient,
          useFastAttestation: true
        });

        results[chain] = {
          status: 'created',
          amount: usdcAmount.toString(),
          transferId: transfer.transferId,
          walletAddress: transfer.walletAddress
        };

        console.log(`    ✅ CCTP transfer created: ${transfer.transferId}`);
        console.log(`    ⚠️  Note: User must send USDC to wallet ${transfer.walletAddress} and execute transfer`);
      } catch (error) {
        console.error(`    ❌ Failed to create CCTP transfer from ${chain}:`, error.message);
        results[chain] = {
          status: 'failed',
          error: error.message
        };
      }
    }

    return results;
  }

  /**
   * Add liquidity to Arc pool
   */
  async addLiquidityToArcPool(gatewayResults, cctpResults, recipient) {
    console.log(`[LP MIGRATION] Adding liquidity to Arc pool...`);

    // Wait for Gateway withdrawals and CCTP transfers to complete
    // For now, we'll assume they're completed (in production, poll for completion)
    
    // Get Arc pool address from route or LP monitor
    const arcDepths = await this.lpMonitor.getDepths('arc');
    const arcPool = arcDepths.find(p => p.poolAddress);
    
    if (!arcPool) {
      throw new Error('Arc pool not found');
    }

    // Sum up all tokens and USDC from migrations
    let totalTokens = 0n;
    let totalUSDC = 0n;

    for (const [chain, result] of Object.entries(gatewayResults)) {
      if (result.status === 'success') {
        totalTokens += BigInt(result.amount);
      }
    }

    for (const [chain, result] of Object.entries(cctpResults)) {
      if (result.status === 'created' || result.status === 'success') {
        totalUSDC += BigInt(result.amount);
      }
    }

    if (totalTokens === 0n || totalUSDC === 0n) {
      throw new Error('No tokens or USDC to add to Arc pool');
    }

    console.log(`  Total tokens: ${this.formatAmount(totalTokens, 18)} FLX`);
    console.log(`  Total USDC: ${this.formatAmount(totalUSDC, 6)} USDC`);

    // Get provider and deployer for Arc
    const provider = this.getProvider('arc');
    if (!provider) {
      throw new Error('No provider for Arc');
    }

    const deployer = new ethers.Wallet(
      process.env.PRIVATE_KEY || process.env.CCTP_PRIVATE_KEY,
      provider
    );

    // Get pool contract
    const poolContract = new ethers.Contract(
      arcPool.poolAddress,
      [
        'function addLiquidity(uint256 amount0Desired, uint256 amount1Desired, uint256 amount0Min, uint256 amount1Min, address to, uint256 deadline) returns (uint256 amount0, uint256 amount1, uint256 liquidity)',
        'function token0() view returns (address)',
        'function token1() view returns (address)'
      ],
      deployer
    );

    // Get token addresses
    const [token0, token1] = await Promise.all([
      poolContract.token0(),
      poolContract.token1()
    ]);

    // Determine which is FLX and which is USDC
    const flxToken = token0; // Assuming token0 is FLX
    const usdcToken = token1; // Assuming token1 is USDC

    // Approve tokens
    const flxContract = new ethers.Contract(
      flxToken,
      ['function approve(address, uint256) returns (bool)'],
      deployer
    );
    const usdcContract = new ethers.Contract(
      usdcToken,
      ['function approve(address, uint256) returns (bool)'],
      deployer
    );

    await flxContract.approve(arcPool.poolAddress, totalTokens);
    await usdcContract.approve(arcPool.poolAddress, totalUSDC);

    // Add liquidity
    const deadline = Math.floor(Date.now() / 1000) + 600; // 10 minutes
    const addTx = await poolContract.addLiquidity(
      totalTokens,  // amount0Desired
      totalUSDC,    // amount1Desired
      totalTokens,  // amount0Min
      totalUSDC,    // amount1Min
      recipient,    // to
      deadline
    );

    const receipt = await addTx.wait();

    return {
      status: 'success',
      txHash: receipt.hash,
      totalTokens: totalTokens.toString(),
      totalUSDC: totalUSDC.toString(),
      poolAddress: arcPool.poolAddress
    };
  }

  /**
   * Get provider for a chain
   */
  getProvider(chain) {
    // Use CCTPCoordinator's provider if available
    if (this.cctpCoordinator && this.cctpCoordinator.getProvider) {
      return this.cctpCoordinator.getProvider(chain);
    }
    
    // Fallback to environment variables
    const rpcUrls = {
      arc: process.env.ARC_RPC_URL,
      base: process.env.BASE_SEPOLIA_RPC_URL || process.env.BASE_RPC_URL,
      'base-sepolia': process.env.BASE_SEPOLIA_RPC_URL || process.env.BASE_RPC_URL,
      basesepolia: process.env.BASE_SEPOLIA_RPC_URL || process.env.BASE_RPC_URL,
      polygon: process.env.POLYGON_AMOY_RPC_URL || process.env.POLYGON_RPC_URL,
      'polygon-amoy': process.env.POLYGON_AMOY_RPC_URL || process.env.POLYGON_RPC_URL
    };

    const rpcUrl = rpcUrls[chain];
    if (!rpcUrl) {
      return null;
    }

    return new ethers.JsonRpcProvider(rpcUrl);
  }

  /**
   * Format amount for display
   */
  formatAmount(amount, decimals) {
    return ethers.formatUnits(amount.toString(), decimals);
  }

  /**
   * Get migration status
   */
  getStatus(migrationId) {
    return this.activeMigrations.get(migrationId) || 
           this.migrationHistory.find(m => m.id === migrationId);
  }
}

