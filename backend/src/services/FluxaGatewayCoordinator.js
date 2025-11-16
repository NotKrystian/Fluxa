/**
 * FluxaGateway Coordinator Service (Simplified for Hackathon - "Shake" Version)
 * 
 * Acts as trusted intermediary/relay for cross-chain token transfers between Arc and Base.
 * Uses the contract's built-in queue mechanism ("shake") instead of event monitoring.
 * 
 * Flow:
 * 1. User deposits/burns tokens on-chain, which adds to the contract's pending queue
 * 2. Backend periodically "shakes" the contracts to get ready items (sorted by priority fee)
 * 3. Backend processes the highest priority items first
 * 4. Backend marks items as processed in the contract
 * 
 * Benefits:
 * - No event filters that expire
 * - No rate limit issues from eth_getLogs
 * - Priority fee system built-in
 * - Much simpler logic
 */

import { ethers } from 'ethers';

export class FluxaGatewayCoordinator {
  constructor() {
    // Private key for backend relay wallet
    this.privateKey = process.env.GATEWAY_PRIVATE_KEY || process.env.PRIVATE_KEY || process.env.CCTP_PRIVATE_KEY;
    
    if (!this.privateKey) {
      console.warn('⚠️  GATEWAY_PRIVATE_KEY not set - Gateway operations will fail');
    } else {
      const wallet = new ethers.Wallet(this.privateKey);
      this.coordinatorAddress = wallet.address;
      console.log(`✓ Gateway Coordinator Wallet: ${this.coordinatorAddress}`);
    }

    // Chain IDs
    this.chainIds = {
      arc: 5042002,
      base: 84532
    };

    // RPC URLs
    this.rpcUrls = {
      arc: process.env.ARC_RPC_URL || 'https://hidden-cosmological-thunder.arc-testnet.quiknode.pro/e18d2b4649fda2fd51ef9f5a2c1d7d8fd132c886',
      base: process.env.BASE_SEPOLIA_RPC_URL || process.env.BASE_RPC_URL || 'https://sepolia.base.org'
    };

    // Gateway ABI with "shake" functions
    this.gatewayAbi = [
      // Queue query functions
      'function processPendingDepositsInfo() external view returns (uint256[] memory readyIndices, uint32[] memory sourceChains, address[] memory recipients, uint256[] memory amounts, uint256[] memory nonces, uint256[] memory priorityFees)',
      'function processPendingBurnsInfo() external view returns (uint256[] memory readyIndices, uint32[] memory destChains, address[] memory recipients, uint256[] memory amounts, uint256[] memory nonces, uint256[] memory priorityFees)',
      'function markDepositsProcessed(uint256[] calldata indices) external',
      'function markBurnsProcessed(uint256[] calldata indices) external',
      // Processing functions
      'function mintWrapped(uint32 sourceChain, address recipient, uint256 amount, uint256 nonce) external',
      'function releaseTokens(uint32 destChain, address recipient, uint256 amount, uint256 nonce) external',
      // View functions
      'function getTotalLocked() external view returns (uint256)',
      'function getTotalWrapped(uint32 sourceChain) external view returns (uint256)',
      'function isNonceProcessed(uint32 sourceChain, uint256 nonce) external view returns (bool)',
      'function coordinator() external view returns (address)',
      'function getPendingDepositsCount() external view returns (uint256)',
      'function getPendingBurnsCount() external view returns (uint256)',
      'function getAccumulatedFees() external view returns (uint256)'
    ];

    // Polling intervals
    this.shakeIntervalMs = 30000; // Check every 30 seconds
    this.maxProcessPerShake = 5; // Process up to 5 items per shake
  }

  /**
   * Get provider for a chain
   */
  getProvider(chain) {
    const rpcUrl = this.rpcUrls[chain];
    if (!rpcUrl) {
      throw new Error(`No RPC URL configured for ${chain}`);
    }
    return new ethers.JsonRpcProvider(rpcUrl);
  }

