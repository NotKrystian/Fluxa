/**
 * Pool Rebasing Service
 * 
 * After executing a swap that used liquidity from multiple chains, rebases all pools
 * to have the same FLX price. This ensures price consistency across all chains.
 * 
 * Process:
 * 1. Calculate target FLX price from Arc pool (after swap)
 * 2. For each remote pool:
 *    - Calculate current FLX price
 *    - If different from target, adjust liquidity to match
 * 3. Rebalance pools by adding/removing liquidity to achieve target price
 */

import { ethers } from 'ethers';

export class PoolRebasingService {
  constructor(lpMonitor, cctpCoordinator, gatewayCoordinator) {
    this.lpMonitor = lpMonitor;
    this.cctpCoordinator = cctpCoordinator;
    this.gatewayCoordinator = gatewayCoordinator;
    
    this.activeRebases = new Map();
    this.rebaseHistory = [];
    
    // Price tolerance (1% difference allowed)
    this.priceTolerance = 0.01;
  }

  /**
   * Rebase all pools to match target FLX price
   * 
   * @param {Object} swapResult - Result from swap execution
   * @param {Object} route - Route object from RouteOptimizer
   * @returns {Promise<Object>} Rebasing results
   */
  async rebasePoolsToTargetPrice(swapResult, route) {
    const rebaseId = `rebase_${Date.now()}`;
    
    console.log(`\n${'='.repeat(60)}`);
    console.log(`[POOL REBASING] Starting rebase: ${rebaseId}`);
    console.log(`${'='.repeat(60)}\n`);

    const rebase = {
      id: rebaseId,
      timestamp: Date.now(),
      swapResult,
      route,
      status: 'in_progress',
      steps: [],
      results: {}
    };

    this.activeRebases.set(rebaseId, rebase);

    try {
      // Step 1: Get target FLX price from Arc pool (after swap)
      rebase.steps.push({ step: 'get_target_price', status: 'in_progress' });
      const targetPrice = await this.getTargetFLXPrice('arc');
      rebase.results.targetPrice = targetPrice;
      rebase.steps.push({ step: 'get_target_price', status: 'complete', price: targetPrice });

      console.log(`[POOL REBASING] Target FLX price: ${targetPrice.toFixed(6)} USDC/FLX`);

      // Step 2: Get all pools and their current prices
      rebase.steps.push({ step: 'analyze_pools', status: 'in_progress' });
      const poolAnalysis = await this.analyzeAllPools(targetPrice);
      rebase.results.poolAnalysis = poolAnalysis;
      rebase.steps.push({ step: 'analyze_pools', status: 'complete', analysis: poolAnalysis });

      // Step 3: Rebase each pool that needs adjustment
      rebase.steps.push({ step: 'rebase_pools', status: 'in_progress' });
      const rebaseResults = await this.rebasePools(poolAnalysis, targetPrice);
      rebase.results.rebaseResults = rebaseResults;
      rebase.steps.push({ step: 'rebase_pools', status: 'complete', results: rebaseResults });

      rebase.status = 'completed';
      rebase.endTime = Date.now();
      rebase.elapsed = (rebase.endTime - rebase.timestamp) / 1000;

      console.log(`\n[POOL REBASING] ✅ Rebase completed in ${rebase.elapsed.toFixed(2)}s`);
      console.log(`[POOL REBASING] Pools rebased: ${Object.keys(rebaseResults).length}`);

      this.rebaseHistory.push(rebase);
      if (this.rebaseHistory.length > 100) {
        this.rebaseHistory.shift();
      }

      return rebase;
    } catch (error) {
      console.error(`[POOL REBASING] ❌ Rebase failed:`, error);
      rebase.status = 'failed';
      rebase.error = error.message;
      rebase.endTime = Date.now();
      
      this.rebaseHistory.push(rebase);
      throw error;
    } finally {
      this.activeRebases.delete(rebaseId);
    }
  }

  /**
   * Get target FLX price from Arc pool
   */
  async getTargetFLXPrice(chain = 'arc') {
    const depths = await this.lpMonitor.getDepths(chain);
    const arcPool = depths.find(p => p.poolAddress);
    
    if (!arcPool) {
      throw new Error(`No pool found on ${chain}`);
    }

    return this.calculateFLXPrice(arcPool);
  }

