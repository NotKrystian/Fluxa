/**
 * Deploy Simplified FluxaGateway contracts for hackathon
 * 
 * Architecture:
 * - Source chains (Base, Polygon, etc.): Deploy Gateway with isSource=true
 * - Arc chain: Deploy Gateway with isSource=false + WrappedToken contracts
 * 
 * Usage:
 * npx hardhat run scripts/deploySimplifiedGateways.js --network base-sepolia
 * npx hardhat run scripts/deploySimplifiedGateways.js --network arc
 */

import hre from "hardhat";
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Chain configurations
const CHAINS = {
  'arc': {
    chainId: 5042002,
    isSource: false, // Arc is destination
    name: 'Arc Testnet'
  },
  'base-sepolia': {
    chainId: 84532,
    isSource: true, // Base is source
    name: 'Base Sepolia'
  },
  'polygon-amoy': {
    chainId: 80002,
    isSource: true, // Polygon is source
    name: 'Polygon Amoy'
  },
  'arbitrum-sepolia': {
    chainId: 421614,
    isSource: true, // Arbitrum is source
    name: 'Arbitrum Sepolia'
  },
  'avalanche-fuji': {
    chainId: 43113,
    isSource: true, // Avalanche is source
    name: 'Avalanche Fuji'
  },
  'optimism-sepolia': {
    chainId: 11155420,
    isSource: true, // Optimism is source
    name: 'Optimism Sepolia'
  }
};

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const network = hre.network.name;
  
  console.log(`\n========================================`);
  console.log(`Deploying Simplified Gateway on ${network}`);
  console.log(`========================================`);
  console.log(`Deployer: ${deployer.address}`);
  
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log(`Balance: ${hre.ethers.formatEther(balance)}`);
  
  const chainConfig = CHAINS[network];
  if (!chainConfig) {
    throw new Error(`Chain ${network} not configured. Available: ${Object.keys(CHAINS).join(', ')}`);
  }
  
  console.log(`\nChain: ${chainConfig.name}`);
  console.log(`Chain ID: ${chainConfig.chainId}`);
  console.log(`Is Source: ${chainConfig.isSource}`);
  
  // Get backend coordinator address from env
  const coordinatorAddress = process.env.GATEWAY_COORDINATOR || process.env.CCTP_PRIVATE_KEY 
    ? new hre.ethers.Wallet(process.env.CCTP_PRIVATE_KEY || process.env.GATEWAY_PRIVATE_KEY || process.env.PRIVATE_KEY).address
    : deployer.address;
  
  console.log(`\nCoordinator: ${coordinatorAddress}`);
  
  const results = {
    network: chainConfig.name,
    chainId: chainConfig.chainId,
    isSource: chainConfig.isSource,
    deployer: deployer.address,
    coordinator: coordinatorAddress,
    timestamp: new Date().toISOString()
  };
  
  if (chainConfig.isSource) {
    // Deploy SOURCE chain gateway
    console.log(`\n[1] Deploying SOURCE Gateway...`);
    
    // Get or deploy test token
    let tokenAddress = process.env[`${network.toUpperCase().replace(/-/g, '_')}_TOKEN`];
    
    if (!tokenAddress) {
      console.log(`  No token configured, deploying MockERC20...`);
      const MockERC20 = await hre.ethers.getContractFactory("MockERC20");
      const token = await MockERC20.deploy("Test Project Token", "FLX", 18);
      await token.waitForDeployment();
      tokenAddress = await token.getAddress();
      console.log(`  ✓ Token deployed: ${tokenAddress}`);
      
      // Mint some tokens to deployer
      const mintTx = await token.mint(deployer.address, hre.ethers.parseEther("1000000"));
      await mintTx.wait();
      console.log(`  ✓ Minted 1,000,000 FLX to deployer`);
      
      results.token = {
        address: tokenAddress,
        name: "Test Project Token",
        symbol: "FLX",
        decimals: 18
      };
    } else {
      console.log(`  Using existing token: ${tokenAddress}`);
      results.token = {
        address: tokenAddress
      };
    }
    
    // Deploy FluxaGateway (source)
    console.log(`\n[2] Deploying FluxaGateway (source)...`);
    const FluxaGateway = await hre.ethers.getContractFactory("FluxaGateway");
    const gateway = await FluxaGateway.deploy(
      tokenAddress,
      true, // isSource
      chainConfig.chainId,
      coordinatorAddress
    );
    await gateway.waitForDeployment();
    const gatewayAddress = await gateway.getAddress();
    console.log(`  ✓ Gateway deployed: ${gatewayAddress}`);
    
    results.gateway = {
      address: gatewayAddress,
      isSource: true,
      token: tokenAddress
    };
    
    console.log(`\n✅ SOURCE chain deployment complete!`);
    console.log(`\nNext steps:`);
    console.log(`1. Set GATEWAY_COORDINATOR=${coordinatorAddress} in .env`);
    console.log(`2. Set ${network.toUpperCase().replace(/-/g, '_')}_GATEWAY=${gatewayAddress} in .env`);
    console.log(`3. Deploy Arc Gateway (if not already deployed)`);
    console.log(`4. Start backend server to monitor deposits`);
    console.log(`5. Test: Call depositForWrap() on source gateway`);
    
  } else {
    // Deploy ARC chain gateway + wrapped tokens
    console.log(`\n[1] Deploying ARC Gateway infrastructure...`);
    
    // For Arc, we need to know which source chains we're supporting
    const sourceChains = ['base-sepolia', 'polygon-amoy']; // Add more as needed
    
    const wrappedTokens = [];
    
    for (const sourceChain of sourceChains) {
      console.log(`\n[*] Setting up for source chain: ${sourceChain}`);
      
      // Get source token address (from env or use default)
      const sourceChainKey = sourceChain.toUpperCase().replace(/-/g, '_');
      const sourceTokenAddress = process.env[`${sourceChainKey}_TOKEN`] || '0x0000000000000000000000000000000000000001';
      
      console.log(`  Source token: ${sourceTokenAddress}`);
      
      // Deploy WrappedToken
      console.log(`  Deploying WrappedToken...`);
      const WrappedToken = await hre.ethers.getContractFactory("WrappedToken");
      const wrappedToken = await WrappedToken.deploy(
        `Wrapped ${sourceChain.toUpperCase()} Token`, // name
        `w${sourceChain.toUpperCase()}`, // symbol
        CHAINS[sourceChain].chainId, // origin chain ID
        sourceTokenAddress // origin token address
      );
      await wrappedToken.waitForDeployment();
      const wrappedTokenAddress = await wrappedToken.getAddress();
      console.log(`  ✓ WrappedToken deployed: ${wrappedTokenAddress}`);
      
      // Deploy FluxaGateway (destination)
      console.log(`  Deploying FluxaGateway (destination)...`);
      const FluxaGateway = await hre.ethers.getContractFactory("FluxaGateway");
      const gateway = await FluxaGateway.deploy(
        wrappedTokenAddress,
        false, // isSource (Arc is destination)
        chainConfig.chainId,
        coordinatorAddress
      );
      await gateway.waitForDeployment();
      const gatewayAddress = await gateway.getAddress();
      console.log(`  ✓ Gateway deployed: ${gatewayAddress}`);
      
      // Set gateway on wrapped token
      console.log(`  Setting gateway on WrappedToken...`);
      const setGatewayTx = await wrappedToken.setGateway(gatewayAddress);
      await setGatewayTx.wait();
      console.log(`  ✓ Gateway set on WrappedToken`);
      
      // Set wrapped token on gateway
      console.log(`  Setting WrappedToken on Gateway...`);
      const setWrappedTx = await gateway.setWrappedToken(wrappedTokenAddress);
      await setWrappedTx.wait();
      console.log(`  ✓ WrappedToken set on Gateway`);
      
      wrappedTokens.push({
        sourceChain,
        sourceChainId: CHAINS[sourceChain].chainId,
        sourceToken: sourceTokenAddress,
        wrappedToken: wrappedTokenAddress,
        gateway: gatewayAddress
      });
    }
    
    results.wrappedTokens = wrappedTokens;
    
    console.log(`\n✅ ARC chain deployment complete!`);
    console.log(`\nDeployed ${wrappedTokens.length} wrapped token systems:`);
    wrappedTokens.forEach(wt => {
      console.log(`\n  ${wt.sourceChain}:`);
      console.log(`    Gateway: ${wt.gateway}`);
      console.log(`    WrappedToken: ${wt.wrappedToken}`);
    });
    
    console.log(`\nNext steps:`);
    console.log(`1. Set GATEWAY_COORDINATOR=${coordinatorAddress} in .env`);
    wrappedTokens.forEach(wt => {
      console.log(`2. Set ARC_GATEWAY_${wt.sourceChain.toUpperCase().replace(/-/g, '_')}=${wt.gateway} in .env`);
    });
    console.log(`3. Fund coordinator wallet on Arc with USDC (for gas)`);
    console.log(`4. Start backend server to process deposits`);
  }
  
  // Save results
  const resultsDir = path.join(__dirname, '..', 'deployment-results');
  if (!fs.existsSync(resultsDir)) {
    fs.mkdirSync(resultsDir, { recursive: true });
  }
  
  const resultsFile = path.join(resultsDir, `gateway-${network}-${Date.now()}.json`);
  fs.writeFileSync(resultsFile, JSON.stringify(results, null, 2));
  console.log(`\n📝 Results saved to: ${resultsFile}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

export default main;

