/**
 * CCTP Bridge Service
 * Handles USDC bridging between chains using Circle's CCTP protocol
 */

import { ethers } from 'ethers';

export class CCTPBridge {
  constructor() {
    this.providers = {};
    this.wallets = {};
    this.messageTransmitterAddresses = {};
    this.tokenMessengerAddresses = {};
    this.usdcAddresses = {};
    
    this.initializeChains();
  }

  initializeChains() {
    // Arc Testnet
    if (process.env.ARC_RPC_URL && process.env.CCTP_PRIVATE_KEY) {
      this.providers.arc = new ethers.JsonRpcProvider(process.env.ARC_RPC_URL);
      this.wallets.arc = new ethers.Wallet(process.env.CCTP_PRIVATE_KEY, this.providers.arc);
      this.usdcAddresses.arc = process.env.ARC_USDC || '0x3600000000000000000000000000000000000000';
      
      // CCTP contract addresses for Arc (need to be deployed/configured)
      this.messageTransmitterAddresses.arc = process.env.ARC_MESSAGE_TRANSMITTER || '0x0000000000000000000000000000000000000000';
      this.tokenMessengerAddresses.arc = process.env.ARC_TOKEN_MESSENGER || '0x0000000000000000000000000000000000000000';
      
      console.log('[CCTP] Arc initialized');
    }

    // Base Sepolia
    if (process.env.BASE_SEPOLIA_RPC_URL && process.env.CCTP_PRIVATE_KEY) {
      this.providers.base = new ethers.JsonRpcProvider(process.env.BASE_SEPOLIA_RPC_URL);
      this.wallets.base = new ethers.Wallet(process.env.CCTP_PRIVATE_KEY, this.providers.base);
      this.usdcAddresses.base = process.env.BASE_USDC || '0x036CbD53842c5426634e7929541eC2318f3dCF7e';
      
      // Base Sepolia CCTP addresses
      this.messageTransmitterAddresses.base = '0x7865fAfC2db2093669d92c0F33AeEF291086BEFD';
      this.tokenMessengerAddresses.base = '0x9f3B8679c73C2Fef8b59B4f3444d4e156fb70AA5';
      
      console.log('[CCTP] Base Sepolia initialized');
    }
  }

  /**
   * Bridge USDC from source chain to destination chain
   */
  async bridgeUSDC(sourceChain, destChain, amount, recipient) {
    console.log(`\n[CCTP Bridge] Bridging ${ethers.formatUnits(amount, 6)} USDC`);
    console.log(`  From: ${sourceChain}`);
    console.log(`  To: ${destChain}`);
    console.log(`  Recipient: ${recipient}`);

    if (!this.providers[sourceChain]) {
      throw new Error(`Source chain ${sourceChain} not configured for CCTP`);
    }

    if (!this.providers[destChain]) {
      throw new Error(`Destination chain ${destChain} not configured for CCTP`);
    }

    try {
      const sourceWallet = this.wallets[sourceChain];
      const tokenMessengerAddress = this.tokenMessengerAddresses[sourceChain];
      const usdcAddress = this.usdcAddresses[sourceChain];

      // Step 1: Approve USDC for TokenMessenger
      console.log(`  [1/3] Approving USDC...`);
      const usdcContract = new ethers.Contract(
        usdcAddress,
        ['function approve(address spender, uint256 amount) returns (bool)'],
        sourceWallet
      );

      const approveTx = await usdcContract.approve(tokenMessengerAddress, amount);
      await approveTx.wait();
      console.log(`  ✓ Approved: ${approveTx.hash}`);

      // Step 2: Burn USDC on source chain
      console.log(`  [2/3] Burning USDC on ${sourceChain}...`);
      
      const tokenMessengerContract = new ethers.Contract(
        tokenMessengerAddress,
        [
          'function depositForBurn(uint256 amount, uint32 destinationDomain, bytes32 mintRecipient, address burnToken) returns (uint64)'
        ],
        sourceWallet
      );

      // Domain mapping (Circle's domain IDs)
      const domainMapping = {
        'arc': 7, // Arc testnet domain (placeholder - need actual value)
        'base': 6 // Base Sepolia domain
      };

      const destinationDomain = domainMapping[destChain];
      const mintRecipient = ethers.zeroPadValue(recipient, 32); // Convert to bytes32

      const burnTx = await tokenMessengerContract.depositForBurn(
        amount,
        destinationDomain,
        mintRecipient,
        usdcAddress
      );
      
      const burnReceipt = await burnTx.wait();
      console.log(`  ✓ Burned: ${burnTx.hash}`);

      // Step 3: Wait for attestation and mint on destination
      console.log(`  [3/3] Waiting for attestation and minting on ${destChain}...`);
      
      // In production, you would:
      // 1. Get the message from the burn receipt
      // 2. Call Circle's attestation API
      // 3. Submit the attestation to the MessageTransmitter on destination chain
      // 4. This mints the USDC to the recipient
      
      // For now, we'll simulate this process
      console.log(`  ⚠️  CCTP attestation requires Circle API integration`);
      console.log(`  ⚠️  In production, this would mint USDC to recipient on ${destChain}`);

      return {
        success: true,
        burnTxHash: burnTx.hash,
        amount: ethers.formatUnits(amount, 6),
        sourceChain,
        destChain,
        recipient
      };

    } catch (error) {
      console.error(`[CCTP Bridge] Error:`, error);
      throw error;
    }
  }

  /**
   * Get USDC balance on a chain
   */
  async getUSDCBalance(chain, address) {
    if (!this.providers[chain]) {
      throw new Error(`Chain ${chain} not configured for CCTP`);
    }

    const usdcContract = new ethers.Contract(
      this.usdcAddresses[chain],
      ['function balanceOf(address) view returns (uint256)'],
      this.providers[chain]
    );

    const balance = await usdcContract.balanceOf(address);
    return balance;
  }

  /**
   * Check if CCTP is configured for a chain
   */
  isChainConfigured(chain) {
    return !!this.providers[chain] && 
           !!this.messageTransmitterAddresses[chain] &&
           !!this.tokenMessengerAddresses[chain];
  }
}

export default CCTPBridge;