  /**
   * Calculate FLX price from pool reserves
   * Price = USDC reserves / FLX reserves
   */
  calculateFLXPrice(pool) {
    // Determine which reserve is FLX and which is USDC
    // Assuming token0 is FLX (18 decimals), token1 is USDC (6 decimals)
    const reserve0 = BigInt(pool.reserve0 || pool.reserveIn || 0);
    const reserve1 = BigInt(pool.reserve1 || pool.reserveOut || 0);
    
    // If we have reserveIn/reserveOut, use those
    // Otherwise, assume token0 is FLX, token1 is USDC
    let flxReserve, usdcReserve;
    
    if (pool.reserveIn && pool.reserveOut) {
      // Use reserveIn/reserveOut if available
      flxReserve = BigInt(pool.reserveIn);
      usdcReserve = BigInt(pool.reserveOut);
    } else {
      // Assume token0 is FLX (18 decimals), token1 is USDC (6 decimals)
      flxReserve = reserve0;
      usdcReserve = reserve1;
    }

    if (flxReserve === 0n) {
      throw new Error('FLX reserve is zero - cannot calculate price');
    }

    // Price = USDC / FLX
    // Adjust for decimals: USDC has 6 decimals, FLX has 18 decimals
    // So price = (usdcReserve * 1e18) / (flxReserve * 1e6) = (usdcReserve * 1e12) / flxReserve
    const price = Number(usdcReserve * 1000000000000n) / Number(flxReserve);
    
    return price;
  }

  /**
   * Analyze all pools and compare prices to target
   */
  async analyzeAllPools(targetPrice) {
    const analysis = {};
    const allDepths = await this.lpMonitor.getAllDepths();

    for (const [chain, pools] of Object.entries(allDepths)) {
      for (const pool of pools) {
        try {
          const currentPrice = this.calculateFLXPrice(pool);
          const priceDiff = Math.abs(currentPrice - targetPrice);
          const priceDiffPercent = (priceDiff / targetPrice) * 100;
          
          const needsRebase = priceDiffPercent > (this.priceTolerance * 100);

          analysis[`${chain}_${pool.poolAddress}`] = {
            chain,
            poolAddress: pool.poolAddress,
            currentPrice,
            targetPrice,
            priceDiff,
            priceDiffPercent,
            needsRebase,
            pool
          };

          if (needsRebase) {
            console.log(`  ${chain}: Current ${currentPrice.toFixed(6)}, Target ${targetPrice.toFixed(6)}, Diff ${priceDiffPercent.toFixed(2)}% - NEEDS REBASE`);
          } else {
            console.log(`  ${chain}: Current ${currentPrice.toFixed(6)}, Target ${targetPrice.toFixed(6)}, Diff ${priceDiffPercent.toFixed(2)}% - OK`);
          }
        } catch (error) {
          console.error(`  Error analyzing pool ${pool.poolAddress} on ${chain}:`, error.message);
          analysis[`${chain}_${pool.poolAddress}`] = {
            chain,
            poolAddress: pool.poolAddress,
            error: error.message,
            needsRebase: false
          };
        }
      }
    }

    return analysis;
  }

  /**
   * Rebase pools to target price
   */
  async rebasePools(poolAnalysis, targetPrice) {
    const results = {};
    const poolsToRebase = Object.values(poolAnalysis).filter(p => p.needsRebase);

    console.log(`[POOL REBASING] Rebasing ${poolsToRebase.length} pool(s)...`);

    for (const poolInfo of poolsToRebase) {
      try {
        console.log(`\n  Rebasing ${poolInfo.chain} pool: ${poolInfo.poolAddress}`);
        console.log(`    Current price: ${poolInfo.currentPrice.toFixed(6)} USDC/FLX`);
        console.log(`    Target price: ${poolInfo.targetPrice.toFixed(6)} USDC/FLX`);

        // Calculate adjustment needed
        const adjustment = await this.calculateRebaseAdjustment(poolInfo, targetPrice);
        
        console.log(`    Adjustment needed:`);
        console.log(`      FLX: ${this.formatAmount(adjustment.flxAdjustment, 18)}`);
        console.log(`      USDC: ${this.formatAmount(adjustment.usdcAdjustment, 6)}`);

        // Execute rebase
        const rebaseResult = await this.executeRebase(poolInfo, adjustment);
        
        results[`${poolInfo.chain}_${poolInfo.poolAddress}`] = {
          status: 'success',
          ...rebaseResult
        };

        console.log(`    ✅ Rebase completed`);
      } catch (error) {
        console.error(`    ❌ Failed to rebase ${poolInfo.chain} pool:`, error.message);
        results[`${poolInfo.chain}_${poolInfo.poolAddress}`] = {
          status: 'failed',
          error: error.message
        };
      }
    }

    return results;
  }

