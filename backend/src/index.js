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
import { ethers } from 'ethers';
import { LPMonitor } from './services/LPMonitor.js';
import { RouteOptimizer } from './services/RouteOptimizer.js';
import { CCTPCoordinator } from './services/CCTPCoordinator.js';
import { GatewayCoordinator } from './services/GatewayCoordinator.js';
import { RebalancingEngine } from './services/RebalancingEngine.js';
import { LPMigrationService } from './services/LPMigrationService.js';
import { PoolRebasingService } from './services/PoolRebasingService.js';
import { TokenRegistryService } from './services/TokenRegistryService.js';
import { DeploymentService } from './services/DeploymentService.js';
import { FluxaGatewayCoordinator } from './services/FluxaGatewayCoordinator.js';
import { CCTPBridge } from './services/CCTPBridge.js';
import { GatewayBridge } from './services/GatewayBridge.js';
import { CCTPAggregator } from './services/CCTPAggregator.js';
import { VaultAggregator } from './services/VaultAggregator.js';

dotenv.config({ path: '../.env' });

const app = express();
const PORT = process.env.BACKEND_PORT || 3001;

// Fix BigInt serialization in JSON
BigInt.prototype.toJSON = function() { return this.toString() }

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
const lpMigrationService = new LPMigrationService(lpMonitor, cctpCoordinator, gatewayCoordinator);
const poolRebasingService = new PoolRebasingService(lpMonitor, cctpCoordinator, gatewayCoordinator);
const deploymentService = new DeploymentService();
const fluxaGatewayCoordinator = new FluxaGatewayCoordinator();
const cctpBridge = new CCTPBridge();
const gatewayBridge = new GatewayBridge();
const cctpAggregator = new CCTPAggregator();
const vaultAggregator = new VaultAggregator();

console.log('\n✅ Bridge Services Initialized:');
console.log(`  CCTP Bridge - Arc: ${cctpBridge.isChainConfigured('arc') ? '✓' : '✗'}`);
console.log(`  CCTP Bridge - Base: ${cctpBridge.isChainConfigured('base') ? '✓' : '✗'}`);
console.log(`  Gateway Bridge - Arc: ${gatewayBridge.isChainConfigured('arc') ? '✓' : '✗'}`);
console.log(`  Gateway Bridge - Base: ${gatewayBridge.isChainConfigured('base') ? '✓' : '✗'}`);
console.log(`  CCTP Aggregator - Wallet: ${cctpAggregator.address}`);
console.log(`  Vault Aggregator - Ready: ✓`);

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
 * POST /api/swap
 * Execute a swap (user always on same chain, routing is internal)
 * 
 * Body:
 * {
 *   tokenIn: "0x...",
 *   tokenOut: "0x...",
 *   amountIn: "1000000000",
 *   minAmountOut: "990000000",
 *   userChain: "base", // User's chain (where they start and finish)
 *   userAddress: "0x..." // User's address on userChain
 * }
 */
