/**
 * Verify Gateway Connections
 * 
 * Checks if Gateway contracts have remote gateways configured
 */

import { ethers } from 'ethers';
import dotenv from 'dotenv';
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
  console.log('🔍 VERIFYING GATEWAY CONNECTIONS');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const gateways = {
    arc: {
      address: process.env.ARC_GATEWAY || '0x2716575791c212A743e8DE1A2859338e6DB23df7',
      chainId: 5042002,
      rpc: process.env.ARC_RPC_URL || 'https://rpc.testnet.arc.network',
      name: 'Arc Testnet'
    },
    base: {
      address: process.env.BASE_SEPOLIA_GATEWAY || '0x710fc62Eef46D242a16B6e573Be33A17F4406044',
      chainId: 84532,
      rpc: process.env.BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org',
      name: 'Base Sepolia'
    }
  };

  const GATEWAY_ABI = [
    'function remoteGateways(uint32) external view returns (address)',
    'function remoteGatewaysBytes(uint32) external view returns (bytes)',
    'function isOrigin() external view returns (bool)'
  ];

  for (const [chainKey, config] of Object.entries(gateways)) {
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`${config.name} (${chainKey})`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`Gateway: ${config.address}`);

    try {
      const provider = new ethers.JsonRpcProvider(config.rpc);
      const gateway = new ethers.Contract(config.address, GATEWAY_ABI, provider);

      const isOrigin = await gateway.isOrigin();
      console.log(`Type: ${isOrigin ? 'ORIGIN' : 'DESTINATION'}`);

      // Check remote gateway for the other chain
      const remoteKey = chainKey === 'arc' ? 'base' : 'arc';
      const remoteConfig = gateways[remoteKey];
      const remoteChainId = remoteConfig.chainId;

      console.log(`\nChecking connection to ${remoteConfig.name} (chain ID: ${remoteChainId})...`);
      
      const remoteGatewayAddress = await gateway.remoteGateways(remoteChainId);
      console.log(`  Remote Gateway Address: ${remoteGatewayAddress}`);
      
      if (!remoteGatewayAddress || remoteGatewayAddress === ethers.ZeroAddress) {
        console.log(`  ❌ NOT CONFIGURED`);
        console.log(`  Expected: ${remoteConfig.address}`);
      } else if (remoteGatewayAddress.toLowerCase() === remoteConfig.address.toLowerCase()) {
        console.log(`  ✅ Address matches`);
      } else {
        console.log(`  ⚠️  Address mismatch`);
        console.log(`  Expected: ${remoteConfig.address}`);
      }

      // Check remoteGatewaysBytes
      try {
        const remoteGatewayBytes = await gateway.remoteGatewaysBytes(remoteChainId);
        if (!remoteGatewayBytes || remoteGatewayBytes.length === 0) {
          console.log(`  ❌ Bytes NOT CONFIGURED`);
        } else {
          console.log(`  ✅ Bytes configured (length: ${remoteGatewayBytes.length})`);
        }
      } catch (bytesError) {
        console.log(`  ⚠️  Could not check bytes: ${bytesError.message}`);
      }

    } catch (error) {
      console.error(`  ❌ Error: ${error.message}`);
    }
  }

  console.log('\n✅ Verification complete!');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('\n✗ Verification failed:', error);
    process.exit(1);
  });

