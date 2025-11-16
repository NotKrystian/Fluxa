/**
 * Gateway Bridge Service
 * Handles FLX/wFLX bridging between chains using the FluxaGateway protocol
 */

import { ethers } from 'ethers';

export class GatewayBridge {
  constructor() {
    this.providers = {};
    this.wallets = {};
    this.gatewayAddresses = {};
    this.tokenAddresses = {};
    
    this.initializeChains();
  }

  initializeChains() {
    // Arc Testnet (Origin - real FLX)
    if (process.env.ARC_RPC_URL && process.env.PRIVATE_KEY) {
      this.providers.arc = new ethers.JsonRpcProvider(process.env.ARC_RPC_URL);
      this.wallets.arc = new ethers.Wallet(process.env.PRIVATE_KEY, this.providers.arc);
      this.gatewayAddresses.arc = process.env.ARC_GATEWAY;
      this.tokenAddresses.arc = process.env.ARC_FLX_TOKEN;
      
      console.log('[Gateway Bridge] Arc initialized');
      console.log(`  Gateway: ${this.gatewayAddresses.arc}`);
      console.log(`  Token (FLX): ${this.tokenAddresses.arc}`);
    }

    // Base Sepolia (Destination - wrapped wFLX)
    if (process.env.BASE_SEPOLIA_RPC_URL && process.env.PRIVATE_KEY) {
      this.providers.base = new ethers.JsonRpcProvider(process.env.BASE_SEPOLIA_RPC_URL);
      this.wallets.base = new ethers.Wallet(process.env.PRIVATE_KEY, this.providers.base);
      this.gatewayAddresses.base = process.env.BASE_GATEWAY;
      this.tokenAddresses.base = process.env.BASE_WRAPPED_TOKEN;
      
      console.log('[Gateway Bridge] Base Sepolia initialized');
      console.log(`  Gateway: ${this.gatewayAddresses.base}`);
      console.log(`  Token (wFLX): ${this.tokenAddresses.base}`);
    }
  }

  /**
   * Bridge FLX from Arc to Base (deposit and wrap)
   */
  async bridgeFLXToBase(amount, recipient, priorityFee = 0) {
    console.log(`\n[Gateway Bridge] Bridging FLX to Base`);
    console.log(`  Amount: ${ethers.formatEther(amount)} FLX`);
    console.log(`  Recipient: ${recipient}`);
    console.log(`  Priority Fee: ${ethers.formatEther(priorityFee)} FLX`);

    if (!this.gatewayAddresses.arc || !this.gatewayAddresses.base) {
      throw new Error('Gateway not configured for Arc or Base');
    }

    try {
      const arcWallet = this.wallets.arc;
      const arcGatewayAddress = this.gatewayAddresses.arc;
      const flxTokenAddress = this.tokenAddresses.arc;

      // Gateway ABI
      const gatewayAbi = [
        'function depositForWrap(uint256 amount, uint32 destinationChain, address destinationRecipient, uint256 priorityFee) returns (uint256)',
        'function token() view returns (address)',
        'function isSource() view returns (bool)',
        'event TokenDeposited(address indexed sender, uint256 amount, uint32 sourceChain, uint32 destinationChain, address indexed destinationRecipient, uint256 nonce)'
      ];

      const gatewayContract = new ethers.Contract(
        arcGatewayAddress,
        gatewayAbi,
        arcWallet
      );

      // Step 1: Approve FLX (amount + priority fee)
      console.log(`  [1/2] Approving FLX...`);
      const totalAmount = amount + priorityFee;
      const tokenContract = new ethers.Contract(
        flxTokenAddress,
        ['function approve(address spender, uint256 amount) returns (bool)'],
        arcWallet
      );

      const approveTx = await tokenContract.approve(arcGatewayAddress, totalAmount);
      await approveTx.wait();
      console.log(`  ✓ Approved: ${approveTx.hash}`);

      // Step 2: Deposit for wrap
      console.log(`  [2/2] Depositing FLX on Arc Gateway...`);
      
      const BASE_CHAIN_ID = 84532; // Base Sepolia
      
      const depositTx = await gatewayContract.depositForWrap(
        amount,
        BASE_CHAIN_ID,
        recipient,
        priorityFee
      );

      const depositReceipt = await depositTx.wait();
      console.log(`  ✓ Deposited: ${depositTx.hash}`);

      // Extract nonce from event
      const depositEvent = depositReceipt.logs
        .map(log => {
          try {
            return gatewayContract.interface.parseLog({ topics: log.topics, data: log.data });
          } catch {
            return null;
          }
        })
        .find(event => event && event.name === 'TokenDeposited');

      const nonce = depositEvent ? depositEvent.args.nonce : null;

      console.log(`  ✓ Deposit complete. Nonce: ${nonce}`);
      console.log(`  ⏳ Coordinator will process and mint wFLX on Base...`);

      return {
        success: true,
        depositTxHash: depositTx.hash,
        nonce: nonce ? nonce.toString() : null,
        amount: ethers.formatEther(amount),
        priorityFee: ethers.formatEther(priorityFee),
        sourceChain: 'arc',
        destChain: 'base',
        recipient
      };

    } catch (error) {
      console.error(`[Gateway Bridge] Error bridging FLX to Base:`, error);
      throw error;
    }
  }