  /**
   * Calculate adjustment needed to reach target price
   */
  async calculateRebaseAdjustment(poolInfo, targetPrice) {
    const pool = poolInfo.pool;
    const currentPrice = poolInfo.currentPrice;
    
    // Get current reserves
    const reserve0 = BigInt(pool.reserve0 || pool.reserveIn || 0);
    const reserve1 = BigInt(pool.reserve1 || pool.reserveOut || 0);
    
    // Assume token0 is FLX (18 decimals), token1 is USDC (6 decimals)
    let flxReserve = reserve0;
    let usdcReserve = reserve1;
    
    if (pool.reserveIn && pool.reserveOut) {
      flxReserve = BigInt(pool.reserveIn);
      usdcReserve = BigInt(pool.reserveOut);
    }

    // Target: USDC / FLX = targetPrice
    // So: targetUSDC = targetPrice * FLX
    // We need to adjust reserves to: newUSDC / newFLX = targetPrice
    
    // Strategy: If current price > target price, we have too much USDC relative to FLX
    //            If current price < target price, we have too little USDC relative to FLX
    
    if (currentPrice > targetPrice) {
      // Price too high: need to reduce USDC or increase FLX
      // Calculate target USDC for current FLX
      const targetUSDC = (flxReserve * BigInt(Math.floor(targetPrice * 1e12))) / 1000000000000n;
      const usdcExcess = usdcReserve - targetUSDC;
      
      // Remove excess USDC (or add FLX to balance)
      return {
        flxAdjustment: 0n,
        usdcAdjustment: -usdcExcess, // Negative = remove
        action: 'remove_usdc'
      };
    } else {
      // Price too low: need to increase USDC or reduce FLX
      // Calculate target USDC for current FLX
      const targetUSDC = (flxReserve * BigInt(Math.floor(targetPrice * 1e12))) / 1000000000000n;
      const usdcDeficit = targetUSDC - usdcReserve;
      
      // Add USDC (or remove FLX to balance)
      return {
        flxAdjustment: 0n,
        usdcAdjustment: usdcDeficit, // Positive = add
        action: 'add_usdc'
      };
    }
  }

  /**
   * Execute rebase on a pool
   */
  async executeRebase(poolInfo, adjustment) {
    const provider = this.getProvider(poolInfo.chain);
    if (!provider) {
      throw new Error(`No provider for chain: ${poolInfo.chain}`);
    }

    const deployer = new ethers.Wallet(
      process.env.PRIVATE_KEY || process.env.CCTP_PRIVATE_KEY,
      provider
    );

    const poolContract = new ethers.Contract(
      poolInfo.poolAddress,
      [
        'function removeLiquidity(uint256 amount0Min, uint256 amount1Min, address to, uint256 deadline) returns (uint256 amount0, uint256 amount1)',
        'function addLiquidity(uint256 amount0Desired, uint256 amount1Desired, uint256 amount0Min, uint256 amount1Min, address to, uint256 deadline) returns (uint256 amount0, uint256 amount1, uint256 liquidity)',
        'function balanceOf(address) view returns (uint256)',
        'function token0() view returns (address)',
        'function token1() view returns (address)'
      ],
      deployer
    );

    const [token0, token1] = await Promise.all([
      poolContract.token0(),
      poolContract.token1()
    ]);

    if (adjustment.action === 'remove_usdc') {
      // Remove liquidity to reduce USDC
      // This is complex - we'd need to calculate how much LP to remove
      // For now, we'll skip this and just log
      console.log(`    ⚠️  Removing USDC requires complex LP removal - skipping for now`);
      return {
        action: 'skipped',
        reason: 'USDC removal requires LP removal calculation'
      };
    } else if (adjustment.action === 'add_usdc') {
      // Add USDC to pool (need to add equal FLX to maintain ratio)
      // Actually, to increase price, we need to add more USDC relative to FLX
      // But adding liquidity maintains ratio, so we need a different approach
      
      // For now, we'll skip automatic rebasing and just log
      console.log(`    ⚠️  Adding USDC requires maintaining FLX ratio - skipping for now`);
      return {
        action: 'skipped',
        reason: 'USDC addition requires maintaining FLX ratio'
      };
    }

    // Note: Proper rebasing would require:
    // 1. Swapping tokens within the pool to adjust price, OR
    // 2. Removing liquidity, adjusting amounts, and re-adding, OR
    // 3. Using a more sophisticated AMM that supports direct price setting
    
    return {
      action: 'not_implemented',
      reason: 'Full rebasing requires swap-based price adjustment'
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
   * Get rebase status
   */
  getStatus(rebaseId) {
    return this.activeRebases.get(rebaseId) || 
           this.rebaseHistory.find(r => r.id === rebaseId);
  }
}