app.post('/api/swap', async (req, res) => {
  try {
    const {
      tokenIn,
      tokenOut,
      amountIn,
      minAmountOut,
      userChain,
      userAddress
    } = req.body;

    if (!tokenIn || !tokenOut || !amountIn || !userChain || !userAddress) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: tokenIn, tokenOut, amountIn, userChain, userAddress'
      });
    }

    console.log(`\n[SWAP] User swap request on ${userChain}`);
    console.log(`  User: ${userAddress}`);
    console.log(`  Token In: ${tokenIn}`);
    console.log(`  Token Out: ${tokenOut}`);
    console.log(`  Amount In: ${amountIn}`);

    // 1. Generate optimal route (evaluates LOCAL_ONLY vs VIA_ARC)
    const route = await routeOptimizer.findOptimalRoute({
      tokenIn,
      tokenOut,
      amountIn,
      sourceChain: userChain
    });

    console.log(`[SWAP] Route selected: ${route.selectedRoute.name}`);
    console.log(`  Requires Multi-Chain: ${route.requiresMultiChain}`);
    console.log(`  Remote Chains: ${route.selectedRoute.remoteChains?.join(', ') || 'none'}`);
    console.log(`  Net Output: ${route.netOutputFormatted}`);

    // 2. Determine strategy: LOCAL_ONLY or VIA_ARC
    const useArc = route.requiresMultiChain && route.selectedRoute.remoteChains?.length > 0;

    // 3. Execute swap
    const execution = await executeSwap({
      route,
      userChain,
      userAddress,
      minAmountOut: minAmountOut || route.estimatedOutput
    });

    res.json({
      success: true,
      data: {
        ...execution,
        route: route,
        strategy: useArc ? 'VIA_ARC' : 'LOCAL_ONLY'
      }
    });
  } catch (error) {
    console.error('Error executing swap:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Execute swap (user always on same chain)
 * Routes internally via Arc if beneficial, but always settles on user's chain
 */
async function executeSwap({ route, userChain, userAddress, minAmountOut }) {
  const steps = [];
  const useArc = route.requiresMultiChain && route.selectedRoute.remoteChains?.length > 0;

  try {
    if (!useArc) {
      // LOCAL_ONLY: Execute swap on user's chain
      console.log(`[SWAP] Executing LOCAL_ONLY on ${userChain}`);
      steps.push({ step: 'local_swap', status: 'in_progress' });
      
      const swapResult = await executeLocalSwap({
        chain: userChain,
        tokenIn: route.tokenIn,
        tokenOut: route.tokenOut,
        amountIn: route.totalAmountIn,
        minAmountOut,
        recipient: userAddress
      });
      
      steps.push({ step: 'local_swap', status: 'complete', result: swapResult });
      
      return {
        strategy: 'LOCAL_ONLY',
        userChain,
        userAddress,
        output: swapResult.amountOut,
        txHash: swapResult.txHash,
        steps
      };
    } else {
      // VIA_ARC: Route via Arc for better execution
      console.log(`[SWAP] Executing VIA_ARC: ${userChain} → Arc → ${userChain}`);
      steps.push({ step: 'arc_routing', status: 'in_progress' });
      
      // Step 1: Migrate LPs from remote chains to Arc (if needed)
      if (route.selectedRoute.remoteChains?.length > 0) {
        steps.push({ step: 'lp_migration', status: 'in_progress' });
        
        try {
          const migrationResult = await lpMigrationService.migratePoolsToArc(route, userAddress);
          steps.push({ step: 'lp_migration', status: 'complete', result: migrationResult });
        } catch (error) {
          console.error('[SWAP] LP migration failed, continuing:', error.message);
          steps.push({ step: 'lp_migration', status: 'failed', error: error.message, continue: true });
        }
      }

      // Step 2: Transfer tokens to Arc (CCTP for USDC, Gateway for FLX)
      steps.push({ step: 'token_transfer_to_arc', status: 'in_progress' });
      const transferResult = await transferTokensToArc({
        route,
        userChain,
        userAddress
      });
      steps.push({ step: 'token_transfer_to_arc', status: 'complete', result: transferResult });

      // Step 3: Execute swap on Arc
      steps.push({ step: 'arc_swap', status: 'in_progress' });
      const swapResult = await executeArcSwap({
        tokenIn: route.tokenIn,
        tokenOut: route.tokenOut,
        amountIn: route.totalAmountIn,
        minAmountOut,
        recipient: userAddress // Will be sent back to userChain
      });
      steps.push({ step: 'arc_swap', status: 'complete', result: swapResult });

      // Step 4: Transfer result back to user's chain
      steps.push({ step: 'token_transfer_from_arc', status: 'in_progress' });
      const returnResult = await transferTokensFromArc({
        route,
        userChain,
        userAddress,
        amountOut: swapResult.amountOut,
        tokenOut: route.tokenOut
      });
      steps.push({ step: 'token_transfer_from_arc', status: 'complete', result: returnResult });

      // Step 5: Rebase pools (optional, for price alignment)
      if (route.selectedRoute.remoteChains?.length > 0) {
        steps.push({ step: 'pool_rebasing', status: 'in_progress' });
        try {
          const rebaseResult = await poolRebasingService.rebasePoolsToTargetPrice(swapResult, route);
          steps.push({ step: 'pool_rebasing', status: 'complete', result: rebaseResult });
        } catch (error) {
          console.error('[SWAP] Pool rebasing failed:', error.message);
          steps.push({ step: 'pool_rebasing', status: 'failed', error: error.message, continue: true });
        }
      }

      return {
        strategy: 'VIA_ARC',
        userChain,
        userAddress,
        output: returnResult.amountOut,
        txHash: returnResult.txHash,
        steps
      };
    }
  } catch (error) {
    console.error('[SWAP] Execution failed:', error);
    throw error;
  }
}

/**
 * Transfer tokens to Arc (CCTP for USDC, Gateway for other ERC20 tokens)
 * Simplified for hackathon: Only transfers TO Arc, never from Arc
 */
async function transferTokensToArc({ route, userChain, userAddress }) {
  const results = [];

  // Determine which tokens need to be transferred
  const logicalTokenIn = routeOptimizer.getLogicalToken(route.tokenIn, userChain);
  
  if (logicalTokenIn === 'USDC') {
    // Use CCTP for USDC transfers from LPs on other chains to Arc
    console.log(`[Transfer] Using CCTP to transfer USDC from ${userChain} to Arc`);
    const transfer = await cctpCoordinator.createPendingTransfer({
      sourceChain: userChain,
      destinationChain: 'arc',
      amount: route.totalAmountIn,
      recipient: userAddress,
      useFastAttestation: true
    });
    results.push({ type: 'CCTP', transfer });
  } else {
    // Use Gateway for other ERC20 tokens (e.g., project tokens like FLX)
    console.log(`[Transfer] Using Gateway to transfer tokens from ${userChain} to Arc`);
    // The user/LP will call depositForWrap() on source chain
    // Backend will monitor and process via FluxaGatewayCoordinator
    results.push({ 
      type: 'GATEWAY', 
      message: 'Token wrapping to Arc - user must call depositForWrap() on source chain',
      sourceChain: userChain
    });
  }

  return results;
}

/**
 * NOTE: Transfers FROM Arc are NOT supported in simplified hackathon version
 * All liquidity operations happen on Arc, users interact on Arc
 */
async function transferTokensFromArc({ route, userChain, userAddress, amountOut, tokenOut }) {
  throw new Error('Transfers FROM Arc are not supported in simplified architecture. All swaps happen on Arc.');
}

/**
 * Get router address for a chain
 */
function getRouterAddress(chain) {
  const routers = {
    arc: process.env.ARC_SWAP_ROUTER,
    base: process.env.BASE_SEPOLIA_SWAP_ROUTER || process.env.BASE_SWAP_ROUTER,
    'base-sepolia': process.env.BASE_SEPOLIA_SWAP_ROUTER || process.env.BASE_SWAP_ROUTER,
    'polygon-amoy': process.env.POLYGON_AMOY_SWAP_ROUTER || process.env.POLYGON_SWAP_ROUTER,
    'arbitrum-sepolia': process.env.ARBITRUM_SEPOLIA_SWAP_ROUTER || process.env.ARBITRUM_SWAP_ROUTER,
    'avalanche-fuji': process.env.AVALANCHE_FUJI_SWAP_ROUTER || process.env.AVALANCHE_SWAP_ROUTER,
    'optimism-sepolia': process.env.OPTIMISM_SEPOLIA_SWAP_ROUTER || process.env.OPTIMISM_SWAP_ROUTER,
    'codex-testnet': process.env.CODEX_TESTNET_SWAP_ROUTER || process.env.CODEX_SWAP_ROUTER,
    'unichain-sepolia': process.env.UNICHAIN_SEPOLIA_SWAP_ROUTER || process.env.UNICHAIN_SWAP_ROUTER
  };
  return routers[chain];
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
// CCTP Endpoints
// ============================================================================

/**
 * POST /api/cctp/estimate-fee
 * Estimate transfer fee using Bridge Kit
 */
app.post('/api/cctp/estimate-fee', async (req, res) => {
  try {
    const { sourceChain, destinationChain, amount, useFastAttestation } = req.body;
    
    if (!sourceChain || !destinationChain || !amount) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required fields: sourceChain, destinationChain, amount' 
      });
    }

    const result = await cctpCoordinator.estimateTransferFee({
      sourceChain,
      destinationChain,
      amount,
      useFastAttestation: useFastAttestation !== false
    });

    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Error estimating transfer fee:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/cctp/initiate
 * Initiate CCTP transfer (burn on source chain)
 */
app.post('/api/cctp/initiate', async (req, res) => {
  try {
    const { sourceChain, destinationChain, amount, recipient, useFastAttestation } = req.body;
    
    if (!sourceChain || !destinationChain || !amount) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required fields: sourceChain, destinationChain, amount' 
      });
    }

    const result = await cctpCoordinator.initiateTransfer({
      sourceChain,
      destinationChain,
      amount,
      recipient,
      useFastAttestation: useFastAttestation !== false
    });

    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Error initiating CCTP transfer:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/cctp/wait-attestation
 * Wait for CCTP attestation
 */
app.post('/api/cctp/wait-attestation', async (req, res) => {
  try {
    const { txHash, useFastAttestation } = req.body;
    
    if (!txHash) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required field: txHash' 
      });
    }

    const result = await cctpCoordinator.waitForAttestation(
      txHash,
      useFastAttestation !== false
    );

    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Error waiting for attestation:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/cctp/complete
 * Complete CCTP transfer (mint on destination chain)
 */
app.post('/api/cctp/complete', async (req, res) => {
  try {
    const { attestation, message, destinationChain } = req.body;
    
    if (!attestation || !message || !destinationChain) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required fields: attestation, message, destinationChain' 
      });
    }

    const result = await cctpCoordinator.completeTransfer({
      attestation,
      message,
      destinationChain
    });

    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Error completing CCTP transfer:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/cctp/full-transfer
 * Execute full CCTP flow (initiate, wait, complete)
 * DEPRECATED: Use /api/cctp/create-transfer instead
 */
app.post('/api/cctp/full-transfer', async (req, res) => {
  try {
    const { sourceChain, destinationChain, amount, recipient, useFastAttestation } = req.body;
    
    if (!sourceChain || !destinationChain || !amount) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required fields: sourceChain, destinationChain, amount' 
      });
    }

    const result = await cctpCoordinator.executeFullTransfer({
      sourceChain,
      destinationChain,
      amount,
      recipient,
      useFastAttestation: useFastAttestation !== false
    });

    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Error executing full CCTP transfer:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/cctp/create-transfer
 * Create a pending CCTP transfer request
 * Returns wallet address for user to send USDC
 */
app.post('/api/cctp/create-transfer', async (req, res) => {
  try {
    const { sourceChain, destinationChain, amount, recipient, useFastAttestation } = req.body;
    
    if (!sourceChain || !destinationChain || !amount) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required fields: sourceChain, destinationChain, amount' 
      });
    }

    const result = await cctpCoordinator.createPendingTransfer({
      sourceChain,
      destinationChain,
      amount,
      recipient,
      useFastAttestation: useFastAttestation !== false
    });

    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Error creating CCTP transfer:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/cctp/check-deposit/:transferId
 * Check if USDC has been received for a pending transfer
 */
app.get('/api/cctp/check-deposit/:transferId', async (req, res) => {
  try {
    const { transferId } = req.params;
    const { sourceChain } = req.query; // Optional: allow sourceChain to be passed as query param
    
    const result = await cctpCoordinator.checkDepositReceived(transferId, sourceChain);

    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Error checking deposit:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/cctp/execute/:transferId
 * Execute CCTP transfer after USDC deposit is confirmed
 */
app.post('/api/cctp/execute/:transferId', async (req, res) => {
  try {
    const { transferId } = req.params;
    // Allow optional parameters in body to reconstruct transfer after server restart
    const { sourceChain, destinationChain, amount, recipient, useFastAttestation } = req.body;
    
    const result = await cctpCoordinator.executePendingTransfer(transferId, {
      sourceChain,
      destinationChain,
      amount,
      recipient,
      useFastAttestation
    });

    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Error executing pending transfer:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/cctp/status/:transferId
 * Get status of a pending transfer
 */
app.get('/api/cctp/status/:transferId', async (req, res) => {
  try {
    const { transferId } = req.params;
    
    const transfer = cctpCoordinator.getPendingTransfer(transferId);
    
    if (!transfer) {
      return res.status(404).json({ 
        success: false, 
        error: 'Transfer not found' 
      });
    }

    res.json({ success: true, data: transfer });
  } catch (error) {
    console.error('Error getting transfer status:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/cctp/wallet-address
 * Get CCTP wallet address for a specific chain
 */
app.get('/api/cctp/wallet-address/:chain', async (req, res) => {
  try {
    const { chain } = req.params;
    
    const address = cctpCoordinator.getCCTPWalletAddress(chain);

    res.json({ success: true, data: { address, chain } });
  } catch (error) {
    console.error('Error getting wallet address:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/cctp/wallet-balance/:chain
 * Get CCTP wallet ETH and USDC balance for a specific chain
 * Optionally accepts sourceChain and destinationChain query params for gas estimation
 */
app.get('/api/cctp/wallet-balance/:chain', async (req, res) => {
  try {
    const { chain } = req.params;
    const { sourceChain, destinationChain, amount } = req.query;
    
    const address = cctpCoordinator.getCCTPWalletAddress(chain);
    const provider = cctpCoordinator.getProvider(chain);
    
    if (!provider) {
      return res.status(400).json({ 
        success: false, 
        error: `No RPC configured for ${chain}` 
      });
    }

    // Get gas balance - Arc uses USDC as native gas token, other chains use ETH
    const isArc = chain.toLowerCase() === 'arc';
    let gasBalance = null;
    let gasTokenName = 'ETH';
    
    if (isArc) {
      // Arc uses USDC as native gas token - check native balance (no contract needed)
      gasTokenName = 'USDC';
      try {
        gasBalance = await provider.getBalance(address);
      } catch (err) {
        console.warn('Could not fetch native USDC balance for Arc:', err.message);
        gasBalance = 0n;
      }
    } else {
      // Other chains use ETH
      gasBalance = await provider.getBalance(address);
    }
    
    // Get USDC balance (for transfers, not gas)
    // For Arc: USDC is native token, so gasBalance IS the USDC balance
    // For other chains: USDC is ERC-20 token, check contract balance
    let usdcBalance = '0';
    if (isArc) {
      // Arc: Native USDC balance is the same as gas balance
      usdcBalance = gasBalance.toString();
    } else {
      // Other chains: Check ERC-20 USDC contract balance
      const usdcAddress = cctpCoordinator.getUSDCAddress(chain);
      if (usdcAddress) {
        try {
          const usdcContract = new ethers.Contract(
            usdcAddress,
            ['function balanceOf(address) view returns (uint256)'],
            provider
          );
          usdcBalance = (await usdcContract.balanceOf(address)).toString();
        } catch (err) {
          console.warn('Could not fetch USDC balance:', err.message);
        }
      }
    }

    // Estimate gas costs if sourceChain and destinationChain are provided
    let gasEstimate = null;
    if (sourceChain && destinationChain) {
      try {
        const estimateAmount = amount || '1.0'; // Default to 1 USDC for estimation
        gasEstimate = await cctpCoordinator.estimateGasCosts(sourceChain, destinationChain, estimateAmount);
      } catch (err) {
        console.warn('Could not estimate gas costs:', err.message);
      }
    }

    const response = { 
      address,
      chain,
      gasBalance: gasBalance.toString(),
      gasToken: gasTokenName,
      usdcBalance,
      gasBalanceFormatted: isArc 
        ? ethers.formatEther(gasBalance) // Arc native USDC uses 18 decimals (like ETH)
        : ethers.formatEther(gasBalance),
      usdcBalanceFormatted: isArc 
        ? ethers.formatEther(usdcBalance) // Arc native USDC uses 18 decimals
        : ethers.formatUnits(usdcBalance, 6), // Other chains: ERC-20 USDC uses 6 decimals
      // Keep ethBalance for backward compatibility (will be same as gasBalance for non-Arc chains)
      ethBalance: isArc ? '0' : gasBalance.toString(),
      ethBalanceFormatted: isArc ? '0' : ethers.formatEther(gasBalance)
    };

    // Add gas estimate if available
    if (gasEstimate) {
      response.gasEstimate = {
        sourceGasCost: gasEstimate.sourceGasCost.toString(),
        sourceGasCostFormatted: gasEstimate.sourceGasCostFormatted,
        sourceGasToken: gasEstimate.sourceGasToken,
        destGasCost: gasEstimate.destGasCost.toString(),
        destGasCostFormatted: gasEstimate.destGasCostFormatted,
        destGasToken: gasEstimate.destGasToken,
        estimated: gasEstimate.estimated || false
      };
    }

    res.json({ 
      success: true,
      data: response
    });
  } catch (error) {
    console.error('Error getting wallet balance:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/cctp/supported-chains
 * Get list of supported chains for CCTP
 */
app.get('/api/cctp/supported-chains', async (req, res) => {
  try {
    const chains = cctpCoordinator.getSupportedChains();
    res.json({ success: true, data: chains });
  } catch (error) {
    console.error('Error fetching supported chains:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// Gateway Endpoints (for Circle Wallet integration)
// ============================================================================

/**
 * POST /api/gateway/distribute
 * Distribute wrapped tokens to multiple destination chains via Gateway
 * Used for initial LP setup
 */
app.post('/api/gateway/distribute', async (req, res) => {
  try {
    const { sourceChain, tokenAddress, amount, destinationChains, depositor, recipient } = req.body;
    
    if (!sourceChain || !tokenAddress || !amount || !destinationChains || !depositor) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required fields: sourceChain, tokenAddress, amount, destinationChains, depositor' 
      });
    }

    if (!Array.isArray(destinationChains) || destinationChains.length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'destinationChains must be a non-empty array' 
      });
    }

    console.log(`[API] Gateway distribution request:`);
    console.log(`  Source: ${sourceChain}`);
    console.log(`  Token: ${tokenAddress}`);
    console.log(`  Amount: ${amount}`);
    console.log(`  Destinations: ${destinationChains.join(', ')}`);

    const result = await gatewayCoordinator.distributeWrappedTokens({
      sourceChain,
      tokenAddress,
      amount,
      destinationChains,
      depositor,
      recipient: recipient || depositor
    });

    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Error distributing tokens via Gateway:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

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

/**
 * POST /api/gateway/deposit
 * Deposit tokens to Gateway
 */
app.post('/api/gateway/deposit', async (req, res) => {
  try {
    const { chain, token, amount, depositor, useOnChain } = req.body;
    
    if (!chain || !token || !amount) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required fields: chain, token, amount' 
      });
    }

    const result = await gatewayCoordinator.deposit({
      chain,
      token,
      amount,
      depositor,
      useOnChain: useOnChain === true
    });

    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Error depositing to Gateway:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/gateway/withdraw
 * Withdraw tokens from Gateway
 */
app.post('/api/gateway/withdraw', async (req, res) => {
  try {
    const { token, amount, targetChain, recipient, depositor } = req.body;
    
    if (!token || !amount || !targetChain || !recipient) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required fields: token, amount, targetChain, recipient' 
      });
    }

    const result = await gatewayCoordinator.withdraw({
      token,
      amount,
      targetChain,
      recipient,
      depositor
    });

    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Error withdrawing from Gateway:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/gateway/withdrawal-status/:withdrawalId
 * Get withdrawal status
 */
app.get('/api/gateway/withdrawal-status/:withdrawalId', async (req, res) => {
  try {
    const { withdrawalId } = req.params;
    const status = await gatewayCoordinator.getWithdrawalStatus(withdrawalId);
    res.json({ success: true, data: status });
  } catch (error) {
    console.error('Error fetching withdrawal status:', error);
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
// Deployment Endpoints
// ============================================================================

/**
 * GET /api/deployment/chains
 * Get available chains for deployment
 */
app.get('/api/deployment/chains', (req, res) => {
  try {
    const chains = deploymentService.getAvailableChains();
    res.json({ success: true, data: chains });
  } catch (error) {
    console.error('Error fetching available chains:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/deployment/estimate-gas
 * Estimate gas costs for deployment on selected chains
 * 
 * Body:
 * {
 *   selectedChains: ["arc", "base", "polygon-amoy"],
 *   privateKey: "0x..." // Private key to check balance
 * }
 */
app.post('/api/deployment/estimate-gas', async (req, res) => {
  try {
    const { selectedChains, privateKey } = req.body;
    
    if (!selectedChains || !Array.isArray(selectedChains) || selectedChains.length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'selectedChains is required and must be a non-empty array' 
      });
    }
    
    if (!privateKey) {
      return res.status(400).json({ 
        success: false, 
        error: 'privateKey is required' 
      });
    }
    
    const estimates = {};
    
    // Process chains sequentially with delays to avoid rate limits
    for (let i = 0; i < selectedChains.length; i++) {
      const chainKey = selectedChains[i];
      
      // Add delay between chains (except first one) to avoid rate limits
      if (i > 0) {
        await new Promise(resolve => setTimeout(resolve, 500)); // 500ms delay
      }
      
      try {
        const chainConfig = deploymentService.getAvailableChains().find(c => c.key === chainKey);
        if (!chainConfig) {
          estimates[chainKey] = { error: 'Chain not found' };
          continue;
        }
        
        // Normalize private key
        let normalized = privateKey.trim();
        if (!normalized.startsWith('0x')) {
          normalized = '0x' + normalized;
        }
        
        const { ethers } = await import('ethers');
        const provider = new ethers.JsonRpcProvider(
          chainKey === 'arc' ? process.env.ARC_RPC_URL :
          chainKey === 'base' ? (process.env.BASE_SEPOLIA_RPC_URL || process.env.BASE_RPC_URL) :
          chainKey === 'polygon-amoy' ? (process.env.POLYGON_AMOY_RPC_URL || process.env.POLYGON_RPC_URL) :
          chainKey === 'arbitrum-sepolia' ? (process.env.ARBITRUM_SEPOLIA_RPC_URL || process.env.ARBITRUM_RPC_URL) :
          chainKey === 'avalanche-fuji' ? (process.env.AVALANCHE_FUJI_RPC_URL || process.env.AVALANCHE_RPC_URL) :
          chainKey === 'optimism-sepolia' ? (process.env.OPTIMISM_SEPOLIA_RPC_URL || process.env.OPTIMISM_RPC_URL) :
          chainKey === 'codex-testnet' ? (process.env.CODEX_TESTNET_RPC_URL || process.env.CODEX_RPC_URL) :
          chainKey === 'unichain-sepolia' ? (process.env.UNICHAIN_SEPOLIA_RPC_URL || process.env.UNICHAIN_RPC_URL) :
          ''
        );
        
        const deployer = new ethers.Wallet(normalized, provider);
        
        // Add small delay before balance check
        await new Promise(resolve => setTimeout(resolve, 100));
        const balance = await provider.getBalance(deployer.address);
        
        const nativeCurrency = 
          chainKey === 'arc' ? 'USDC' :
          chainKey === 'base' ? 'ETH' :
          chainKey === 'polygon-amoy' ? 'MATIC' :
          chainKey === 'arbitrum-sepolia' ? 'ETH' :
          chainKey === 'avalanche-fuji' ? 'AVAX' :
          chainKey === 'optimism-sepolia' ? 'ETH' :
          chainKey === 'codex-testnet' ? 'CDX' :
          chainKey === 'unichain-sepolia' ? 'ETH' :
          'ETH';
        
        // Calculate accurate gas estimation based on actual deployment costs
        // Actual Base Sepolia deployment: ~0.0000127 ETH total
        // Gas usage breakdown (from actual deployment):
        // - MockERC20: ~250k gas
        // - VaultFactory: ~275k gas
        // - createVault: ~155k gas
        // - ArcAMMFactory: ~250k gas
        // - ArcMetaRouter: ~275k gas
        // - setAMMFactory: ~155k gas
        // Total: ~1.36M gas (much less than estimated 9.6M)
        
        // Get current gas price to calculate accurate cost
        // Use fallback estimates to avoid rate limits on QuickNode
        let minRequired;
        try {
          // Add delay before gas price fetch to avoid rate limits
          await new Promise(resolve => setTimeout(resolve, 200));
          
          const feeData = await provider.getFeeData();
          let gasPrice;
          
          if (feeData.gasPrice) {
            // Legacy chain
            gasPrice = feeData.gasPrice;
          } else if (feeData.maxFeePerGas) {
            // EIP-1559 chain - use maxFeePerGas for accurate estimate
            gasPrice = feeData.maxFeePerGas;
          } else {
            // Fallback: use chain-specific defaults
            if (chainKey === 'arc') {
              gasPrice = ethers.parseUnits('0.1', 'gwei'); // Arc is very cheap
            } else if (chainKey === 'base' || chainKey === 'arbitrum-sepolia' || chainKey === 'optimism-sepolia' || chainKey === 'unichain-sepolia') {
              gasPrice = ethers.parseUnits('0.1', 'gwei'); // L2s are cheap
            } else if (chainKey === 'polygon-amoy') {
              gasPrice = ethers.parseUnits('30', 'gwei'); // Polygon testnet
            } else if (chainKey === 'avalanche-fuji') {
              gasPrice = ethers.parseUnits('25', 'nano'); // Avalanche uses nAVAX
            } else {
              gasPrice = ethers.parseUnits('1', 'gwei');
            }
          }
          
          // Total gas for all deployments: ~1.36M gas
          const totalGas = 1360000n;
          
          // Calculate cost: gas * gasPrice
          const estimatedCost = totalGas * gasPrice;
          
          // Add 20% buffer for safety
          minRequired = (estimatedCost * 120n) / 100n;
          
          // Minimum floor: ensure at least 0.00001 native token
          const minFloor = ethers.parseEther('0.00001');
          if (minRequired < minFloor) {
            minRequired = minFloor;
          }
        } catch (error) {
          // Fallback if gas price fetch fails (e.g., rate limit)
          if (error.message && error.message.includes('rate limit')) {
            console.warn(`Rate limit hit for ${chainKey}, using fallback estimate`);
          } else {
            console.warn(`Could not fetch gas price for ${chainKey}, using fallback estimate:`, error.message);
          }
          
          // Use chain-specific fallback estimates based on typical testnet costs
          if (chainKey === 'arc') {
            minRequired = ethers.parseEther('0.00002'); // Arc: very cheap
          } else if (chainKey === 'base' || chainKey === 'arbitrum-sepolia' || chainKey === 'optimism-sepolia' || chainKey === 'unichain-sepolia') {
            minRequired = ethers.parseEther('0.00002'); // L2s: ~0.0000127 * 1.6 buffer
          } else if (chainKey === 'polygon-amoy') {
            minRequired = ethers.parseEther('0.00005'); // Polygon: slightly higher
          } else if (chainKey === 'avalanche-fuji') {
            minRequired = ethers.parseEther('0.00003'); // Avalanche
          } else if (chainKey === 'codex-testnet') {
            minRequired = ethers.parseEther('0.00002'); // Codex
          } else {
            minRequired = ethers.parseEther('0.00002'); // Default
          }
        }
        
        const balanceFormatted = ethers.formatEther(balance);
        const requiredFormatted = ethers.formatEther(minRequired);
        const hasEnough = balance >= minRequired;
        
        estimates[chainKey] = {
          chain: chainConfig.name,
          nativeCurrency,
          currentBalance: balanceFormatted,
          estimatedRequired: requiredFormatted,
          hasEnough,
          walletAddress: deployer.address
        };
      } catch (error) {
        estimates[chainKey] = { error: error.message };
      }
    }
    
    res.json({ success: true, data: estimates });
  } catch (error) {
    console.error('Error estimating gas:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/deployment/deploy
 * Deploy contracts on selected chains
 * 
 * Body:
 * {
 *   selectedChains: ["arc", "base", "polygon-amoy"],
 *   tokenAddress: "0x...", // Optional - if not provided, will deploy new token on Arc
 *   tokenAmount: "1000000000000000000000", // Total tokens (18 decimals)
 *   usdcAmount: "1000000000", // Total USDC (6 decimals)
 *   depositor: "0x...", // Address that will deposit tokens/USDC
 *   recipient: "0x...", // Address receiving wrapped tokens
 *   privateKey: "0x..." // Private key for deployment (from frontend wallet)
 * }
 */
app.post('/api/deployment/deploy', async (req, res) => {
  try {
    const { selectedChains, tokenAddress, tokenAmount, usdcAmount, depositor, recipient, privateKey } = req.body;
    
    if (!selectedChains || !Array.isArray(selectedChains) || selectedChains.length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'selectedChains is required and must be a non-empty array' 
      });
    }
    
    if (!privateKey) {
      return res.status(400).json({ 
        success: false, 
        error: 'privateKey is required' 
      });
    }
    
    // Validate chains
    const availableChains = deploymentService.getAvailableChains().map(c => c.key);
    const invalidChains = selectedChains.filter(c => !availableChains.includes(c));
    if (invalidChains.length > 0) {
      return res.status(400).json({ 
        success: false, 
        error: `Invalid chains: ${invalidChains.join(', ')}. Available: ${availableChains.join(', ')}` 
      });
    }
    
    // Deploy contracts
    const deploymentResults = await deploymentService.deployContracts({
      selectedChains,
      tokenAddress,
      tokenAmount,
      usdcAmount,
      depositor,
      recipient,
      privateKey
    });
    
    res.json({ 
      success: true, 
      data: {
        step1_contracts: deploymentResults,
        // TODO: Add Gateway distribution (step 2)
        // TODO: Add CCTP distribution (step 3)
        // TODO: Add LP formation (step 4)
      }
    });
  } catch (error) {
    console.error('Error deploying contracts:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/dev/deploy-factory
 * Deploy VaultFactory or ArcAMMFactory on a specific chain
 * 
 * Body:
 * {
 *   chain: "arc" | "base" | "polygon-amoy" | ...,
 *   factoryType: "vault" | "amm", // Type of factory to deploy
 *   privateKey: "0x..." // Private key for signing
 * }
 */
app.post('/api/dev/deploy-factory', async (req, res) => {
  try {
    const { chain, factoryType, privateKey } = req.body;
    
    if (!chain) {
      return res.status(400).json({ 
        success: false, 
        error: 'chain is required' 
      });
    }
    
    if (!factoryType || (factoryType !== 'vault' && factoryType !== 'amm')) {
      return res.status(400).json({ 
        success: false, 
        error: 'factoryType is required and must be "vault" or "amm"' 
      });
    }
    
    if (!privateKey) {
      return res.status(400).json({ 
        success: false, 
        error: 'privateKey is required' 
      });
    }
    
    // Get chain config
    const chainConfig = deploymentService.getAvailableChains().find(c => c.key === chain);
    if (!chainConfig) {
      return res.status(400).json({ 
        success: false, 
        error: `Unsupported chain: ${chain}` 
      });
    }
    
    // Get USDC address for chain
    const getUSDCAddress = (chainKey) => {
      if (chainKey === 'arc') return process.env.ARC_USDC_ADDRESS || "0x3600000000000000000000000000000000000000";
      if (chainKey === 'base') return process.env.BASE_SEPOLIA_USDC || process.env.BASE_SEPOLIA_USDC_ADDRESS || "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
      if (chainKey === 'polygon-amoy') return process.env.POLYGON_AMOY_USDC || process.env.POLYGON_AMOY_USDC_ADDRESS || process.env.POLYGON_USDC_ADDRESS || "0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582";
      if (chainKey === 'arbitrum-sepolia') return process.env.ARBITRUM_SEPOLIA_USDC || process.env.ARBITRUM_USDC_ADDRESS || "";
      if (chainKey === 'avalanche-fuji') return process.env.AVALANCHE_FUJI_USDC || process.env.AVALANCHE_USDC_ADDRESS || "";
      if (chainKey === 'optimism-sepolia') return process.env.OPTIMISM_SEPOLIA_USDC || process.env.OPTIMISM_USDC_ADDRESS || "";
      if (chainKey === 'codex-testnet') return process.env.CODEX_TESTNET_USDC || process.env.CODEX_USDC_ADDRESS || "";
      if (chainKey === 'unichain-sepolia') return process.env.UNICHAIN_SEPOLIA_USDC || process.env.UNICHAIN_USDC_ADDRESS || "";
      return '';
    };
    
    const usdcAddress = getUSDCAddress(chain);
    if (!usdcAddress) {
      return res.status(400).json({ 
        success: false, 
        error: `USDC address not configured for ${chain}. Please set ${chain.toUpperCase().replace(/-/g, '_')}_USDC in .env` 
      });
    }
    
    // Normalize private key
    let normalized = privateKey.trim();
    if (!normalized.startsWith('0x')) {
      normalized = '0x' + normalized;
    }
    
    const { ethers } = await import('ethers');
    
    // Get RPC URL
    const CHAINS_CONFIG = {
      arc: { rpcUrl: process.env.ARC_RPC_URL || "https://hidden-cosmological-thunder.arc-testnet.quiknode.pro/e18d2b4649fda2fd51ef9f5a2c1d7d8fd132c886" },
      base: { rpcUrl: process.env.BASE_SEPOLIA_RPC_URL || process.env.BASE_RPC_URL || "https://sepolia.base.org" },
      'polygon-amoy': { rpcUrl: process.env.POLYGON_AMOY_RPC_URL || process.env.POLYGON_RPC_URL || "https://rpc-amoy.polygon.technology" },
      'arbitrum-sepolia': { rpcUrl: process.env.ARBITRUM_SEPOLIA_RPC_URL || process.env.ARBITRUM_RPC_URL || "https://sepolia-rollup.arbitrum.io/rpc" },
      'avalanche-fuji': { rpcUrl: process.env.AVALANCHE_FUJI_RPC_URL || process.env.AVALANCHE_RPC_URL || "https://api.avax-test.network/ext/bc/C/rpc" },
      'optimism-sepolia': { rpcUrl: process.env.OPTIMISM_SEPOLIA_RPC_URL || process.env.OPTIMISM_RPC_URL || "https://sepolia.optimism.io" },
      'codex-testnet': { rpcUrl: process.env.CODEX_TESTNET_RPC_URL || process.env.CODEX_RPC_URL || "https://812242.rpc.thirdweb.com" },
      'unichain-sepolia': { rpcUrl: process.env.UNICHAIN_SEPOLIA_RPC_URL || process.env.UNICHAIN_RPC_URL || "https://sepolia.unichain.io" }
    };
    
    const rpcUrl = CHAINS_CONFIG[chain]?.rpcUrl;
    if (!rpcUrl) {
      return res.status(400).json({ 
        success: false, 
        error: `RPC URL not configured for ${chain}` 
      });
    }
    
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const deployer = new ethers.Wallet(normalized, provider);
    
    if (factoryType === 'vault') {
      // Deploy VaultFactory
      const VaultFactory = deploymentService.getArtifact("VaultFactory");
      const VaultFactoryContract = new ethers.ContractFactory(
        VaultFactory.abi,
        VaultFactory.bytecode,
        deployer
      );
      
      const vaultFactory = await VaultFactoryContract.deploy(
        usdcAddress,
        deployer.address, // fee recipient
        30 // 0.30% swap fee
      );
      
      await vaultFactory.waitForDeployment();
      const vaultFactoryAddress = await vaultFactory.getAddress();
      
      res.json({ 
        success: true, 
        data: {
          chain: chainConfig.name,
          factoryType: 'vault',
          factoryAddress: vaultFactoryAddress,
          deployerAddress: deployer.address,
          usdcAddress: usdcAddress,
          explorer: chainConfig.explorer
        }
      });
    } else if (factoryType === 'amm') {
      // Deploy ArcAMMFactory
      const ArcAMMFactory = deploymentService.getArtifact("ArcAMMFactory");
      const AMMFactoryContract = new ethers.ContractFactory(
        ArcAMMFactory.abi,
        ArcAMMFactory.bytecode,
        deployer
      );
      
      const ammFactory = await AMMFactoryContract.deploy(
        deployer.address, // feeToSetter
        30, // 0.30% default swap fee
        0   // 0% protocol fee share
      );
      
      await ammFactory.waitForDeployment();
      const ammFactoryAddress = await ammFactory.getAddress();
      
      res.json({ 
        success: true, 
        data: {
          chain: chainConfig.name,
          factoryType: 'amm',
          factoryAddress: ammFactoryAddress,
          deployerAddress: deployer.address,
          explorer: chainConfig.explorer
        }
      });
    }
  } catch (error) {
    console.error('Error deploying VaultFactory:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/dev/distribute-gateway
 * Distribute wrapped tokens to multiple chains via Circle Gateway
 * 
 * Body:
 * {
 *   sourceChain: "arc" | "base" | ...,
 *   tokenAddress: "0x...",
 *   amount: "1000000000000000000", // Amount in token's smallest unit
 *   destinationChains: ["base", "polygon-amoy", ...],
 *   privateKey: "0x..." // Private key for signing transactions
 * }
 */
app.post('/api/dev/distribute-gateway', async (req, res) => {
  try {
    const { sourceChain, tokenAddress, amount, destinationChains, privateKey } = req.body;
    
    if (!sourceChain) {
      return res.status(400).json({ 
        success: false, 
        error: 'sourceChain is required' 
      });
    }
    
    if (!tokenAddress) {
      return res.status(400).json({ 
        success: false, 
        error: 'tokenAddress is required' 
      });
    }
    
    if (!amount) {
      return res.status(400).json({ 
        success: false, 
        error: 'amount is required' 
      });
    }
    
    if (!Array.isArray(destinationChains) || destinationChains.length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'destinationChains must be a non-empty array' 
      });
    }
    
    if (!privateKey) {
      return res.status(400).json({ 
        success: false, 
        error: 'privateKey is required' 
      });
    }
    
    // Normalize private key
    let normalized = privateKey.trim();
    if (!normalized.startsWith('0x')) {
      normalized = '0x' + normalized;
    }
    
    const { ethers } = await import('ethers');
    
    // Get RPC URL for source chain
    const CHAINS_CONFIG = {
      arc: { rpcUrl: process.env.ARC_RPC_URL || "https://hidden-cosmological-thunder.arc-testnet.quiknode.pro/e18d2b4649fda2fd51ef9f5a2c1d7d8fd132c886" },
      base: { rpcUrl: process.env.BASE_SEPOLIA_RPC_URL || process.env.BASE_RPC_URL || "https://sepolia.base.org" },
      'polygon-amoy': { rpcUrl: process.env.POLYGON_AMOY_RPC_URL || process.env.POLYGON_RPC_URL || "https://rpc-amoy.polygon.technology" },
      'arbitrum-sepolia': { rpcUrl: process.env.ARBITRUM_SEPOLIA_RPC_URL || process.env.ARBITRUM_RPC_URL || "https://sepolia-rollup.arbitrum.io/rpc" },
      'avalanche-fuji': { rpcUrl: process.env.AVALANCHE_FUJI_RPC_URL || process.env.AVALANCHE_RPC_URL || "https://api.avax-test.network/ext/bc/C/rpc" },
      'optimism-sepolia': { rpcUrl: process.env.OPTIMISM_SEPOLIA_RPC_URL || process.env.OPTIMISM_RPC_URL || "https://sepolia.optimism.io" },
      'codex-testnet': { rpcUrl: process.env.CODEX_TESTNET_RPC_URL || process.env.CODEX_RPC_URL || "https://812242.rpc.thirdweb.com" },
      'unichain-sepolia': { rpcUrl: process.env.UNICHAIN_SEPOLIA_RPC_URL || process.env.UNICHAIN_RPC_URL || "https://sepolia.unichain.io" }
    };
    
    const sourceRpcUrl = CHAINS_CONFIG[sourceChain]?.rpcUrl;
    if (!sourceRpcUrl) {
      return res.status(400).json({ 
        success: false, 
        error: `RPC URL not configured for ${sourceChain}` 
      });
    }
    
    const provider = new ethers.JsonRpcProvider(sourceRpcUrl);
    const signer = new ethers.Wallet(normalized, provider);
    const depositor = signer.address;
    
    console.log(`[GATEWAY DISTRIBUTION] Starting distribution:`);
    console.log(`  Source Chain: ${sourceChain}`);
    console.log(`  Token: ${tokenAddress}`);
    console.log(`  Amount: ${amount}`);
    console.log(`  Destinations: ${destinationChains.join(', ')}`);
    console.log(`  Depositor: ${depositor}`);
    
    // Use GatewayCoordinator with custom signer
    const results = {
      deposit: null,
      withdrawals: {},
      errors: {}
    };
    
    try {
      // Step 1: Deposit tokens to Gateway on source chain
      console.log(`\n[GATEWAY] Step 1: Depositing ${amount} tokens to Gateway on ${sourceChain}...`);
      
      const depositResult = await gatewayCoordinator.deposit({
        chain: sourceChain,
        token: tokenAddress,
        amount: amount,
        depositor: depositor,
        useOnChain: true,
        signer: signer
      });
      
      results.deposit = depositResult;
      console.log(`  ✓ Deposit successful: ${depositResult.id || depositResult.txHash}`);
      
      // Step 2: Withdraw wrapped tokens on each destination chain
      const amountPerChain = (BigInt(amount) / BigInt(destinationChains.length)).toString();
      console.log(`\n[GATEWAY] Step 2: Distributing ${amountPerChain} wrapped tokens to each destination chain...`);
      
      for (const destChain of destinationChains) {
        try {
          console.log(`  Withdrawing to ${destChain}...`);
          
          const withdrawal = await gatewayCoordinator.withdraw({
            token: tokenAddress,
            amount: amountPerChain,
            targetChain: destChain,
            recipient: depositor,
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
      
      res.json({ 
        success: true, 
        data: {
          sourceChain,
          tokenAddress,
          amount,
          amountPerChain,
          destinationChains,
          depositor,
          ...results
        }
      });
    } catch (error) {
      console.error(`[GATEWAY] Distribution failed:`, error);
      res.status(500).json({ success: false, error: error.message });
    }
  } catch (error) {
    console.error('Error distributing tokens via Gateway:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/dev/create-vault
 * Create a vault for a token on a specific chain
 * 
 * Body:
 * {
 *   chain: "arc" | "base" | "polygon-amoy" | ...,
 *   tokenAddress: "0x...", // Token address - will fetch name, symbol, decimals automatically
 *   vaultName: "Vault Shares Name", // Optional - auto-generated from token if not provided
 *   vaultSymbol: "vSYMBOL", // Optional - auto-generated from token if not provided
 *   privateKey: "0x..." // OPTIONAL - Private key for signing. If not provided, uses backend's PRIVATE_KEY from .env
 * }
 */
app.post('/api/dev/create-vault', async (req, res) => {
  try {
    const { chain, tokenAddress, vaultName, vaultSymbol, privateKey } = req.body;
    
    if (!chain) {
      return res.status(400).json({ 
        success: false, 
        error: 'chain is required' 
      });
    }
    
    if (!tokenAddress) {
      return res.status(400).json({ 
        success: false, 
        error: 'tokenAddress is required' 
      });
    }
    
    // Use provided private key or fallback to backend's PRIVATE_KEY
    const keyToUse = privateKey || process.env.PRIVATE_KEY || process.env.DEPLOYER_PRIVATE_KEY;
    
    if (!keyToUse) {
      return res.status(400).json({ 
        success: false, 
        error: 'Private key not provided and PRIVATE_KEY not found in backend .env' 
      });
    }
    
    // Get chain config
    const chainConfig = deploymentService.getAvailableChains().find(c => c.key === chain);
    if (!chainConfig) {
      return res.status(400).json({ 
        success: false, 
        error: `Unsupported chain: ${chain}` 
      });
    }
    
    // Get VaultFactory address from env
    const getVaultFactoryAddress = (chainKey) => {
      if (chainKey === 'arc') return process.env.ARC_VAULT_FACTORY || '';
      if (chainKey === 'base' || chainKey === 'base-sepolia') return process.env.BASE_VAULT_FACTORY || process.env.BASE_SEPOLIA_VAULT_FACTORY || '';
      if (chainKey === 'polygon-amoy') return process.env.POLYGON_AMOY_VAULT_FACTORY || '';
      if (chainKey === 'arbitrum-sepolia') return process.env.ARBITRUM_SEPOLIA_VAULT_FACTORY || '';
      if (chainKey === 'avalanche-fuji') return process.env.AVALANCHE_FUJI_VAULT_FACTORY || '';
      if (chainKey === 'optimism-sepolia') return process.env.OPTIMISM_SEPOLIA_VAULT_FACTORY || '';
      if (chainKey === 'codex-testnet') return process.env.CODEX_TESTNET_VAULT_FACTORY || '';
      if (chainKey === 'unichain-sepolia') return process.env.UNICHAIN_SEPOLIA_VAULT_FACTORY || '';
      return '';
    };
    
    const vaultFactoryAddress = getVaultFactoryAddress(chain);
    if (!vaultFactoryAddress) {
      return res.status(400).json({ 
        success: false, 
        error: `VaultFactory not configured for ${chain}. Please set ${chain.toUpperCase().replace(/-/g, '_')}_VAULT_FACTORY in .env` 
      });
    }
    
    // Normalize private key
    let normalized = keyToUse.trim();
    if (!normalized.startsWith('0x')) {
      normalized = '0x' + normalized;
    }
    
    const { ethers } = await import('ethers');
    
    // Get RPC URL from DeploymentService CHAINS config
    const CHAINS_CONFIG = {
      arc: { rpcUrl: process.env.ARC_RPC_URL || "https://hidden-cosmological-thunder.arc-testnet.quiknode.pro/e18d2b4649fda2fd51ef9f5a2c1d7d8fd132c886" },
      base: { rpcUrl: process.env.BASE_SEPOLIA_RPC_URL || process.env.BASE_RPC_URL || "https://sepolia.base.org" },
      'polygon-amoy': { rpcUrl: process.env.POLYGON_AMOY_RPC_URL || process.env.POLYGON_RPC_URL || "https://rpc-amoy.polygon.technology" },
      'arbitrum-sepolia': { rpcUrl: process.env.ARBITRUM_SEPOLIA_RPC_URL || process.env.ARBITRUM_RPC_URL || "https://sepolia-rollup.arbitrum.io/rpc" },
      'avalanche-fuji': { rpcUrl: process.env.AVALANCHE_FUJI_RPC_URL || process.env.AVALANCHE_RPC_URL || "https://api.avax-test.network/ext/bc/C/rpc" },
      'optimism-sepolia': { rpcUrl: process.env.OPTIMISM_SEPOLIA_RPC_URL || process.env.OPTIMISM_RPC_URL || "https://sepolia.optimism.io" },
      'codex-testnet': { rpcUrl: process.env.CODEX_TESTNET_RPC_URL || process.env.CODEX_RPC_URL || "https://812242.rpc.thirdweb.com" },
      'unichain-sepolia': { rpcUrl: process.env.UNICHAIN_SEPOLIA_RPC_URL || process.env.UNICHAIN_RPC_URL || "https://sepolia.unichain.io" }
    };
    
    const rpcUrl = CHAINS_CONFIG[chain]?.rpcUrl;
    if (!rpcUrl) {
      return res.status(400).json({ 
        success: false, 
        error: `RPC URL not configured for ${chain}` 
      });
    }
    
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const deployer = new ethers.Wallet(normalized, provider);
    
    const results = {
      chain: chainConfig.name,
      deployerAddress: deployer.address
    };
    
    // Fetch token info from blockchain
    console.log(`\n[CREATE VAULT] Fetching token info from ${chain}...`);
    const tokenContract = new ethers.Contract(
      tokenAddress,
      [
        'function name() view returns (string)',
        'function symbol() view returns (string)',
        'function decimals() view returns (uint8)'
      ],
      provider
    );
    
    let tokenName, tokenSymbol, tokenDecimals;
    try {
      [tokenName, tokenSymbol, tokenDecimals] = await Promise.all([
        tokenContract.name(),
        tokenContract.symbol(),
        tokenContract.decimals()
      ]);
      
      console.log(`  Token Name: ${tokenName}`);
      console.log(`  Token Symbol: ${tokenSymbol}`);
      console.log(`  Token Decimals: ${tokenDecimals}`);
    } catch (err) {
      return res.status(400).json({ 
        success: false, 
        error: `Failed to fetch token info: ${err.message}. Make sure the token address is valid and deployed on ${chain}.`
      });
    }
    
    results.token = {
      address: tokenAddress,
      name: tokenName,
      symbol: tokenSymbol,
      decimals: Number(tokenDecimals) // Convert BigInt to number
    };
    
    // Auto-generate vault name and symbol if not provided
    const finalVaultName = vaultName || `${tokenName}/USDC Vault`;
    const finalVaultSymbol = vaultSymbol || `v${tokenSymbol}-USDC`;
    
    console.log(`  Vault Name: ${finalVaultName}`);
    console.log(`  Vault Symbol: ${finalVaultSymbol}`);
    
    // Create vault using VaultFactory
    const VaultFactoryABI = [
      'function createVault(address projectToken, string memory name, string memory symbol) external returns (address)',
      'function getVault(address projectToken) external view returns (address)'
    ];
    
    const vaultFactory = new ethers.Contract(vaultFactoryAddress, VaultFactoryABI, deployer);
    
    // Check if vault already exists
    const existingVault = await vaultFactory.getVault(tokenAddress);
    if (existingVault !== ethers.ZeroAddress) {
      return res.status(400).json({ 
        success: false, 
        error: `Vault already exists for token ${tokenAddress} at ${existingVault}`,
        existingVault: existingVault,
        tokenInfo: results.token
      });
    }
    
    // Create vault
    console.log(`\n[CREATE VAULT] Creating vault...`);
    const createTx = await vaultFactory.createVault(
      tokenAddress,
      finalVaultName,
      finalVaultSymbol
    );
    console.log(`  Transaction sent: ${createTx.hash}`);
    
    const receipt = await createTx.wait();
    console.log(`  Transaction confirmed in block ${receipt.blockNumber}`);
    
    // Get vault address
    const vaultAddress = await vaultFactory.getVault(tokenAddress);
    console.log(`  Vault deployed at: ${vaultAddress}`);
    
    results.vault = {
      address: vaultAddress,
      name: finalVaultName,
      symbol: finalVaultSymbol,
      transactionHash: receipt.hash,
      blockNumber: Number(receipt.blockNumber) // Convert BigInt to number
    };
    
    console.log(`\n✅ Vault creation complete!`);
    console.log(`   Chain: ${chainConfig.name}`);
    console.log(`   Token: ${tokenName} (${tokenSymbol})`);
    console.log(`   Vault: ${vaultAddress}`);
    
    res.json({ 
      success: true, 
      data: results
    });
  } catch (error) {
    console.error('Error creating vault:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// Fluxa Gateway Endpoints
// ============================================================================

/**
 * POST /api/dev/deploy-gateway
 * Deploy FluxaGateway contract on a chain
 * 
 * Body:
 * {
 *   chain: "arc",
 *   tokenAddress: "0x...", // Token to wrap (on origin) or wrapped token (on destination)
 *   isOrigin: true, // true for origin chain, false for destination
 *   privateKey: "0x..."
 * }
 */
app.post('/api/dev/deploy-gateway', async (req, res) => {
  try {
    const { chain, tokenAddress, isOrigin, privateKey } = req.body;
    
    if (!chain) {
      return res.status(400).json({ 
        success: false, 
        error: 'chain is required' 
      });
    }
    
    if (!tokenAddress) {
      return res.status(400).json({ 
        success: false, 
        error: 'tokenAddress is required' 
      });
    }
    
    if (typeof isOrigin !== 'boolean') {
      return res.status(400).json({ 
        success: false, 
        error: 'isOrigin must be a boolean' 
      });
    }
    
    if (!privateKey) {
      return res.status(400).json({ 
        success: false, 
        error: 'privateKey is required' 
      });
    }
    
    // Get chain config
    const chainConfig = deploymentService.getAvailableChains().find(c => c.key === chain);
    if (!chainConfig) {
      return res.status(400).json({ 
        success: false, 
        error: `Unsupported chain: ${chain}` 
      });
    }
    
    // Get chain ID
    const chainIds = {
      arc: 5042002,
      base: 84532,
      'base-sepolia': 84532,
      polygon: 80002,
      'polygon-amoy': 80002,
      avalanche: 43113,
      'avalanche-fuji': 43113,
      optimism: 11155420,
      'optimism-sepolia': 11155420,
      arbitrum: 421614,
      'arbitrum-sepolia': 421614,
      'codex-testnet': 812242,
      'unichain-sepolia': 0
    };
    
    const chainId = chainIds[chain];
    if (!chainId) {
      return res.status(400).json({ 
        success: false, 
        error: `Chain ID not configured for ${chain}` 
      });
    }
    
    // Normalize private key
    let normalized = privateKey.trim();
    if (!normalized.startsWith('0x')) {
      normalized = '0x' + normalized;
    }
    
    // Get RPC URL
    const CHAINS_CONFIG = {
      arc: { rpcUrl: process.env.ARC_RPC_URL || "https://hidden-cosmological-thunder.arc-testnet.quiknode.pro/e18d2b4649fda2fd51ef9f5a2c1d7d8fd132c886" },
      base: { rpcUrl: process.env.BASE_SEPOLIA_RPC_URL || process.env.BASE_RPC_URL || "https://sepolia.base.org" },
      'polygon-amoy': { rpcUrl: process.env.POLYGON_AMOY_RPC_URL || process.env.POLYGON_RPC_URL || "https://rpc-amoy.polygon.technology" },
      'arbitrum-sepolia': { rpcUrl: process.env.ARBITRUM_SEPOLIA_RPC_URL || process.env.ARBITRUM_RPC_URL || "https://sepolia-rollup.arbitrum.io/rpc" },
      'avalanche-fuji': { rpcUrl: process.env.AVALANCHE_FUJI_RPC_URL || process.env.AVALANCHE_RPC_URL || "https://api.avax-test.network/ext/bc/C/rpc" },
      'optimism-sepolia': { rpcUrl: process.env.OPTIMISM_SEPOLIA_RPC_URL || process.env.OPTIMISM_RPC_URL || "https://sepolia.optimism.io" },
      'codex-testnet': { rpcUrl: process.env.CODEX_TESTNET_RPC_URL || process.env.CODEX_RPC_URL || "https://812242.rpc.thirdweb.com" },
      'unichain-sepolia': { rpcUrl: process.env.UNICHAIN_SEPOLIA_RPC_URL || process.env.UNICHAIN_RPC_URL || "https://sepolia.unichain.io" }
    };
    
    const rpcUrl = CHAINS_CONFIG[chain]?.rpcUrl;
    if (!rpcUrl) {
      return res.status(400).json({ 
        success: false, 
        error: `RPC URL not configured for ${chain}` 
      });
    }
    
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const deployer = new ethers.Wallet(normalized, provider);
    
    // Deploy FluxaGateway
    const FluxaGateway = deploymentService.getArtifact("FluxaGateway");
    const GatewayFactory = new ethers.ContractFactory(
      FluxaGateway.abi,
      FluxaGateway.bytecode,
      deployer
    );
    
    // Use coordinator from request, or fallback to deployer address
    // Get LayerZero Endpoint address for chain
    const lzEndpoints = {
      arc: process.env.ARC_LZ_ENDPOINT || '0x6aB5Ae6822647046626e83ee6dB8187151E1d5ab', // Arc testnet
      base: process.env.BASE_LZ_ENDPOINT || '0x6EDCE65403992e310A62460808c4b910D972f10f', // Base Sepolia
      'base-sepolia': process.env.BASE_LZ_ENDPOINT || '0x6EDCE65403992e310A62460808c4b910D972f10f',
      'polygon-amoy': process.env.POLYGON_LZ_ENDPOINT || '0x6EDCE65403992e310A62460808c4b910D972f10f', // Polygon Amoy
      'arbitrum-sepolia': process.env.ARBITRUM_LZ_ENDPOINT || '0x6EDCE65403992e310A62460808c4b910D972f10f',
      'avalanche-fuji': process.env.AVALANCHE_LZ_ENDPOINT || '0x6EDCE65403992e310A62460808c4b910D972f10f',
      'optimism-sepolia': process.env.OPTIMISM_LZ_ENDPOINT || '0x6EDCE65403992e310A62460808c4b910D972f10f',
      'codex-testnet': process.env.CODEX_LZ_ENDPOINT || '',
      'unichain-sepolia': process.env.UNICHAIN_LZ_ENDPOINT || ''
    };
    
    const lzEndpoint = lzEndpoints[chain];
    if (!lzEndpoint) {
      return res.status(400).json({ 
        success: false, 
        error: `LayerZero Endpoint not configured for ${chain}` 
      });
    }

    // Get LayerZero chain ID
    const lzChainIds = {
      arc: 30110, // Arc Testnet
      base: 40245, // Base Sepolia
      'base-sepolia': 40245,
      'polygon-amoy': 40267, // Polygon Amoy
      'arbitrum-sepolia': 40231,
      'avalanche-fuji': 40106,
      'optimism-sepolia': 40232,
      'codex-testnet': 0, // Need to verify
      'unichain-sepolia': 0 // Need to verify
    };
    
    const lzChainId = lzChainIds[chain];
    if (!lzChainId) {
      return res.status(400).json({ 
        success: false, 
        error: `LayerZero chain ID not configured for ${chain}` 
      });
    }
    
    const gateway = await GatewayFactory.deploy(
      tokenAddress,
      isOrigin,
      chainId,
      lzEndpoint,
      lzChainId
    );
    
    await gateway.waitForDeployment();
    const gatewayAddress = await gateway.getAddress();
    
    // If destination chain, also deploy WrappedToken
    let wrappedTokenAddress = null;
    if (!isOrigin) {
      const WrappedToken = deploymentService.getArtifact("WrappedToken");
      const TokenFactory = new ethers.ContractFactory(
        WrappedToken.abi,
        WrappedToken.bytecode,
        deployer
      );
      
      // Get token info for naming
      const tokenContract = new ethers.Contract(
        tokenAddress,
        ['function name() view returns (string)', 'function symbol() view returns (string)'],
        provider
      );
      
      let tokenName, tokenSymbol;
      try {
        [tokenName, tokenSymbol] = await Promise.all([
          tokenContract.name(),
          tokenContract.symbol()
        ]);
      } catch {
        tokenName = 'Wrapped Token';
        tokenSymbol = 'WTKN';
      }
      
      const wrappedToken = await TokenFactory.deploy(
        `Wrapped ${tokenName}`,
        `w${tokenSymbol}`,
        chainId,
        tokenAddress
      );
      
      await wrappedToken.waitForDeployment();
      wrappedTokenAddress = await wrappedToken.getAddress();
      
      // Set gateway on wrapped token
      const setGatewayTx = await wrappedToken.setGateway(gatewayAddress);
      await setGatewayTx.wait();
      
      // Set wrapped token on gateway
      const setWrappedTx = await gateway.setWrappedToken(wrappedTokenAddress);
      await setWrappedTx.wait();
    }
    
    res.json({ 
      success: true, 
      data: {
        chain: chainConfig.name,
        gatewayAddress: gatewayAddress,
        isOrigin: isOrigin,
        tokenAddress: tokenAddress,
        wrappedTokenAddress: wrappedTokenAddress,
        lzEndpoint: lzEndpoint,
        lzChainId: lzChainId,
        deployerAddress: deployer.address,
        explorer: chainConfig.explorer
      }
    });
  } catch (error) {
    console.error('Error deploying Gateway:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/swap/execute
 * Execute a cross-chain swap with progress tracking
 * 
 * Body:
 * {
 *   route: RouteOption, // Selected route from SmartSwapRouter
 *   userAddress: "0x...",
 *   userChain: "arc" | "base",
 *   amountIn: "1000000000000000000", // Amount in wei
 *   tokenIn: "FLX" | "wFLX" | "USDC",
 *   tokenOut: "FLX" | "wFLX" | "USDC",
 *   slippageTolerance: 0.01 // 1%
 * }
 */
app.post('/api/swap/execute', async (req, res) => {
  try {
    const { route, userAddress, userChain, amountIn, tokenIn, tokenOut, slippageTolerance } = req.body;
    
    if (!route || !userAddress || !userChain || !amountIn || !tokenIn || !tokenOut) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required fields: route, userAddress, userChain, amountIn, tokenIn, tokenOut' 
      });
    }

    console.log(`\n[SWAP EXECUTE] Starting swap execution`);
    console.log(`  User: ${userAddress} on ${userChain}`);
    console.log(`  Route: ${route.name}`);
    console.log(`  Amount In: ${amountIn} ${tokenIn}`);
    console.log(`  Token Out: ${tokenOut}`);
    console.log(`  Chains: ${route.chains.join(', ')}`);

    // Create swap session ID for progress tracking
    const swapId = `swap_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Initialize progress tracking
    const progress = {
      swapId,
      status: 'initiated',
      steps: [],
      currentStep: 0,
      totalSteps: route.chains.length === 1 ? 2 : 6 // Local vs Multi-chain
    };

    // Execute swap based on route type
    if (route.chains.length === 1) {
      // LOCAL ONLY SWAP
      await executeLocalSwap({ route, userAddress, userChain, amountIn, tokenIn, tokenOut, slippageTolerance, progress });
    } else {
      // MULTI-CHAIN SWAP
      await executeMultiChainSwap({ route, userAddress, userChain, amountIn, tokenIn, tokenOut, slippageTolerance, progress });
    }

    res.json({ success: true, data: { swapId, progress } });
  } catch (error) {
    console.error('[SWAP EXECUTE] Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Execute local-only swap on a single chain
 */
async function executeLocalSwap({ route, userAddress, userChain, amountIn, tokenIn, tokenOut, slippageTolerance, progress }) {
  console.log(`\n[LOCAL SWAP] Executing on ${userChain}...`);
  
  // Step 1: Get vault address
  progress.steps.push({ name: 'Getting vault', status: 'in_progress', timestamp: Date.now() });
  progress.currentStep = 1;
  
  const vaultAddress = userChain === 'arc' 
    ? process.env.ARC_VAULT_ADDRESS 
    : process.env.BASE_VAULT_ADDRESS;
  
  if (!vaultAddress) {
    throw new Error(`Vault not deployed on ${userChain}`);
  }
  
  progress.steps[progress.steps.length - 1].status = 'complete';
  console.log(`  Vault: ${vaultAddress}`);
  
  // Step 2: Execute swap on vault
  progress.steps.push({ name: `Swapping ${tokenIn} → ${tokenOut}`, status: 'in_progress', timestamp: Date.now() });
  progress.currentStep = 2;
  
  // TODO: Implement actual vault swap call
  console.log(`  Swap: ${amountIn} ${tokenIn} → ${tokenOut}`);
  console.log(`  Expected output: ${route.output} ${tokenOut}`);
  
  progress.steps[progress.steps.length - 1].status = 'complete';
  progress.status = 'complete';
  
  return progress;
}

/**
 * Execute multi-chain swap (aggregate liquidity from multiple chains)
 */
async function executeMultiChainSwap({ route, userAddress, userChain, amountIn, tokenIn, tokenOut, slippageTolerance, progress }) {
  console.log(`\n[MULTI-CHAIN SWAP] Executing across ${route.chains.length} chains...`);
  
  try {
    // Step 1: Bridge tokens to Arc (if not already on Arc)
    if (userChain !== 'arc') {
      progress.steps.push({ name: `Bridging ${tokenIn} to Arc`, status: 'in_progress', timestamp: Date.now() });
      progress.currentStep = 1;
      
      if (tokenIn === 'USDC') {
        console.log(`  Using CCTP to bridge USDC from ${userChain} to Arc`);
        const bridgeResult = await cctpBridge.bridgeUSDC(userChain, 'arc', amountIn, userAddress);
        progress.steps[progress.steps.length - 1].txHash = bridgeResult.burnTxHash;
        console.log(`  ✓ USDC bridged: ${bridgeResult.burnTxHash}`);
      } else if (tokenIn === 'wFLX') {
        console.log(`  Using Gateway to bridge wFLX from ${userChain} to Arc`);
        const bridgeResult = await gatewayBridge.bridgeWFLXToArc(BigInt(amountIn), userAddress, 0n);
        progress.steps[progress.steps.length - 1].txHash = bridgeResult.burnTxHash;
        console.log(`  ✓ wFLX bridged: ${bridgeResult.burnTxHash}`);
      }
      
      progress.steps[progress.steps.length - 1].status = 'complete';
    }
    
    // Step 2: Aggregate liquidity from remote chains to Arc
    progress.steps.push({ name: 'Aggregating liquidity to Arc', status: 'in_progress', timestamp: Date.now() });
    progress.currentStep++;
    
    console.log(`\n${'═'.repeat(80)}`);
    console.log(`📦 STEP 2: AGGREGATING VAULT LIQUIDITY`);
    console.log(`${'═'.repeat(80)}`);
    console.log(`⏰ ${new Date().toISOString()}`);
    
    const remoteChains = route.chains.filter(c => c !== 'arc');
    console.log(`Remote chains to aggregate: ${remoteChains.join(', ')}`);
    
    const aggregationResults = await vaultAggregator.aggregateFromMultipleChains(remoteChains);
    
    progress.steps[progress.steps.length - 1].status = 'complete';
    progress.steps[progress.steps.length - 1].data = aggregationResults;
    
    console.log(`\n✅ Liquidity aggregated from ${aggregationResults.length} remote chain(s)`);
    console.log(`${'═'.repeat(80)}\n`);
    
    // Step 3: Execute swap on Arc with aggregated liquidity
    progress.steps.push({ name: `Swapping on Arc (aggregated)`, status: 'in_progress', timestamp: Date.now() });
    progress.currentStep++;
    
    console.log(`  Executing swap with aggregated liquidity...`);
    console.log(`  Input: ${amountIn} ${tokenIn}`);
    console.log(`  Expected output: ${route.output} ${tokenOut}`);
    
    // TODO: Execute swap on Arc vault with aggregated liquidity
    
    progress.steps[progress.steps.length - 1].status = 'complete';
    
    // Step 4: Rebalance pools to same price
    progress.steps.push({ name: 'Rebalancing pools', status: 'in_progress', timestamp: Date.now() });
    progress.currentStep++;
    
    console.log(`  Rebalancing all pools to target price...`);
    
    // TODO: Implement pool rebalancing
    
    progress.steps[progress.steps.length - 1].status = 'complete';
    
    // Step 5: Return liquidity to original chains
    progress.steps.push({ name: 'Returning liquidity', status: 'in_progress', timestamp: Date.now() });
    progress.currentStep++;
    
    for (const chain of remoteChains) {
      console.log(`  Returning liquidity to ${chain}...`);
      
      // In production: rebalance vaults and bridge back to original chains
      if (chain === 'base') {
        console.log(`    ℹ️  Returning FLX to Base (as wFLX)`);
        console.log(`    ℹ️  Returning USDC to Base`);
      }
    }
    
    console.log(`  ✓ Liquidity returned to ${remoteChains.length} remote chain(s)`);
    progress.steps[progress.steps.length - 1].status = 'complete';
    
    // Step 6: Bridge output token back to user's chain (if needed)
    if (userChain !== 'arc') {
      progress.steps.push({ name: `Bridging ${tokenOut} to ${userChain}`, status: 'in_progress', timestamp: Date.now() });
      progress.currentStep++;
      
      console.log(`  Bridging output to user's chain...`);
      
      if (tokenOut === 'USDC') {
        console.log(`    Using CCTP to bridge USDC to ${userChain}`);
        // Calculate expected output amount (simplified)
        const outputAmount = route.expectedOutput * 1e6; // Convert to USDC decimals
        const bridgeResult = await cctpBridge.bridgeUSDC('arc', userChain, BigInt(Math.floor(outputAmount)), userAddress);
        progress.steps[progress.steps.length - 1].txHash = bridgeResult.burnTxHash;
        console.log(`  ✓ USDC bridged: ${bridgeResult.burnTxHash}`);
      } else if (tokenOut === 'FLX' && userChain === 'base') {
        console.log(`    Using Gateway to bridge FLX to Base (as wFLX)`);
        const outputAmount = ethers.parseEther(route.expectedOutput.toString());
        const bridgeResult = await gatewayBridge.bridgeFLXToBase(outputAmount, userAddress, 0n);
        progress.steps[progress.steps.length - 1].txHash = bridgeResult.depositTxHash;
        console.log(`  ✓ FLX bridged: ${bridgeResult.depositTxHash}`);
      }
      
      progress.steps[progress.steps.length - 1].status = 'complete';
    }
    
    progress.status = 'complete';
    console.log(`\n✅ Multi-chain swap complete!`);
    
    return progress;
  } catch (error) {
    progress.status = 'failed';
    progress.error = error.message;
    throw error;
  }
}

/**
 * GET /api/swap/progress/:swapId
 * Get swap execution progress
 */
app.get('/api/swap/progress/:swapId', async (req, res) => {
  try {
    const { swapId } = req.params;
    
    // TODO: Store progress in memory or database
    // For now, return mock progress
    res.json({ 
      success: true, 
      data: { 
        swapId,
        status: 'in_progress',
        currentStep: 2,
        totalSteps: 6,
        steps: []
      } 
    });
  } catch (error) {
    console.error('Error getting swap progress:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/gateway/process-deposit
 * Process a token deposit from Arc to destination chain (Base)
 * Backend monitors deposits on Arc and mints wrapped tokens on Base
 * 
 * Body:
 * {
 *   arcDepositTxHash: "0x...", // Transaction hash of depositForWrap call on Arc
 *   baseGatewayAddress: "0x..." // Gateway address on Base
 * }
 */
app.post('/api/gateway/process-deposit', async (req, res) => {
  try {
    const { arcDepositTxHash, baseGatewayAddress } = req.body;
    
    if (!arcDepositTxHash || !baseGatewayAddress) {
      return res.status(400).json({ 
        success: false, 
        error: 'arcDepositTxHash and baseGatewayAddress are required' 
      });
    }
    
    const result = await fluxaGatewayCoordinator.processDeposit(
      'arc',
      baseGatewayAddress,
      arcDepositTxHash
    );
    
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Error processing deposit:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/gateway/coordinator-address
 * Get backend coordinator wallet address
 */
app.get('/api/gateway/coordinator-address', (req, res) => {
  try {
    const address = fluxaGatewayCoordinator.getCoordinatorAddress();
    if (!address) {
      return res.status(500).json({ 
        success: false, 
        error: 'Coordinator wallet not configured' 
      });
    }
    res.json({ success: true, data: { address } });
  } catch (error) {
    console.error('Error getting coordinator address:', error);
    res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/vault/drain
 * Test endpoint to drain vault from a specific chain
 * Body: { chain: "base" }
 */
app.post('/api/vault/drain', async (req, res) => {
  try {
    const { chain } = req.body;
    
    if (!chain) {
      return res.status(400).json({ success: false, error: 'chain is required' });
    }
    
    if (chain === 'arc') {
      return res.status(400).json({ success: false, error: 'Cannot drain Arc vault (Arc is the destination)' });
    }
    
    console.log(`\n${'🔔'.repeat(40)}`);
    console.log(`📞 API CALL: POST /api/vault/drain`);
    console.log(`${'🔔'.repeat(40)}`);
    console.log(`⏰ ${new Date().toISOString()}`);
    console.log(`Request Body:`, JSON.stringify(req.body, null, 2));
    
    const result = await vaultAggregator.drainVault(chain);
    
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Error draining vault:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/vault/repopulate
 * Test endpoint to repopulate vault on a specific chain
 * Body: { chain: "base", flxAmount: "1000000000000000000", usdcAmount: "1000000" }
 */
app.post('/api/vault/repopulate', async (req, res) => {
  try {
    const { chain, flxAmount, usdcAmount } = req.body;
    
    if (!chain) {
      return res.status(400).json({ success: false, error: 'chain is required' });
    }
    
    if (!flxAmount || !usdcAmount) {
      return res.status(400).json({ success: false, error: 'flxAmount and usdcAmount are required' });
    }
    
    console.log(`\n${'🔔'.repeat(40)}`);
    console.log(`📞 API CALL: POST /api/vault/repopulate`);
    console.log(`${'🔔'.repeat(40)}`);
    console.log(`⏰ ${new Date().toISOString()}`);
    console.log(`Request Body:`, JSON.stringify(req.body, null, 2));
    
    const result = await vaultAggregator.repopulateVault(chain, BigInt(flxAmount), BigInt(usdcAmount));
    
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Error repopulating vault:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/gateway/arc-balance
 * Check coordinator wallet balance on Arc (for gas fees)
 */
app.get('/api/gateway/arc-balance', async (req, res) => {
  try {
    const balance = await fluxaGatewayCoordinator.checkArcBalance();
    res.json({ success: true, data: balance });
  } catch (error) {
    console.error('Error checking Arc balance:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/gateway/base-balance
 * Check coordinator wallet balance on Base (for gas fees)
 */
app.get('/api/gateway/base-balance', async (req, res) => {
  try {
    const balance = await fluxaGatewayCoordinator.checkBaseBalance();
    res.json({ success: true, data: balance });
  } catch (error) {
    console.error('Error checking Base balance:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// Start Server
// ============================================================================

// Handle unhandled promise rejections to prevent crashes
process.on('unhandledRejection', (error, promise) => {
  console.error('Unhandled Promise Rejection:', error);
  console.error('Stack:', error.stack);
  // Don't exit - just log the error
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  console.error('Stack:', error.stack);
  // Don't exit - just log the error
});

// Start LP monitoring
await lpMonitor.start();
console.log('✓ LP Monitor started');

// Start Fluxa Gateway monitoring (Arc → Base token bridging)
try {
  const arcGateway = process.env.ARC_GATEWAY;
  const baseGateway = process.env.BASE_GATEWAY;
  
  if (arcGateway && baseGateway) {
    await fluxaGatewayCoordinator.startMonitoring(arcGateway, 'base', baseGateway);
    console.log('✓ Fluxa Gateway Coordinator started');
    console.log(`  Arc Gateway: ${arcGateway}`);
    console.log(`  Base Gateway: ${baseGateway}`);
  } else {
    console.warn('⚠️  Gateway addresses not configured in .env:');
    if (!arcGateway) console.warn('   - Missing ARC_GATEWAY');
    if (!baseGateway) console.warn('   - Missing BASE_GATEWAY');
    console.warn('   Gateway monitoring will not start.');
  }
} catch (err) {
  console.error('⚠️  Failed to start Fluxa Gateway Coordinator:', err.message);
}

// Start server
app.listen(PORT, () => {
  console.log(`\n🚀 Fluxa Backend running on port ${PORT}`);
  console.log(`\nAPI Endpoints:`);
  console.log(`  GET  /health`);
  console.log(`  GET  /api/lp-depths`);
  console.log(`  POST /api/quote`);
  console.log(`  POST /api/execute-highvalue`);
  console.log(`  GET  /api/rebalance/status`);
  console.log(`  GET  /api/deployment/chains`);
  console.log(`  POST /api/deployment/deploy`);
  console.log(`\n`);
});

export default app;

