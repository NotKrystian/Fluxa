/**
 * Complete Arc Gateway Setup
 * 
 * Finishes the Arc Gateway deployment that was interrupted by rate limits
 */

import { ethers } from 'ethers';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env
const envPath = path.join(__dirname, '../.env');
dotenv.config({ path: envPath });

function getArtifact(contractName) {
  const artifactPath = path.join(__dirname, '../artifacts/core', `${contractName}.sol`, `${contractName}.json`);
  return JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
}

async function main() {
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('🔧 COMPLETING ARC GATEWAY SETUP');
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
  const wrappedTokenAddress = '0xc8589C1258842b26415A5cB717b767F2776b2bd5';

  console.log(`Arc Gateway: ${arcGatewayAddress}`);
  console.log(`Wrapped Token: ${wrappedTokenAddress}\n`);

  const provider = new ethers.JsonRpcProvider(
    process.env.ARC_RPC_URL || 'https://rpc.testnet.arc.network'
  );
  const deployer = new ethers.Wallet(normalizedKey, provider);

  // Set gateway on wrapped token
  console.log('Setting Gateway on WrappedToken...');
  const wrappedTokenArtifact = getArtifact('WrappedToken');
  const wrappedToken = new ethers.Contract(wrappedTokenAddress, wrappedTokenArtifact.abi, deployer);
  
  try {
    const setGatewayTx = await wrappedToken.setGateway(arcGatewayAddress);
    await setGatewayTx.wait();
    console.log('  ✓ Gateway set on WrappedToken');
  } catch (error) {
    if (error.message.includes('already set') || error.message.includes('OWNER_ONLY')) {
      console.log('  ⚠️  Gateway already set or not owner');
    } else {
      throw error;
    }
  }

  // Set wrapped token on gateway
  console.log('Setting WrappedToken on Gateway...');
  const gatewayArtifact = getArtifact('FluxaGateway');
  const gateway = new ethers.Contract(arcGatewayAddress, gatewayArtifact.abi, deployer);
  
  try {
    const setWrappedTx = await gateway.setWrappedToken(wrappedTokenAddress);
    await setWrappedTx.wait();
    console.log('  ✓ WrappedToken set on Gateway');
  } catch (error) {
    if (error.message.includes('already set')) {
      console.log('  ⚠️  WrappedToken already set');
    } else {
      throw error;
    }
  }

  // Update deployment results
  const resultsPath = path.join(__dirname, '../deployment-results-gateways.json');
  const results = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));
  
  results.gateways.arc = {
    chain: 'Arc Testnet',
    gatewayAddress: arcGatewayAddress,
    wrappedTokenAddress: wrappedTokenAddress,
    isOrigin: false,
    explorer: `https://testnet.arcscan.net/address/${arcGatewayAddress}`
  };

  fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));
  console.log('\n✓ Deployment results updated');

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('📋 ARC GATEWAY INFO');
  console.log('═══════════════════════════════════════════════════════════════\n');
  console.log(`Gateway: ${arcGatewayAddress}`);
  console.log(`Wrapped Token: ${wrappedTokenAddress}`);
  console.log(`Type: DESTINATION (mints wrapped tokens)`);
  console.log('\nAdd to .env:');
  console.log(`ARC_GATEWAY=${arcGatewayAddress}`);
  console.log(`NEXT_PUBLIC_ARC_GATEWAY=${arcGatewayAddress}`);
  console.log(`ARC_WRAPPED_TOKEN=${wrappedTokenAddress}`);
  console.log(`NEXT_PUBLIC_ARC_WRAPPED_TOKEN=${wrappedTokenAddress}`);
  console.log('\n✅ Arc Gateway setup complete!');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('\n✗ Setup failed:', error);
    process.exit(1);
  });

