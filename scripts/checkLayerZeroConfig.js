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
  const lzEndpoint = '0x6EDCE65403992e310A62460808c4b910D972f10f';
  
  const provider = new ethers.JsonRpcProvider(baseRpc);
  
  // LayerZero Endpoint ABI
  const LZ_ABI = [
    'function getInboundNonce(uint16 _srcChainId, bytes calldata _srcAddress) external view returns (uint64)',
    'function getOutboundNonce(uint16 _dstChainId, address _srcAddress) external view returns (uint64)',
    'function getConfig(uint16 _version, uint16 _chainId, address _userApplication, uint256 _configType) external view returns (bytes)',
    'function estimateFees(uint16 _dstChainId, address _userApplication, bytes calldata _payload, bool _payInZRO, bytes calldata _adapterParams) external view returns (uint nativeFee, uint zroFee)'
  ];
  
  const lzContract = new ethers.Contract(lzEndpoint, LZ_ABI, provider);
  
  console.log('Checking LayerZero configuration for Gateway...');
  console.log(`Gateway: ${baseGateway}`);
  console.log(`LayerZero Endpoint: ${lzEndpoint}\n`);
  
  try {
    // Check if Gateway has sent messages before
    const outboundNonce = await lzContract.getOutboundNonce(30110, baseGateway); // Arc LZ chain ID
    console.log(`✓ Outbound nonce to Arc: ${outboundNonce.toString()}`);
  } catch (e) {
    console.log(`⚠️  Could not get outbound nonce: ${e.message}`);
  }
  
  // Try to get config (might not be accessible)
  try {
    const config = await lzContract.getConfig(1, 30110, baseGateway, 2); // version 1, Arc chain, config type 2
    console.log(`✓ Config exists: ${config.length > 0 ? 'Yes' : 'No'}`);
  } catch (e) {
    console.log(`⚠️  Could not get config (may need to be set): ${e.message}`);
  }
  
  // Try a simple estimateFees call
  try {
    const payload = ethers.AbiCoder.defaultAbiCoder().encode(
      ['address', 'uint256', 'uint256', 'uint32'],
      ['0xe8f14cD50Cfa48e366142815D2b63263849400cE', ethers.parseEther('1000'), 0n, 84532]
    );
    
    const [nativeFee] = await lzContract.estimateFees(
      30110, // Arc LZ chain ID
      baseGateway,
      payload,
      false,
      '0x'
    );
    console.log(`✓ Fee estimation works: ${ethers.formatEther(nativeFee)} ETH`);
  } catch (e) {
    console.error(`✗ Fee estimation failed: ${e.message}`);
  }
}

main().catch(console.error);
