/**
 * Modular Gateway-Based LP Deployment Script
 * 
 * Deploys complete multi-chain LP system using Circle Gateway and CCTP:
 * Step 1: Deploy contracts (TokenRegistry, Vaults, AMM Factory)
 * Step 2: Gateway transfers (deposit tokens, withdraw wrapped tokens on all chains)
 * Step 3: CCTP transfers (distribute USDC equally across all chains)
 * Step 4: LP formation (create equal LP pools on all chains)
 * 
 * Supported chains: Arc, Base Sepolia, Polygon Amoy
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
  arc: {
    name: "Arc Testnet",
    rpcUrl: process.env.ARC_RPC_URL || "https://hidden-cosmological-thunder.arc-testnet.quiknode.pro/e18d2b4649fda2fd51ef9f5a2c1d7d8fd132c886",
    chainId: 5042002,
    usdc: process.env.ARC_USDC_ADDRESS || "0x3600000000000000000000000000000000000000",
    explorer: "https://testnet.arcscan.net"
  },
  base: {
    name: "Base Sepolia",
    rpcUrl: process.env.BASE_SEPOLIA_RPC_URL || process.env.BASE_RPC_URL || "https://sepolia.base.org",
    chainId: 84532,
    usdc: process.env.BASE_SEPOLIA_USDC_ADDRESS || "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    explorer: "https://sepolia.basescan.org"
  },
  'polygon-amoy': {
    name: "Polygon Amoy",
    rpcUrl: process.env.POLYGON_AMOY_RPC_URL || process.env.POLYGON_RPC_URL || "https://rpc-amoy.polygon.technology",
    chainId: 80002,
    usdc: process.env.POLYGON_AMOY_USDC_ADDRESS || process.env.POLYGON_USDC_ADDRESS || "0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582",
    explorer: "https://amoy.polygonscan.com"
  }
};

// Deployment configuration
const DEPLOYMENT_CONFIG = {
  tokenAddress: process.env.DEPLOY_TOKEN_ADDRESS, // Token address on Arc (source chain)
  tokenAmount: process.env.DEPLOY_TOKEN_AMOUNT || "1000000000000000000000", // Total tokens to distribute (18 decimals)
  usdcAmount: process.env.DEPLOY_USDC_AMOUNT || "1000000000", // Total USDC to distribute (6 decimals)
  depositor: process.env.DEPLOYER_ADDRESS, // Address that will deposit tokens/USDC
  recipient: process.env.RECIPIENT_ADDRESS || process.env.DEPLOYER_ADDRESS, // Address receiving wrapped tokens
  destinationChains: ['base', 'polygon-amoy'] // Chains to distribute to (excluding Arc)
};

class GatewayLPDeployer {
  constructor() {
    this.results = {
      step1_contracts: {},
      step2_gateway: {},
      step3_cctp: {},
      step4_lp: {}
    };
    this.deployedContracts = {}; // Store deployed contract addresses per chain
    this.wrappedTokenAddresses = {}; // Store wrapped token addresses per chain (from Gateway)
    
    // Rate limiting: QuickNode has 15 requests/second limit
    // Add delays to avoid hitting rate limits
    this.RATE_LIMIT_DELAY = 2000; // 2 seconds between operations
    this.POST_DEPLOY_DELAY = 3000; // 3 seconds after deployment (waitForDeployment polls frequently)
    this.POST_TX_DELAY = 2000; // 2 seconds after transaction confirmation
  }

  /**
   * Sleep helper with rate limiting
   */
  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Wait for deployment with rate limiting
   */
  async waitForDeploymentWithDelay(contract, name) {
    await this.sleep(this.RATE_LIMIT_DELAY); // Delay before
    await contract.waitForDeployment();
    await this.sleep(this.POST_DEPLOY_DELAY); // Delay after (waitForDeployment polls frequently)
    console.log(`  ✓ ${name} deployment confirmed`);
  }

  /**
   * Wait for transaction with rate limiting
   */
  async waitForTransactionWithDelay(tx, name) {
    await this.sleep(this.RATE_LIMIT_DELAY); // Delay before
    const receipt = await tx.wait();
    await this.sleep(this.POST_TX_DELAY); // Delay after
    console.log(`  ✓ ${name} transaction confirmed`);
    return receipt;
  }

  /**
   * Get contract artifact
   */
  getArtifact(contractName) {
    const artifactPath = path.join(__dirname, "..", "artifacts", "core", `${contractName}.sol`, `${contractName}.json`);
    if (!fs.existsSync(artifactPath)) {
      throw new Error(`Artifact not found: ${artifactPath}`);
    }
    return JSON.parse(fs.readFileSync(artifactPath, "utf8"));
  }

  /**
   * Step 1: Deploy contracts on all chains
   */
  async deployContracts() {
    console.log("\n=== STEP 1: DEPLOYING CONTRACTS ===\n");
    
    for (const [chainKey, chainConfig] of Object.entries(CHAINS)) {
      console.log(`\n${"=".repeat(60)}`);
      console.log(`Deploying contracts on ${chainConfig.name}...`);
      console.log(`${"=".repeat(60)}\n`);
      
      try {
        // Validate and normalize private key
        if (!process.env.PRIVATE_KEY) {
          throw new Error(`PRIVATE_KEY not set in .env file. Please add your wallet private key.`);
        }
        
        // Normalize private key (ensure it has 0x prefix if needed)
        let privateKey = process.env.PRIVATE_KEY.trim();
        if (!privateKey.startsWith('0x')) {
          privateKey = '0x' + privateKey;
        }
        
        // Validate private key format (should be 66 characters with 0x prefix = 64 hex chars)
        if (privateKey.length !== 66) {
          throw new Error(`Invalid private key format. Expected 64 hex characters (with optional 0x prefix). Got ${privateKey.length - 2} characters.`);
        }
        
        const provider = new ethers.JsonRpcProvider(chainConfig.rpcUrl);
        let deployer;
        try {
          deployer = new ethers.Wallet(privateKey, provider);
        } catch (error) {
          throw new Error(`Invalid private key: ${error.message}. Please check your PRIVATE_KEY in .env file.`);
        }
        
        const balance = await provider.getBalance(deployer.address);
        const nativeCurrency = chainKey === 'arc' ? 'USDC' : 'ETH';
        console.log(`Deployer: ${deployer.address}`);
        console.log(`Balance: ${ethers.formatEther(balance)} ${nativeCurrency}\n`);
        
        if (balance === 0n) {
          console.error(`  ✗ No ${nativeCurrency} balance - cannot deploy`);
          this.results.step1_contracts[chainKey] = {
            status: 'failed',
            error: `No ${nativeCurrency} balance`
          };
          continue;
        }

        // Verify USDC address
        if (!chainConfig.usdc || chainConfig.usdc === '' || chainConfig.usdc === '0x0000000000000000000000000000000000000000') {
          throw new Error(`USDC address not configured for ${chainConfig.name}. Please set USDC address in .env (e.g., ${chainKey.toUpperCase()}_USDC_ADDRESS or BASE_SEPOLIA_USDC_ADDRESS)`);
        }
        
        // Ensure address is valid hex format
        if (!ethers.isAddress(chainConfig.usdc)) {
          throw new Error(`Invalid USDC address format for ${chainConfig.name}: ${chainConfig.usdc}`);
        }

        console.log(`  Using USDC address: ${chainConfig.usdc}`);

        const artifacts = {
          MockERC20: this.getArtifact("MockERC20"),
          VaultFactory: this.getArtifact("VaultFactory"),
          LiquidityVault: this.getArtifact("LiquidityVault"),
          ArcAMMFactory: this.getArtifact("ArcAMMFactory"),
          ArcAMMPool: this.getArtifact("ArcAMMPool"),
          ArcMetaRouter: this.getArtifact("ArcMetaRouter")
        };

        const chainResults = {};

        // Deploy Project Token (FLX) - only on Arc (source chain)
        // On other chains, the token will be wrapped via Gateway
        let projectTokenAddress;
        if (chainKey === 'arc') {
          console.log("Deploying Project Token (FLX) on Arc...");
          await this.sleep(this.RATE_LIMIT_DELAY); // Rate limit protection
          const TokenFactory = new ethers.ContractFactory(
            artifacts.MockERC20.abi,
            artifacts.MockERC20.bytecode,
            deployer
          );
          const projectToken = await TokenFactory.deploy("Fluxa Token", "FLX", 18);
          await this.waitForDeploymentWithDelay(projectToken, "Project Token (FLX)");
          projectTokenAddress = await projectToken.getAddress();
          chainResults.projectToken = projectTokenAddress;
        } else {
          // On destination chains, we'll get the wrapped token address from Gateway
          // For now, we'll need to query it after Gateway distribution
          console.log("  ⏳ Project token will be wrapped via Gateway");
          projectTokenAddress = null; // Will be set after Gateway distribution
        }

        // Deploy VaultFactory
        console.log("\nDeploying VaultFactory...");
        await this.sleep(this.RATE_LIMIT_DELAY); // Rate limit protection
        const swapFeeBps = 30; // 0.30% swap fee
        const VaultFactoryContract = new ethers.ContractFactory(
          artifacts.VaultFactory.abi,
          artifacts.VaultFactory.bytecode,
          deployer
        );
        const vaultFactory = await VaultFactoryContract.deploy(
          chainConfig.usdc,
          deployer.address, // governance
          swapFeeBps
        );
        await this.waitForDeploymentWithDelay(vaultFactory, "VaultFactory");
        const vaultFactoryAddress = await vaultFactory.getAddress();
        chainResults.vaultFactory = vaultFactoryAddress;

        // Create Vault for FLX token (only if we have the token address)
        let vaultAddress = null;
        if (projectTokenAddress) {
          console.log("\nCreating FLX Liquidity Vault...");
          await this.sleep(this.RATE_LIMIT_DELAY); // Rate limit protection
          const createTx = await vaultFactory.createVault(
            projectTokenAddress,
            "Fluxa Vault Shares",
            "vFLX"
          );
          await this.waitForTransactionWithDelay(createTx, "FLX Vault creation");
          vaultAddress = await vaultFactory.getVault(projectTokenAddress);
          chainResults.vault = vaultAddress;
        }

        // Deploy ArcAMMFactory
        console.log("\nDeploying ArcAMMFactory...");
        await this.sleep(this.RATE_LIMIT_DELAY); // Rate limit protection
        const AMMFactory = new ethers.ContractFactory(
          artifacts.ArcAMMFactory.abi,
          artifacts.ArcAMMFactory.bytecode,
          deployer
        );
        const ammFactory = await AMMFactory.deploy(
          deployer.address, // feeToSetter
          30,               // 0.30% swap fee
          0                 // no protocol fee
        );
        await this.waitForDeploymentWithDelay(ammFactory, "ArcAMMFactory");
        const ammFactoryAddress = await ammFactory.getAddress();
        chainResults.ammFactory = ammFactoryAddress;

        // Deploy ArcMetaRouter
        console.log("\nDeploying ArcMetaRouter...");
        await this.sleep(this.RATE_LIMIT_DELAY); // Rate limit protection
        
        // Get and validate USDC address
        const usdcAddr = chainConfig.usdc;
        
        // Validate USDC address is set and valid
        if (!usdcAddr) {
          throw new Error(`USDC address not set for ${chainConfig.name}. Check .env file for ${chainKey.toUpperCase()}_USDC_ADDRESS or BASE_SEPOLIA_USDC_ADDRESS`);
        }
        
        // Convert to address format and validate
        let usdcAddress;
        try {
          usdcAddress = ethers.getAddress(usdcAddr); // Normalizes address (checksum)
        } catch (error) {
          throw new Error(`Invalid USDC address format for ${chainConfig.name}: ${usdcAddr}. Error: ${error.message}`);
        }
        
        // Final check - ensure it's not zero address
        if (usdcAddress === ethers.ZeroAddress || usdcAddress === '0x0000000000000000000000000000000000000000') {
          throw new Error(`USDC address cannot be zero address for ${chainConfig.name}. Please set a valid USDC address in .env`);
        }
        
        console.log(`  USDC address: ${usdcAddress}`);
        console.log(`  EURC address: ${usdcAddress} (NOTE: Not using EURC, using USDC address for both)`);
        console.log(`  Fee collector: ${deployer.address}`);
        
        const RouterFactory = new ethers.ContractFactory(
          artifacts.ArcMetaRouter.abi,
          artifacts.ArcMetaRouter.bytecode,
          deployer
        );
        const router = await RouterFactory.deploy(
          usdcAddress,        // usdc
          usdcAddress,        // eurc - NOT using EURC, using USDC address for both (contract requires non-zero)
          ethers.ZeroAddress, // tokenMessenger (will be set later)
          ethers.ZeroAddress, // gatewayWallet (will be set later)
          0,                  // 0% protocol fee
          deployer.address    // feeCollector
        );
        await this.waitForDeploymentWithDelay(router, "ArcMetaRouter");
        const routerAddress = await router.getAddress();
        chainResults.router = routerAddress;

        // Link AMM Factory to Router
        console.log("\nLinking AMM Factory to Router...");
        await this.sleep(this.RATE_LIMIT_DELAY); // Rate limit protection
        const routerContract = new ethers.Contract(routerAddress, artifacts.ArcMetaRouter.abi, deployer);
        const linkTx = await routerContract.setAMMFactory(ammFactoryAddress);
        await this.waitForTransactionWithDelay(linkTx, "AMM Factory link");

        this.deployedContracts[chainKey] = chainResults;
        this.results.step1_contracts[chainKey] = {
          status: 'success',
          chain: chainConfig.name,
          contracts: chainResults
        };
        
        console.log(`\n✅ All contracts deployed on ${chainConfig.name}`);
      } catch (error) {
        console.error(`  ✗ Failed to deploy contracts on ${chainConfig.name}:`, error.message);
        this.results.step1_contracts[chainKey] = {
          status: 'failed',
          error: error.message
        };
      }
    }
    
    return this.results.step1_contracts;
  }

  /**
   * Step 2: Gateway transfers - distribute wrapped tokens
   */
  async distributeTokensViaGateway() {
    console.log("\n=== STEP 2: GATEWAY TOKEN DISTRIBUTION ===\n");
    
    if (!DEPLOYMENT_CONFIG.tokenAddress) {
      console.error("  ✗ DEPLOY_TOKEN_ADDRESS not configured in .env");
      console.error("  ⚠️  This step requires a deployed FLX token address on Arc.");
      console.error("  💡 To fix:");
      console.error("     1. Deploy FLX token on Arc (or use existing address)");
      console.error("     2. Set DEPLOY_TOKEN_ADDRESS=<token_address> in .env");
      console.error("     3. Re-run this script");
      return { status: 'skipped', error: 'Token address not configured' };
    }
    
    if (!DEPLOYMENT_CONFIG.depositor) {
      console.error("  ✗ DEPLOYER_ADDRESS not configured in .env");
      console.error("  💡 Set DEPLOYER_ADDRESS=<your_wallet_address> in .env");
      return { status: 'skipped', error: 'Depositor address not configured' };
    }
    
    try {
      const axios = (await import('axios')).default;
      const backendUrl = process.env.BACKEND_URL || 'http://localhost:3001';
      
      // Check if backend is running
      try {
        await axios.get(`${backendUrl}/health`, { timeout: 3000 });
      } catch (error) {
        console.error(`  ✗ Backend server not reachable at ${backendUrl}`);
        console.error("  💡 Make sure the backend is running:");
        console.error("     cd backend && npm start");
        throw new Error(`Backend server not running at ${backendUrl}`);
      }
      
      console.log(`Calling backend API: ${backendUrl}/api/gateway/distribute`);
      console.log(`  Source: arc`);
      console.log(`  Token: ${DEPLOYMENT_CONFIG.tokenAddress}`);
      console.log(`  Amount: ${DEPLOYMENT_CONFIG.tokenAmount}`);
      console.log(`  Destinations: ${DEPLOYMENT_CONFIG.destinationChains.join(', ')}`);
      console.log(`  Depositor: ${DEPLOYMENT_CONFIG.depositor}`);
      
      const response = await axios.post(`${backendUrl}/api/gateway/distribute`, {
        sourceChain: 'arc',
        tokenAddress: DEPLOYMENT_CONFIG.tokenAddress,
        amount: DEPLOYMENT_CONFIG.tokenAmount,
        destinationChains: DEPLOYMENT_CONFIG.destinationChains,
        depositor: DEPLOYMENT_CONFIG.depositor,
        recipient: DEPLOYMENT_CONFIG.recipient
      });
      
      if (response.data.success) {
        console.log("  ✓ Gateway distribution successful");
        console.log(`  Deposit ID: ${response.data.data.deposit?.id || response.data.data.deposit?.txHash || 'N/A'}`);
        console.log(`  Withdrawals: ${Object.keys(response.data.data.withdrawals || {}).length} successful`);
        if (Object.keys(response.data.data.errors || {}).length > 0) {
          console.log(`  Errors: ${Object.keys(response.data.data.errors).join(', ')}`);
        }
        
        // Store wrapped token addresses from Gateway withdrawals
        // Note: Gateway creates wrapped tokens on destination chains
        // The wrapped token address is typically the same as source token if already deployed,
        // or a new wrapped token created by Gateway
        // For now, we'll use the source token address as a placeholder
        // In production, you'd query Gateway API or check withdrawal transactions for actual wrapped token addresses
        const sourceTokenAddress = DEPLOYMENT_CONFIG.tokenAddress;
        for (const destChain of DEPLOYMENT_CONFIG.destinationChains) {
          if (response.data.data.withdrawals?.[destChain]) {
            // Store source token address as wrapped token address (Gateway may create new wrapped tokens)
            // TODO: Query Gateway API or withdrawal transaction to get actual wrapped token address
            this.wrappedTokenAddresses[destChain] = sourceTokenAddress;
            console.log(`  Stored wrapped token address for ${destChain}: ${sourceTokenAddress} (may need to query Gateway for actual address)`);
          }
        }
        
        this.results.step2_gateway = response.data.data;
        return response.data.data;
      } else {
        throw new Error(response.data.error || 'Gateway distribution failed');
      }
    } catch (error) {
      console.error(`  ✗ Gateway distribution failed:`, error.message);
      if (error.response) {
        console.error(`  Backend response:`, error.response.data);
      }
      if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
        console.error("  💡 Make sure the backend server is running:");
        console.error("     cd backend && npm start");
      }
      this.results.step2_gateway = { status: 'failed', error: error.message };
      throw error;
    }
  }

  /**
   * Step 3: CCTP transfers - distribute USDC equally
   */
  async distributeUSDCViaCCTP() {
    console.log("\n=== STEP 3: CCTP USDC DISTRIBUTION ===\n");
    
    if (!DEPLOYMENT_CONFIG.usdcAmount || BigInt(DEPLOYMENT_CONFIG.usdcAmount) === 0n) {
      console.log("  ⚠️  USDC amount not configured, skipping CCTP distribution");
      return { status: 'skipped' };
    }
    
    const totalUSDC = BigInt(DEPLOYMENT_CONFIG.usdcAmount);
    const numChains = DEPLOYMENT_CONFIG.destinationChains.length;
    const usdcPerChain = (totalUSDC / BigInt(numChains)).toString();
    
    console.log(`Distributing USDC equally across ${numChains} chains:`);
    console.log(`  Total USDC: ${DEPLOYMENT_CONFIG.usdcAmount} (${(Number(totalUSDC) / 1e6).toFixed(6)} USDC)`);
    console.log(`  Per chain: ${usdcPerChain} (${(Number(usdcPerChain) / 1e6).toFixed(6)} USDC)`);
    
    const results = {};
    
    try {
      const axios = (await import('axios')).default;
      const backendUrl = process.env.BACKEND_URL || 'http://localhost:3001';
      
      // Check if backend is running
      try {
        await axios.get(`${backendUrl}/health`, { timeout: 3000 });
      } catch (error) {
        console.error(`  ✗ Backend server not reachable at ${backendUrl}`);
        console.error("  💡 Make sure the backend is running:");
        console.error("     cd backend && npm start");
        throw new Error(`Backend server not running at ${backendUrl}`);
      }
      
      for (const destChain of DEPLOYMENT_CONFIG.destinationChains) {
        console.log(`\n  Transferring ${(Number(usdcPerChain) / 1e6).toFixed(6)} USDC to ${destChain}...`);
        
        try {
          const response = await axios.post(`${backendUrl}/api/cctp/create-transfer`, {
            sourceChain: 'arc',
            destinationChain: destChain,
            amount: usdcPerChain,
            recipient: DEPLOYMENT_CONFIG.recipient,
            useFastAttestation: true
          }, {
            timeout: 30000 // 30 second timeout
          });
          
          if (response.data.success) {
            const transferId = response.data.data.transferId;
            console.log(`    ✓ CCTP transfer created: ${transferId}`);
            console.log(`    Wallet address: ${response.data.data.walletAddress}`);
            console.log(`    ⚠️  IMPORTANT: Send ${(Number(usdcPerChain) / 1e6).toFixed(6)} USDC to ${response.data.data.walletAddress} on Arc`);
            console.log(`    ⚠️  Then execute the transfer using: POST ${backendUrl}/api/cctp/execute/${transferId}`);
            results[destChain] = {
              status: 'created',
              transferId: transferId,
              walletAddress: response.data.data.walletAddress,
              amount: usdcPerChain
            };
          } else {
            throw new Error(response.data.error || 'CCTP transfer creation failed');
          }
        } catch (error) {
          console.error(`    ✗ CCTP transfer to ${destChain} failed:`, error.message);
          if (error.response) {
            console.error(`    Backend response:`, error.response.data);
          }
          if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
            console.error(`    💡 Make sure the backend server is running: cd backend && npm start`);
          }
          results[destChain] = {
            status: 'failed',
            error: error.message
          };
        }
      }
      
      this.results.step3_cctp = results;
      return results;
    } catch (error) {
      console.error(`  ✗ CCTP distribution failed:`, error.message);
      this.results.step3_cctp = { status: 'failed', error: error.message };
      throw error;
    }
  }

  /**
   * Step 4: Form LP pools on all chains
   */
  async formLPPools() {
    console.log("\n=== STEP 4: LP POOL FORMATION ===\n");
    
    // Calculate amounts per chain (including Arc)
    const numChains = DEPLOYMENT_CONFIG.destinationChains.length + 1; // +1 for Arc
    const tokenAmountPerChain = (BigInt(DEPLOYMENT_CONFIG.tokenAmount) / BigInt(numChains)).toString();
    const usdcAmountPerChain = (BigInt(DEPLOYMENT_CONFIG.usdcAmount) / BigInt(numChains)).toString();
    
    console.log(`Creating equal LP pools on all chains:`);
    console.log(`  Token per pool: ${tokenAmountPerChain} (${ethers.formatUnits(tokenAmountPerChain, 18)} FLX)`);
    console.log(`  USDC per pool: ${usdcAmountPerChain} (${ethers.formatUnits(usdcAmountPerChain, 6)} USDC)`);
    console.log(`  Total chains: ${numChains} (Arc + ${DEPLOYMENT_CONFIG.destinationChains.length} destinations)\n`);
    
    const results = {};
    
    for (const [chainKey, chainConfig] of Object.entries(CHAINS)) {
      console.log(`\n${"=".repeat(60)}`);
      console.log(`Creating LP pool on ${chainConfig.name}...`);
      console.log(`${"=".repeat(60)}\n`);
      
      try {
        // Validate and normalize private key
        if (!process.env.PRIVATE_KEY) {
          throw new Error(`PRIVATE_KEY not set in .env file. Please add your wallet private key.`);
        }
        
        // Normalize private key (ensure it has 0x prefix if needed)
        let privateKey = process.env.PRIVATE_KEY.trim();
        if (!privateKey.startsWith('0x')) {
          privateKey = '0x' + privateKey;
        }
        
        // Validate private key format
        if (privateKey.length !== 66) {
          throw new Error(`Invalid private key format. Expected 64 hex characters (with optional 0x prefix). Got ${privateKey.length - 2} characters.`);
        }
        
        const provider = new ethers.JsonRpcProvider(chainConfig.rpcUrl);
        let deployer;
        try {
          deployer = new ethers.Wallet(privateKey, provider);
        } catch (error) {
          throw new Error(`Invalid private key: ${error.message}. Please check your PRIVATE_KEY in .env file.`);
        }
        
        const chainContracts = this.deployedContracts[chainKey];
        if (!chainContracts || !chainContracts.ammFactory) {
          throw new Error(`Contracts not deployed on ${chainConfig.name}. Run Step 1 first.`);
        }

        const artifacts = {
          ArcAMMFactory: this.getArtifact("ArcAMMFactory"),
          ArcAMMPool: this.getArtifact("ArcAMMPool"),
          MockERC20: this.getArtifact("MockERC20")
        };

        // Get token address
        // On Arc: use deployed project token
        // On other chains: use wrapped token from Gateway
        let tokenAddress;
        if (chainKey === 'arc') {
          tokenAddress = chainContracts.projectToken;
          if (!tokenAddress) {
            throw new Error(`Project token not deployed on Arc. Run Step 1 first.`);
          }
        } else {
          // For destination chains, get wrapped token address from Gateway distribution
          tokenAddress = this.wrappedTokenAddresses[chainKey];
          if (!tokenAddress) {
            console.log(`  ⚠️  Wrapped token address not found for ${chainConfig.name}`);
            console.log(`  ⚠️  This should be obtained from Gateway distribution (Step 2)`);
            console.log(`  ⚠️  Attempting to use source token address as fallback...`);
            
            // Fallback: use source token address (Gateway may use same address if token already exists)
            tokenAddress = DEPLOYMENT_CONFIG.tokenAddress;
            console.log(`  ⚠️  Using fallback token address: ${tokenAddress}`);
            console.log(`  ⚠️  Note: This may not be correct if Gateway created a new wrapped token`);
          }
          
          // Verify token exists on this chain
          try {
            const tokenContract = new ethers.Contract(tokenAddress, [
              'function balanceOf(address) view returns (uint256)',
              'function symbol() view returns (string)'
            ], provider);
            const balance = await tokenContract.balanceOf(deployer.address);
            const symbol = await tokenContract.symbol();
            console.log(`  ✓ Token verified on ${chainConfig.name}: ${symbol}, balance: ${ethers.formatUnits(balance, 18)}`);
          } catch (error) {
            throw new Error(`Token ${tokenAddress} not found or invalid on ${chainConfig.name}. Error: ${error.message}`);
          }
        }

        const ammFactory = new ethers.Contract(
          chainContracts.ammFactory,
          artifacts.ArcAMMFactory.abi,
          deployer
        );

        // Check if pool already exists
        await this.sleep(this.RATE_LIMIT_DELAY); // Rate limit protection
        const existingPool = await ammFactory.getPool(tokenAddress, chainConfig.usdc);
        if (existingPool && existingPool !== ethers.ZeroAddress) {
          console.log(`  ⚠️  Pool already exists: ${existingPool}`);
          console.log(`  ⚠️  Skipping pool creation, will add liquidity to existing pool`);
        } else {
          // Create pool
          console.log(`Creating AMM pool for FLX/USDC...`);
          await this.sleep(this.RATE_LIMIT_DELAY); // Rate limit protection
          const createTx = await ammFactory.createPair(tokenAddress, chainConfig.usdc);
          await this.waitForTransactionWithDelay(createTx, "Pool creation");
        }

        await this.sleep(this.RATE_LIMIT_DELAY); // Rate limit protection
        const poolAddress = await ammFactory.getPool(tokenAddress, chainConfig.usdc);
        if (!poolAddress || poolAddress === ethers.ZeroAddress) {
          throw new Error(`Pool address is zero after creation`);
        }
        console.log(`  ✓ Pool address: ${poolAddress}`);

        const pool = new ethers.Contract(poolAddress, artifacts.ArcAMMPool.abi, deployer);
        const [token0, token1] = await pool.getTokens();
        console.log(`  Token0: ${token0}`);
        console.log(`  Token1: ${token1}`);

        // Get token contracts
        const tokenContract = new ethers.Contract(tokenAddress, artifacts.MockERC20.abi, deployer);
        const usdcContract = new ethers.Contract(chainConfig.usdc, [
          'function approve(address spender, uint256 amount) returns (bool)',
          'function balanceOf(address account) view returns (uint256)',
          'function decimals() view returns (uint8)'
        ], deployer);

        // Check balances
        await this.sleep(this.RATE_LIMIT_DELAY); // Rate limit protection
        const tokenBalance = await tokenContract.balanceOf(deployer.address);
        await this.sleep(this.RATE_LIMIT_DELAY); // Rate limit protection
        const usdcBalance = await usdcContract.balanceOf(deployer.address);
        
        console.log(`\nChecking balances:`);
        console.log(`  FLX balance: ${ethers.formatUnits(tokenBalance, 18)} FLX`);
        console.log(`  USDC balance: ${ethers.formatUnits(usdcBalance, 6)} USDC`);

        // Check if we have enough tokens
        if (tokenBalance < BigInt(tokenAmountPerChain)) {
          throw new Error(`Insufficient FLX balance. Need ${ethers.formatUnits(tokenAmountPerChain, 18)}, have ${ethers.formatUnits(tokenBalance, 18)}`);
        }
        if (usdcBalance < BigInt(usdcAmountPerChain)) {
          throw new Error(`Insufficient USDC balance. Need ${ethers.formatUnits(usdcAmountPerChain, 6)}, have ${ethers.formatUnits(usdcBalance, 6)}`);
        }

        // Approve tokens
        console.log(`\nApproving tokens for pool...`);
        await this.sleep(this.RATE_LIMIT_DELAY); // Rate limit protection
        const tokenApproveTx = await tokenContract.approve(poolAddress, tokenAmountPerChain);
        await this.waitForTransactionWithDelay(tokenApproveTx, "FLX approval");

        await this.sleep(this.RATE_LIMIT_DELAY); // Rate limit protection
        const usdcApproveTx = await usdcContract.approve(poolAddress, usdcAmountPerChain);
        await this.waitForTransactionWithDelay(usdcApproveTx, "USDC approval");

        // Add liquidity
        console.log(`\nAdding liquidity to pool...`);
        console.log(`  FLX: ${ethers.formatUnits(tokenAmountPerChain, 18)}`);
        console.log(`  USDC: ${ethers.formatUnits(usdcAmountPerChain, 6)}`);

        await this.sleep(this.RATE_LIMIT_DELAY); // Rate limit protection
        const addLiqTx = await pool.addLiquidity(
          tokenAmountPerChain,  // amount0Desired
          usdcAmountPerChain,    // amount1Desired
          tokenAmountPerChain,   // amount0Min (no slippage protection for initial liquidity)
          usdcAmountPerChain,    // amount1Min
          deployer.address       // to
        );
        const addLiqReceipt = await this.waitForTransactionWithDelay(addLiqTx, "Liquidity addition");
        console.log(`  Gas used: ${addLiqReceipt.gasUsed.toString()}`);

        // Check reserves
        await this.sleep(this.RATE_LIMIT_DELAY); // Rate limit protection
        const reserves = await pool.getReserves();
        console.log(`\nPool reserves:`);
        console.log(`  Reserve0: ${reserves[0].toString()}`);
        console.log(`  Reserve1: ${reserves[1].toString()}`);

        results[chainKey] = {
          status: 'success',
          poolAddress: poolAddress,
          token0: token0,
          token1: token1,
          reserves: {
            reserve0: reserves[0].toString(),
            reserve1: reserves[1].toString()
          }
        };

        console.log(`\n✅ LP pool created and funded on ${chainConfig.name}`);
      } catch (error) {
        console.error(`  ✗ Failed to create LP pool on ${chainConfig.name}:`, error.message);
        results[chainKey] = {
          status: 'failed',
          error: error.message
        };
      }
    }
    
    this.results.step4_lp = results;
    return results;
  }

  /**
   * Run complete deployment process
   */
  async deploy() {
    console.log("\n" + "=".repeat(60));
    console.log("GATEWAY-BASED MULTI-CHAIN LP DEPLOYMENT");
    console.log("=".repeat(60));
    
    try {
      // Step 1: Deploy contracts
      await this.deployContracts();
      
      // Step 2: Gateway transfers
      await this.distributeTokensViaGateway();
      
      // Step 3: CCTP transfers
      await this.distributeUSDCViaCCTP();
      
      // Step 4: Form LP pools
      await this.formLPPools();
      
      console.log("\n" + "=".repeat(60));
      console.log("DEPLOYMENT COMPLETE");
      console.log("=".repeat(60));
      console.log("\nResults:", JSON.stringify(this.results, null, 2));
      
      return this.results;
    } catch (error) {
      console.error("\n✗ Deployment failed:", error);
      throw error;
    }
  }
}

// Run deployment if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const deployer = new GatewayLPDeployer();
  deployer.deploy().catch(console.error);
}

export default GatewayLPDeployer;

