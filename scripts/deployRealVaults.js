/**
 * Real Multi-Chain Vault Deployment
 * Deploys to BSC Testnet and Arc Testnet with actual contracts
 */

import { ethers } from "ethers";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CHAINS = {
  sepolia: {
    name: "Ethereum Sepolia",
    rpcUrl: process.env.SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com",
    chainId: 11155111,
    nativeCurrency: "ETH",
    explorer: "https://sepolia.etherscan.io",
    // Real USDC on Sepolia
    usdc: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238"
  },
  arc: {
    name: "Arc Testnet", 
    rpcUrl: process.env.ARC_RPC_URL || "https://rpc.testnet.arc.network",
    chainId: 5042002,
    nativeCurrency: "USDC", // Native token on Arc IS USDC
    explorer: "https://testnet.arcscan.net",
    // Real USDC on Arc - Circle's NativeFiatTokenV2_2 (Proxy)
    // Proxy: 0x3600000000000000000000000000000000000000
    // Implementation: 0x3910B7cbb3341f1F4bF4cEB66e4A2C8f204FE2b8
    // Use proxy address for ERC20 operations
    usdc: process.env.ARC_USDC_ADDRESS || "0x3600000000000000000000000000000000000000"
  }
};

function getArtifact(contractName) {
  const artifactPath = path.join(__dirname, "..", "artifacts", "core", `${contractName}.sol`, `${contractName}.json`);
  if (!fs.existsSync(artifactPath)) {
    throw new Error(`Artifact not found: ${artifactPath}`);
  }
  return JSON.parse(fs.readFileSync(artifactPath, "utf8"));
}

