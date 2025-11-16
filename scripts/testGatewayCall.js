import { ethers } from 'ethers';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

async function main() {
  const baseGateway = process.env.BASE_SEPOLIA_GATEWAY || '0x55936f194765CE6bd0d33a374cEFad8c9b34Fb65';
  const baseRpc = process.env.BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org';
  const arcChainId = 5042002;
  
  const provider = new ethers.JsonRpcProvider(baseRpc);
  
  const GATEWAY_ABI = [
    'function isOrigin() external view returns (bool)',
    'function remoteGateways(uint32) external view returns (address)',
    'function remoteGatewaysBytes(uint32) external view returns (bytes)',
    'function lzEndpoint() external view returns (address)',
    'function getLZChainId(uint32) external view returns (uint16)'
  ];
  
  const gateway = new ethers.Contract(baseGateway, GATEWAY_ABI, provider);
  
  console.log('Checking Gateway state...');
  console.log(`Gateway: ${baseGateway}`);
  
  try {
    const isOrigin = await gateway.isOrigin();
    console.log(`✓ isOrigin: ${isOrigin}`);
    
    const remoteGateway = await gateway.remoteGateways(arcChainId);
    console.log(`✓ remoteGateways[${arcChainId}]: ${remoteGateway}`);
    
    const remoteGatewayBytes = await gateway.remoteGatewaysBytes(arcChainId);
    console.log(`✓ remoteGatewaysBytes[${arcChainId}]: ${remoteGatewayBytes.length} bytes`);
    
    const lzEndpoint = await gateway.lzEndpoint();
    console.log(`✓ lzEndpoint: ${lzEndpoint}`);
    
    // Try to get LayerZero chain ID (might not be public)
    try {
      const lzChainId = await gateway.getLZChainId(arcChainId);
      console.log(`✓ getLZChainId(${arcChainId}): ${lzChainId}`);
    } catch (e) {
      console.log(`⚠️  getLZChainId not accessible (expected if not public)`);
    }
  } catch (error) {
    console.error('Error:', error.message);
  }
}

main().catch(console.error);
