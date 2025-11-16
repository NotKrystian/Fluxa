/**
 * Deploy Test Tokens (MockERC20) on all chains
 * 
 * Deploys the same test token on Base, Arc, and Polygon for testing
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
  arc: {
    name: 'Arc Testnet',
    rpcUrl: process.env.ARC_RPC_URL || 'https://hidden-cosmological-thunder.arc-testnet.quiknode.pro/e18d2b4649fda2fd51ef9f5a2c1d7d8fd132c886',
    chainId: 5042002,
    explorer: 'https://testnet.arcscan.net'
  },
  base: {
    name: 'Base Sepolia',
    rpcUrl: process.env.BASE_SEPOLIA_RPC_URL || process.env.BASE_RPC_URL || 'https://sepolia.base.org',
    chainId: 84532,
    explorer: 'https://sepolia.basescan.org'
  }
};

function getArtifact(contractName) {
  const artifactPath = path.join(__dirname, '../artifacts/core', `${contractName}.sol`, `${contractName}.json`);
  return JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
}

async function deployToken(chainKey, chainConfig, deployer) {
  console.log(`\n[${chainConfig.name}] Deploying MockERC20...`);
  
  const artifact = getArtifact('MockERC20');
  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, deployer);
  
  // Deploy with name "Fluxa Test Token" and symbol "FLX"
  const token = await factory.deploy('Fluxa Test Token', 'FLX', 18);
  await token.waitForDeployment();
  const address = await token.getAddress();
  
  console.log(`  ✓ MockERC20 deployed: ${address}`);
  console.log(`  Explorer: ${chainConfig.explorer}/address/${address}`);
  
  return address;
}

async function main() {
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('🪙 DEPLOYING TEST TOKENS');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // Check for private key with better error message
  const privateKey = process.env.PRIVATE_KEY || process.env.DEPLOYER_PRIVATE_KEY;
  if (!privateKey) {
    console.error('\n❌ Error: PRIVATE_KEY or DEPLOYER_PRIVATE_KEY not found!');
    console.error('\nTroubleshooting:');
    console.error('  1. Check that .env file exists in the project root');
    console.error('  2. Verify the file contains: PRIVATE_KEY=0x...');
    console.error('  3. Make sure there are no spaces around the = sign');
    console.error('  4. Ensure the private key starts with 0x');
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

  const results = {
    timestamp: Date.now(),
    deployer: deployerWallet.address,
    tokens: {}
  };

  for (const [chainKey, chainConfig] of Object.entries(CHAINS)) {
    try {
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

      const tokenAddress = await deployToken(chainKey, chainConfig, deployer);
      results.tokens[chainKey] = {
        chain: chainConfig.name,
        address: tokenAddress,
        explorer: `${chainConfig.explorer}/address/${tokenAddress}`
      };

      // Save to .env format
      const envVar = chainKey === 'arc' 
        ? 'ARC_FLX_TOKEN'
        : 'BASE_SEPOLIA_FLX_TOKEN';
      
      console.log(`\n  Add to .env:`);
      console.log(`  ${envVar}=${tokenAddress}`);
      console.log(`  NEXT_PUBLIC_${envVar}=${tokenAddress}`);

    } catch (error) {
      console.error(`  ✗ Failed on ${chainKey}:`, error.message);
      results.tokens[chainKey] = { error: error.message };
    }
  }

  // Save results
  const resultsPath = path.join(__dirname, '../deployment-results-tokens.json');
  fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));
  console.log(`\n✓ Results saved to: ${resultsPath}`);

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('📋 SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════\n');
  
  for (const [chainKey, result] of Object.entries(results.tokens)) {
    if (result.error) {
      console.log(`❌ ${chainKey}: ${result.error}`);
    } else {
      console.log(`✅ ${chainKey}: ${result.address}`);
    }
  }
}

main()
  .then(() => {
    console.log('\n✓ Token deployment complete!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n✗ Token deployment failed:', error);
    process.exit(1);
  });

