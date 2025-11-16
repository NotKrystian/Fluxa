import { ethers } from 'ethers';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

// Delay helper
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  const networkArg = process.argv[2];
  
  if (!networkArg || !['arc', 'base'].includes(networkArg.toLowerCase())) {
    console.error('❌ Usage: node deployVaultFactory.js [arc|base]');
    process.exit(1);
  }

  const network = networkArg.toLowerCase();
  const isArc = network === 'arc';
  
  // Get network config
  const config = isArc ? {
    name: 'Arc Testnet',
    rpcUrl: process.env.ARC_RPC_URL,
    usdcAddress: process.env.ARC_USDC || '0x3600000000000000000000000000000000000000', // Arc native USDC
    gatewayAddress: process.env.ARC_GATEWAY,
    chainId: 5042002
  } : {
    name: 'Base Sepolia',
    rpcUrl: process.env.BASE_SEPOLIA_RPC_URL || process.env.BASE_RPC_URL,
    usdcAddress: process.env.BASE_SEPOLIA_USDC || '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
    gatewayAddress: process.env.BASE_GATEWAY,
    chainId: 84532
  };

  console.log(`\n========================================`);
  console.log(`🚀 Deploying VaultFactory on ${config.name}`);
  console.log(`========================================`);

  // Setup provider and wallet
  const provider = new ethers.JsonRpcProvider(config.rpcUrl);
  const privateKey = process.env.PRIVATE_KEY;
  
  if (!privateKey) {
    console.error('❌ PRIVATE_KEY not found in .env');
    process.exit(1);
  }

  const deployer = new ethers.Wallet(privateKey, provider);
  console.log(`Deployer: ${deployer.address}`);

  // Check balance
  const balance = await provider.getBalance(deployer.address);
  console.log(`Balance: ${ethers.formatEther(balance)} ${isArc ? 'USDC' : 'ETH'}`);

  if (balance === 0n) {
    console.error(`❌ Insufficient balance on ${config.name}`);
    process.exit(1);
  }

  console.log(`USDC Address: ${config.usdcAddress}`);
  console.log(`\n📦 DEPLOYING VAULT FACTORY`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

  // Load contract artifacts
  const VaultFactoryArtifact = JSON.parse(
    fs.readFileSync(path.join(__dirname, '../artifacts/core/VaultFactory.sol/VaultFactory.json'), 'utf8')
  );

  const VaultFactoryContract = new ethers.ContractFactory(
    VaultFactoryArtifact.abi,
    VaultFactoryArtifact.bytecode,
    deployer
  );

  // Deploy VaultFactory
  console.log(`[1/1] Deploying VaultFactory...`);
  console.log(`      USDC: ${config.usdcAddress}`);
  console.log(`      Fee Recipient: ${deployer.address}`);
  console.log(`      Swap Fee: 30 bps (0.30%)`);
  
  // Gateway address (will be set after gateway is deployed, use address(0) for now)
  const gatewayAddress = config.gatewayAddress || ethers.ZeroAddress;
  console.log(`      Gateway: ${gatewayAddress}`);

  await delay(2000);

  const vaultFactory = await VaultFactoryContract.deploy(
    config.usdcAddress,
    deployer.address, // fee recipient
    30, // 0.30% swap fee
    gatewayAddress // gateway address
  );

  await delay(2000);
  await vaultFactory.waitForDeployment();
  const vaultFactoryAddress = await vaultFactory.getAddress();

  console.log(`      ✓ VaultFactory: ${vaultFactoryAddress}\n`);

  // Verify deployment
  await delay(2000);
  console.log(`🔍 Verifying deployment...`);
  const usdc = await vaultFactory.usdc();
  const governance = await vaultFactory.governance();
  const swapFeeBps = await vaultFactory.swapFeeBps();
  const feeRecipient = await vaultFactory.feeRecipient();

  console.log(`   USDC: ${usdc}`);
  console.log(`   Governance: ${governance}`);
  console.log(`   Swap Fee: ${swapFeeBps} bps`);
  console.log(`   Fee Recipient: ${feeRecipient}`);

  if (usdc.toLowerCase() !== config.usdcAddress.toLowerCase()) {
    console.error(`   ❌ USDC mismatch!`);
  } else {
    console.log(`   ✅ Configuration verified`);
  }

  console.log(`\n✅ ${config.name.toUpperCase()} DEPLOYMENT COMPLETE!\n`);

  console.log(`📋 Add to .env:`);
  if (isArc) {
    console.log(`ARC_VAULT_FACTORY=${vaultFactoryAddress}`);
  } else {
    console.log(`BASE_VAULT_FACTORY=${vaultFactoryAddress}`);
  }

  console.log(`\n📝 Next steps:`);
  if (isArc) {
    console.log(`1. Create FLX/USDC vault on Arc using the webapp`);
    console.log(`2. Deploy VaultFactory on Base: node scripts/deployVaultFactory.js base`);
  } else {
    console.log(`1. Create wFLX/USDC vault on Base using the webapp`);
    console.log(`2. Add liquidity to both vaults`);
    console.log(`3. Test swaps!`);
  }

  // Save deployment info
  const deploymentDir = path.join(__dirname, '../deployment-results');
  if (!fs.existsSync(deploymentDir)) {
    fs.mkdirSync(deploymentDir, { recursive: true });
  }

  const deploymentInfo = {
    network: config.name,
    chainId: config.chainId,
    timestamp: Date.now(),
    deployer: deployer.address,
    contracts: {
      VaultFactory: vaultFactoryAddress,
      USDC: config.usdcAddress
    },
    config: {
      swapFeeBps: swapFeeBps.toString(),
      feeRecipient,
      governance
    }
  };

  const filename = `${network}-vault-factory-${Date.now()}.json`;
  fs.writeFileSync(
    path.join(deploymentDir, filename),
    JSON.stringify(deploymentInfo, null, 2)
  );

  console.log(`\n💾 Saved: ${path.join(deploymentDir, filename)}\n`);
}

main().catch((error) => {
  console.error('\n❌ Deployment failed:', error);
  process.exit(1);
});

