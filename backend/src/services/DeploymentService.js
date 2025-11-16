/**
 * Deployment Service
 * 
 * Handles multi-chain LP deployment via Gateway and CCTP
 * Can be called from frontend API
 */

import { ethers } from "ethers";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

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
    usdc: process.env.BASE_SEPOLIA_USDC || process.env.BASE_SEPOLIA_USDC_ADDRESS || "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    explorer: "https://sepolia.basescan.org"
  },
  'polygon-amoy': {
    name: "Polygon Amoy",
    rpcUrl: process.env.POLYGON_AMOY_RPC_URL || process.env.POLYGON_RPC_URL || "https://rpc-amoy.polygon.technology",
    chainId: 80002,
    usdc: process.env.POLYGON_AMOY_USDC || process.env.POLYGON_AMOY_USDC_ADDRESS || process.env.POLYGON_USDC_ADDRESS || "0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582",
    explorer: "https://amoy.polygonscan.com"
  },
  'arbitrum-sepolia': {
    name: "Arbitrum Sepolia",
    rpcUrl: process.env.ARBITRUM_SEPOLIA_RPC_URL || process.env.ARBITRUM_RPC_URL || "https://sepolia-rollup.arbitrum.io/rpc",
    chainId: 421614,
    usdc: process.env.ARBITRUM_SEPOLIA_USDC || process.env.ARBITRUM_USDC_ADDRESS || "",
    explorer: "https://sepolia.arbiscan.io"
  },
  'avalanche-fuji': {
    name: "Avalanche Fuji",
    rpcUrl: process.env.AVALANCHE_FUJI_RPC_URL || process.env.AVALANCHE_RPC_URL || "https://api.avax-test.network/ext/bc/C/rpc",
    chainId: 43113,
    usdc: process.env.AVALANCHE_FUJI_USDC || process.env.AVALANCHE_USDC_ADDRESS || "",
    explorer: "https://testnet.snowtrace.io"
  },
  'optimism-sepolia': {
    name: "Optimism Sepolia",
    rpcUrl: process.env.OPTIMISM_SEPOLIA_RPC_URL || process.env.OPTIMISM_RPC_URL || "https://sepolia.optimism.io",
    chainId: 11155420,
    usdc: process.env.OPTIMISM_SEPOLIA_USDC || process.env.OPTIMISM_USDC_ADDRESS || "",
    explorer: "https://sepolia-optimistic.etherscan.io"
  },
  'codex-testnet': {
    name: "Codex Testnet",
    rpcUrl: process.env.CODEX_TESTNET_RPC_URL || process.env.CODEX_RPC_URL || "https://812242.rpc.thirdweb.com",
    chainId: 812242,
    usdc: process.env.CODEX_TESTNET_USDC || process.env.CODEX_USDC_ADDRESS || "",
    explorer: "https://explorer.codex-stg.xyz"
  },
  'unichain-sepolia': {
    name: "Unichain Sepolia",
    rpcUrl: process.env.UNICHAIN_SEPOLIA_RPC_URL || process.env.UNICHAIN_RPC_URL || "",
    chainId: 1301,
    usdc: process.env.UNICHAIN_SEPOLIA_USDC || process.env.UNICHAIN_USDC_ADDRESS || "",
    explorer: ""
  }
};

export class DeploymentService {
  constructor() {
    // Increased delays to avoid QuickNode rate limits (15/second = ~67ms per request)
    // We need to stay well below this, especially since waitForDeployment polls frequently
    this.RATE_LIMIT_DELAY = 5000; // 5 seconds between operations (increased from 3s)
    this.POST_DEPLOY_DELAY = 8000; // 8 seconds after deployment (increased from 5s) - waitForDeployment polls frequently
    this.POST_TX_DELAY = 5000; // 5 seconds after transaction confirmation (increased from 3s)
    this.PRE_WAIT_DELAY = 2000; // 2 seconds before waitForDeployment/waitForTransaction
  }

