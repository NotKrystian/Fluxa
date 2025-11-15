/**
 * Fluxa Backend - Multi-Chain Liquidity Routing Engine
 * 
 * Core services:
 * - LP depth monitoring across chains
 * - Route optimization for high-value swaps
 * - CCTP coordination
 * - Gateway integration
 * - LP rebalancing
 */

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { LPMonitor } from './services/LPMonitor.js';
import { RouteOptimizer } from './services/RouteOptimizer.js';
import { CCTPCoordinator } from './services/CCTPCoordinator.js';
import { GatewayCoordinator } from './services/GatewayCoordinator.js';
import { RebalancingEngine } from './services/RebalancingEngine.js';
import { TokenRegistryService } from './services/TokenRegistryService.js';
import { SwapQueue } from './services/SwapQueue.js';

dotenv.config({ path: '../.env' });

const app = express();
const PORT = process.env.BACKEND_PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Initialize services
const tokenRegistry = new TokenRegistryService();
const lpMonitor = new LPMonitor();
const routeOptimizer = new RouteOptimizer(lpMonitor);
const cctpCoordinator = new CCTPCoordinator();
const gatewayCoordinator = new GatewayCoordinator(tokenRegistry);
const rebalancingEngine = new RebalancingEngine(lpMonitor, cctpCoordinator, gatewayCoordinator);
const swapQueue = new SwapQueue(routeOptimizer, {
  initialLiquidity: process.env.QUEUE_INITIAL_LIQUIDITY || '1000000',
  executionDelayMs: Number(process.env.QUEUE_EXECUTION_DELAY_MS || 1500),
  settlementDelayMs: Number(process.env.QUEUE_SETTLEMENT_DELAY_MS || 4000),
  rebalanceDelayMs: Number(process.env.QUEUE_REBALANCE_DELAY_MS || 6000)
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

// ============================================================================
// LP Monitoring Endpoints
// ============================================================================

/**
 * GET /api/lp-depths
 * Returns current LP depths across all chains
 */
app.get('/api/lp-depths', async (req, res) => {
  try {
    const depths = await lpMonitor.getAllDepths();
    res.json({ success: true, data: depths });
  } catch (error) {
    console.error('Error fetching LP depths:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/lp-depths/:chain
 * Returns LP depths for a specific chain
 */
app.get('/api/lp-depths/:chain', async (req, res) => {
  try {
    const { chain } = req.params;
    const depths = await lpMonitor.getChainDepths(chain);
    res.json({ success: true, data: depths });
  } catch (error) {
    console.error(`Error fetching ${req.params.chain} depths:`, error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// Routing & Execution Endpoints
// ============================================================================

/**
 * POST /api/quote
 * Get best execution quote for a trade
 * 
 * Body:
 * {
 *   tokenIn: "0x...",
 *   tokenOut: "0x...",
 *   amountIn: "1000000000", // in wei
 *   sourceChain: "arc"
 * }
 */
app.post('/api/quote', async (req, res) => {
  try {
    const { tokenIn, tokenOut, amountIn, sourceChain } = req.body;
    
    if (!tokenIn || !tokenOut || !amountIn) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required fields: tokenIn, tokenOut, amountIn' 
      });
    }

    const quote = await routeOptimizer.getQuote({
      tokenIn,
      tokenOut,
      amountIn,
      sourceChain: sourceChain || 'arc'
    });

    res.json({ success: true, data: quote });
  } catch (error) {
    console.error('Error generating quote:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/execute-highvalue
 * Execute a high-value swap with multi-chain routing
 * 
 * Body:
 * {
 *   tokenIn: "0x...",
 *   tokenOut: "0x...",
 *   amountIn: "1000000000",
 *   minAmountOut: "990000000",
 *   recipient: "0x...",
 *   sourceChain: "arc",
 *   slippageTolerance: 0.01
 * }
 */
app.post('/api/execute-highvalue', async (req, res) => {
  try {
    const {
      tokenIn,
      tokenOut,
      amountIn,
      minAmountOut,
      recipient,
      sourceChain,
      slippageTolerance
    } = req.body;

    if (!tokenIn || !tokenOut || !amountIn || !recipient) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields'
      });
    }

    // 1. Generate optimal route
    const route = await routeOptimizer.findOptimalRoute({
      tokenIn,
      tokenOut,
      amountIn,
      sourceChain: sourceChain || 'arc',
      slippageTolerance: slippageTolerance || 0.01
    });

    // 2. Check if multi-chain routing is needed
    if (!route.requiresMultiChain) {
      return res.json({
        success: true,
        message: 'Single-chain execution sufficient',
        route,
        multiChain: false
      });
    }

    // 3. Execute multi-chain routing
    const execution = await executeMultiChainSwap({
      route,
      recipient,
      minAmountOut: minAmountOut || route.estimatedOutput * 0.99
    });

    res.json({
      success: true,
      data: execution,
      multiChain: true
    });
  } catch (error) {
    console.error('Error executing high-value swap:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Prototype queue endpoints
app.post('/api/queue/jobs', (req, res) => {
  try {
    const job = swapQueue.enqueue({
      tokenIn: req.body.tokenIn,
      tokenOut: req.body.tokenOut,
      amountIn: req.body.amountIn,
      sourceChain: req.body.sourceChain || 'arc',
      metadata: req.body.metadata || {}
    });

    res.json({ success: true, data: job });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

app.get('/api/queue/jobs', (req, res) => {
  try {
    const jobs = swapQueue.listJobs();
    res.json({ success: true, data: jobs });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/queue/jobs/:id', (req, res) => {
  try {
    const job = swapQueue.getJob(req.params.id);
    if (!job) {
      return res.status(404).json({ success: false, error: 'Job not found' });
    }
    res.json({ success: true, data: job });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Multi-chain swap execution orchestrator
 */
async function executeMultiChainSwap({ route, recipient, minAmountOut }) {
  const steps = [];

  try {
    // Step 1: Pull USDC via CCTP if needed (using Fast Attestation)
    if (route.cctpTransfers && route.cctpTransfers.length > 0) {
      steps.push({ step: 'cctp_initiate', status: 'in_progress' });
      
      const cctpResults = await Promise.all(
        route.cctpTransfers.map(transfer =>
          cctpCoordinator.initiateTransfer({
            ...transfer,
            useFastAttestation: true // Use fast attestation for speed
          })
        )
      );
      
      steps.push({ step: 'cctp_initiate', status: 'complete', results: cctpResults });
      
      // Wait for fast attestations (~20-60 seconds instead of ~15 minutes)
      steps.push({ step: 'cctp_attest', status: 'in_progress', fast: true });
      const attestationResults = await Promise.all(
        cctpResults.map(result => 
          cctpCoordinator.waitForAttestation(
            result.txHash, 
            result.useFastAttestation !== false // Use fast by default
          )
        )
      );
      steps.push({ 
        step: 'cctp_attest', 
        status: 'complete', 
        fast: true,
        results: attestationResults,
        avgTime: (attestationResults.reduce((sum, r) => sum + parseFloat(r.elapsed || 0), 0) / attestationResults.length).toFixed(1) + 's'
      });
    }

    // Step 2: Pull tokens via Gateway if needed
    if (route.gatewayWithdrawals && route.gatewayWithdrawals.length > 0) {
      steps.push({ step: 'gateway_withdraw', status: 'in_progress' });
      
      await Promise.all(
        route.gatewayWithdrawals.map(withdrawal =>
          gatewayCoordinator.withdrawToArc(withdrawal)
        )
      );
      
      steps.push({ step: 'gateway_withdraw', status: 'complete' });
    }

    // Step 3: Execute swap on Arc
    steps.push({ step: 'arc_swap', status: 'in_progress' });
    
    const swapResult = await executeArcSwap({
      tokenIn: route.tokenIn,
      tokenOut: route.tokenOut,
      amountIn: route.totalAmountIn,
      minAmountOut,
      recipient
    });
    
    steps.push({ step: 'arc_swap', status: 'complete', result: swapResult });

    // Step 4: Trigger rebalancing
    steps.push({ step: 'rebalance', status: 'in_progress' });
    
    const rebalancePlan = await rebalancingEngine.createPlan(route, swapResult);
    // Execute rebalancing asynchronously (don't wait)
    rebalancingEngine.executeAsync(rebalancePlan);
    
    steps.push({ step: 'rebalance', status: 'initiated' });

    return {
      steps,
      output: swapResult.amountOut,
      txHash: swapResult.txHash,
      route
    };
  } catch (error) {
    steps.push({ step: 'error', error: error.message });
    throw error;
  }
}

/**
 * Execute swap on Arc (simplified - will use actual router)
 */
async function executeArcSwap({ tokenIn, tokenOut, amountIn, minAmountOut, recipient }) {
  // TODO: Integrate with actual ArcMetaRouter contract
  // For now, return simulated result
  return {
    amountOut: BigInt(amountIn) * 99n / 100n, // simulate 1% slippage
    txHash: '0x' + '0'.repeat(64),
    gasUsed: '150000'
  };
}

// ============================================================================
// Rebalancing Endpoints
// ============================================================================

/**
 * GET /api/rebalance/status
 * Get current rebalancing status
 */
app.get('/api/rebalance/status', async (req, res) => {
  try {
    const status = await rebalancingEngine.getStatus();
    res.json({ success: true, data: status });
  } catch (error) {
    console.error('Error fetching rebalance status:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/rebalance/analyze
 * Analyze current LP imbalances
 */
app.post('/api/rebalance/analyze', async (req, res) => {
  try {
    const analysis = await rebalancingEngine.analyzeImbalances();
    res.json({ success: true, data: analysis });
  } catch (error) {
    console.error('Error analyzing imbalances:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// Gateway Endpoints (for Circle Wallet integration)
// ============================================================================

/**
 * GET /api/gateway/balance/:address/:token
 * Get Gateway balance for a user
 */
app.get('/api/gateway/balance/:address/:token', async (req, res) => {
  try {
    const { address, token } = req.params;
    const balance = await gatewayCoordinator.getBalance(address, token);
    res.json({ success: true, data: { balance } });
  } catch (error) {
    console.error('Error fetching Gateway balance:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// Token Registry Endpoints
// ============================================================================

/**
 * GET /api/registry/tokens
 * Get all registered tokens
 */
app.get('/api/registry/tokens', async (req, res) => {
  try {
    const tokens = await tokenRegistry.getAllTokens();
    res.json({ success: true, data: tokens });
  } catch (error) {
    console.error('Error fetching tokens:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/registry/chains
 * Get all registered chains
 */
app.get('/api/registry/chains', async (req, res) => {
  try {
    const chains = await tokenRegistry.getAllChains();
    res.json({ success: true, data: chains });
  } catch (error) {
    console.error('Error fetching chains:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/registry/token/:symbol/:chainId
 * Get token info for a symbol on a specific chain
 */
app.get('/api/registry/token/:symbol/:chainId', async (req, res) => {
  try {
    const { symbol, chainId } = req.params;
    const tokenId = tokenRegistry.getTokenId(symbol);
    const info = await tokenRegistry.getTokenInfo(tokenId, parseInt(chainId));
    res.json({ success: true, data: info });
  } catch (error) {
    console.error('Error fetching token info:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/registry/token/:symbol/chains
 * Get all chains where a token is registered
 */
app.get('/api/registry/token/:symbol/chains', async (req, res) => {
  try {
    const { symbol } = req.params;
    const tokenId = tokenRegistry.getTokenId(symbol);
    const chains = await tokenRegistry.getTokenChains(tokenId);
    res.json({ success: true, data: chains });
  } catch (error) {
    console.error('Error fetching token chains:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// Start Server
// ============================================================================

// Start LP monitoring
await lpMonitor.start();
console.log('✓ LP Monitor started');

// Start server
app.listen(PORT, () => {
  console.log(`\n🚀 Fluxa Backend running on port ${PORT}`);
  console.log(`\nAPI Endpoints:`);
  console.log(`  GET  /health`);
  console.log(`  GET  /api/lp-depths`);
  console.log(`  POST /api/quote`);
  console.log(`  POST /api/execute-highvalue`);
  console.log(`  GET  /api/rebalance/status`);
  console.log(`\n`);
});

export default app;
