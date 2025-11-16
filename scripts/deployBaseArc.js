/**
 * Deploy Base + Arc Only (Hackathon)
 * 
 * Usage:
 * npm run compile
 * node scripts/deployBaseArc.js base
 * node scripts/deployBaseArc.js arc
 */

import { ethers } from 'ethers';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

// Helper to delay and avoid rate limits
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const CHAINS = {
  arc: {
    name: 'Arc Testnet',
    rpcUrl: process.env.ARC_RPC_URL,
    chainId: 5042002,
    isSource: true, // Arc has the REAL token (origin)
    nativeToken: 'USDC',
    usdcAddress: process.env.ARC_USDC || '0x3600000000000000000000000000000000000000'
  },
  base: {
    name: 'Base Sepolia',
    rpcUrl: process.env.BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org',
    chainId: 84532,
    isSource: false, // Base gets WRAPPED tokens (destination)
    nativeToken: 'ETH',
    usdcAddress: process.env.BASE_USDC || '0x036CbD53842c5426634e7929541eC2318f3dCF7e'
  }
};

function getArtifact(contractName) {
  const artifactPath = path.join(__dirname, '../artifacts/core', `${contractName}.sol`, `${contractName}.json`);
  if (!fs.existsSync(artifactPath)) {
    throw new Error(`Artifact not found: ${artifactPath}\nRun: npx hardhat compile`);
  }
  return JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
}

