/**
 * Rebalancing Engine
 * 
 * Manages post-trade LP rebalancing across chains.
 * Ensures liquidity is optimally distributed after large trades.
 */

import { ethers } from 'ethers';

export class RebalancingEngine {
  constructor(lpMonitor, cctpCoordinator, gatewayCoordinator) {
    this.lpMonitor = lpMonitor;
    this.cctpCoordinator = cctpCoordinator;
    this.gatewayCoordinator = gatewayCoordinator;
    
    this.activeRebalances = new Map();
    this.rebalanceHistory = [];
    
    // Thresholds for rebalancing
    this.config = {
      minImbalancePercent: 20, // Trigger rebalance if pool is > 20% imbalanced
      targetBalancePercent: 50, // Target 50/50 balance
      maxRebalanceSize: ethers.parseUnits('100000', 6).toString(), // Max 100k per rebalance
      cooldownPeriod: 300000 // 5 minutes between rebalances per pool
    };
  }

  /**
   * Analyze current LP imbalances across all chains
   */
  async analyzeImbalances() {
    const depths = await this.lpMonitor.getAllDepths();
    const imbalances = [];

    for (const [chain, pools] of Object.entries(depths)) {
      for (const pool of pools) {
        const imbalance = this.calculateImbalance(pool);
        
        if (Math.abs(imbalance.percentDiff) > this.config.minImbalancePercent) {
          imbalances.push({
            chain,
            poolAddress: pool.poolAddress,
            token0: pool.token0,
            token1: pool.token1,
            reserve0: pool.reserve0,
            reserve1: pool.reserve1,
            imbalance,
            severity: this.categorizeSeverity(imbalance.percentDiff)
          });
        }
      }
    }

    return {
      timestamp: Date.now(),
      totalImbalances: imbalances.length,
      imbalances: imbalances.sort((a, b) => 
        Math.abs(b.imbalance.percentDiff) - Math.abs(a.imbalance.percentDiff)
      )
    };
  }

  /**
   * Calculate pool imbalance
   */
  calculateImbalance(pool) {
    const reserve0 = BigInt(pool.reserve0);
    const reserve1 = BigInt(pool.reserve1);
    
    // Calculate ratio deviation from 50/50
    const total = reserve0 + reserve1;
    const reserve0Percent = Number(reserve0 * 10000n / total) / 100;
    const reserve1Percent = Number(reserve1 * 10000n / total) / 100;
    
    const targetPercent = 50;
    const diff0 = reserve0Percent - targetPercent;
    const diff1 = reserve1Percent - targetPercent;
    
    return {
      reserve0Percent,
      reserve1Percent,
      percentDiff: Math.max(Math.abs(diff0), Math.abs(diff1)),
      excessToken: diff0 > 0 ? 'token0' : 'token1',
      deficitToken: diff0 > 0 ? 'token1' : 'token0',
      excessAmount: diff0 > 0 ? 
        (reserve0 - reserve1).toString() : 
        (reserve1 - reserve0).toString()
    };
  }

  /**
   * Categorize imbalance severity
   */
  categorizeSeverity(percentDiff) {
    if (percentDiff > 40) return 'critical';
    if (percentDiff > 30) return 'high';
    if (percentDiff > 20) return 'medium';
    return 'low';
  }

  /**
   * Create rebalancing plan after a trade
   */
  async createPlan(route, swapResult) {
    const plan = {
      id: 'rebal_' + Date.now(),
      timestamp: Date.now(),
      trigger: 'post_trade',
      route,
      swapResult,
      actions: []
    };

    // Analyze post-trade state
    const imbalances = await this.analyzeImbalances();
    
    if (imbalances.imbalances.length === 0) {
      plan.status = 'no_action_needed';
      return plan;
    }

    // For each significant imbalance, create rebalancing actions
    for (const imbalance of imbalances.imbalances) {
      if (imbalance.severity === 'critical' || imbalance.severity === 'high') {
        const actions = await this.createRebalanceActions(imbalance);
        plan.actions.push(...actions);
      }
    }

    plan.status = 'pending';
    plan.estimatedTime = this.estimateExecutionTime(plan.actions);
    
    return plan;
  }

