/**
 * Fund Gateway Contracts with Native Tokens
 * 
 * Sends native tokens (ETH on Base, USDC on Arc) to Gateway contracts
 * so they can pay for LayerZero message fees.
 */

import { ethers } from 'ethers';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env file
const envPath = path.join(__dirname, '../.env');
const envLoaded = dotenv.config({ path: envPath });

if (envLoaded.error) {
  console.warn(`Warning: Could not load .env from ${envPath}`);
  dotenv.config(); // Try current directory
}

const CHAINS = {
  arc: {
    name: 'Arc Testnet',
    rpc: process.env.ARC_RPC_URL || 'https://rpc.testnet.arc.network',
    chainId: 5042002,
    nativeSymbol: 'USDC',
    gatewayAddress: process.env.ARC_GATEWAY,
    usdcAddress: process.env.ARC_USDC_ADDRESS || '0x3600000000000000000000000000000000000000',
    amount: ethers.parseUnits('1', 6), // 1 USDC (6 decimals on Arc)
    useERC20: true // USDC is ERC20 on Arc, not native
  },
  base: {
    name: 'Base Sepolia',
    rpc: process.env.BASE_SEPOLIA_RPC_URL || process.env.BASE_RPC_URL || 'https://sepolia.base.org',
    chainId: 84532,
    nativeSymbol: 'ETH',
    gatewayAddress: process.env.BASE_SEPOLIA_GATEWAY || process.env.BASE_SEPOLIA_GATEWAY,
    amount: ethers.parseEther('0.00001'), // 0.00001 ETH (minimal amount for LayerZero fees)
    useERC20: false // ETH is native on Base
  }
};

// USDC ERC20 ABI (minimal)
const USDC_ABI = [
  'function transfer(address to, uint256 amount) external returns (bool)',
  'function balanceOf(address account) external view returns (uint256)',
  'function decimals() external view returns (uint8)'
];

