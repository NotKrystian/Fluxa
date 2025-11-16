/**
 * Fund coordinator wallet on Base for gas fees
 * 
 * Usage: node scripts/fundCoordinator.js
 */

import { ethers } from 'ethers';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

async function main() {
  console.log('\n💰 Funding Coordinator on Base\n');

  // Get coordinator address
  const coordinatorPrivateKey = process.env.GATEWAY_PRIVATE_KEY || process.env.PRIVATE_KEY;
  if (!coordinatorPrivateKey) {
    console.error('❌ GATEWAY_PRIVATE_KEY not set in .env');
    process.exit(1);
  }

  const coordinatorWallet = new ethers.Wallet(coordinatorPrivateKey);
  const coordinatorAddress = coordinatorWallet.address;

  console.log(`Coordinator: ${coordinatorAddress}`);

  // Connect to Base
  const baseRpc = process.env.BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org';
  const provider = new ethers.JsonRpcProvider(baseRpc);

  // Check current balance
  const currentBalance = await provider.getBalance(coordinatorAddress);
  console.log(`Current Balance: ${ethers.formatEther(currentBalance)} ETH`);

  // Check if needs funding (less than 0.0001 ETH)
  const minBalance = ethers.parseEther('0.0001');
  if (currentBalance >= minBalance) {
    console.log('✅ Coordinator already has sufficient balance');
    return;
  }

  // Use deployer wallet to send ETH
  const deployerPrivateKey = process.env.PRIVATE_KEY;
  if (!deployerPrivateKey) {
    console.error('❌ PRIVATE_KEY not set in .env');
    process.exit(1);
  }

  const deployerWallet = new ethers.Wallet(deployerPrivateKey, provider);
  console.log(`\nFunding from: ${deployerWallet.address}`);

  const deployerBalance = await provider.getBalance(deployerWallet.address);
  console.log(`Deployer Balance: ${ethers.formatEther(deployerBalance)} ETH`);

  // Send 0.0001 ETH to coordinator (just enough for a few transactions)
  const amountToSend = ethers.parseEther('0.0001');
  
  if (deployerBalance < amountToSend) {
    console.error(`❌ Insufficient balance. Need ${ethers.formatEther(amountToSend)} ETH`);
    process.exit(1);
  }

  console.log(`\nSending ${ethers.formatEther(amountToSend)} ETH...`);
  
  const tx = await deployerWallet.sendTransaction({
    to: coordinatorAddress,
    value: amountToSend
  });

  console.log(`TX: ${tx.hash}`);
  console.log('Waiting for confirmation...');
  
  await tx.wait();
  
  // Check new balance
  const newBalance = await provider.getBalance(coordinatorAddress);
  console.log(`\n✅ Funded successfully!`);
  console.log(`New Balance: ${ethers.formatEther(newBalance)} ETH`);
}

main().catch(console.error);

