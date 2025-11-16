/**
 * Deploy FluxaGateway contracts on all chains
 * 
 * Deploys Gateway contracts for wrapping test tokens across chains
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
    explorer: 'https://testnet.arcscan.net',
    lzEndpoint: process.env.ARC_LZ_ENDPOINT || '0x6aB5Ae6822647046626e83ee6dB8187151E1d5ab',
    lzChainId: 30110
  },
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

async function deployGateway(chainKey, chainConfig, tokenAddress, deployer, tokenAddresses) {
  console.log(`\n[${chainConfig.name}] Deploying FluxaGateway...`);
  
  const artifact = getArtifact('FluxaGateway');
  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, deployer);
  
  // Origin Gateway: Base (locks tokens when wrapping)
  // Destination Gateway: Arc (mints wrapped tokens when wrapping)
  const isOrigin = chainKey === 'base';
  
  const gateway = await factory.deploy(
    tokenAddress,
    isOrigin,
    chainConfig.chainId,
    chainConfig.lzEndpoint,
    chainConfig.lzChainId
  );
  
  await gateway.waitForDeployment();
  const address = await gateway.getAddress();
  
  console.log(`  ✓ FluxaGateway deployed: ${address}`);
  console.log(`  Type: ${isOrigin ? 'ORIGIN' : 'DESTINATION'}`);
  console.log(`  Explorer: ${chainConfig.explorer}/address/${address}`);
  
  // If destination, deploy WrappedToken
  let wrappedTokenAddress = null;
  if (!isOrigin) {
    console.log(`  Deploying WrappedToken...`);
    const wrappedArtifact = getArtifact('WrappedToken');
    const wrappedFactory = new ethers.ContractFactory(
      wrappedArtifact.abi,
      wrappedArtifact.bytecode,
      deployer
    );
    
    // Get Base chain config for origin chain ID and token (Base is origin)
    const baseChain = CHAINS.base;
    const baseTokenAddress = tokenAddresses?.base;
    
    if (!baseTokenAddress) {
      throw new Error('Base token address not found. Deploy Base token first.');
    }
    
    console.log(`    Origin Chain ID: ${baseChain.chainId}`);
    console.log(`    Origin Token: ${baseTokenAddress}`);
    
    // WrappedToken constructor: (name, symbol, originChainId, originToken)
    // Origin is Base (where tokens are locked), so use Base's chain ID and token address
    // Convert chainId to uint32 (should be fine, but ensure it's a number)
    const originChainId = Number(baseChain.chainId);
    if (originChainId > 4294967295) {
      throw new Error(`Chain ID ${originChainId} is too large for uint32`);
    }
    
    console.log(`    Deploying with originChainId: ${originChainId} (uint32)`);
    
    // Estimate gas first to see if there's an issue
    try {
      const deployTx = wrappedFactory.getDeployTransaction(
        'Wrapped Fluxa Test Token',
        'wFLX',
        originChainId,
        baseTokenAddress
      );
      const estimatedGas = await deployer.estimateGas(deployTx);
      console.log(`    Estimated gas: ${estimatedGas.toString()}`);
    } catch (estimateError) {
      console.error(`    Gas estimation failed: ${estimateError.message}`);
      throw estimateError;
    }
    
    const wrappedToken = await wrappedFactory.deploy(
      'Wrapped Fluxa Test Token',
      'wFLX',
      originChainId, // Origin chain ID (Base) as uint32
      baseTokenAddress // Origin token address (Base token)
    );
    
    // Add delay before waiting for deployment to avoid rate limits
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Wait for deployment with retry logic
    let deploymentReceipt;
    let retries = 0;
    const maxRetries = 10;
    while (retries < maxRetries) {
      try {
        await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds between retries
        deploymentReceipt = await wrappedToken.waitForDeployment();
        break;
      } catch (error) {
        if (error.message.includes('rate limit') || error.code === -32007) {
          retries++;
          console.log(`    ⚠️  Rate limit hit, retrying... (${retries}/${maxRetries})`);
          if (retries >= maxRetries) {
            // Get the address from the deployment transaction
            const deployTx = wrappedToken.deploymentTransaction();
            if (deployTx) {
              console.log(`    ⚠️  Could not confirm deployment due to rate limits, but transaction was sent:`);
              console.log(`    Transaction: ${deployTx.hash}`);
              console.log(`    You can check the transaction manually and get the address from the contract creation event`);
              // Try to compute the address
              const address = await wrappedToken.getAddress();
              wrappedTokenAddress = address;
              console.log(`    Computed address: ${address}`);
              break;
            }
            throw error;
          }
        } else {
          throw error;
        }
      }
    }
    
    if (!wrappedTokenAddress) {
      wrappedTokenAddress = await wrappedToken.getAddress();
    }
    
    // Set gateway on wrapped token
    const setGatewayTx = await wrappedToken.setGateway(address);
    await setGatewayTx.wait();
    
    // Set wrapped token on gateway
    const setWrappedTx = await gateway.setWrappedToken(wrappedTokenAddress);
    await setWrappedTx.wait();
    
    console.log(`  ✓ WrappedToken deployed: ${wrappedTokenAddress}`);
  }
  
  return { gatewayAddress: address, wrappedTokenAddress };
}

async function main() {
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('🌉 DEPLOYING FLUXA GATEWAYS');
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

  // Load token addresses from previous deployment or env
  // First try .env, then check deployment results JSON
  let tokenAddresses = {
    arc: process.env.ARC_FLX_TOKEN || '',
    base: process.env.BASE_SEPOLIA_FLX_TOKEN || ''
  };
  
  // If missing, try to load from deployment results
  if (!tokenAddresses.arc || !tokenAddresses.base) {
    const tokensPath = path.join(__dirname, '../deployment-results-tokens.json');
    if (fs.existsSync(tokensPath)) {
      const tokensData = JSON.parse(fs.readFileSync(tokensPath, 'utf8'));
      if (!tokenAddresses.arc && tokensData.tokens?.arc?.address) {
        tokenAddresses.arc = tokensData.tokens.arc.address;
        console.log(`  📝 Loaded Arc token from deployment results: ${tokenAddresses.arc}`);
      }
      if (!tokenAddresses.base && tokensData.tokens?.base?.address) {
        tokenAddresses.base = tokensData.tokens.base.address;
        console.log(`  📝 Loaded Base token from deployment results: ${tokenAddresses.base}`);
      }
    }
  }

  const results = {
    timestamp: Date.now(),
    deployer: deployerWallet.address,
    gateways: {}
  };

  // Deploy gateways
  for (const [chainKey, chainConfig] of Object.entries(CHAINS)) {
    try {
      const tokenAddress = tokenAddresses[chainKey];
      if (!tokenAddress) {
        console.warn(`  ⚠️  Token address not found for ${chainKey}, skipping...`);
        continue;
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

      const { gatewayAddress, wrappedTokenAddress } = await deployGateway(
        chainKey,
        chainConfig,
        tokenAddress,
        deployer,
        tokenAddresses
      );

      results.gateways[chainKey] = {
        chain: chainConfig.name,
        gatewayAddress,
        wrappedTokenAddress,
        isOrigin: chainKey === 'base',
        explorer: `${chainConfig.explorer}/address/${gatewayAddress}`
      };

      // Save to .env format
      const envPrefix = chainKey === 'arc' 
        ? 'ARC'
        : 'BASE_SEPOLIA';
      
      console.log(`\n  Add to .env:`);
      console.log(`  ${envPrefix}_GATEWAY=${gatewayAddress}`);
      if (wrappedTokenAddress) {
        console.log(`  ${envPrefix}_WRAPPED_TOKEN=${wrappedTokenAddress}`);
      }

    } catch (error) {
      console.error(`  ✗ Failed on ${chainKey}:`, error.message);
      results.gateways[chainKey] = { error: error.message };
    }
  }

  // Set up remote gateway connections
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`Setting up remote gateway connections...`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

  for (const [chainKey, result] of Object.entries(results.gateways)) {
    if (result.error) continue;

    try {
      const provider = new ethers.JsonRpcProvider(CHAINS[chainKey].rpcUrl);
      const deployer = new ethers.Wallet(normalizedKey, provider);
      const artifact = getArtifact('FluxaGateway');
      const gateway = new ethers.Contract(result.gatewayAddress, artifact.abi, deployer);

      // Set remote gateways
      for (const [remoteKey, remoteResult] of Object.entries(results.gateways)) {
        if (remoteKey === chainKey || remoteResult.error) continue;

        const remoteChainId = CHAINS[remoteKey].chainId;
        const setRemoteTx = await gateway.setRemoteGateway(remoteChainId, remoteResult.gatewayAddress);
        await setRemoteTx.wait();
        console.log(`  ✓ ${chainKey} → ${remoteKey} connection set`);
      }
    } catch (error) {
      console.error(`  ✗ Failed to set connections for ${chainKey}:`, error.message);
    }
  }

  // Save results
  const resultsPath = path.join(__dirname, '../deployment-results-gateways.json');
  fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));
  console.log(`\n✓ Results saved to: ${resultsPath}`);

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('📋 SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════\n');
  
  for (const [chainKey, result] of Object.entries(results.gateways)) {
    if (result.error) {
      console.log(`❌ ${chainKey}: ${result.error}`);
    } else {
      console.log(`✅ ${chainKey}: ${result.gatewayAddress}`);
      if (result.wrappedTokenAddress) {
        console.log(`   WrappedToken: ${result.wrappedTokenAddress}`);
      }
    }
  }
}

main()
  .then(() => {
    console.log('\n✓ Gateway deployment complete!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n✗ Gateway deployment failed:', error);
    process.exit(1);
  });

