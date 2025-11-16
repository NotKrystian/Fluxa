/**
 * Set up connections between deployed contracts
 * 
 * - Sets remote routers on Arc Hub
 * - Verifies Gateway connections
 * - Sets up any other required connections
 */

import { ethers } from 'ethers';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env file - try multiple locations
const envPath = path.join(__dirname, '../.env');
const envLoaded = dotenv.config({ path: envPath });

if (envLoaded.error) {
  console.warn(`Warning: Could not load .env from ${envPath}`);
  console.warn(`Trying current directory...`);
  dotenv.config(); // Try current directory
}

function getArtifact(contractName) {
  const artifactPath = path.join(__dirname, '../artifacts/core', `${contractName}.sol`, `${contractName}.json`);
  return JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
}

async function main() {
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('🔗 SETTING UP CONTRACT CONNECTIONS');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // Check for private key with better error message
  const privateKey = (process.env.PRIVATE_KEY || process.env.DEPLOYER_PRIVATE_KEY)?.trim();
  if (!privateKey) {
    console.error('\n❌ Error: PRIVATE_KEY or DEPLOYER_PRIVATE_KEY not found!');
    console.error(`\nCurrent working directory: ${process.cwd()}`);
    console.error(`Looking for .env at: ${envPath}`);
    console.error(`Environment variables loaded: ${Object.keys(process.env).filter(k => k.includes('PRIVATE')).join(', ') || 'NONE'}\n`);
    throw new Error('PRIVATE_KEY or DEPLOYER_PRIVATE_KEY not set in .env');
  }

  // Normalize private key (remove quotes, trim, ensure 0x prefix)
  let normalizedKey = privateKey.trim();
  // Remove surrounding quotes if present
  if ((normalizedKey.startsWith('"') && normalizedKey.endsWith('"')) || 
      (normalizedKey.startsWith("'") && normalizedKey.endsWith("'"))) {
    normalizedKey = normalizedKey.slice(1, -1);
  }
  normalizedKey = normalizedKey.startsWith('0x') ? normalizedKey : `0x${normalizedKey}`;
  const deployerWallet = new ethers.Wallet(normalizedKey);
  console.log(`Deployer: ${deployerWallet.address}\n`);

  // Load contract addresses
  const arcHub = process.env.ARC_EXECUTION_HUB;
  const baseRouter = process.env.BASE_SEPOLIA_SWAP_ROUTER;

  if (!arcHub) {
    throw new Error('ARC_EXECUTION_HUB not set in .env');
  }

  const results = {
    timestamp: Date.now(),
    connections: {}
  };

  // Set up Arc Hub remote routers
  if (arcHub) {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Setting up Arc Hub remote routers...');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    const arcProvider = new ethers.JsonRpcProvider(
      process.env.ARC_RPC_URL || 'https://hidden-cosmological-thunder.arc-testnet.quiknode.pro/e18d2b4649fda2fd51ef9f5a2c1d7d8fd132c886'
    );
    const arcDeployer = new ethers.Wallet(normalizedKey, arcProvider);
    const hubArtifact = getArtifact('ArcExecutionHub');
    const hub = new ethers.Contract(arcHub, hubArtifact.abi, arcDeployer);

    const baseChainId = 84532;

    if (baseRouter) {
      try {
        console.log(`\n  Setting Base router (chainId: ${baseChainId})...`);
        const tx = await hub.setRemoteRouter(baseChainId, baseRouter);
        await tx.wait();
        console.log(`  ✓ Base router set: ${baseRouter}`);
        results.connections.base = { router: baseRouter, status: 'connected' };
      } catch (error) {
        console.error(`  ✗ Failed to set Base router:`, error.message);
        results.connections.base = { error: error.message };
      }
    }
  }

  // Verify Gateway connections (already set in deployGateways.js, just verify)
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Verifying Gateway connections...');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const gateways = {
    arc: process.env.ARC_GATEWAY,
    base: process.env.BASE_SEPOLIA_GATEWAY
  };

  for (const [chainKey, gatewayAddress] of Object.entries(gateways)) {
    if (!gatewayAddress) {
      console.log(`  ⚠️  ${chainKey}: Gateway not configured`);
      continue;
    }

    try {
      const rpcUrls = {
        arc: process.env.ARC_RPC_URL || 'https://hidden-cosmological-thunder.arc-testnet.quiknode.pro/e18d2b4649fda2fd51ef9f5a2c1d7d8fd132c886',
        base: process.env.BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org'
      };

      const provider = new ethers.JsonRpcProvider(rpcUrls[chainKey]);
      const deployer = new ethers.Wallet(normalizedKey, provider);
      const gatewayArtifact = getArtifact('FluxaGateway');
      const gateway = new ethers.Contract(gatewayAddress, gatewayArtifact.abi, deployer);

      // Check remote gateways
      const chainIds = {
        arc: 5042002,
        base: 84532
      };

      const remoteChains = Object.keys(chainIds).filter(k => k !== chainKey);
      let allConnected = true;

      for (const remoteKey of remoteChains) {
        const remoteGateway = gateways[remoteKey];
        if (!remoteGateway) continue;

        const remoteChainId = chainIds[remoteKey];
        let remoteGatewayAddress = await gateway.remoteGateways(remoteChainId);
        
        if (remoteGatewayAddress.toLowerCase() !== remoteGateway.toLowerCase()) {
          // Not connected, try to set it
          console.log(`  ⚠️  ${chainKey} → ${remoteKey}: Not connected, setting up...`);
          try {
            const setTx = await gateway.setRemoteGateway(remoteChainId, remoteGateway);
            await setTx.wait();
            console.log(`  ✓ ${chainKey} → ${remoteKey}: Connected (just set)`);
            allConnected = true;
          } catch (setError) {
            console.error(`  ✗ ${chainKey} → ${remoteKey}: Failed to set - ${setError.message}`);
            allConnected = false;
          }
        } else {
          // Check if remoteGatewaysBytes is also set
          try {
            const remoteGatewayBytes = await gateway.remoteGatewaysBytes(remoteChainId);
            if (!remoteGatewayBytes || remoteGatewayBytes.length === 0) {
              console.log(`  ⚠️  ${chainKey} → ${remoteKey}: Address set but bytes missing, fixing...`);
              // Re-set to ensure bytes are set
              const setTx = await gateway.setRemoteGateway(remoteChainId, remoteGateway);
              await setTx.wait();
              console.log(`  ✓ ${chainKey} → ${remoteKey}: Bytes configured`);
            } else {
              console.log(`  ✓ ${chainKey} → ${remoteKey}: Connected`);
            }
          } catch (bytesError) {
            console.log(`  ✓ ${chainKey} → ${remoteKey}: Connected (bytes check failed, but address is set)`);
          }
        }
      }

      results.connections[chainKey] = {
        gateway: gatewayAddress,
        status: allConnected ? 'connected' : 'partial'
      };

    } catch (error) {
      console.error(`  ✗ ${chainKey}: Error verifying - ${error.message}`);
      results.connections[chainKey] = { error: error.message };
    }
  }

  // Save results
  const resultsPath = path.join(__dirname, '../deployment-results-connections.json');
  fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));
  console.log(`\n✓ Results saved to: ${resultsPath}`);

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('📋 CONNECTION SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════\n');

  for (const [key, result] of Object.entries(results.connections)) {
    if (result.error) {
      console.log(`❌ ${key}: ${result.error}`);
    } else {
      console.log(`✅ ${key}: ${result.status || 'connected'}`);
    }
  }

  console.log('\n✅ Connection setup complete!');
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n✗ Connection setup failed:', error);
    process.exit(1);
  });

