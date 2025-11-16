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
  
  // Try to decode the error
  const errorData = '0xfb8f41b200000000000000000000000055936f194765ce6bd0d33a374cefad8c9b34fb65000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000003635c9adc5dea00000';
  const selector = errorData.slice(0, 10);
  
  console.log('Error selector:', selector);
  console.log('Full error data:', errorData);
  console.log('Error data length:', errorData.length);
  
  // Common LayerZero errors (from LayerZero contracts)
  // Let's try to see if we can get more info from the transaction
  const txHash = '0x17c302f428ef5991d02467a5e3e785305e084709f6cda619e051665c8467c92f';
  console.log(`\nChecking transaction: ${txHash}`);
  
  try {
    const receipt = await provider.getTransactionReceipt(txHash);
    console.log('Transaction status:', receipt.status);
    console.log('Gas used:', receipt.gasUsed.toString());
    console.log('Logs:', receipt.logs.length);
    
    if (receipt.logs.length > 0) {
      console.log('\nEvents:');
      receipt.logs.forEach((log, i) => {
        console.log(`  [${i}] ${log.address}: ${log.topics.length} topics`);
      });
    }
  } catch (e) {
    console.error('Error getting receipt:', e.message);
  }
  
  // Check if this is a known LayerZero error
  // Common LayerZero errors:
  // - INSUFFICIENT_FEE
  // - INVALID_PAYLOAD
  // - INVALID_DESTINATION
  // - SRC_NOT_TRUSTED
  
  console.log('\nPossible LayerZero errors:');
  console.log('  - INSUFFICIENT_FEE: Fee too low');
  console.log('  - INVALID_PAYLOAD: Payload format wrong');
  console.log('  - INVALID_DESTINATION: Destination chain/address wrong');
  console.log('  - SRC_NOT_TRUSTED: Source not trusted (unlikely for sending)');
}

main().catch(console.error);
