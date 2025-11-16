import { ethers } from 'ethers';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

async function main() {
  const privateKey = (process.env.PRIVATE_KEY || process.env.DEPLOYER_PRIVATE_KEY)?.trim();
  if (!privateKey) {
    throw new Error('PRIVATE_KEY not set');
  }

  let normalizedKey = privateKey.trim();
  if ((normalizedKey.startsWith('"') && normalizedKey.endsWith('"')) || 
      (normalizedKey.startsWith("'") && normalizedKey.endsWith("'"))) {
    normalizedKey = normalizedKey.slice(1, -1);
  }
  normalizedKey = normalizedKey.startsWith('0x') ? normalizedKey : `0x${normalizedKey}`;

  const baseGateway = process.env.BASE_SEPOLIA_GATEWAY;
  const baseRpc = process.env.BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org';
  
  const provider = new ethers.JsonRpcProvider(baseRpc);
  const wallet = new ethers.Wallet(normalizedKey, provider);
  
  console.log(`Wallet: ${wallet.address}`);
  console.log(`Gateway: ${baseGateway}`);
  
  const balance = await provider.getBalance(wallet.address);
  console.log(`Wallet balance: ${ethers.formatEther(balance)} ETH`);
  
  const gatewayBalance = await provider.getBalance(baseGateway);
  console.log(`Gateway balance (before): ${ethers.formatEther(gatewayBalance)} ETH`);
  
  // Try sending with a very small amount first
  const amount = ethers.parseEther('0.00002'); // 0.00002 ETH
  
  if (balance < amount + ethers.parseEther('0.00001')) {
    console.error('Insufficient balance!');
    return;
  }
  
  console.log(`\nSending ${ethers.formatEther(amount)} ETH to Gateway...`);
  
  try {
    // Try with a simple transfer
    const tx = await wallet.sendTransaction({
      to: baseGateway,
      value: amount,
      gasLimit: 21000n
    });
    
    console.log(`Transaction: ${tx.hash}`);
    const receipt = await tx.wait();
    
    if (receipt.status === 1) {
      console.log(`✓ Success! Confirmed in block ${receipt.blockNumber}`);
      const newBalance = await provider.getBalance(baseGateway);
      console.log(`Gateway balance (after): ${ethers.formatEther(newBalance)} ETH`);
    } else {
      console.error(`✗ Transaction reverted (status: ${receipt.status})`);
    }
  } catch (error) {
    console.error(`✗ Error: ${error.message}`);
    if (error.receipt) {
      console.error(`Transaction status: ${error.receipt.status}`);
    }
  }
}

main().catch(console.error);
