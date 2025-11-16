/**
 * Deploy ArcExecutionHub on Arc
 * 
 * This is the internal execution hub that handles cross-chain swaps
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

const ARC_CHAIN = {
  name: 'Arc Testnet',
  rpcUrl: process.env.ARC_RPC_URL || 'https://hidden-cosmological-thunder.arc-testnet.quiknode.pro/e18d2b4649fda2fd51ef9f5a2c1d7d8fd132c886',
  chainId: 5042002,
  explorer: 'https://testnet.arcscan.net',
  lzEndpoint: process.env.ARC_LZ_ENDPOINT || '0x6aB5Ae6822647046626e83ee6dB8187151E1d5ab',
  lzChainId: 30110
};

function getArtifact(contractName) {
  const artifactPath = path.join(__dirname, '../artifacts/core', `${contractName}.sol`, `${contractName}.json`);
  return JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
}

async function main() {
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('🏗️  DEPLOYING ARC EXECUTION HUB');
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

  // Load Arc pool address (LiquidityVault or ArcAMMPool)
  const arcPool = process.env.ARC_FLX_VAULT || process.env.ARC_AMM_POOL;
  if (!arcPool) {
    console.warn('⚠️  ARC_FLX_VAULT or ARC_AMM_POOL not set in .env');
    console.warn('   Using placeholder - you\'ll need to deploy a pool first');
  }

  const provider = new ethers.JsonRpcProvider(ARC_CHAIN.rpcUrl);
  const deployer = new ethers.Wallet(normalizedKey, provider);

  const balance = await provider.getBalance(deployer.address);
  console.log(`Balance: ${ethers.formatEther(balance)} ETH`);

  // Check for very low balance (less than 0.00001 ETH)
  if (balance < ethers.parseEther('0.00001')) {
    console.warn(`⚠️  Very low balance! May not be enough for deployment`);
    console.warn(`Current: ${ethers.formatEther(balance)} ETH`);
    console.warn(`Proceeding anyway...`);
  }

  console.log(`\n[${ARC_CHAIN.name}] Deploying ArcExecutionHub...`);
  
  const artifact = getArtifact('ArcExecutionHub');
  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, deployer);
  
  const hub = await factory.deploy(
    arcPool || ethers.ZeroAddress, // Pool address (can be updated later)
    ARC_CHAIN.lzEndpoint
  );
  
  await hub.waitForDeployment();
  const address = await hub.getAddress();
  
  console.log(`  ✓ ArcExecutionHub deployed: ${address}`);
  console.log(`  Pool: ${arcPool || 'NOT_SET (update after pool deployment)'}`);
  console.log(`  LayerZero Endpoint: ${ARC_CHAIN.lzEndpoint}`);
  console.log(`  Explorer: ${ARC_CHAIN.explorer}/address/${address}`);

  // Save results
  const results = {
    timestamp: Date.now(),
    deployer: deployerWallet.address,
    hub: {
      address,
      pool: arcPool || 'NOT_SET',
      lzEndpoint: ARC_CHAIN.lzEndpoint,
      explorer: `${ARC_CHAIN.explorer}/address/${address}`
    }
  };

  const resultsPath = path.join(__dirname, '../deployment-results-arc-hub.json');
  fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));
  console.log(`\n✓ Results saved to: ${resultsPath}`);

  console.log(`\n  Add to .env:`);
  console.log(`  ARC_EXECUTION_HUB=${address}`);
  console.log(`  NEXT_PUBLIC_ARC_EXECUTION_HUB=${address}`);

  if (!arcPool) {
    console.log(`\n  ⚠️  Remember to:`);
    console.log(`     1. Deploy a LiquidityVault or ArcAMMPool on Arc`);
    console.log(`     2. Update ArcExecutionHub with the pool address`);
  }

  console.log('\n✅ Arc Execution Hub deployment complete!');
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n✗ Deployment failed:', error);
    process.exit(1);
  });