async function deployToChain(chainKey) {
  const config = CHAINS[chainKey];
  console.log(`\n${"=".repeat(70)}`);
  console.log(`DEPLOYING TO ${config.name.toUpperCase()}`);
  console.log(`${"=".repeat(70)}\n`);

  const provider = new ethers.JsonRpcProvider(config.rpcUrl);
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

  console.log(`Deployer: ${wallet.address}`);
  const balance = await provider.getBalance(wallet.address);
  console.log(`Balance: ${ethers.formatEther(balance)} ${config.nativeCurrency}\n`);

  if (balance === 0n) {
    console.log(`❌ No ${config.nativeCurrency} balance - cannot deploy`);
    return null;
  }

  const artifacts = {
    MockERC20: getArtifact("MockERC20"),
    VaultFactory: getArtifact("VaultFactory"),
    LiquidityVault: getArtifact("LiquidityVault"),
    ArcAMMFactory: getArtifact("ArcAMMFactory"),
    ArcAMMPool: getArtifact("ArcAMMPool"),
    ArcMetaRouter: getArtifact("ArcMetaRouter"),
    TokenRegistry: getArtifact("TokenRegistry")
  };

  let usdcAddress = config.usdc;

  // Use REAL USDC only - required for Circle CCTP support
  if (!usdcAddress) {
    throw new Error(
      `❌ USDC address not configured for ${config.name}!\n` +
      `   Set ARC_USDC_ADDRESS in .env with the REAL Circle-supported USDC contract address.\n` +
      `   We use REAL USDC tokens only - no mocks - for Circle CCTP compatibility.`
    );
  }

  // Verify USDC contract exists and is valid
  try {
    const usdcContract = new ethers.Contract(
      usdcAddress,
      ['function symbol() view returns (string)', 'function decimals() view returns (uint8)'],
      provider
    );
    const symbol = await usdcContract.symbol();
    const decimals = await usdcContract.decimals();
    console.log(`✅ Using REAL USDC: ${usdcAddress}`);
    console.log(`   Symbol: ${symbol}, Decimals: ${decimals}`);
    
    if (symbol !== 'USDC') {
      console.warn(`⚠️  Warning: Contract symbol is "${symbol}", expected "USDC"`);
    }
  } catch (error) {
    throw new Error(
      `❌ Invalid USDC address ${usdcAddress} on ${config.name}!\n` +
      `   Error: ${error.message}\n` +
      `   Please verify the USDC contract address is correct.`
    );
  }

  // Deploy Project Token
  console.log(`\nDeploying Project Token...`);
  await sleep(1000); // Rate limit protection - delay before deployment
  const Token = new ethers.ContractFactory(artifacts.MockERC20.abi, artifacts.MockERC20.bytecode, wallet);
  const projectToken = await Token.deploy("Fluxa Token", "FLX", 18);
  await projectToken.waitForDeployment();
  await sleep(2000); // Rate limit protection - waitForDeployment polls many times
  const projectTokenAddress = await projectToken.getAddress();
  console.log(`✅ Project Token (FLX): ${projectTokenAddress}`);

  // Deploy VaultFactory
  console.log(`\nDeploying VaultFactory...`);
  await sleep(1000); // Rate limit protection
  const VaultFactoryContract = new ethers.ContractFactory(artifacts.VaultFactory.abi, artifacts.VaultFactory.bytecode, wallet);
  const swapFeeBps = 30; // 0.30% swap fee
  const vaultFactory = await VaultFactoryContract.deploy(usdcAddress, wallet.address, swapFeeBps);
  await vaultFactory.waitForDeployment();
  await sleep(2000); // Rate limit protection
  const factoryAddress = await vaultFactory.getAddress();
  console.log(`✅ VaultFactory: ${factoryAddress}`);

  // Create Vault for FLX token
  console.log(`\nCreating FLX Liquidity Vault...`);
  await sleep(1000); // Rate limit protection
  const createTx = await vaultFactory.createVault(
    projectTokenAddress,
    "Fluxa Vault Shares",
    "vFLX"
  );
  await createTx.wait();
  await sleep(2000); // Rate limit protection - wait() polls many times
  const vaultAddress = await vaultFactory.getVault(projectTokenAddress);
  console.log(`✅ FLX Vault: ${vaultAddress}`);

  // Deploy ArcAMMFactory
  console.log(`\nDeploying ArcAMMFactory...`);
  await sleep(1000); // Rate limit protection
  const AMMFactory = new ethers.ContractFactory(artifacts.ArcAMMFactory.abi, artifacts.ArcAMMFactory.bytecode, wallet);
  const ammFactory = await AMMFactory.deploy(
    wallet.address, // feeToSetter
    30,             // 0.30% swap fee
    0               // no protocol fee
  );
  await ammFactory.waitForDeployment();
  await sleep(2000); // Rate limit protection
  const ammFactoryAddress = await ammFactory.getAddress();
  console.log(`✅ ArcAMMFactory: ${ammFactoryAddress}`);

  // Deploy ArcMetaRouter
  console.log(`\nDeploying ArcMetaRouter...`);
  await sleep(1000); // Rate limit protection
  const Router = new ethers.ContractFactory(artifacts.ArcMetaRouter.abi, artifacts.ArcMetaRouter.bytecode, wallet);
  const router = await Router.deploy(
    usdcAddress,
    usdcAddress, // Using USDC for both USDC and EURC for now
    ethers.ZeroAddress, // tokenMessenger - will update
    ethers.ZeroAddress, // gatewayWallet - will update
    0, // no fee
    wallet.address
  );
  await router.waitForDeployment();
  await sleep(2000); // Rate limit protection
  const routerAddress = await router.getAddress();
  console.log(`✅ ArcMetaRouter: ${routerAddress}`);

  // Link factories to router
  console.log(`\nLinking Vault Factory to Router...`);
  await sleep(1000); // Rate limit protection
  const vaultFactoryTx = await router.setVaultFactory(factoryAddress);
  await vaultFactoryTx.wait();
  await sleep(2000); // Rate limit protection
  console.log(`✅ Vault Factory linked`);

  console.log(`\nLinking AMM Factory to Router...`);
  await sleep(1000); // Rate limit protection
  const linkTx = await router.setAMMFactory(ammFactoryAddress);
  await linkTx.wait();
  await sleep(2000); // Rate limit protection
  console.log(`✅ AMM Factory linked`);

  // Vaults ARE the pools - no need to create separate pool contracts
  // The vault we created above is the liquidity pool for FLX/USDC swaps
  const poolAddress = vaultAddress; // Vault address IS the pool address
  console.log(`\n✅ Vault is the pool - no separate pool contract needed`);
  console.log(`   Pool address (same as vault): ${poolAddress}`);

  return {
    chain: chainKey,
    chainId: config.chainId,
    usdc: usdcAddress,
    projectToken: projectTokenAddress,
    vaultFactory: factoryAddress,
    vault: vaultAddress,
    ammFactory: ammFactoryAddress,
    router: routerAddress,
    pool: poolAddress,
    gatewayWallet: config.gatewayWallet || ethers.ZeroAddress
  };
}

