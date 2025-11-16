/**
 * Create LiquidityVault on Base Sepolia
 * 
 * Creates a vault for the test token on Base, which is needed for the Swap Router
 */

import { ethers } from 'ethers';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env file
const envPath = path.join(__dirname, '../.env');
dotenv.config({ path: envPath });

const BASE_CONFIG = {
  name: 'Base Sepolia',
  rpcUrl: process.env.BASE_SEPOLIA_RPC_URL || process.env.BASE_RPC_URL || 'https://sepolia.base.org',
  chainId: 84532,
  explorer: 'https://sepolia.basescan.org'
};

function getArtifact(contractName) {
  const artifactPath = path.join(__dirname, '../artifacts/core', `${contractName}.sol`, `${contractName}.json`);
  return JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
}

async function main() {
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('🏦 CREATING LIQUIDITY VAULT ON BASE SEPOLIA');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // Check for private key
  const privateKey = (process.env.PRIVATE_KEY || process.env.DEPLOYER_PRIVATE_KEY)?.trim();
  if (!privateKey) {
    throw new Error('PRIVATE_KEY or DEPLOYER_PRIVATE_KEY not set in .env');
  }

  // Normalize private key
  let normalizedKey = privateKey.replace(/^["']|["']$/g, '').trim();
  normalizedKey = normalizedKey.startsWith('0x') ? normalizedKey : `0x${normalizedKey}`;

  const provider = new ethers.JsonRpcProvider(BASE_CONFIG.rpcUrl);
  const deployer = new ethers.Wallet(normalizedKey, provider);

  console.log(`Deployer: ${deployer.address}\n`);

  // Check balance
  const balance = await provider.getBalance(deployer.address);
  console.log(`Balance: ${ethers.formatEther(balance)} ETH\n`);

  // Get required addresses - try .env first, then deployment results
  let vaultFactoryAddress = process.env.BASE_SEPOLIA_VAULT_FACTORY || process.env.BASE_VAULT_FACTORY;
  let tokenAddress = process.env.BASE_SEPOLIA_FLX_TOKEN;
  const usdcAddress = process.env.BASE_SEPOLIA_USDC_ADDRESS || 
                      process.env.BASE_USDC_ADDRESS || 
                      '0x036CbD53842c5426634e7929541eC2318f3dCF7e'; // Base Sepolia testnet USDC

  // Load from deployment results if not in .env
  if (!vaultFactoryAddress) {
    const factoryPath = path.join(__dirname, '../deployment-results-base-factory.json');
    if (fs.existsSync(factoryPath)) {
      const factoryData = JSON.parse(fs.readFileSync(factoryPath, 'utf8'));
      if (factoryData.vaultFactory?.address) {
        vaultFactoryAddress = factoryData.vaultFactory.address;
        console.log(`  📝 Loaded VaultFactory from deployment results: ${vaultFactoryAddress}`);
      }
    }
  }

  if (!tokenAddress) {
    const tokensPath = path.join(__dirname, '../deployment-results-tokens.json');
    if (fs.existsSync(tokensPath)) {
      const tokensData = JSON.parse(fs.readFileSync(tokensPath, 'utf8'));
      if (tokensData.tokens?.base?.address) {
        tokenAddress = tokensData.tokens.base.address;
        console.log(`  📝 Loaded Base token from deployment results: ${tokenAddress}`);
      }
    }
  }

  if (!vaultFactoryAddress) {
    console.error('❌ Error: BASE_SEPOLIA_VAULT_FACTORY not found in .env or deployment results');
    console.error('   Please deploy VaultFactory first or set BASE_SEPOLIA_VAULT_FACTORY in .env\n');
    throw new Error('VaultFactory address not configured');
  }

  if (!tokenAddress) {
    console.error('❌ Error: BASE_SEPOLIA_FLX_TOKEN not found in .env or deployment results');
    console.error('   Please deploy test token first or set BASE_SEPOLIA_FLX_TOKEN in .env\n');
    throw new Error('Token address not configured');
  }

  console.log(`VaultFactory: ${vaultFactoryAddress}`);
  console.log(`Token: ${tokenAddress}`);
  console.log(`USDC: ${usdcAddress}\n`);

  // Connect to VaultFactory
  const VaultFactoryArtifact = getArtifact('VaultFactory');
  const vaultFactory = new ethers.Contract(
    vaultFactoryAddress,
    VaultFactoryArtifact.abi,
    deployer
  );

  // Check if vault already exists
  try {
    const existingVault = await vaultFactory.getVault(tokenAddress);
    if (existingVault && existingVault !== ethers.ZeroAddress) {
      console.log(`✅ Vault already exists: ${existingVault}`);
      console.log(`   Explorer: ${BASE_CONFIG.explorer}/address/${existingVault}\n`);
      console.log('Add to .env:');
      console.log(`BASE_SEPOLIA_FLX_VAULT=${existingVault}`);
      console.log(`NEXT_PUBLIC_BASE_SEPOLIA_FLX_VAULT=${existingVault}\n`);
      return;
    }
  } catch (error) {
    // Vault doesn't exist, continue to create
  }

  // Create vault
  console.log('Creating LiquidityVault...');
  const createTx = await vaultFactory.createVault(
    tokenAddress,
    'Base Test Vault Shares',
    'vFLX'
  );

  console.log(`  Transaction: ${createTx.hash}`);
  console.log(`  Waiting for confirmation...`);
  const receipt = await createTx.wait();

  // Get vault address
  const vaultAddress = await vaultFactory.getVault(tokenAddress);
  
  console.log(`\n✅ Vault created: ${vaultAddress}`);
  console.log(`   Explorer: ${BASE_CONFIG.explorer}/address/${vaultAddress}\n`);

  // Save result
  const result = {
    timestamp: Date.now(),
    deployer: deployer.address,
    vault: {
      address: vaultAddress,
      token: tokenAddress,
      factory: vaultFactoryAddress,
      explorer: `${BASE_CONFIG.explorer}/address/${vaultAddress}`
    }
  };

  const resultPath = path.join(__dirname, '../deployment-results-base-vault.json');
  fs.writeFileSync(resultPath, JSON.stringify(result, null, 2));
  console.log(`✓ Results saved to: ${resultPath}\n`);

  console.log('Add to .env:');
  console.log(`BASE_SEPOLIA_FLX_VAULT=${vaultAddress}`);
  console.log(`NEXT_PUBLIC_BASE_SEPOLIA_FLX_VAULT=${vaultAddress}\n`);
}

main().catch((error) => {
  console.error('\n❌ Error:', error.message);
  process.exit(1);
});