async function main() {
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('💰 FUNDING GATEWAY CONTRACTS');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // Check for private key
  const privateKey = (process.env.PRIVATE_KEY || process.env.DEPLOYER_PRIVATE_KEY)?.trim();
  if (!privateKey) {
    throw new Error('PRIVATE_KEY or DEPLOYER_PRIVATE_KEY not set in .env');
  }

  // Normalize private key
  let normalizedKey = privateKey.trim();
  if ((normalizedKey.startsWith('"') && normalizedKey.endsWith('"')) || 
      (normalizedKey.startsWith("'") && normalizedKey.endsWith("'"))) {
    normalizedKey = normalizedKey.slice(1, -1);
  }
  normalizedKey = normalizedKey.startsWith('0x') ? normalizedKey : `0x${normalizedKey}`;
  
  const results = {};

  for (const [chainKey, chainConfig] of Object.entries(CHAINS)) {
    if (!chainConfig.gatewayAddress) {
      console.log(`⚠️  ${chainConfig.name}: Gateway address not configured, skipping...`);
      results[chainKey] = { status: 'skipped', reason: 'Gateway address not configured' };
      continue;
    }

    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`${chainConfig.name} (${chainKey})`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

    try {
      const provider = new ethers.JsonRpcProvider(chainConfig.rpc);
      const wallet = new ethers.Wallet(normalizedKey, provider);
      
      console.log(`  Wallet: ${wallet.address}`);
      console.log(`  Gateway: ${chainConfig.gatewayAddress}`);

      // Check wallet balance
      let walletBalance, walletBalanceFormatted;
      if (chainConfig.useERC20) {
        // For Arc: check USDC ERC20 balance
        const usdcContract = new ethers.Contract(chainConfig.usdcAddress, USDC_ABI, provider);
        walletBalance = await usdcContract.balanceOf(wallet.address);
        walletBalanceFormatted = ethers.formatUnits(walletBalance, 6);
      } else {
        // For Base: check native ETH balance
        walletBalance = await provider.getBalance(wallet.address);
        walletBalanceFormatted = ethers.formatEther(walletBalance);
      }
      
      console.log(`  Wallet Balance: ${walletBalanceFormatted} ${chainConfig.nativeSymbol}`);

      // Check Gateway balance
      let gatewayBalance, gatewayBalanceFormatted;
      if (chainConfig.useERC20) {
        // For Arc: check USDC ERC20 balance
        const usdcContract = new ethers.Contract(chainConfig.usdcAddress, USDC_ABI, provider);
        gatewayBalance = await usdcContract.balanceOf(chainConfig.gatewayAddress);
        gatewayBalanceFormatted = ethers.formatUnits(gatewayBalance, 6);
      } else {
        // For Base: check native ETH balance
        gatewayBalance = await provider.getBalance(chainConfig.gatewayAddress);
        gatewayBalanceFormatted = ethers.formatEther(gatewayBalance);
      }
      
      console.log(`  Gateway Balance (before): ${gatewayBalanceFormatted} ${chainConfig.nativeSymbol}`);

      // Check if we have enough balance
      // For Base, use available balance if less than requested amount
      let actualAmount = chainConfig.amount;
      if (chainKey === 'base' && walletBalance < chainConfig.amount) {
        // Estimate gas cost first
        const gasPrice = await provider.getFeeData();
        const estimatedGas = 21000n; // Simple transfer
        const gasCost = (gasPrice.gasPrice || 0n) * estimatedGas;
        
        // Use 80% of available balance after gas, but ensure minimum
        const availableAfterGas = walletBalance > gasCost ? walletBalance - gasCost : 0n;
        actualAmount = (availableAfterGas * 80n) / 100n;
        
        if (actualAmount < ethers.parseEther('0.0001')) {
          const needed = ethers.formatEther(chainConfig.amount);
          console.log(`  ⚠️  Insufficient balance! Need ${needed} ${chainConfig.nativeSymbol} (after gas)`);
          console.log(`  Current: ${ethers.formatEther(walletBalance)} ETH`);
          console.log(`  Estimated gas: ${ethers.formatEther(gasCost)} ETH`);
          results[chainKey] = { 
            status: 'failed', 
            error: `Insufficient balance. Need ${needed} ${chainConfig.nativeSymbol} (after gas)` 
          };
          continue;
        }
        console.log(`  ⚠️  Using available balance: ${ethers.formatEther(actualAmount)} ETH (instead of ${ethers.formatEther(chainConfig.amount)})`);
      } else if (walletBalance < chainConfig.amount) {
        const needed = chainKey === 'arc'
          ? ethers.formatUnits(chainConfig.amount, 6)
          : ethers.formatEther(chainConfig.amount);
        console.log(`  ⚠️  Insufficient balance! Need ${needed} ${chainConfig.nativeSymbol}`);
        results[chainKey] = { 
          status: 'failed', 
          error: `Insufficient balance. Need ${needed} ${chainConfig.nativeSymbol}` 
        };
        continue;
      }

      // Check if Gateway already has enough
      const minAmount = chainKey === 'arc' 
        ? ethers.parseUnits('0.5', 6) // 0.5 USDC
        : ethers.parseEther('0.00001'); // 0.00001 ETH (minimal for LayerZero)
      
      if (gatewayBalance >= minAmount) {
        console.log(`  ✓ Gateway already has sufficient balance (${gatewayBalanceFormatted} ${chainConfig.nativeSymbol})`);
        results[chainKey] = { 
          status: 'skipped', 
          reason: 'Already has sufficient balance',
          balance: gatewayBalanceFormatted
        };
        continue;
      }

      // Send tokens to Gateway
      const amountFormatted = chainKey === 'arc' 
        ? ethers.formatUnits(actualAmount, 6)
        : ethers.formatEther(actualAmount);
      
      console.log(`  Sending ${amountFormatted} ${chainConfig.nativeSymbol} to Gateway...`);
      
      let tx, receipt;
      
      if (chainConfig.useERC20) {
        // For Arc: use USDC ERC20 transfer
        const usdcContract = new ethers.Contract(chainConfig.usdcAddress, USDC_ABI, wallet);
        tx = await usdcContract.transfer(chainConfig.gatewayAddress, actualAmount);
      } else {
        // For Base: use native ETH transfer
        // Check if contract exists and can receive ETH
        const code = await provider.getCode(chainConfig.gatewayAddress);
        if (!code || code === '0x') {
          throw new Error(`No contract found at Gateway address ${chainConfig.gatewayAddress}`);
        }
        
        // Try with explicit gas limit to avoid estimation issues
        tx = await wallet.sendTransaction({
          to: chainConfig.gatewayAddress,
          value: actualAmount,
          gasLimit: 21000n // Standard transfer gas limit
        });
      }

      console.log(`  Transaction: ${tx.hash}`);
      console.log(`  Waiting for confirmation...`);
      
      // Add delay to avoid rate limits
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      receipt = await tx.wait();
      console.log(`  ✓ Transaction confirmed in block ${receipt.blockNumber}`);

      // Check new Gateway balance
      let newGatewayBalance, newGatewayBalanceFormatted;
      if (chainConfig.useERC20) {
        // For Arc: check USDC ERC20 balance
        const usdcContract = new ethers.Contract(chainConfig.usdcAddress, USDC_ABI, provider);
        newGatewayBalance = await usdcContract.balanceOf(chainConfig.gatewayAddress);
        newGatewayBalanceFormatted = ethers.formatUnits(newGatewayBalance, 6);
      } else {
        // For Base: check native ETH balance
        newGatewayBalance = await provider.getBalance(chainConfig.gatewayAddress);
        newGatewayBalanceFormatted = ethers.formatEther(newGatewayBalance);
      }
      
      console.log(`  Gateway Balance (after): ${newGatewayBalanceFormatted} ${chainConfig.nativeSymbol}`);
      console.log(`  ✓ Funding complete!`);

      results[chainKey] = {
        status: 'success',
        txHash: receipt.hash,
        amount: amountFormatted,
        balanceBefore: gatewayBalanceFormatted,
        balanceAfter: newGatewayBalanceFormatted
      };

    } catch (error) {
      console.error(`  ✗ Failed: ${error.message}`);
      results[chainKey] = { 
        status: 'failed', 
        error: error.message 
      };
    }
  }

  // Summary
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('📋 FUNDING SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════\n');

  for (const [chainKey, result] of Object.entries(results)) {
    const chainName = CHAINS[chainKey].name;
    if (result.status === 'success') {
      console.log(`✅ ${chainName}: Funded ${result.amount} ${CHAINS[chainKey].nativeSymbol}`);
      console.log(`   Balance: ${result.balanceAfter} ${CHAINS[chainKey].nativeSymbol}`);
      console.log(`   TX: ${result.txHash}`);
    } else if (result.status === 'skipped') {
      console.log(`⏭️  ${chainName}: ${result.reason}`);
      if (result.balance) {
        console.log(`   Balance: ${result.balance} ${CHAINS[chainKey].nativeSymbol}`);
      }
    } else {
      console.log(`❌ ${chainName}: ${result.error}`);
    }
    console.log('');
  }

  console.log('✅ Funding complete!');
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n✗ Funding failed:', error);
    process.exit(1);
  });