  /**
   * Create specific rebalancing actions for an imbalance
   */
  async createRebalanceActions(imbalance) {
    const actions = [];
    
    // If Arc pool has excess USDC after a large swap, distribute to other chains
    if (imbalance.chain === 'arc' && imbalance.imbalance.excessToken === 'token0') {
      const excessAmount = BigInt(imbalance.imbalance.excessAmount);
      const amountToMove = excessAmount / 2n; // Move half to maintain some buffer
      
      // Split between available chains
      const targetChains = ['ethereum', 'base', 'polygon'].filter(
        chain => this.lpMonitor.chains.has(chain)
      );
      
      const amountPerChain = amountToMove / BigInt(targetChains.length);
      
      for (const targetChain of targetChains) {
        actions.push({
          type: 'cctp_transfer',
          sourceChain: 'arc',
          targetChain,
          token: imbalance.token0,
          amount: amountPerChain.toString(),
          reason: 'rebalance_excess_after_trade'
        });
      }
    }
    
    // If Arc pool has deficit of tokenOut, pull from other chains
    if (imbalance.chain === 'arc' && imbalance.imbalance.deficitToken === 'token1') {
      const deficitAmount = BigInt(imbalance.imbalance.excessAmount); // Same as excess of other token
      const amountToMove = deficitAmount / 2n;
      
      actions.push({
        type: 'gateway_withdrawal',
        targetChain: 'arc',
        token: imbalance.token1,
        amount: amountToMove.toString(),
        reason: 'rebalance_deficit_after_trade'
      });
    }
    
    return actions;
  }

  /**
   * Execute rebalancing plan
   */
  async execute(plan) {
    console.log(`Executing rebalancing plan: ${plan.id}`);
    console.log(`Total actions: ${plan.actions.length}`);
    
    this.activeRebalances.set(plan.id, {
      ...plan,
      status: 'executing',
      startTime: Date.now()
    });

    const results = [];
    
    for (const action of plan.actions) {
      try {
        let result;
        
        if (action.type === 'cctp_transfer') {
          result = await this.cctpCoordinator.initiateTransfer({
            sourceChain: action.sourceChain,
            amount: action.amount,
            destinationChain: action.targetChain
          });
        } else if (action.type === 'gateway_withdrawal') {
          result = await this.gatewayCoordinator.withdrawToArc({
            token: action.token,
            amount: action.amount
          });
        }
        
        results.push({
          action,
          result,
          status: 'success'
        });
      } catch (error) {
        console.error(`Rebalancing action failed:`, error);
        results.push({
          action,
          error: error.message,
          status: 'failed'
        });
      }
    }

    const finalPlan = {
      ...plan,
      status: 'completed',
      endTime: Date.now(),
      results
    };

    this.activeRebalances.set(plan.id, finalPlan);
    this.rebalanceHistory.push(finalPlan);
    
    // Keep history limited to last 100
    if (this.rebalanceHistory.length > 100) {
      this.rebalanceHistory.shift();
    }

    return finalPlan;
  }

  /**
   * Execute rebalancing asynchronously (don't wait for completion)
   */
  async executeAsync(plan) {
    // Execute in background without awaiting
    this.execute(plan).catch(error => {
      console.error('Async rebalancing error:', error);
    });
    
    return {
      planId: plan.id,
      status: 'initiated',
      message: 'Rebalancing started in background'
    };
  }

  /**
   * Get current rebalancing status
   */
  async getStatus() {
    const active = Array.from(this.activeRebalances.values())
      .filter(r => r.status === 'executing');
    
    const recent = this.rebalanceHistory.slice(-10);
    
    return {
      activeRebalances: active.length,
      active,
      recentHistory: recent,
      totalExecuted: this.rebalanceHistory.length
    };
  }

  /**
   * Estimate execution time for rebalancing actions
   */
  estimateExecutionTime(actions) {
    let maxTime = 0;
    
    for (const action of actions) {
      if (action.type === 'cctp_transfer') {
        maxTime = Math.max(maxTime, 900); // 15 minutes for CCTP
      } else if (action.type === 'gateway_withdrawal') {
        maxTime = Math.max(maxTime, 120); // 2 minutes for Gateway
      }
    }
    
    return maxTime;
  }

  /**
   * Check if pool is due for rebalancing
   */
  canRebalance(poolAddress) {
    const lastRebalance = this.rebalanceHistory
      .filter(r => r.actions.some(a => a.poolAddress === poolAddress))
      .sort((a, b) => b.timestamp - a.timestamp)[0];
    
    if (!lastRebalance) return true;
    
    const timeSinceLastRebalance = Date.now() - lastRebalance.timestamp;
    return timeSinceLastRebalance > this.config.cooldownPeriod;
  }

  /**
   * Get rebalancing statistics
   */
  getStats() {
    const total = this.rebalanceHistory.length;
    const successful = this.rebalanceHistory.filter(r => r.status === 'completed').length;
    const failed = this.rebalanceHistory.filter(r => r.status === 'failed').length;
    
    const totalActions = this.rebalanceHistory.reduce((sum, r) => 
      sum + r.actions.length, 0
    );
    
    return {
      totalRebalances: total,
      successful,
      failed,
      successRate: total > 0 ? (successful / total * 100).toFixed(2) + '%' : '0%',
      totalActions,
      averageActionsPerRebalance: total > 0 ? (totalActions / total).toFixed(2) : '0'
    };
  }
}

