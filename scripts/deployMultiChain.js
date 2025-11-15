/**
 * Multi-Chain Deployment Script
 * 
 * Deploys LiquidityVault system to multiple chains:
 * - Ethereum Sepolia (Testnet)
 * - BSC Testnet
 * - Arc Testnet
 * 
 * Automatically saves addresses to .env files
 */

import { ethers } from "ethers";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Chain configurations
const CHAINS = {
  sepolia: {
    name: "Ethereum Sepolia",
    rpcUrl: process.env.SEPOLIA_RPC_URL || "https://rpc.sepolia.org",
    chainId: 11155111,
    usdc: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238", // Sepolia USDC
    explorer: "https://sepolia.etherscan.io"
  },
  bscTestnet: {
    name: "BSC Testnet",
    rpcUrl: process.env.BSC_TESTNET_RPC_URL || "https://data-seed-prebsc-1-s1.binance.org:8545",
    chainId: 97,
    usdc: "0x64544969ed7EBf5f083679233325356EbE738930", // BSC Testnet USDC
    explorer: "https://testnet.bscscan.com"
  },
  arc: {
    name: "Arc Testnet",
    rpcUrl: process.env.ARC_RPC_URL || "https://rpc.testnet.arc.network",
    chainId: 5042002,
    usdc: null, // Will deploy mock
    explorer: "https://testnet.arcscan.net"
  }
};

function getArtifact(contractName) {
  const artifactPath = path.join(
    __dirname,
    "..",
    "artifacts",
    "core",
    `${contractName}.sol`,
    `${contractName}.json`
  );

  if (!fs.existsSync(artifactPath)) {
    throw new Error(`Artifact not found: ${artifactPath}\nRun: npx hardhat compile`);
  }

  return JSON.parse(fs.readFileSync(artifactPath, "utf8"));
}

async function deployToChain(chainKey, deployments) {
  const config = CHAINS[chainKey];
  console.log(`\n${"=".repeat(70)}`);
  console.log(`DEPLOYING TO ${config.name.toUpperCase()}`);
  console.log(`${"=".repeat(70)}\n`);

  try {
    const provider = new ethers.JsonRpcProvider(config.rpcUrl);
    const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

    console.log(`📍 Deploying from: ${wallet.address}`);
    console.log(`🌐 Chain ID: ${config.chainId}`);

    // Check balance
    const balance = await provider.getBalance(wallet.address);
    console.log(`💰 Balance: ${ethers.formatEther(balance)} ETH\n`);

    if (balance === 0n) {
      console.log(`⚠️  Warning: Wallet has 0 balance on ${config.name}`);
      return null;
    }

    let usdcAddress = config.usdc;

    // Deploy mock USDC if needed (Arc)
    if (!usdcAddress) {
      console.log(`📄 Deploying Mock USDC...`);
      const MockERC20 = getArtifact("MockERC20");
      const factory = new ethers.ContractFactory(MockERC20.abi, MockERC20.bytecode, wallet);
      const usdc = await factory.deploy("USD Coin", "USDC", 6);
      await usdc.waitForDeployment();
      usdcAddress = await usdc.getAddress();
      console.log(`✅ Mock USDC: ${usdcAddress}`);
    } else {
      console.log(`📌 Using existing USDC: ${usdcAddress}`);
    }

    // Deploy VaultFactory
    console.log(`\n📄 Deploying VaultFactory...`);
    const VaultFactory = getArtifact("VaultFactory");
    const factoryContract = new ethers.ContractFactory(
      VaultFactory.abi,
      VaultFactory.bytecode,
      wallet
    );

    const vaultFactory = await factoryContract.deploy(usdcAddress, wallet.address);
    await vaultFactory.waitForDeployment();
    const factoryAddress = await vaultFactory.getAddress();
    console.log(`✅ VaultFactory: ${factoryAddress}`);

    // Deploy a test project token and vault for demo
    console.log(`\n📄 Deploying Test Project Token...`);
    const MockERC20 = getArtifact("MockERC20");
    const tokenFactory = new ethers.ContractFactory(MockERC20.abi, MockERC20.bytecode, wallet);
    const projectToken = await tokenFactory.deploy("Test Token", "TEST", 18);
    await projectToken.waitForDeployment();
    const projectTokenAddress = await projectToken.getAddress();
    console.log(`✅ Test Token: ${projectTokenAddress}`);

    // Create vault via factory
    console.log(`\n📄 Creating Liquidity Vault...`);
    const createTx = await vaultFactory.createVault(
      projectTokenAddress,
      "Test Vault Shares",
      "vTEST"
    );
    await createTx.wait();

    const vaultAddress = await vaultFactory.getVault(projectTokenAddress);
    console.log(`✅ Liquidity Vault: ${vaultAddress}`);

    console.log(`\n✨ ${config.name} deployment complete!`);
    console.log(`🔗 Explorer: ${config.explorer}`);

    return {
      chain: chainKey,
      chainId: config.chainId,
      usdc: usdcAddress,
      factory: factoryAddress,
      testToken: projectTokenAddress,
      testVault: vaultAddress,
      deployer: wallet.address
    };
  } catch (error) {
    console.error(`\n❌ Error deploying to ${config.name}:`, error.message);
    return null;
  }
}

