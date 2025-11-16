/**
 * Test Swap Flow
 * 
 * Tests the complete swap flow:
 * - User swaps on Base
 * - Backend routes via Arc + Polygon (if beneficial)
 * - User receives result on Base
 */

import axios from 'axios';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

const API_URL = process.env.BACKEND_URL || 'http://localhost:3001';

async function testSwapFlow() {
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('🧪 TESTING SWAP FLOW: Base → Arc + Polygon → Base');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // Test parameters
  const testParams = {
    tokenIn: process.env.BASE_SEPOLIA_FLX_TOKEN || '',
    tokenOut: process.env.BASE_SEPOLIA_USDC_ADDRESS || '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
    amountIn: '1000000000000000000', // 1 FLX (18 decimals)
    userChain: 'base',
    userAddress: process.env.TEST_USER_ADDRESS || '0x0000000000000000000000000000000000000000'
  };

  console.log('Test Parameters:');
  console.log(`  User Chain: ${testParams.userChain}`);
  console.log(`  User Address: ${testParams.userAddress}`);
  console.log(`  Token In: ${testParams.tokenIn}`);
  console.log(`  Token Out: ${testParams.tokenOut}`);
  console.log(`  Amount In: ${testParams.amountIn} (${Number(testParams.amountIn) / 1e18} FLX)\n`);

  try {
    // Step 1: Get quote
    console.log('📊 Step 1: Getting quote...');
    const quoteResponse = await axios.post(`${API_URL}/api/quote`, {
      tokenIn: testParams.tokenIn,
      tokenOut: testParams.tokenOut,
      amountIn: testParams.amountIn,
      sourceChain: testParams.userChain
    });

    if (!quoteResponse.data.success) {
      throw new Error(`Quote failed: ${quoteResponse.data.error}`);
    }

    const quote = quoteResponse.data.data;
    console.log(`  ✓ Quote received`);
    console.log(`    Strategy: ${quote.requiresMultiChain ? 'VIA_ARC' : 'LOCAL_ONLY'}`);
    console.log(`    Selected Route: ${quote.selectedRoute.name}`);
    console.log(`    Chains: ${quote.selectedRoute.chains.join(' → ')}`);
    console.log(`    Gross Output: ${quote.estimatedOutputFormatted}`);
    console.log(`    Net Output: ${quote.netOutputFormatted}`);
    console.log(`    Gas Cost: ${quote.totalGasCostFormatted}\n`);

    // Show all routing options
    if (quote.routingOptions && quote.routingOptions.length > 0) {
      console.log('  Routing Options Evaluated:');
      quote.routingOptions.forEach((opt, i) => {
        const isBest = i === 0;
        const marker = isBest ? '🏆' : '  ';
        console.log(`    ${marker} ${opt.name}: Net = ${opt.netOutputFormatted}, Gas = ${opt.gasCostUSDFormatted}`);
      });
      console.log('');
    }

    // Step 2: Execute swap
    console.log('🔄 Step 2: Executing swap...');
    const swapResponse = await axios.post(`${API_URL}/api/swap`, {
      tokenIn: testParams.tokenIn,
      tokenOut: testParams.tokenOut,
      amountIn: testParams.amountIn,
      minAmountOut: quote.estimatedOutput,
      userChain: testParams.userChain,
      userAddress: testParams.userAddress
    });

    if (!swapResponse.data.success) {
      throw new Error(`Swap failed: ${swapResponse.data.error}`);
    }

    const swapResult = swapResponse.data.data;
    console.log(`  ✓ Swap executed`);
    console.log(`    Strategy: ${swapResult.strategy}`);
    console.log(`    Output: ${swapResult.output}`);
    console.log(`    TX Hash: ${swapResult.txHash}\n`);

    // Show execution steps
    if (swapResult.steps && swapResult.steps.length > 0) {
      console.log('  Execution Steps:');
      swapResult.steps.forEach((step, i) => {
        const status = step.status === 'complete' ? '✓' : step.status === 'failed' ? '✗' : '⏳';
        console.log(`    ${i + 1}. ${status} ${step.step}: ${step.status}`);
        if (step.result) {
          console.log(`       Result: ${JSON.stringify(step.result).substring(0, 100)}...`);
        }
      });
      console.log('');
    }

    console.log('═══════════════════════════════════════════════════════════════');
    console.log('✅ TEST COMPLETE');
    console.log('═══════════════════════════════════════════════════════════════\n');
    console.log(`User received ${swapResult.output} on ${testParams.userChain}`);
    console.log(`(Same chain they started on!)\n`);

  } catch (error) {
    console.error('\n✗ Test failed:', error.message);
    if (error.response) {
      console.error('  Response:', error.response.data);
    }
    process.exit(1);
  }
}

// Run test
testSwapFlow()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

