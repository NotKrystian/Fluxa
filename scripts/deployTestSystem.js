/**
 * Deploy Test System
 * 
 * Deploys the complete Fluxa system for testing:
 * 1. FluxaSwapRouter on Base, Arc, Polygon
 * 2. ArcExecutionHub on Arc
 * 3. Sets up routing between them
 * 
 * Test Flow: User swaps on Base → Routes via Arc + Polygon → Settles on Base
 */

import { ethers } from 'ethers';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

// Chain configurations
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
  },
  'polygon-amoy': {
    name: 'Polygon Amoy',
    rpcUrl: process.env.POLYGON_AMOY_RPC_URL || process.env.POLYGON_RPC_URL || 'https://rpc-amoy.polygon.technology',
    chainId: 80002,
    explorer: 'https://amoy.polygonscan.com'
  }
};

// Get contract artifacts
function getArtifact(contractName) {
  const artifactPath = path.join(__dirname, '../artifacts/core', `${contractName}.sol`, `${contractName}.json`);
  return JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
}

// Deploy contract helper
async function deployContract(contractName, args, deployer, chainName) {
  console.log(`\n[${chainName.toUpperCase()}] Deploying ${contractName}...`);
  
  const artifact = getArtifact(contractName);
  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, deployer);
  
  const contract = await factory.deploy(...args);
  await contract.waitForDeployment();
  const address = await contract.getAddress();
  
  console.log(`  ✓ ${contractName} deployed: ${address}`);
  console.log(`  Explorer: ${CHAINS[chainName].explorer}/address/${address}`);
  
  return { contract, address };
}