function updateEnvFiles(deployments) {
  console.log(`\n${"=".repeat(70)}`);
  console.log(`UPDATING ENVIRONMENT FILES`);
  console.log(`${"=".repeat(70)}\n`);

  // Update root .env
  const rootEnvPath = path.join(__dirname, "..", ".env");
  let rootEnv = fs.existsSync(rootEnvPath) ? fs.readFileSync(rootEnvPath, "utf8") : "";

  for (const [chain, deployment] of Object.entries(deployments)) {
    if (!deployment) continue;

    const prefix = chain.toUpperCase();
    rootEnv = updateOrAddEnvVar(rootEnv, `${prefix}_FACTORY`, deployment.factory);
    rootEnv = updateOrAddEnvVar(rootEnv, `${prefix}_USDC`, deployment.usdc);
    rootEnv = updateOrAddEnvVar(rootEnv, `${prefix}_TEST_TOKEN`, deployment.testToken);
    rootEnv = updateOrAddEnvVar(rootEnv, `${prefix}_TEST_VAULT`, deployment.testVault);
  }

  fs.writeFileSync(rootEnvPath, rootEnv);
  console.log(`✅ Updated ${rootEnvPath}`);

  // Update frontend .env.local
  const frontendEnvPath = path.join(__dirname, "..", "frontend", ".env.local");
  let frontendEnv = fs.existsSync(frontendEnvPath) ? fs.readFileSync(frontendEnvPath, "utf8") : "";

  // Add backend URL if not present
  if (!frontendEnv.includes("NEXT_PUBLIC_BACKEND_URL")) {
    frontendEnv += "\n# Backend\nNEXT_PUBLIC_BACKEND_URL=http://localhost:3001\n";
  }

  // Add deployment addresses
  for (const [chain, deployment] of Object.entries(deployments)) {
    if (!deployment) continue;

    const prefix = `NEXT_PUBLIC_${chain.toUpperCase()}`;
    frontendEnv = updateOrAddEnvVar(frontendEnv, `${prefix}_FACTORY`, deployment.factory);
    frontendEnv = updateOrAddEnvVar(frontendEnv, `${prefix}_USDC`, deployment.usdc);
    frontendEnv = updateOrAddEnvVar(frontendEnv, `${prefix}_TEST_TOKEN`, deployment.testToken);
    frontendEnv = updateOrAddEnvVar(frontendEnv, `${prefix}_TEST_VAULT`, deployment.testVault);
  }

  fs.writeFileSync(frontendEnvPath, frontendEnv);
  console.log(`✅ Updated ${frontendEnvPath}`);

  // Update backend .env
  const backendEnvPath = path.join(__dirname, "..", "backend", ".env");
  let backendEnv = fs.existsSync(backendEnvPath) ? fs.readFileSync(backendEnvPath, "utf8") : "";

  for (const [chain, deployment] of Object.entries(deployments)) {
    if (!deployment) continue;

    const prefix = chain.toUpperCase();
    backendEnv = updateOrAddEnvVar(backendEnv, `${prefix}_FACTORY_ADDRESS`, deployment.factory);
    backendEnv = updateOrAddEnvVar(backendEnv, `${prefix}_USDC_ADDRESS`, deployment.usdc);
  }

  fs.writeFileSync(backendEnvPath, backendEnv);
  console.log(`✅ Updated ${backendEnvPath}`);
}

function updateOrAddEnvVar(envContent, key, value) {
  const regex = new RegExp(`^${key}=.*$`, 'm');
  const newLine = `${key}=${value}`;

  if (regex.test(envContent)) {
    return envContent.replace(regex, newLine);
  } else {
    return envContent + (envContent.endsWith('\n') ? '' : '\n') + newLine + '\n';
  }
}

async function main() {
  console.log(`\n${"=".repeat(70)}`);
  console.log(`FLUXA MULTI-CHAIN DEPLOYMENT`);
  console.log(`${"=".repeat(70)}\n`);

  console.log(`📋 Deploying to:`);
  Object.entries(CHAINS).forEach(([key, config]) => {
    console.log(`   • ${config.name}`);
  });
  console.log();

  const deployments = {};

  // Deploy to each chain
  for (const chainKey of Object.keys(CHAINS)) {
    const deployment = await deployToChain(chainKey, deployments);
    if (deployment) {
      deployments[chainKey] = deployment;
    }
  }

  // Update environment files
  if (Object.keys(deployments).length > 0) {
    updateEnvFiles(deployments);
  }

  // Summary
  console.log(`\n${"=".repeat(70)}`);
  console.log(`DEPLOYMENT SUMMARY`);
  console.log(`${"=".repeat(70)}\n`);

  for (const [chain, deployment] of Object.entries(deployments)) {
    if (!deployment) continue;

    console.log(`✅ ${CHAINS[chain].name}:`);
    console.log(`   Factory: ${deployment.factory}`);
    console.log(`   USDC: ${deployment.usdc}`);
    console.log(`   Test Token: ${deployment.testToken}`);
    console.log(`   Test Vault: ${deployment.testVault}\n`);
  }

  console.log(`\n🎉 Multi-chain deployment complete!`);
  console.log(`\n📝 Next steps:`);
  console.log(`   1. Start backend: cd backend && npm start`);
  console.log(`   2. Start frontend: cd frontend && npm run dev`);
  console.log(`   3. Visit: http://localhost:3000\n`);
}

main().catch((err) => {
  console.error("\n❌ Deployment failed:\n", err);
  process.exit(1);
});