  /**
   * Sleep helper
   */
  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Wait for deployment with rate limit handling
   */
  async waitForDeploymentWithRetry(contract, maxRetries = 3) {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        // Add delay before waiting to avoid rate limits
        await this.sleep(this.PRE_WAIT_DELAY);
        await contract.waitForDeployment();
        return;
      } catch (error) {
        const isRateLimit = error.message && (
          error.message.includes('rate limit') ||
          error.message.includes('15/second') ||
          error.code === -32007
        );
        
        if (isRateLimit && attempt < maxRetries - 1) {
          const backoffDelay = (attempt + 1) * 5000; // 5s, 10s, 15s
          console.warn(`Rate limit hit, retrying in ${backoffDelay}ms (attempt ${attempt + 1}/${maxRetries})`);
          await this.sleep(backoffDelay);
          continue;
        }
        throw error;
      }
    }
  }

  /**
   * Wait for transaction with rate limit handling
   */
  async waitForTransactionWithRetry(tx, maxRetries = 3) {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        // Add delay before waiting to avoid rate limits
        await this.sleep(this.PRE_WAIT_DELAY);
        await tx.wait();
        return;
      } catch (error) {
        const isRateLimit = error.message && (
          error.message.includes('rate limit') ||
          error.message.includes('15/second') ||
          error.code === -32007
        );
        
        if (isRateLimit && attempt < maxRetries - 1) {
          const backoffDelay = (attempt + 1) * 5000; // 5s, 10s, 15s
          console.warn(`Rate limit hit, retrying in ${backoffDelay}ms (attempt ${attempt + 1}/${maxRetries})`);
          await this.sleep(backoffDelay);
          continue;
        }
        throw error;
      }
    }
  }

  /**
   * Get contract artifact
   */
  getArtifact(contractName) {
    const artifactPath = path.join(__dirname, '../../../artifacts/core', `${contractName}.sol`, `${contractName}.json`);
    if (!fs.existsSync(artifactPath)) {
      throw new Error(`Artifact not found: ${artifactPath}`);
    }
    return JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
  }

  /**
   * Validate and normalize private key
   */
  validatePrivateKey(privateKey) {
    if (!privateKey) {
      throw new Error('PRIVATE_KEY not provided');
    }
    
    let normalized = privateKey.trim();
    if (!normalized.startsWith('0x')) {
      normalized = '0x' + normalized;
    }
    
    if (normalized.length !== 66) {
      throw new Error(`Invalid private key format. Expected 64 hex characters. Got ${normalized.length - 2} characters.`);
    }
    
    return normalized;
  }

  /**
   * Deploy contracts on selected chains
   */
  async deployContracts(config) {
    const { selectedChains, privateKey, tokenAddress } = config;
    const results = {};
    
    const normalizedPrivateKey = this.validatePrivateKey(privateKey);
    
    for (const chainKey of selectedChains) {
      const chainConfig = CHAINS[chainKey];
      if (!chainConfig) {
        throw new Error(`Unsupported chain: ${chainKey}`);
      }
      
      try {
        await this.sleep(this.RATE_LIMIT_DELAY);
        const provider = new ethers.JsonRpcProvider(chainConfig.rpcUrl);
        const deployer = new ethers.Wallet(normalizedPrivateKey, provider);
        
        // Check balance before deploying
        const balance = await provider.getBalance(deployer.address);
        const nativeCurrency = chainKey === 'arc' ? 'USDC' : chainKey === 'base' ? 'ETH' : 'MATIC';
        const balanceFormatted = chainKey === 'arc' 
          ? ethers.formatEther(balance) 
          : ethers.formatEther(balance);
        
        console.log(`[${chainConfig.name}] Deployer balance: ${balanceFormatted} ${nativeCurrency}`);
        
        // Calculate accurate gas estimation based on actual deployment costs
        // Actual Base Sepolia deployment: ~0.0000127 ETH total
        // Gas usage breakdown (from actual deployment):
        // - MockERC20: ~250k gas
        // - VaultFactory: ~275k gas
        // - createVault: ~155k gas
        // - ArcAMMFactory: ~250k gas
        // - ArcMetaRouter: ~275k gas
        // - setAMMFactory: ~155k gas
        // Total: ~1.36M gas
        
        // Get current gas price to calculate accurate cost
        let minRequired;
        try {
          const feeData = await provider.getFeeData();
          let gasPrice;
          
          if (feeData.gasPrice) {
            // Legacy chain
            gasPrice = feeData.gasPrice;
          } else if (feeData.maxFeePerGas) {
            // EIP-1559 chain - use maxFeePerGas for accurate estimate
            gasPrice = feeData.maxFeePerGas;
          } else {
            // Fallback: use a conservative default
            gasPrice = ethers.parseUnits('1', 'gwei');
          }
          
          // Total gas for all deployments: ~1.36M gas
          const totalGas = 1360000n;
          
          // Calculate cost: gas * gasPrice
          const estimatedCost = totalGas * gasPrice;
          
          // Add 20% buffer for safety
          minRequired = (estimatedCost * 120n) / 100n;
          
          // Minimum floor: ensure at least 0.00001 native token
          const minFloor = ethers.parseEther('0.00001');
          if (minRequired < minFloor) {
            minRequired = minFloor;
          }
        } catch (error) {
          // Fallback if gas price fetch fails
          console.warn(`Could not fetch gas price for ${chainKey}, using fallback estimate:`, error.message);
          // Use conservative estimate based on actual Base Sepolia cost
          minRequired = ethers.parseEther('0.00002'); // 0.0000127 * 1.6 buffer
        }
        
        if (balance < minRequired) {
          throw new Error(
            `Insufficient ${nativeCurrency} balance. ` +
            `Have: ${balanceFormatted} ${nativeCurrency}, ` +
            `Need: ~${ethers.formatEther(minRequired)} ${nativeCurrency} for gas fees. ` +
            `Please fund the wallet: ${deployer.address}`
          );
        }
        
        const artifacts = {
          MockERC20: this.getArtifact("MockERC20"),
          VaultFactory: this.getArtifact("VaultFactory"),
          ArcAMMFactory: this.getArtifact("ArcAMMFactory"),
          ArcMetaRouter: this.getArtifact("ArcMetaRouter")
        };
        
        const chainResults = {};
        
        // Deploy Project Token (FLX) - only on Arc
        let projectTokenAddress = tokenAddress;
        if (chainKey === 'arc' && !tokenAddress) {
          // Deploy new token if not provided
          const TokenFactory = new ethers.ContractFactory(
            artifacts.MockERC20.abi,
            artifacts.MockERC20.bytecode,
            deployer
          );
          const projectToken = await TokenFactory.deploy("Fluxa Token", "FLX", 18);
          await this.waitForDeploymentWithRetry(projectToken);
          await this.sleep(this.POST_DEPLOY_DELAY);
          projectTokenAddress = await projectToken.getAddress();
          chainResults.projectToken = projectTokenAddress;
        }
        
        // Deploy ArcMetaRouter
        await this.sleep(this.RATE_LIMIT_DELAY);
        const usdcAddress = ethers.getAddress(chainConfig.usdc);
        const RouterFactory = new ethers.ContractFactory(
          artifacts.ArcMetaRouter.abi,
          artifacts.ArcMetaRouter.bytecode,
          deployer
        );
        const router = await RouterFactory.deploy(
          usdcAddress,
          usdcAddress, // EURC not used, using USDC address
          ethers.ZeroAddress,
          ethers.ZeroAddress,
          0,
          deployer.address
        );
        await this.waitForDeploymentWithRetry(router);
        await this.sleep(this.POST_DEPLOY_DELAY);
        chainResults.router = await router.getAddress();
        
        results[chainKey] = {
          status: 'success',
          contracts: chainResults
        };
      } catch (error) {
        console.error(`[${chainConfig.name}] Deployment failed:`, error.message);
        
        // Provide helpful error messages
        let errorMessage = error.message;
        if (error.message.includes('insufficient funds') || error.code === 'INSUFFICIENT_FUNDS') {
          const nativeCurrency = chainKey === 'arc' ? 'USDC' : chainKey === 'base' ? 'ETH' : 'MATIC';
          errorMessage = `Insufficient ${nativeCurrency} for gas fees. Please fund the deployment wallet with ${nativeCurrency} on ${chainConfig.name}.`;
        } else if (error.message.includes('rate limit') || error.code === -32007) {
          errorMessage = `Rate limit exceeded. Please wait a moment and try again, or upgrade your QuickNode plan.`;
        }
        
        results[chainKey] = {
          status: 'failed',
          error: errorMessage,
          details: error.message
        };
      }
    }
    
    return results;
  }

  /**
   * Get available chains
   */
  getAvailableChains() {
    return Object.entries(CHAINS)
      .filter(([key, config]) => config.rpcUrl) // Only return chains with RPC URLs configured
      .map(([key, config]) => ({
        key,
        name: config.name,
        chainId: config.chainId,
        explorer: config.explorer
      }));
  }
}

