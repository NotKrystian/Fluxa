/**
 * Deploy FluxaSwapRouter on Base and Polygon
 * 
 * These routers handle user swaps on their respective chains
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

const CHAINS = {
  base: {
    name: 'Base Sepolia',
    rpcUrl: process.env.BASE_SEPOLIA_RPC_URL || process.env.BASE_RPC_URL || 'https://sepolia.base.org',
    chainId: 84532,
    explorer: 'https://sepolia.basescan.org',
    lzEndpoint: process.env.BASE_LZ_ENDPOINT || '0x6EDCE65403992e310A62460808c4b910D972f10f',
    lzChainId: 40245
  }
};

function getArtifact(contractName) {
  const artifactPath = path.join(__dirname, '../artifacts/core', `${contractName}.sol`, `${contractName}.json`);
  return JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
}

async function deployRouter(chainKey, chainConfig, localPool, arcHub, deployer) {
  console.log(`\n[${chainConfig.name}] Deploying FluxaSwapRouter...`);
  
  const artifact = getArtifact('FluxaSwapRouter');
  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, deployer);
  
  const router = await factory.deploy(
    localPool, // Local pool address (LiquidityVault or AMM pool)
    arcHub,    // Arc Execution Hub address
    chainConfig.lzEndpoint,
    chainConfig.chainId
  );
  
  await router.waitForDeployment();
  const address = await router.getAddress();
  
  console.log(`  ✓ FluxaSwapRouter deployed: ${address}`);
  console.log(`  Local Pool: ${localPool}`);
  console.log(`  Arc Hub: ${arcHub}`);
  console.log(`  Explorer: ${chainConfig.explorer}/address/${address}`);
  
  return address;
}

async function main() {
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('🔄 DEPLOYING SWAP ROUTERS');
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

  // Load Arc Hub address (must be deployed first)
  const arcHubAddress = process.env.ARC_EXECUTION_HUB;
  if (!arcHubAddress) {
    throw new Error('ARC_EXECUTION_HUB not set in .env. Deploy Arc Hub first!');
  }

  // Load pool addresses (LiquidityVault or AMM pool)
  // Try .env first, then deployment results
  let basePool = process.env.BASE_SEPOLIA_FLX_VAULT || process.env.BASE_FLX_VAULT || '';
  
  if (!basePool) {
    const vaultPath = path.join(__dirname, '../deployment-results-base-vault.json');
    if (fs.existsSync(vaultPath)) {
      const vaultData = JSON.parse(fs.readFileSync(vaultPath, 'utf8'));
      if (vaultData.vault?.address) {
        basePool = vaultData.vault.address;
        console.log(`  📝 Loaded Base vault from deployment results: ${basePool}`);
      }
    }
  }
  
  const poolAddresses = {
    base: basePool
  };

  const results = {
    timestamp: Date.now(),
    deployer: deployerWallet.address,
    routers: {}
  };

  for (const [chainKey, chainConfig] of Object.entries(CHAINS)) {
    try {
      const localPool = poolAddresses[chainKey];
      if (!localPool) {
        console.warn(`  ⚠️  Pool address not found for ${chainKey}, using placeholder...`);
        // Use a placeholder - in production, deploy vault first
        console.warn(`  Note: You'll need to deploy a LiquidityVault and update the router`);
      }

      const provider = new ethers.JsonRpcProvider(chainConfig.rpcUrl);
      const deployer = new ethers.Wallet(normalizedKey, provider);

      const balance = await provider.getBalance(deployer.address);
      console.log(`  Balance: ${ethers.formatEther(balance)} ETH`);

      // Check for very low balance (less than 0.00001 ETH)
      if (balance < ethers.parseEther('0.00001')) {
        console.warn(`  ⚠️  Very low balance! May not be enough for deployment`);
        console.warn(`  Current: ${ethers.formatEther(balance)} ETH`);
        console.warn(`  Proceeding anyway...`);
      }

      const routerAddress = await deployRouter(
        chainKey,
        chainConfig,
        localPool || ethers.ZeroAddress, // Use zero address as placeholder
        arcHubAddress,
        deployer
      );

      results.routers[chainKey] = {
        chain: chainConfig.name,
        routerAddress,
        localPool: localPool || 'NOT_SET',
        arcHub: arcHubAddress,
        explorer: `${chainConfig.explorer}/address/${routerAddress}`
      };

      // Save to .env format
      const envPrefix = 'BASE_SEPOLIA';
      
      console.log(`\n  Add to .env:`);
      console.log(`  ${envPrefix}_SWAP_ROUTER=${routerAddress}`);
      console.log(`  NEXT_PUBLIC_${envPrefix}_SWAP_ROUTER=${routerAddress}`);

    } catch (error) {
      console.error(`  ✗ Failed on ${chainKey}:`, error.message);
      results.routers[chainKey] = { error: error.message };
    }
  }

  // Save results
  const resultsPath = path.join(__dirname, '../deployment-results-routers.json');
  fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));
  console.log(`\n✓ Results saved to: ${resultsPath}`);

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('📋 SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════\n');
  
  for (const [chainKey, result] of Object.entries(results.routers)) {
    if (result.error) {
      console.log(`❌ ${chainKey}: ${result.error}`);
    } else {
      console.log(`✅ ${chainKey}: ${result.routerAddress}`);
      if (result.localPool === 'NOT_SET') {
        console.log(`   ⚠️  Local pool not set - deploy LiquidityVault and update router`);
      }
    }
  }
}

main()
  .then(() => {
    console.log('\n✓ Router deployment complete!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n✗ Router deployment failed:', error);
    process.exit(1);
  });