function updateEnvFile(deployments) {
  console.log(`\n${"=".repeat(70)}`);
  console.log(`UPDATING .ENV FILES`);
  console.log(`${"=".repeat(70)}\n`);

  const rootEnvPath = path.join(__dirname, "..", ".env");
  let envContent = fs.existsSync(rootEnvPath) ? fs.readFileSync(rootEnvPath, "utf8") : "";

  for (const [chain, deployment] of Object.entries(deployments)) {
    if (chain === 'registry') continue;
    
    const prefix = chain.toUpperCase();
    envContent = updateEnvVar(envContent, `${prefix}_VAULT_FACTORY`, deployment.vaultFactory);
    envContent = updateEnvVar(envContent, `${prefix}_USDC`, deployment.usdc);
    envContent = updateEnvVar(envContent, `${prefix}_FLX_TOKEN`, deployment.projectToken);
    envContent = updateEnvVar(envContent, `${prefix}_FLX_VAULT`, deployment.vault);
    envContent = updateEnvVar(envContent, `${prefix}_AMM_FACTORY`, deployment.ammFactory);
    envContent = updateEnvVar(envContent, `${prefix}_ROUTER`, deployment.router);
    envContent = updateEnvVar(envContent, `${prefix}_FLX_USDC_POOL`, deployment.pool);
  }

  if (deployments.registry) {
    envContent = updateEnvVar(envContent, 'TOKEN_REGISTRY', deployments.registry.address);
    envContent = updateEnvVar(envContent, 'FLX_TOKEN_ID', deployments.registry.flxTokenId);
    envContent = updateEnvVar(envContent, 'USDC_TOKEN_ID', deployments.registry.usdcTokenId);
  }

  fs.writeFileSync(rootEnvPath, envContent);
  console.log(`✅ Updated .env`);

  // Frontend .env.local
  const frontendEnvPath = path.join(__dirname, "..", "frontend", ".env.local");
  let frontendEnv = "NEXT_PUBLIC_BACKEND_URL=http://localhost:3001\n\n";

  if (deployments.registry) {
    frontendEnv += "# Token Registry (Arc - Source of Truth)\n";
    frontendEnv += `NEXT_PUBLIC_TOKEN_REGISTRY=${deployments.registry.address}\n`;
    frontendEnv += `NEXT_PUBLIC_FLX_TOKEN_ID=${deployments.registry.flxTokenId}\n`;
    frontendEnv += `NEXT_PUBLIC_USDC_TOKEN_ID=${deployments.registry.usdcTokenId}\n\n`;
  }

  // Write Arc-specific variables that frontend expects
  if (deployments.arc) {
    const arc = deployments.arc;
    frontendEnv += "# Arc Testnet (Main Chain)\n";
    frontendEnv += `NEXT_PUBLIC_ARC_RPC_URL=${CHAINS.arc.rpcUrl}\n`;
    frontendEnv += `NEXT_PUBLIC_ARC_CHAIN_ID=${arc.chainId}\n`;
    frontendEnv += `NEXT_PUBLIC_ARC_ROUTER_ADDRESS=${arc.router}\n`;
    frontendEnv += `NEXT_PUBLIC_ARC_FACTORY_ADDRESS=${arc.ammFactory}\n`;
    frontendEnv += `NEXT_PUBLIC_ARC_USDC_ADDRESS=${arc.usdc}\n`;
    frontendEnv += `NEXT_PUBLIC_ARC_EURC_ADDRESS=${arc.usdc}\n`; // Using USDC for EURC for now
    frontendEnv += `NEXT_PUBLIC_ARC_FLX_TOKEN=${arc.projectToken}\n`;
    frontendEnv += `NEXT_PUBLIC_ARC_FLX_VAULT=${arc.vault}\n`;
    frontendEnv += `NEXT_PUBLIC_ARC_FLX_USDC_POOL=${arc.pool}\n\n`;
  }

  // Write all chain variables (for multi-chain support)
  for (const [chain, deployment] of Object.entries(deployments)) {
    if (chain === 'registry') continue;
    
    const prefix = `NEXT_PUBLIC_${chain.toUpperCase()}`;
    frontendEnv += `# ${CHAINS[chain].name} (Multi-Chain)\n`;
    frontendEnv += `${prefix}_VAULT_FACTORY=${deployment.vaultFactory}\n`;
    frontendEnv += `${prefix}_USDC=${deployment.usdc}\n`;
    frontendEnv += `${prefix}_FLX_TOKEN=${deployment.projectToken}\n`;
    frontendEnv += `${prefix}_FLX_VAULT=${deployment.vault}\n`;
    frontendEnv += `${prefix}_AMM_FACTORY=${deployment.ammFactory}\n`;
    frontendEnv += `${prefix}_ROUTER=${deployment.router}\n`;
    frontendEnv += `${prefix}_FLX_USDC_POOL=${deployment.pool}\n`;
    frontendEnv += `${prefix}_CHAIN_ID=${deployment.chainId}\n`;
    frontendEnv += `${prefix}_RPC_URL=${CHAINS[chain].rpcUrl}\n\n`;
  }

  fs.writeFileSync(frontendEnvPath, frontendEnv);
  console.log(`✅ Created frontend/.env.local`);
}

