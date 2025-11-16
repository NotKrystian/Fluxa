/**
 * CCTP Aggregator Service
 * Handles USDC bridging between chains for vault liquidity aggregation
 * Uses wallet: 0x418611a31f73ff9ae33cd7ba7fec85def2f47541
 */

import { ethers } from 'ethers';

export class CCTPAggregator {
  constructor() {
    this.address = process.env.CCTP_WALLET_ADDRESS || '0x418611a31f73ff9ae33cd7ba7fec85def2f47541';
    this.privateKey = process.env.CCTP_PRIVATE_KEY;
    
    if (!this.privateKey) {
      console.warn('⚠️  CCTP_PRIVATE_KEY not found in .env');
    }

    // Initialize providers and wallets
    this.providers = {};
    this.wallets = {};
    
    this.initializeChains();
    
    console.log(`[CCTP Aggregator] Initialized`);
    console.log(`  Wallet Address: ${this.address}`);
  }

  initializeChains() {
    // Arc Testnet
    if (process.env.ARC_RPC_URL && this.privateKey) {
      this.providers.arc = new ethers.JsonRpcProvider(process.env.ARC_RPC_URL);
      this.wallets.arc = new ethers.Wallet(this.privateKey, this.providers.arc);
      console.log(`  ✓ Arc connected`);
    }

    // Base Sepolia
    if (process.env.BASE_SEPOLIA_RPC_URL && this.privateKey) {
      this.providers.base = new ethers.JsonRpcProvider(process.env.BASE_SEPOLIA_RPC_URL);
      this.wallets.base = new ethers.Wallet(this.privateKey, this.providers.base);
      console.log(`  ✓ Base Sepolia connected`);
    }
  }

  /**
   * Bridge USDC from one chain to another
   * @param {string} sourceChain - Source chain ('arc' or 'base')
   * @param {string} destChain - Destination chain ('arc' or 'base')
   * @param {string} amount - Amount in USDC (with decimals)
   * @param {string} recipient - Recipient address (usually gateway)
   * @returns {Promise<Object>} Bridge result with tx hash
   */
  async bridgeUSDC(sourceChain, destChain, amount, recipient) {
    console.log(`\n[CCTP Aggregator] Bridging USDC`);
    console.log(`  From: ${sourceChain}`);
    console.log(`  To: ${destChain}`);
    console.log(`  Amount: ${ethers.formatUnits(amount, 6)} USDC`);
    console.log(`  Recipient: ${recipient}`);

    if (!this.providers[sourceChain]) {
      throw new Error(`Source chain ${sourceChain} not configured`);
    }

    if (!this.providers[destChain]) {
      throw new Error(`Destination chain ${destChain} not configured`);
    }

    try {
      const sourceWallet = this.wallets[sourceChain];
      const usdcAddress = this.getUSDCAddress(sourceChain);
      const tokenMessengerAddress = this.getTokenMessengerAddress(sourceChain);

      // Step 1: Approve USDC
      console.log(`  [1/2] Approving USDC...`);
      const usdcContract = new ethers.Contract(
        usdcAddress,
        ['function approve(address spender, uint256 amount) returns (bool)'],
        sourceWallet
      );

      const approveTx = await usdcContract.approve(tokenMessengerAddress, amount);
      await approveTx.wait();
      console.log(`  ✓ Approved: ${approveTx.hash}`);

      // Step 2: Burn USDC (initiates CCTP bridge)
      console.log(`  [2/2] Burning USDC on ${sourceChain}...`);
      
      const tokenMessengerContract = new ethers.Contract(
        tokenMessengerAddress,
        [
          'function depositForBurn(uint256 amount, uint32 destinationDomain, bytes32 mintRecipient, address burnToken) returns (uint64)'
        ],
        sourceWallet
      );

      const destinationDomain = this.getDomain(destChain);
      const mintRecipient = ethers.zeroPadValue(recipient, 32); // Convert to bytes32

      const burnTx = await tokenMessengerContract.depositForBurn(
        amount,
        destinationDomain,
        mintRecipient,
        usdcAddress
      );
      
      await burnTx.wait();
      console.log(`  ✓ Burned: ${burnTx.hash}`);
      console.log(`  ⏳ CCTP attestation will take ~20-60 seconds`);
      console.log(`  ⏳ USDC will be minted to ${recipient} on ${destChain}`);

      return {
        success: true,
        burnTxHash: burnTx.hash,
        amount: ethers.formatUnits(amount, 6),
        sourceChain,
        destChain,
        recipient
      };

    } catch (error) {
      console.error(`[CCTP Aggregator] Error:`, error.message);
      throw error;
    }
  }

  /**
   * Monitor for incoming USDC transfers and auto-bridge
   * This would listen for USDC transfers to the aggregator wallet
   * and automatically bridge them to the destination chain
   */
  async startMonitoring() {
    console.log(`\n[CCTP Aggregator] Starting monitoring...`);
    console.log(`  Watching for USDC transfers to: ${this.address}`);
    
    // For hackathon: simplified monitoring
    // In production: would use event listeners for Transfer events
    // to this.address and auto-bridge to destination
    
    console.log(`  ℹ️  Auto-bridging not implemented yet`);
    console.log(`  ℹ️  Use bridgeUSDC() manually for now`);
  }

  /**
   * Get USDC token address for a chain
   */
  getUSDCAddress(chain) {
    const addresses = {
      'arc': process.env.ARC_USDC || '0x3600000000000000000000000000000000000000',
      'base': process.env.BASE_USDC || '0x036CbD53842c5426634e7929541eC2318f3dCF7e'
    };
    return addresses[chain];
  }

  /**
   * Get TokenMessenger contract address for CCTP
   */
  getTokenMessengerAddress(chain) {
    const addresses = {
      'arc': process.env.ARC_TOKEN_MESSENGER || '0x0000000000000000000000000000000000000000',
      'base': '0x9f3B8679c73C2Fef8b59B4f3444d4e156fb70AA5' // Base Sepolia TokenMessenger
    };
    return addresses[chain];
  }

  /**
   * Get CCTP domain ID for a chain
   */
  getDomain(chain) {
    const domains = {
      'arc': 7, // Placeholder - need actual Arc domain
      'base': 6 // Base Sepolia domain
    };
    return domains[chain];
  }

  /**
   * Get USDC balance of aggregator wallet
   */
  async getBalance(chain) {
    if (!this.providers[chain]) {
      throw new Error(`Chain ${chain} not configured`);
    }

    const usdcAddress = this.getUSDCAddress(chain);
    const usdcContract = new ethers.Contract(
      usdcAddress,
      ['function balanceOf(address) view returns (uint256)'],
      this.providers[chain]
    );

    const balance = await usdcContract.balanceOf(this.address);
    return balance;
  }
}

export default CCTPAggregator;

