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
const lpMigrationService = new LPMigrationService(lpMonitor, cctpCoordinator, gatewayCoordinator);
const poolRebasingService = new PoolRebasingService(lpMonitor, cctpCoordinator, gatewayCoordinator);

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

/**
 * Multi-chain swap execution orchestrator
 */
async function executeMultiChainSwap({ route, recipient, minAmountOut }) {
  const steps = [];

  try {
    // Step 0: Migrate LP pools from remote chains to Arc (if multi-chain route)
    if (route.requiresMultiChain && route.selectedRoute?.remoteChains?.length > 0) {
      steps.push({ step: 'lp_migration', status: 'in_progress' });
      
      try {
        const migrationResult = await lpMigrationService.migratePoolsToArc(route, recipient);
        steps.push({ step: 'lp_migration', status: 'complete', result: migrationResult });
      } catch (error) {
        console.error('[EXECUTION] LP migration failed, continuing with existing liquidity:', error.message);
        steps.push({ step: 'lp_migration', status: 'failed', error: error.message, continue: true });
      }
    }

    // Step 1: Pull USDC via CCTP if needed (using Fast Attestation)
    if (route.cctpTransfers && route.cctpTransfers.length > 0) {
      steps.push({ step: 'cctp_initiate', status: 'in_progress' });
      
      const cctpResults = await Promise.all(
        route.cctpTransfers.map(transfer =>
          cctpCoordinator.initiateTransfer({
            ...transfer,
            recipient: recipient, // Mint USDC to user's recipient address on Arc
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

    // Step 4: Rebase pools to same FLX price (if multi-chain route was used)
    if (route.requiresMultiChain && route.selectedRoute?.remoteChains?.length > 0) {
      steps.push({ step: 'pool_rebasing', status: 'in_progress' });
      
      try {
        const rebaseResult = await poolRebasingService.rebasePoolsToTargetPrice(swapResult, route);
        steps.push({ step: 'pool_rebasing', status: 'complete', result: rebaseResult });
      } catch (error) {
        console.error('[EXECUTION] Pool rebasing failed:', error.message);
        steps.push({ step: 'pool_rebasing', status: 'failed', error: error.message, continue: true });
      }
    }

    // Step 5: Trigger rebalancing (for liquidity ratio balancing)
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