async function main() {
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('🚀 FLUXA TEST SYSTEM DEPLOYMENT');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // Check private key
  const privateKey = process.env.PRIVATE_KEY || process.env.DEPLOYER_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error('PRIVATE_KEY or DEPLOYER_PRIVATE_KEY not set in .env');
  }

  const normalizedKey = privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`;
  const deployerWallet = new ethers.Wallet(normalizedKey);
  console.log(`Deployer: ${deployerWallet.address}\n`);

  const deploymentResults = {
    timestamp: Date.now(),
    deployer: deployerWallet.address,
    chains: {}
  };

  // Deploy on each chain
  for (const [chainKey, chainConfig] of Object.entries(CHAINS)) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`📦 Deploying on ${chainConfig.name}`);
    console.log(`${'='.repeat(60)}`);

    const provider = new ethers.JsonRpcProvider(chainConfig.rpcUrl);
    const deployer = new ethers.Wallet(normalizedKey, provider);

    // Check balance
    const balance = await provider.getBalance(deployer.address);
    console.log(`  Balance: ${ethers.formatEther(balance)} ETH`);

    if (balance < ethers.parseEther('0.01')) {
      console.warn(`  ⚠️  Low balance! Need at least 0.01 ETH for deployment`);
    }

    const chainResults = {
      chain: chainConfig.name,
      chainId: chainConfig.chainId,
      contracts: {}
    };

    try {
      // Get required addresses from env
      const getAddress = (envVar, fallback) => {
        return process.env[envVar] || fallback || '';
      };

      // For Arc: Deploy ArcExecutionHub
      if (chainKey === 'arc') {
        // Get Arc pool address (LiquidityVault or ArcAMMPool)
        const arcPool = getAddress('ARC_FLX_VAULT') || getAddress('ARC_AMM_POOL');
        if (!arcPool) {
          throw new Error('ARC_FLX_VAULT or ARC_AMM_POOL not configured');
        }

        // Get LayerZero Endpoint (Arc testnet)
        // LayerZero endpoint addresses for testnets
        const lzEndpoint = getAddress('ARC_LZ_ENDPOINT') || '0x6aB5Ae6822647046626e83ee6dB8187151E1d5ab'; // Arc testnet
        
        const { address: hubAddress } = await deployContract(
          'ArcExecutionHub',
          [arcPool, lzEndpoint],
          deployer,
          chainKey
        );

        chainResults.contracts.ArcExecutionHub = hubAddress;

        // Save to .env format
        console.log(`\n  Add to .env:`);
        console.log(`  ARC_EXECUTION_HUB=${hubAddress}`);
        console.log(`  ARC_LZ_ENDPOINT=${lzEndpoint}`);
      }

      // For Base and Polygon: Deploy FluxaSwapRouter
      if (chainKey === 'base' || chainKey === 'polygon-amoy') {
        // Get local pool address
        const localPool = chainKey === 'base' 
          ? (getAddress('BASE_SEPOLIA_FLX_VAULT') || getAddress('BASE_FLX_VAULT'))
          : (getAddress('POLYGON_AMOY_FLX_VAULT') || getAddress('POLYGON_FLX_VAULT'));
        
        if (!localPool) {
          throw new Error(`${chainKey.toUpperCase()}_FLX_VAULT not configured`);
        }

        // Get Arc Router address (from Arc deployment)
        const arcRouter = deploymentResults.chains.arc?.contracts?.ArcExecutionHub;
        if (!arcRouter && chainKey !== 'arc') {
          throw new Error('Deploy Arc first to get ArcExecutionHub address');
        }

        // Get LayerZero Endpoint
        const lzEndpoints = {
          base: getAddress('BASE_LZ_ENDPOINT') || '0x6EDCE65403992e310A62460808c4b910D972f10f', // Base Sepolia
          'polygon-amoy': getAddress('POLYGON_LZ_ENDPOINT') || '0x6EDCE65403992e310A62460808c4b910D972f10f' // Polygon Amoy
        };
        const lzEndpoint = lzEndpoints[chainKey];

        const { address: routerAddress } = await deployContract(
          'FluxaSwapRouter',
          [localPool, arcRouter, lzEndpoint, chainConfig.chainId],
          deployer,
          chainKey
        );

        chainResults.contracts.FluxaSwapRouter = routerAddress;

        // Set remote router on Arc Hub (if Arc is already deployed)
        if (arcRouter) {
          console.log(`\n  Setting remote router on Arc Hub...`);
          const arcProvider = new ethers.JsonRpcProvider(CHAINS.arc.rpcUrl);
          const arcDeployer = new ethers.Wallet(normalizedKey, arcProvider);
          const arcHub = new ethers.Contract(
            arcRouter,
            getArtifact('ArcExecutionHub').abi,
            arcDeployer
          );
          
          const setRouterTx = await arcHub.setRemoteRouter(chainConfig.chainId, routerAddress);
          await setRouterTx.wait();
          console.log(`  ✓ Remote router set on Arc Hub`);
        }

        // Save to .env format
        const envPrefix = chainKey === 'base' ? 'BASE_SEPOLIA' : 'POLYGON_AMOY';
        console.log(`\n  Add to .env:`);
        console.log(`  ${envPrefix}_SWAP_ROUTER=${routerAddress}`);
        console.log(`  ${envPrefix}_LZ_ENDPOINT=${lzEndpoint}`);
      }

      deploymentResults.chains[chainKey] = chainResults;

    } catch (error) {
      console.error(`  ✗ Deployment failed on ${chainKey}:`, error.message);
      deploymentResults.chains[chainKey] = {
        error: error.message
      };
    }
  }

  // Save deployment results
  const resultsPath = path.join(__dirname, '../deployment-results.json');
  fs.writeFileSync(resultsPath, JSON.stringify(deploymentResults, null, 2));
  console.log(`\n✓ Deployment results saved to: ${resultsPath}`);

  // Print summary
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('📋 DEPLOYMENT SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════\n');

  for (const [chainKey, results] of Object.entries(deploymentResults.chains)) {
    if (results.error) {
      console.log(`❌ ${chainKey}: ${results.error}`);
    } else {
      console.log(`✅ ${chainKey}:`);
      for (const [contract, address] of Object.entries(results.contracts)) {
        console.log(`   ${contract}: ${address}`);
      }
    }
  }

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('🧪 TEST FLOW');
  console.log('═══════════════════════════════════════════════════════════════\n');
  console.log('1. User calls swap() on Base FluxaSwapRouter');
  console.log('2. Backend analyzes LP depths and decides routing');
  console.log('3. If VIA_ARC: Migrate LPs, execute on Arc, return to Base');
  console.log('4. User receives result on Base (same chain)\n');
}

main()
  .then(() => {
    console.log('\n✓ Deployment complete!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n✗ Deployment failed:', error);
    process.exit(1);
  });

