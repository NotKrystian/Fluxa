// src/index.js (MERGED VERSION)

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

// ============ GITHUB'S SERVICES ============
import { LPMonitor } from './services/LPMonitor.js';
import { RouteOptimizer } from './services/RouteOptimizer.js';
import { CCTPCoordinator } from './services/CCTPCoordinator.js';
import { GatewayCoordinator } from './services/GatewayCoordinator.js';
import { RebalancingEngine } from './services/RebalancingEngine.js';
import { TokenRegistryService } from './services/TokenRegistryService.js';

// ============ YOUR ADVANCED SERVICES ============
import { RouteOptimizerV2 } from './services/RouteOptimizerV2.js';
import { LiquidityAggregator } from './services/LiquidityAggregator.js';
import { RiskAnalyzer } from './services/RiskAnalyzer.js';

// ============ YOUR MODULES ============
import { simulateAcrossPools } from './advanced/simulator/priceImpact.js';
import { estimateRouteCost } from './advanced/simulator/gasEstimator.js';
import { planFromCandidates } from './advanced/router/planner.js';

dotenv.config({ path: '../.env' });

const app = express();
const PORT = process.env.BACKEND_PORT || 3001;

app.use(cors());
app.use(express.json());

// ============ INITIALIZE GITHUB SERVICES ============
const tokenRegistry = new TokenRegistryService();
const lpMonitor = new LPMonitor();
const routeOptimizer = new RouteOptimizer(lpMonitor);
const cctpCoordinator = new CCTPCoordinator();
const gatewayCoordinator = new GatewayCoordinator(tokenRegistry);
const rebalancingEngine = new RebalancingEngine(lpMonitor, cctpCoordinator, gatewayCoordinator);

// ============ INITIALIZE YOUR ADVANCED SERVICES ============
const routeOptimizerV2 = new RouteOptimizerV2(lpMonitor);
const liquidityAggregator = new LiquidityAggregator(lpMonitor);
const riskAnalyzer = new RiskAnalyzer();

// ============ GITHUB'S EXISTING ENDPOINTS (KEEP ALL) ============

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

app.get('/api/lp-depths', async (req, res) => {
  try {
    const depths = await lpMonitor.getAllDepths();
    res.json({ success: true, data: depths });
  } catch (error) {
    console.error('Error fetching LP depths:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ... [Keep ALL of GitHub's existing endpoints] ...

// ============ YOUR ADVANCED ENDPOINTS (ADD AFTER GITHUB'S) ============

/**
 * GET /api/v2/liquidity/aggregated
 * Get aggregated liquidity from vaults + external DEXes
 */
app.get('/api/v2/liquidity/aggregated', async (req, res) => {
  try {
    const { family, chain, includeExternal = true } = req.query;
    
    const liquidity = await liquidityAggregator.getAggregatedLiquidity({
      family,
      chain,
      includeExternal: includeExternal === 'true'
    });
    
    res.json({ success: true, data: liquidity });
  } catch (error) {
    console.error('Aggregated liquidity error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/v2/quote/advanced
 * Get quote with advanced scoring + risk analysis
 */
app.post('/api/v2/quote/advanced', async (req, res) => {
  try {
    const { tokenIn, tokenOut, amountIn, sourceChain } = req.body;
    
    // Get route with advanced scoring
    const route = await routeOptimizerV2.findOptimalRoute({
      tokenIn,
      tokenOut,
      amountIn,
      sourceChain
    });
    
    // Add risk analysis
    const risk = riskAnalyzer.analyzeRoute(route);
    
    res.json({ 
      success: true, 
      data: {
        ...route,
        riskAnalysis: risk
      }
    });
  } catch (error) {
    console.error('Advanced quote error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/v2/simulate/price-impact
 * Simulate price impact across all liquidity sources
 */
app.post('/api/v2/simulate/price-impact', async (req, res) => {
  try {
    const { amountIn, tokenIn, tokenOut, chain } = req.body;
    
    // Get all available pools
    const liquidity = await liquidityAggregator.getAggregatedLiquidity({ chain });
    
    // Simulate across all pools
    const simulation = simulateAcrossPools(amountIn, liquidity.combined);
    
    res.json({ success: true, data: simulation });
  } catch (error) {
    console.error('Price impact simulation error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/v2/route/plan
 * Generate canonical route plan with hash (for commitment)
 */
app.post('/api/v2/route/plan', async (req, res) => {
  try {
    const { candidates, userAddress, requestId } = req.body;
    
    if (!candidates || !Array.isArray(candidates)) {
      return res.status(400).json({
        success: false,
        error: 'candidates array required'
      });
    }
    
    // Generate plan with scoring + hash
    const result = planFromCandidates(candidates, {
      userAddress,
      requestId,
      topFallbackCount: 3
    });
    
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Route planning error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/v2/risk/analyze
 * Analyze risk for a specific token/chain combination
 */
app.post('/api/v2/risk/analyze', async (req, res) => {
  try {
    const { token, chain, route } = req.body;
    
    let analysis;
    
    if (route) {
      // Full route risk analysis
      analysis = riskAnalyzer.analyzeRoute(route);
    } else {
      // Simple token risk
      const { getRiskScore } = await import('./advanced/stablecoin/risk.js');
      analysis = getRiskScore(token, chain);
    }
    
    res.json({ success: true, data: analysis });
  } catch (error) {
    console.error('Risk analysis error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/v2/gas/estimate
 * Estimate gas costs for different execution paths
 */
app.get('/api/v2/gas/estimate', async (req, res) => {
  try {
    const { chain, usesCCTP, cctpSrc, cctpDst } = req.query;
    
    const estimate = estimateRouteCost({
      chain,
      usesCCTP: usesCCTP === 'true',
      cctpSrc,
      cctpDst
    });
    
    res.json({ success: true, data: estimate });
  } catch (error) {
    console.error('Gas estimation error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============ START SERVER ============

await lpMonitor.start();
console.log('✓ LP Monitor started');

app.listen(PORT, () => {
  console.log(`\n🚀 Fluxa Backend running on port ${PORT}`);
  console.log(`\nGitHub API Endpoints:`);
  console.log(`  GET  /health`);
  console.log(`  GET  /api/lp-depths`);
  console.log(`  POST /api/quote`);
  console.log(`  POST /api/execute-highvalue`);
  console.log(`\nAdvanced API Endpoints (v2):`);
  console.log(`  GET  /api/v2/liquidity/aggregated`);
  console.log(`  POST /api/v2/quote/advanced`);
  console.log(`  POST /api/v2/simulate/price-impact`);
  console.log(`  POST /api/v2/route/plan`);
  console.log(`  POST /api/v2/risk/analyze`);
  console.log(`  GET  /api/v2/gas/estimate`);
  console.log(`\n`);
});

export default app;