/**
 * Deploy VaultFactory on Base Sepolia
 * 
 * Deploys VaultFactory which is needed to create vaults
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
  console.log('🏭 DEPLOYING VAULT FACTORY ON BASE SEPOLIA');
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

  // Get USDC address (Base Sepolia testnet USDC)
  const usdcAddress = process.env.BASE_SEPOLIA_USDC_ADDRESS || 
                      process.env.BASE_USDC_ADDRESS || 
                      '0x036CbD53842c5426634e7929541eC2318f3dCF7e'; // Base Sepolia testnet USDC

  console.log(`USDC Address: ${usdcAddress}\n`);

  // Deploy VaultFactory
  console.log('Deploying VaultFactory...');
  const VaultFactoryArtifact = getArtifact('VaultFactory');
  const factory = new ethers.ContractFactory(
    VaultFactoryArtifact.abi,
    VaultFactoryArtifact.bytecode,
    deployer
  );

  // VaultFactory constructor: (usdc, governance, swapFeeBps)
  const swapFeeBps = 30; // 0.3%
  const vaultFactory = await factory.deploy(
    usdcAddress,
    deployer.address, // governance
    swapFeeBps
  );

  await vaultFactory.waitForDeployment();
  const vaultFactoryAddress = await vaultFactory.getAddress();

  console.log(`\n✅ VaultFactory deployed: ${vaultFactoryAddress}`);
  console.log(`   Explorer: ${BASE_CONFIG.explorer}/address/${vaultFactoryAddress}\n`);

  // Save result
  const result = {
    timestamp: Date.now(),
    deployer: deployer.address,
    vaultFactory: {
      address: vaultFactoryAddress,
      usdc: usdcAddress,
      governance: deployer.address,
      swapFeeBps,
      explorer: `${BASE_CONFIG.explorer}/address/${vaultFactoryAddress}`
    }
  };

  const resultPath = path.join(__dirname, '../deployment-results-base-factory.json');
  fs.writeFileSync(resultPath, JSON.stringify(result, null, 2));
  console.log(`✓ Results saved to: ${resultPath}\n`);

  console.log('Add to .env:');
  console.log(`BASE_SEPOLIA_VAULT_FACTORY=${vaultFactoryAddress}`);
  console.log(`NEXT_PUBLIC_BASE_SEPOLIA_VAULT_FACTORY=${vaultFactoryAddress}\n`);
}

main().catch((error) => {
  console.error('\n❌ Error:', error.message);
  process.exit(1);
});