  /**
   * Bridge wFLX from Base to Arc (burn and unwrap)
   */
  async bridgeWFLXToArc(amount, recipient, priorityFee = 0) {
    console.log(`\n[Gateway Bridge] Bridging wFLX to Arc`);
    console.log(`  Amount: ${ethers.formatEther(amount)} wFLX`);
    console.log(`  Recipient: ${recipient}`);
    console.log(`  Priority Fee: ${ethers.formatEther(priorityFee)} wFLX`);

    if (!this.gatewayAddresses.base || !this.gatewayAddresses.arc) {
      throw new Error('Gateway not configured for Base or Arc');
    }

    try {
      const baseWallet = this.wallets.base;
      const baseGatewayAddress = this.gatewayAddresses.base;
      const wflxTokenAddress = this.tokenAddresses.base;

      // Gateway ABI
      const gatewayAbi = [
        'function burnForUnwrap(uint256 amount, address recipient, uint256 priorityFee) returns (uint256)',
        'function wrappedToken() view returns (address)',
        'function isSource() view returns (bool)',
        'event TokenBurned(address indexed burner, uint256 amount, address indexed recipient, uint256 nonce)'
      ];

      const gatewayContract = new ethers.Contract(
        baseGatewayAddress,
        gatewayAbi,
        baseWallet
      );

      // Step 1: Approve wFLX (amount + priority fee)
      console.log(`  [1/2] Approving wFLX...`);
      const totalAmount = amount + priorityFee;
      const tokenContract = new ethers.Contract(
        wflxTokenAddress,
        ['function approve(address spender, uint256 amount) returns (bool)'],
        baseWallet
      );

      const approveTx = await tokenContract.approve(baseGatewayAddress, totalAmount);
      await approveTx.wait();
      console.log(`  ✓ Approved: ${approveTx.hash}`);

      // Step 2: Burn for unwrap
      console.log(`  [2/2] Burning wFLX on Base Gateway...`);
      
      const burnTx = await gatewayContract.burnForUnwrap(
        amount,
        recipient,
        priorityFee
      );

      const burnReceipt = await burnTx.wait();
      console.log(`  ✓ Burned: ${burnTx.hash}`);

      // Extract nonce from event
      const burnEvent = burnReceipt.logs
        .map(log => {
          try {
            return gatewayContract.interface.parseLog({ topics: log.topics, data: log.data });
          } catch {
            return null;
          }
        })
        .find(event => event && event.name === 'TokenBurned');

      const nonce = burnEvent ? burnEvent.args.nonce : null;

      console.log(`  ✓ Burn complete. Nonce: ${nonce}`);
      console.log(`  ⏳ Coordinator will process and release FLX on Arc...`);

      return {
        success: true,
        burnTxHash: burnTx.hash,
        nonce: nonce ? nonce.toString() : null,
        amount: ethers.formatEther(amount),
        priorityFee: ethers.formatEther(priorityFee),
        sourceChain: 'base',
        destChain: 'arc',
        recipient
      };

    } catch (error) {
      console.error(`[Gateway Bridge] Error bridging wFLX to Arc:`, error);
      throw error;
    }
  }

  /**
   * Get FLX balance on Arc
   */
  async getFLXBalance(address) {
    if (!this.providers.arc || !this.tokenAddresses.arc) {
      throw new Error('Arc not configured for Gateway');
    }

    const tokenContract = new ethers.Contract(
      this.tokenAddresses.arc,
      ['function balanceOf(address) view returns (uint256)'],
      this.providers.arc
    );

    const balance = await tokenContract.balanceOf(address);
    return balance;
  }

  /**
   * Get wFLX balance on Base
   */
  async getWFLXBalance(address) {
    if (!this.providers.base || !this.tokenAddresses.base) {
      throw new Error('Base not configured for Gateway');
    }

    const tokenContract = new ethers.Contract(
      this.tokenAddresses.base,
      ['function balanceOf(address) view returns (uint256)'],
      this.providers.base
    );

    const balance = await tokenContract.balanceOf(address);
    return balance;
  }

  /**
   * Check if Gateway is configured for a chain
   */
  isChainConfigured(chain) {
    return !!this.providers[chain] && 
           !!this.gatewayAddresses[chain] &&
           !!this.tokenAddresses[chain];
  }
}

export default GatewayBridge;