function updateEnvVar(content, key, value) {
  const regex = new RegExp(`^${key}=.*$`, 'm');
  const newLine = `${key}=${value}`;
  if (regex.test(content)) {
    return content.replace(regex, newLine);
  }
  return content + (content.endsWith('\n') ? '' : '\n') + newLine + '\n';
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  console.log(`\n${"=".repeat(70)}`);
  console.log(`FLUXA REAL MULTI-CHAIN DEPLOYMENT`);
  console.log(`${"=".repeat(70)}\n`);
  console.log(`📋 IMPORTANT: We use REAL USDC tokens only (Circle-supported)`);
  console.log(`   - Sepolia: Using real USDC (${CHAINS.sepolia.usdc})`);
  console.log(`   - Arc: Using real USDC proxy (${CHAINS.arc.usdc})`);
  console.log(`     Implementation: 0x3910B7cbb3341f1F4bF4cEB66e4A2C8f204FE2b8 (NativeFiatTokenV2_2)\n`);

  const deployments = {};

  // Deploy to Sepolia
  try {
    const sepoliaDeployment = await deployToChain('sepolia');
    if (sepoliaDeployment) deployments.sepolia = sepoliaDeployment;
  } catch (err) {
    console.error(`Sepolia deployment error:`, err.message);
  }

  // Deploy to Arc
  try {
    const arcDeployment = await deployToChain('arc');
    if (arcDeployment) deployments.arc = arcDeployment;
  } catch (err) {
    console.error(`Arc deployment error:`, err.message);
  }

  if (Object.keys(deployments).length === 0) {
    console.log(`\n❌ No successful deployments`);
    return;
  }

  // Deploy TokenRegistry (on Arc as the coordination hub)
  console.log(`\n${"=".repeat(70)}`);
  console.log(`DEPLOYING TOKEN REGISTRY (ARC)`);
  console.log(`${"=".repeat(70)}\n`);

  const arcDeployment = deployments.arc;
  if (arcDeployment) {
    const provider = new ethers.JsonRpcProvider(CHAINS.arc.rpcUrl);
    const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
    const RegistryArtifact = getArtifact("TokenRegistry");

    console.log(`Deploying TokenRegistry...`);
    await sleep(1000); // Rate limit protection
    const Registry = new ethers.ContractFactory(RegistryArtifact.abi, RegistryArtifact.bytecode, wallet);
    const registry = await Registry.deploy();
    await registry.waitForDeployment();
    await sleep(2000); // Rate limit protection - waitForDeployment polls many times
    const registryAddress = await registry.getAddress();
    console.log(`✅ TokenRegistry: ${registryAddress}`);

    // Register chains
    console.log(`\nRegistering chains in registry...`);
    for (const [chainKey, deployment] of Object.entries(deployments)) {
      await sleep(1000); // Rate limit protection - delay before transaction
      const registerChainTx = await registry.registerChain(
        deployment.chainId,
        deployment.gatewayWallet,
        CHAINS[chainKey].rpcUrl
      );
      await registerChainTx.wait();
      await sleep(2000); // Rate limit protection - wait() polls many times
      console.log(`✅ Registered ${CHAINS[chainKey].name} (${deployment.chainId})`);
    }

    // Register FLX token on each chain
    console.log(`\nRegistering FLX token across chains...`);
    const flxTokenId = ethers.id("FLX"); // keccak256("FLX")

    for (const [chainKey, deployment] of Object.entries(deployments)) {
      await sleep(1000); // Rate limit protection
      const registerTokenTx = await registry.registerToken(
        flxTokenId,
        deployment.chainId,
        deployment.projectToken,
        deployment.vault,
        "FLX",
        "Fluxa Token",
        18
      );
      await registerTokenTx.wait();
      await sleep(2000); // Rate limit protection
      console.log(`✅ Registered FLX on ${CHAINS[chainKey].name}`);
    }

    // Register USDC token on each chain
    console.log(`\nRegistering USDC token across chains...`);
    const usdcTokenId = ethers.id("USDC");

    for (const [chainKey, deployment] of Object.entries(deployments)) {
      await sleep(1000); // Rate limit protection
      const registerUsdcTx = await registry.registerToken(
        usdcTokenId,
        deployment.chainId,
        deployment.usdc,
        ethers.ZeroAddress, // USDC doesn't have a vault
        "USDC",
        "USD Coin",
        6
      );
      await registerUsdcTx.wait();
      await sleep(2000); // Rate limit protection
      console.log(`✅ Registered USDC on ${CHAINS[chainKey].name}`);
    }

    deployments.registry = {
      address: registryAddress,
      flxTokenId,
      usdcTokenId
    };
  }

  // Update env files
  updateEnvFile(deployments);

  // Summary
  console.log(`\n${"=".repeat(70)}`);
  console.log(`DEPLOYMENT SUMMARY`);
  console.log(`${"=".repeat(70)}\n`);

  for (const [chain, d] of Object.entries(deployments)) {
    if (chain === 'registry') continue;
    
    console.log(`✅ ${CHAINS[chain].name}:`);
    console.log(`   VaultFactory:    ${d.vaultFactory}`);
    console.log(`   USDC:            ${d.usdc}`);
    console.log(`   FLX Token:       ${d.projectToken}`);
    console.log(`   FLX Vault:       ${d.vault}`);
    console.log(`   AMM Factory:     ${d.ammFactory}`);
    console.log(`   Router:          ${d.router}`);
    console.log(`   FLX/USDC Pool:   ${d.pool}\n`);
  }

  if (deployments.registry) {
    console.log(`✅ Token Registry (Arc):`);
    console.log(`   Address:         ${deployments.registry.address}`);
    console.log(`   FLX Token ID:    ${deployments.registry.flxTokenId}`);
    console.log(`   USDC Token ID:   ${deployments.registry.usdcTokenId}\n`);
  }

  console.log(`✅ Deployment complete!`);
  console.log(`\n📝 Next steps:`);
  console.log(`   1. RESTART the frontend dev server to load new environment variables:`);
  console.log(`      - Stop frontend (Ctrl+C if running)`);
  console.log(`      - cd frontend && npm run dev`);
  console.log(`   2. Start backend: cd backend && npm start`);
  console.log(`   3. Visit http://localhost:3000/vaults to see deployed vaults`);
  console.log(`   4. Visit http://localhost:3000/swap to swap tokens`);
  console.log(`\n⚠️  IMPORTANT: Frontend must be restarted after deployment to load .env.local!`);
}

main().catch(console.error);

