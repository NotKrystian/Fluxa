/**
 * Set Vault Addresses in Gateways
 * Links vaults to gateways for cross-chain liquidity aggregation
 */

import { ethers } from 'ethers';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function getArtifact(contractName) {
  const artifactPath = path.join(__dirname, '../artifacts/core', `${contractName}.sol`, `${contractName}.json`);
  if (!fs.existsSync(artifactPath)) {
    throw new Error(`Artifact not found: ${artifactPath}\nRun: npx hardhat compile`);
  }
  return JSON.parse(fs.readFileSync(artifactPath, 'utf-8'));
}

async function main() {
  console.log(`\n========================================`);
  console.log(`🔗 Setting Vault Addresses in Gateways`);
  console.log(`========================================\n`);

  // Check required env vars
  const privateKey = process.env.DEPLOYER_PRIVATE_KEY || process.env.PRIVATE_KEY;
  
  const requiredVars = {
    'ARC_GATEWAY': process.env.ARC_GATEWAY,
    'BASE_GATEWAY': process.env.BASE_GATEWAY,
    'ARC_VAULT_FACTORY': process.env.ARC_VAULT_FACTORY,
    'BASE_VAULT_FACTORY': process.env.BASE_VAULT_FACTORY,
    'PRIVATE_KEY': privateKey,
    'ARC_RPC_URL': process.env.ARC_RPC_URL,
    'BASE_SEPOLIA_RPC_URL': process.env.BASE_SEPOLIA_RPC_URL
  };

  const missing = [];
  for (const [key, value] of Object.entries(requiredVars)) {
    if (!value) {
      missing.push(key);
    }
  }

  if (missing.length > 0) {
    console.error(`❌ Missing required environment variables:`);
    missing.forEach(key => console.error(`   - ${key}`));
    process.exit(1);
  }

  // Get vault addresses from factories
  console.log(`📋 Fetching vault addresses from factories...\n`);

  const FluxaGateway = getArtifact('FluxaGateway');
  const VaultFactory = getArtifact('VaultFactory');

  // Arc setup
  console.log(`🔵 ARC TESTNET`);
  console.log(`   Gateway: ${process.env.ARC_GATEWAY}`);
  console.log(`   Factory: ${process.env.ARC_VAULT_FACTORY}`);

  const arcProvider = new ethers.JsonRpcProvider(process.env.ARC_RPC_URL);
  const arcWallet = new ethers.Wallet(privateKey, arcProvider);
  
  const arcFactory = new ethers.Contract(
    process.env.ARC_VAULT_FACTORY,
    VaultFactory.abi,
    arcWallet
  );

  // Get Arc vault address (from env or query factory)
  let arcVaultAddress = process.env.ARC_FLX_VAULT;
  
  if (!arcVaultAddress || arcVaultAddress === ethers.ZeroAddress) {
    console.log(`   Querying factory for vault...`);
    const arcTokenAddress = process.env.ARC_TOKEN || process.env.ARC_FLX;
    if (!arcTokenAddress) {
      console.error(`❌ ARC_TOKEN or ARC_FLX not found in .env`);
      process.exit(1);
    }
    console.log(`   Token: ${arcTokenAddress}`);
    arcVaultAddress = await arcFactory.getVault(arcTokenAddress);
    
    if (arcVaultAddress === ethers.ZeroAddress) {
      console.error(`❌ No vault found for token ${arcTokenAddress} on Arc`);
      console.log(`   Create vault first using: POST /api/dev/create-vault`);
      process.exit(1);
    }
  }

  console.log(`   Vault: ${arcVaultAddress}`);

  // Base setup
  console.log(`\n🟣 BASE SEPOLIA`);
  console.log(`   Gateway: ${process.env.BASE_GATEWAY}`);
  console.log(`   Factory: ${process.env.BASE_VAULT_FACTORY}`);

  const baseProvider = new ethers.JsonRpcProvider(process.env.BASE_SEPOLIA_RPC_URL);
  const baseWallet = new ethers.Wallet(privateKey, baseProvider);
  
  const baseFactory = new ethers.Contract(
    process.env.BASE_VAULT_FACTORY,
    VaultFactory.abi,
    baseWallet
  );

  // Get Base vault address (from env or query factory)
  let baseVaultAddress = process.env.BASE_SEPOLIA_FLX_VAULT || process.env.BASE_FLX_VAULT;
  
  if (!baseVaultAddress || baseVaultAddress === ethers.ZeroAddress) {
    console.log(`   Querying factory for vault...`);
    const baseTokenAddress = process.env.BASE_WRAPPED_TOKEN;
    if (!baseTokenAddress) {
      console.error(`❌ BASE_WRAPPED_TOKEN not found in .env`);
      process.exit(1);
    }
    console.log(`   Token: ${baseTokenAddress}`);
    baseVaultAddress = await baseFactory.getVault(baseTokenAddress);
    
    if (baseVaultAddress === ethers.ZeroAddress) {
      console.error(`❌ No vault found for token ${baseTokenAddress} on Base`);
      console.log(`   Create vault first using: POST /api/dev/create-vault`);
      process.exit(1);
    }
  }

  console.log(`   Vault: ${baseVaultAddress}`);

  // Set vault in Arc Gateway
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`🔵 Setting Arc Vault in Arc Gateway...`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

  const arcGateway = new ethers.Contract(
    process.env.ARC_GATEWAY,
    FluxaGateway.abi,
    arcWallet
  );

  // Check current vault
  const currentArcVault = await arcGateway.vault();
  if (currentArcVault === arcVaultAddress) {
    console.log(`   ℹ️  Vault already set to ${arcVaultAddress}`);
  } else {
    console.log(`   Current vault: ${currentArcVault}`);
    console.log(`   New vault: ${arcVaultAddress}`);
    console.log(`   Setting...`);
    
    await delay(2000);
    const arcTx = await arcGateway.setVault(arcVaultAddress);
    console.log(`   Tx: ${arcTx.hash}`);
    
    await arcTx.wait();
    await delay(2000);
    console.log(`   ✅ Arc Gateway vault set!`);
  }

  // Set vault in Base Gateway
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`🟣 Setting Base Vault in Base Gateway...`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

  const baseGateway = new ethers.Contract(
    process.env.BASE_GATEWAY,
    FluxaGateway.abi,
    baseWallet
  );

  // Check current vault
  const currentBaseVault = await baseGateway.vault();
  if (currentBaseVault === baseVaultAddress) {
    console.log(`   ℹ️  Vault already set to ${baseVaultAddress}`);
  } else {
    console.log(`   Current vault: ${currentBaseVault}`);
    console.log(`   New vault: ${baseVaultAddress}`);
    console.log(`   Setting...`);
    
    await delay(2000);
    const baseTx = await baseGateway.setVault(baseVaultAddress);
    console.log(`   Tx: ${baseTx.hash}`);
    
    await baseTx.wait();
    await delay(2000);
    console.log(`   ✅ Base Gateway vault set!`);
  }

  // Verify setup
  console.log(`\n========================================`);
  console.log(`✅ VERIFICATION`);
  console.log(`========================================\n`);

  const verifiedArcVault = await arcGateway.vault();
  const verifiedBaseVault = await baseGateway.vault();

  console.log(`🔵 Arc Gateway (${process.env.ARC_GATEWAY})`);
  console.log(`   Vault: ${verifiedArcVault}`);
  console.log(`   Status: ${verifiedArcVault === arcVaultAddress ? '✅ Correct' : '❌ Mismatch'}`);

  console.log(`\n🟣 Base Gateway (${process.env.BASE_GATEWAY})`);
  console.log(`   Vault: ${verifiedBaseVault}`);
  console.log(`   Status: ${verifiedBaseVault === baseVaultAddress ? '✅ Correct' : '❌ Mismatch'}`);

  console.log(`\n========================================`);
  console.log(`🎉 SETUP COMPLETE!`);
  console.log(`========================================\n`);

  console.log(`Vaults are now linked to gateways.`);
  console.log(`Gateways can now:`);
  console.log(`  - Drain vault liquidity for cross-chain swaps`);
  console.log(`  - Repopulate vaults after rebalancing`);
  console.log(`\nReady for multi-chain liquidity aggregation! 🚀\n`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('\n❌ Error:', error.message);
    if (error.stack) {
      console.error('\nStack trace:', error.stack);
    }
    process.exit(1);
  });