  /**
   * Get signer for a chain
   */
  getSigner(chain) {
    if (!this.privateKey) {
      throw new Error('GATEWAY_PRIVATE_KEY not configured');
    }
    const provider = this.getProvider(chain);
    return new ethers.Wallet(this.privateKey, provider);
  }

  /**
   * Start monitoring and processing queues
   * @param {string} arcGatewayAddress Gateway address on Arc (origin)
   * @param {string} destChain Destination chain name (e.g., 'base')
   * @param {string} destGatewayAddress Gateway address on destination chain
   */
  async startMonitoring(arcGatewayAddress, destChain, destGatewayAddress) {
    console.log(`\n[Gateway Coordinator] Starting "shake" monitoring...`);
    console.log(`  Arc Gateway: ${arcGatewayAddress}`);
    console.log(`  ${destChain} Gateway: ${destGatewayAddress}`);
    console.log(`  Shake interval: ${this.shakeIntervalMs}ms`);
    console.log(`  Max items per shake: ${this.maxProcessPerShake}`);

    const arcProvider = this.getProvider('arc');
    const destProvider = this.getProvider(destChain);

    const arcSigner = this.getSigner('arc');
    const destSigner = this.getSigner(destChain);

    const arcGateway = new ethers.Contract(arcGatewayAddress, this.gatewayAbi, arcSigner);
    const destGateway = new ethers.Contract(destGatewayAddress, this.gatewayAbi, destSigner);

    console.log(`\n✓ Connected to gateways`);
    console.log(`  Arc provider: ${arcProvider._getConnection().url.substring(0, 50)}...`);
    console.log(`  ${destChain} provider: ${destProvider._getConnection().url.substring(0, 50)}...`);

    // Shake Arc deposits (Arc → Base minting)
    const shakeArcDeposits = async () => {
      try {
        console.log(`\n[Shake Arc] 🔍 Checking pending deposits on Arc...`);
    
        // Get ready items (sorted by priority fee)
        const result = await arcGateway.processPendingDepositsInfo();
        const [readyIndices, sourceChains, recipients, amounts, nonces, priorityFees] = result;
        
        if (readyIndices.length === 0) {
          console.log(`[Shake Arc] No pending deposits ready`);
          return;
        }

        console.log(`[Shake Arc] Found ${readyIndices.length} ready deposit(s)`);
    
        // Process up to maxProcessPerShake items (highest priority first)
        const itemsToProcess = Math.min(readyIndices.length, this.maxProcessPerShake);
        const processedIndices = [];
        
        for (let i = 0; i < itemsToProcess; i++) {
          const idx = readyIndices[i];
          const recipient = recipients[i];
          const amount = amounts[i];
          const nonce = nonces[i];
          const priorityFee = priorityFees[i];
          
          console.log(`\n[Shake Arc] Processing deposit #${i + 1}/${itemsToProcess}`);
          console.log(`  Priority Fee: ${ethers.formatUnits(priorityFee, 18)} FLX`);
          console.log(`  Amount: ${ethers.formatUnits(amount, 18)} FLX`);
          console.log(`  Recipient: ${recipient}`);
          console.log(`  Nonce: ${nonce.toString()}`);
          
          try {
            // Check if already processed on destination
            const isProcessed = await destGateway.isNonceProcessed(this.chainIds.arc, nonce);
            if (isProcessed) {
              console.log(`  ⚠️  Already processed on ${destChain}, marking as complete`);
              processedIndices.push(idx);
              continue;
            }

            // Mint wrapped tokens on destination
            console.log(`  Minting wFLX on ${destChain}...`);
            const mintTx = await destGateway.mintWrapped(
              this.chainIds.arc,
              recipient,
              amount,
              nonce
            );
            console.log(`    TX: ${mintTx.hash}`);
            await mintTx.wait();
            console.log(`    ✅ Minted!`);
            
            processedIndices.push(idx);
      } catch (error) {
            console.error(`  ❌ Error processing deposit:`, error.message);
            // Don't mark as processed if it failed
          }
          
          // Delay between items to avoid rate limits
          if (i < itemsToProcess - 1) {
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
        }
        
        // Mark processed items in the contract
        if (processedIndices.length > 0) {
          console.log(`\n[Shake Arc] Marking ${processedIndices.length} deposit(s) as processed...`);
          try {
            const markTx = await arcGateway.markDepositsProcessed(processedIndices);
            await markTx.wait();
            console.log(`✅ Marked deposits as processed`);
          } catch (error) {
            console.error(`❌ Error marking deposits:`, error.message);
          }
        }
        
      } catch (err) {
        console.error('[Shake Arc] Error:', err.message);
      }
    };

    // Shake Base burns (Base → Arc releasing)
    const shakeBaseBurns = async () => {
      try {
        console.log(`\n[Shake ${destChain}] 🔍 Checking pending burns on ${destChain}...`);

        // Get ready items (sorted by priority fee)
        const result = await destGateway.processPendingBurnsInfo();
        const [readyIndices, destChains, recipients, amounts, nonces, priorityFees] = result;
        
        if (readyIndices.length === 0) {
          console.log(`[Shake ${destChain}] No pending burns ready`);
          return;
        }

        console.log(`[Shake ${destChain}] Found ${readyIndices.length} ready burn(s)`);

        // Process up to maxProcessPerShake items (highest priority first)
        const itemsToProcess = Math.min(readyIndices.length, this.maxProcessPerShake);
        const processedIndices = [];
        
        for (let i = 0; i < itemsToProcess; i++) {
          const idx = readyIndices[i];
          const recipient = recipients[i];
          const amount = amounts[i];
          const nonce = nonces[i];
          const priorityFee = priorityFees[i];
          const destChainId = destChains[i];
          
          console.log(`\n[Shake ${destChain}] Processing burn #${i + 1}/${itemsToProcess}`);
          console.log(`  Priority Fee: ${ethers.formatUnits(priorityFee, 18)} wFLX`);
          console.log(`  Amount: ${ethers.formatUnits(amount, 18)} wFLX`);
          console.log(`  Recipient: ${recipient}`);
    console.log(`  Nonce: ${nonce.toString()}`);

          try {
            // Check if already processed on Arc
            const isProcessed = await arcGateway.isNonceProcessed(destChainId, nonce);
            if (isProcessed) {
              console.log(`  ⚠️  Already processed on Arc, marking as complete`);
              processedIndices.push(idx);
              continue;
            }

            // Release tokens on Arc
            console.log(`  Releasing FLX on Arc...`);
            const releaseTx = await arcGateway.releaseTokens(
              destChainId,
              recipient,
              amount,
              nonce
            );
            console.log(`    TX: ${releaseTx.hash}`);
            await releaseTx.wait();
            console.log(`    ✅ Released!`);
            
            processedIndices.push(idx);
          } catch (error) {
            console.error(`  ❌ Error processing burn:`, error.message);
            // Don't mark as processed if it failed
          }
          
          // Delay between items to avoid rate limits
          if (i < itemsToProcess - 1) {
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
        }
        
        // Mark processed items in the contract
        if (processedIndices.length > 0) {
          console.log(`\n[Shake ${destChain}] Marking ${processedIndices.length} burn(s) as processed...`);
          try {
            const markTx = await destGateway.markBurnsProcessed(processedIndices);
            await markTx.wait();
            console.log(`✅ Marked burns as processed`);
          } catch (error) {
            console.error(`❌ Error marking burns:`, error.message);
          }
        }
        
      } catch (err) {
        console.error(`[Shake ${destChain}] Error:`, err.message);
      }
    };

    // Start shaking Arc deposits immediately, then every interval
    shakeArcDeposits();
    setInterval(shakeArcDeposits, this.shakeIntervalMs);
    
    // Start shaking Base burns after a 15-second stagger
    setTimeout(() => {
      shakeBaseBurns();
      setInterval(shakeBaseBurns, this.shakeIntervalMs);
    }, 15000);

    console.log(`\n✅ Shake monitoring started!`);
    console.log(`   Arc deposits: shake every ${this.shakeIntervalMs / 1000}s`);
    console.log(`   ${destChain} burns: shake every ${this.shakeIntervalMs / 1000}s (staggered by 15s)`);
  }
}
