import { ethers } from 'ethers';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

async function main() {
  const baseRpc = process.env.BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org';
  // Base Sepolia LayerZero Endpoint
  const lzEndpoint = '0x6EDCE65403992e310A62460808c4b910D972f10f';
  
  const provider = new ethers.JsonRpcProvider(baseRpc);
  
  // Check if endpoint exists
  const code = await provider.getCode(lzEndpoint);
  console.log(`LayerZero Endpoint: ${lzEndpoint}`);
  console.log(`Has code: ${code !== '0x' && code.length > 2}`);
  console.log(`Code length: ${code.length} bytes\n`);
  
  // Try a simple view function
  const LZ_ABI = [
    'function getChainId() external view returns (uint16)',
    'function getSendLibraryAddress(address _userApplication) external view returns (address)'
  ];
  
  try {
    const lzContract = new ethers.Contract(lzEndpoint, LZ_ABI, provider);
    const chainId = await lzContract.getChainId();
    console.log(`✓ Chain ID: ${chainId.toString()}`);
  } catch (e) {
    console.error(`✗ Could not call endpoint: ${e.message}`);
  }
}

main().catch(console.error);