async function main() {
  const chainKey = process.argv[2] || 'base';
  const chainConfig = CHAINS[chainKey];
  
  if (!chainConfig) {
    console.error(`❌ Invalid chain: ${chainKey}`);
    console.log('Usage: node scripts/deployBaseArc.js [base|arc]');
    process.exit(1);
  }

  console.log(`\n========================================`);
  console.log(`🚀 Deploying on ${chainConfig.name}`);
  console.log(`========================================`);

  const provider = new ethers.JsonRpcProvider(chainConfig.rpcUrl);
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
  
  console.log(`Deployer: ${wallet.address}`);
  const balance = await provider.getBalance(wallet.address);
  console.log(`Balance: ${ethers.formatEther(balance)} ${chainConfig.nativeToken}`);

  const coordinatorAddress = process.env.GATEWAY_COORDINATOR || wallet.address;
  console.log(`Coordinator: ${coordinatorAddress}`);

  const results = {
    chain: chainConfig.name,
    chainId: chainConfig.chainId,
    deployer: wallet.address,
    coordinator: coordinatorAddress,
    timestamp: new Date().toISOString()
  };

  if (chainConfig.isSource) {
    // ====== ARC DEPLOYMENT (SOURCE - REAL TOKEN) ======
    console.log(`\n📦 ARC DEPLOYMENT (ORIGIN)`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

    let tokenAddress = process.env.ARC_TOKEN;

    if (!tokenAddress) {
      console.log(`\n[1/2] Deploying FLX Token...`);
      const MockERC20 = getArtifact('MockERC20');
      const TokenFactory = new ethers.ContractFactory(MockERC20.abi, MockERC20.bytecode, wallet);
      const token = await TokenFactory.deploy('Fluxa Test Token', 'FLX', 18);
      await token.waitForDeployment();
      await delay(2000); // Wait 2s to avoid rate limit
      tokenAddress = await token.getAddress();
      console.log(`      ✓ Token: ${tokenAddress}`);
      console.log(`      ✓ Auto-minted 1B FLX to deployer`);

      results.token = { address: tokenAddress, symbol: 'FLX' };
    } else {
      console.log(`\n[1/2] Using existing token: ${tokenAddress}`);
      results.token = { address: tokenAddress };
    }

    console.log(`\n[2/2] Deploying Gateway (SOURCE)...`);
    await delay(2000); // Wait before next deployment
    const USDC_AGGREGATOR = process.env.CCTP_WALLET_ADDRESS || '0x418611a31f73ff9ae33cd7ba7fec85def2f47541';
    const USDC_ADDRESS = chainConfig.usdcAddress;
    console.log(`      USDC Aggregator: ${USDC_AGGREGATOR}`);
    console.log(`      USDC: ${USDC_ADDRESS}`);
    const FluxaGateway = getArtifact('FluxaGateway');
    const GatewayFactory = new ethers.ContractFactory(FluxaGateway.abi, FluxaGateway.bytecode, wallet);
    const gateway = await GatewayFactory.deploy(
      tokenAddress, 
      true, // isSource
      chainConfig.chainId, 
      coordinatorAddress,
      USDC_AGGREGATOR,
      USDC_ADDRESS
    );
    await gateway.waitForDeployment();
    await delay(2000); // Wait 2s to avoid rate limit
    const gatewayAddress = await gateway.getAddress();
    console.log(`      ✓ Gateway: ${gatewayAddress}`);

    results.gateway = { address: gatewayAddress };

    console.log(`\n✅ ARC DEPLOYMENT COMPLETE!`);
    console.log(`\n📋 Add to .env:`);
    console.log(`ARC_TOKEN=${tokenAddress}`);
    console.log(`ARC_GATEWAY=${gatewayAddress}`);
    console.log(`\n📝 Next: node scripts/deployBaseArc.js base`);

  } else {
    // ====== BASE DEPLOYMENT (DESTINATION - WRAPPED TOKEN) ======
    console.log(`\n📦 BASE DEPLOYMENT (DESTINATION)`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

    const arcTokenAddress = process.env.ARC_TOKEN;
    if (!arcTokenAddress) {
      console.error(`\n❌ ARC_TOKEN not set in .env!`);
      console.log(`Run: node scripts/deployBaseArc.js arc first`);
      process.exit(1);
    }

    console.log(`Arc Token (origin): ${arcTokenAddress}`);

    console.log(`\n[1/3] Deploying WrappedToken...`);
    const WrappedToken = getArtifact('WrappedToken');
    const WTokenFactory = new ethers.ContractFactory(WrappedToken.abi, WrappedToken.bytecode, wallet);
    const wrappedToken = await WTokenFactory.deploy('Wrapped Fluxa Token', 'wFLX', CHAINS.arc.chainId, arcTokenAddress);
    await wrappedToken.waitForDeployment();
    await delay(2000); // Wait 2s to avoid rate limit
    const wrappedTokenAddress = await wrappedToken.getAddress();
    console.log(`      ✓ WrappedToken: ${wrappedTokenAddress}`);

    console.log(`\n[2/3] Deploying Gateway (BASE)...`);
    await delay(2000); // Wait before next deployment
    const USDC_AGGREGATOR = process.env.CCTP_WALLET_ADDRESS || '0x418611a31f73ff9ae33cd7ba7fec85def2f47541';
    const USDC_ADDRESS = chainConfig.usdcAddress;
    console.log(`      USDC Aggregator: ${USDC_AGGREGATOR}`);
    console.log(`      USDC: ${USDC_ADDRESS}`);
    const FluxaGateway = getArtifact('FluxaGateway');
    const GatewayFactory = new ethers.ContractFactory(FluxaGateway.abi, FluxaGateway.bytecode, wallet);
    const gateway = await GatewayFactory.deploy(
      wrappedTokenAddress, 
      false, // isSource (Arc is destination)
      chainConfig.chainId, 
      coordinatorAddress,
      USDC_AGGREGATOR,
      USDC_ADDRESS
    );
    await gateway.waitForDeployment();
    await delay(2000); // Wait 2s to avoid rate limit
    const gatewayAddress = await gateway.getAddress();
    console.log(`      ✓ Gateway: ${gatewayAddress}`);

    console.log(`\n[3/3] Connecting contracts...`);
    await delay(2000); // Wait before transactions
    const setGatewayTx = await wrappedToken.setGateway(gatewayAddress);
    await setGatewayTx.wait();
    await delay(2000); // Wait between transactions
    console.log(`      ✓ Gateway → WrappedToken`);

    const setWrappedTx = await gateway.setWrappedToken(wrappedTokenAddress);
    await setWrappedTx.wait();
    await delay(1000);
    console.log(`      ✓ WrappedToken → Gateway`);

    results.wrappedToken = { address: wrappedTokenAddress };
    results.gateway = { address: gatewayAddress };

    console.log(`\n✅ BASE DEPLOYMENT COMPLETE!`);
    console.log(`\n📋 Add to .env:`);
    console.log(`BASE_GATEWAY=${gatewayAddress}`);
    console.log(`BASE_WRAPPED_TOKEN=${wrappedTokenAddress}`);
    console.log(`\n📝 Next steps:`);
    console.log(`1. Fund coordinator on Base: ${coordinatorAddress}`);
    console.log(`2. Start backend: cd backend && npm start`);
  }

  // Save results
  const resultsDir = path.join(__dirname, '..', 'deployment-results');
  if (!fs.existsSync(resultsDir)) fs.mkdirSync(resultsDir, { recursive: true });
  
  const resultsFile = path.join(resultsDir, `${chainKey}-${Date.now()}.json`);
  fs.writeFileSync(resultsFile, JSON.stringify(results, null, 2));
  console.log(`\n💾 Saved: ${resultsFile}\n`);
}

main().catch(console.error);
