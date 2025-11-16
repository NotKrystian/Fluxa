/**
 * Connect Arc Gateway to Base Gateway
 */

import { ethers } from 'ethers';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

function getArtifact(contractName) {
  const artifactPath = path.join(__dirname, '../artifacts/core', `${contractName}.sol`, `${contractName}.json`);
  return JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
}

async function main() {
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('🔗 CONNECTING ARC GATEWAY TO BASE GATEWAY');
  console.log('═══════════════════════════════════════════════════════════════\n');

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

  const arcGatewayAddress = '0x2716575791c212A743e8DE1A2859338e6DB23df7';
  const baseGatewayAddress = '0x710fc62Eef46D242a16B6e573Be33A17F4406044';
  const baseChainId = 84532;

  console.log(`Arc Gateway: ${arcGatewayAddress}`);
  console.log(`Base Gateway: ${baseGatewayAddress}`);
  console.log(`Base Chain ID: ${baseChainId}\n`);

  const provider = new ethers.JsonRpcProvider(
    process.env.ARC_RPC_URL || 'https://rpc.testnet.arc.network'
  );
  
  // Add delay to avoid rate limits
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  const deployer = new ethers.Wallet(normalizedKey, provider);
  const gatewayArtifact = getArtifact('FluxaGateway');
  const gateway = new ethers.Contract(arcGatewayAddress, gatewayArtifact.abi, deployer);

  // Check current connection
  const currentRemote = await gateway.remoteGateways(baseChainId);
  console.log(`Current remote Gateway: ${currentRemote}`);
  
  if (currentRemote.toLowerCase() === baseGatewayAddress.toLowerCase()) {
    console.log('✅ Already connected!');
    return;
  }

  console.log('Setting remote Gateway...');
  
  // Add delay before transaction
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  const tx = await gateway.setRemoteGateway(baseChainId, baseGatewayAddress);
  console.log(`Transaction: ${tx.hash}`);
  console.log('Waiting for confirmation...');
  
  // Add delay before waiting
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  const receipt = await tx.wait();
  console.log(`✅ Connected! Block: ${receipt.blockNumber}`);

  // Verify
  const newRemote = await gateway.remoteGateways(baseChainId);
  if (newRemote.toLowerCase() === baseGatewayAddress.toLowerCase()) {
    console.log('✅ Verification: Connection successful!');
  } else {
    console.log(`⚠️  Verification: Address mismatch (got ${newRemote})`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('\n✗ Connection failed:', error);
    process.exit(1);
  });

