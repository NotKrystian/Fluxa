/**
 * Simple standalone CCTP transfer test
 * 
 * Usage: cd backend && node testCCTPTransfer.js
 */

import dotenv from 'dotenv';
import { BridgeKit } from '@circle-fin/bridge-kit';
import { createAdapterFromPrivateKey } from '@circle-fin/adapter-viem-v2';
import { createPublicClient, http } from 'viem';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables from project root
dotenv.config({ path: join(__dirname, '../.env') });

const RECIPIENT_ADDRESS = '0xe8f14cD50Cfa48e366142815D2b63263849400cE';
const AMOUNT = '1.0'; // 6.0 USDC
const SOURCE_CHAIN = 'Base_Sepolia';
const DEST_CHAIN = 'Arc_Testnet';
const BASE_USDC_ADDRESS = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';

async function testTransfer() {
  console.log('🧪 Testing CCTP Transfer');
  console.log('========================');
  console.log(`Source Chain: ${SOURCE_CHAIN}`);
  console.log(`Destination Chain: ${DEST_CHAIN}`);
  console.log(`Amount: ${AMOUNT} USDC`);
  console.log(`Recipient: ${RECIPIENT_ADDRESS}`);
  console.log('');

  try {
    // Get private key from env
    const privateKey = process.env.CCTP_PRIVATE_KEY || process.env.PRIVATE_KEY;
    if (!privateKey) {
      throw new Error('CCTP_PRIVATE_KEY or PRIVATE_KEY not found in .env');
    }

    // Get RPC URLs
    const baseSepoliaRpc = process.env.BASE_SEPOLIA_RPC_URL || process.env.BASE_RPC_URL || 'https://sepolia.base.org';
    const arcRpc = process.env.ARC_RPC_URL || 'https://rpc.testnet.arc.network';

    console.log('✅ Environment variables loaded');
    console.log('');

    // Initialize Bridge Kit
    const kit = new BridgeKit();
    console.log('✅ Bridge Kit initialized');
    console.log('');

    // Create adapter with custom RPCs
    const adapter = createAdapterFromPrivateKey({
      privateKey: privateKey,
      getPublicClient: ({ chain: viemChain }) => {
        const chainName = viemChain?.name || '';
        let rpcUrl = null;

        if (chainName.includes('Base') && chainName.includes('Sepolia')) {
          rpcUrl = baseSepoliaRpc;
        } else if (chainName.includes('Arc') || chainName === 'Arc_Testnet') {
          rpcUrl = arcRpc;
        }

        if (!rpcUrl) {
          console.warn(`No RPC found for ${chainName}, using default`);
          return createPublicClient({
            chain: viemChain,
            transport: http(),
          });
        }

        return createPublicClient({
          chain: viemChain,
          transport: http(rpcUrl, {
            retryCount: 3,
            timeout: 10000,
          }),
        });
      },
    });

    console.log('✅ Adapter created');
    console.log('');

    // Check USDC balance and allowance before transfer
    console.log('🔍 Checking wallet status...');
    
    // Get wallet address from private key directly
    const { privateKeyToAccount } = await import('viem/accounts');
    const account = privateKeyToAccount(`0x${privateKey.replace(/^0x/, '')}`);
    const walletAddress = account.address;
    console.log(`  Wallet: ${walletAddress}`);
    
    // Get USDC contract to check balance and allowance
    const { createPublicClient, formatUnits, parseUnits } = await import('viem');
    const { baseSepolia } = await import('viem/chains');
    const publicClient = createPublicClient({
      chain: baseSepolia,
      transport: http(baseSepoliaRpc),
    });
    
    const usdcAbi = [
      { inputs: [{ name: 'account', type: 'address' }], name: 'balanceOf', outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' },
      { inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }], name: 'allowance', outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' }
    ];
    
    const balance = await publicClient.readContract({
      address: BASE_USDC_ADDRESS,
      abi: usdcAbi,
      functionName: 'balanceOf',
      args: [walletAddress]
    });
    
    // Bridge Kit's bridge contract address (from the result structure)
    const bridgeContract = '0xC5567a5E3370d4DBfB0540025078e283e36A363d';
    const allowance = await publicClient.readContract({
      address: BASE_USDC_ADDRESS,
      abi: usdcAbi,
      functionName: 'allowance',
      args: [walletAddress, bridgeContract]
    });
    
    const balanceFormatted = formatUnits(balance, 6);
    const allowanceFormatted = formatUnits(allowance, 6);
    const amountNeeded = parseFloat(AMOUNT);
    
    console.log(`  USDC Balance: ${balanceFormatted} USDC`);
    console.log(`  Allowance: ${allowanceFormatted} USDC`);
    console.log(`  Amount Needed: ${amountNeeded} USDC`);
    
    if (parseFloat(balanceFormatted) < amountNeeded) {
      throw new Error(`Insufficient USDC balance. Have: ${balanceFormatted}, Need: ${amountNeeded}`);
    }
    
    // Pre-approve if allowance is insufficient
    if (parseFloat(allowanceFormatted) < amountNeeded) {
      console.log(`  ⚠️  Allowance (${allowanceFormatted}) is less than amount (${amountNeeded})`);
      console.log(`  Pre-approving USDC to avoid timing issues...`);
      
      const { createWalletClient } = await import('viem');
      const { baseSepolia } = await import('viem/chains');
      // Reuse the account we already created
      
      const walletClient = createWalletClient({
        account,
        chain: baseSepolia,
        transport: http(baseSepoliaRpc),
      });
      
      // Approve a large amount to avoid future approval issues
      const approveAmount = parseUnits('1000000', 6); // 1M USDC
      
      const approveTx = await walletClient.writeContract({
        address: BASE_USDC_ADDRESS,
        abi: [
          { inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], name: 'approve', outputs: [{ name: '', type: 'bool' }], stateMutability: 'nonpayable', type: 'function' }
        ],
        functionName: 'approve',
        args: [bridgeContract, approveAmount]
      });
      
      console.log(`  Approval TX: ${approveTx}`);
      console.log(`  Waiting for confirmation...`);
      
      // Wait for approval to be confirmed
      await publicClient.waitForTransactionReceipt({ hash: approveTx });
      
      console.log(`  ✅ Approval confirmed!`);
      
      // Verify new allowance
      const newAllowance = await publicClient.readContract({
        address: BASE_USDC_ADDRESS,
        abi: usdcAbi,
        functionName: 'allowance',
        args: [walletAddress, bridgeContract]
      });
      const newAllowanceFormatted = formatUnits(newAllowance, 6);
      console.log(`  New Allowance: ${newAllowanceFormatted} USDC`);
      console.log('');
    } else {
      console.log(`  ✅ Allowance is sufficient`);
      console.log('');
    }

    // Execute transfer
    console.log('🚀 Starting transfer...');
    
    // Monitor the transfer steps
    let approvalTxHash = null;
    const result = await kit.bridge({
      from: { adapter, chain: SOURCE_CHAIN },
      to: {
        adapter,
        chain: DEST_CHAIN,
        recipientAddress: RECIPIENT_ADDRESS
      },
      amount: AMOUNT,
      config: {
        transferSpeed: 'FAST'
      }
    });

    // Check if approval succeeded but burn failed
    const approvalStep = result.steps?.find(s => s.name === 'approve' && s.state === 'success');
    const burnStep = result.steps?.find(s => s.name === 'burn');
    
    if (approvalStep && burnStep?.state === 'error') {
      console.log('');
      console.log('⚠️  Approval succeeded but burn failed. Checking allowance...');
      
      // Wait a bit for approval to be confirmed
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // Check allowance again
      const newAllowance = await publicClient.readContract({
        address: BASE_USDC_ADDRESS,
        abi: usdcAbi,
        functionName: 'allowance',
        args: [walletAddress, bridgeContract]
      });
      
      const newAllowanceFormatted = formatUnits(newAllowance, 6);
      console.log(`  Allowance after approval: ${newAllowanceFormatted} USDC`);
      console.log(`  Approval TX: ${approvalStep.txHash}`);
      console.log(`  Error: ${burnStep.errorMessage}`);
      
      if (parseFloat(newAllowanceFormatted) < amountNeeded) {
        console.log('');
        console.log('❌ Issue: Allowance is still insufficient after approval');
        console.log('  This might be a Bridge Kit issue or the approval amount was too low');
      }
    }

    console.log('');
    if (result.state === 'error') {
      console.log('❌ Transfer failed!');
    } else {
      console.log('✅ Transfer completed!');
    }
    
    // Serialize BigInt values before stringifying
    const serializeBigInts = (obj) => {
      if (obj === null || obj === undefined) {
        return obj;
      }
      if (typeof obj === 'bigint') {
        return obj.toString();
      }
      if (Array.isArray(obj)) {
        return obj.map(item => serializeBigInts(item));
      }
      if (typeof obj === 'object') {
        const serialized = {};
        for (const [key, value] of Object.entries(obj)) {
          serialized[key] = serializeBigInts(value);
        }
        return serialized;
      }
      return obj;
    };
    
    const serializedResult = serializeBigInts(result);
    console.log('Result:', JSON.stringify(serializedResult, null, 2));
    
  } catch (error) {
    console.error('');
    console.error('❌ Transfer failed:');
    console.error(error.message);
    console.error('');
    if (error.stack) {
      console.error('Stack trace:');
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Run the test
testTransfer();

