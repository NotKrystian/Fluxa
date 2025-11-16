import { ethers } from 'ethers';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

async function main() {
  const baseGateway = process.env.BASE_SEPOLIA_GATEWAY;
  const baseRpc = process.env.BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org';
  
  const provider = new ethers.JsonRpcProvider(baseRpc);
  
  // Get contract code
  const code = await provider.getCode(baseGateway);
  console.log(`Base Gateway: ${baseGateway}`);
  console.log(`Has code: ${code !== '0x' && code.length > 2}`);
  
  // Try to check if it can receive ETH by checking balance
  const balance = await provider.getBalance(baseGateway);
  console.log(`Current balance: ${ethers.formatEther(balance)} ETH`);
  
  // Try to call a function to see if contract is accessible
  try {
    const ABI = ['function isOrigin() external view returns (bool)'];
    const contract = new ethers.Contract(baseGateway, ABI, provider);
    const isOrigin = await contract.isOrigin();
    console.log(`isOrigin: ${isOrigin}`);
  } catch (e) {
    console.error(`Error calling contract: ${e.message}`);
  }
}

main().catch(console.error);
