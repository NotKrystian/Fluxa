/**
 * CCTP Coordinator Service
 * 
 * Orchestrates cross-chain USDC transfers via Circle's Cross-Chain Transfer Protocol.
 * Handles burn, attestation, and mint flows.
 */

import { ethers } from 'ethers';
import axios from 'axios';

export class CCTPCoordinator {
  constructor() {
    this.attestationServiceUrl = 'https://iris-api-sandbox.circle.com';
    
    // CCTP domain IDs
    this.domains = {
      ethereum: 0,
      avalanche: 1,
      optimism: 2,
      arbitrum: 3,
      base: 6,
      polygon: 7,
      arc: 999 // Placeholder - update with actual Arc domain ID when available
    };

    // Token Messenger addresses (testnet)
    this.tokenMessengers = {
      ethereum: '0xBd3fa81B58Ba92a82136038B25aDec7066af3155',
      avalanche: '0xBd3fa81B58Ba92a82136038B25aDec7066af3155',
      base: '0xBd3fa81B58Ba92a82136038B25aDec7066af3155',
      arc: process.env.ARC_TOKEN_MESSENGER || ethers.ZeroAddress
    };

    // USDC addresses (testnet)
    this.usdcAddresses = {
      ethereum: '0x07865c6E87B9F70255377e024ace6630C1Eaa37F',
      base: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
      arc: process.env.ARC_USDC_ADDRESS
    };
  }

  /**
   * Initiate CCTP transfer (burn on source chain)
   * Uses Fast Attestation by default for faster cross-chain transfers
   */
  async initiateTransfer({ sourceChain, amount, destinationChain = 'arc', recipient, useFastAttestation = true }) {
    const transferType = useFastAttestation ? 'FAST' : 'standard';
    console.log(`Initiating CCTP ${transferType} transfer: ${amount} USDC from ${sourceChain} to ${destinationChain}`);

    // Get source chain provider
    const provider = this.getProvider(sourceChain);
    
    if (!provider) {
      throw new Error(`No RPC configured for ${sourceChain}`);
    }
    
    if (this.tokenMessengers[sourceChain] === ethers.ZeroAddress) {
      console.warn(`TokenMessenger not configured for ${sourceChain}, using placeholder`);
      return this.simulateTransfer(sourceChain, amount, destinationChain);
    }

    try {
      // Get signer (you'd need to implement key management)
      // const signer = ...;

      // Get TokenMessenger contract
      const tokenMessenger = new ethers.Contract(
        this.tokenMessengers[sourceChain],
        [
          'function depositForBurn(uint256 amount, uint32 destinationDomain, bytes32 mintRecipient, address burnToken) external returns (uint64)'
        ],
        provider // should be signer
      );

      const destinationDomain = this.domains[destinationChain];
      const mintRecipient = this.addressToBytes32(recipient || ethers.ZeroAddress);

      const tx = await tokenMessenger.depositForBurn(
        amount,
        destinationDomain,
        mintRecipient,
        this.usdcAddresses[sourceChain]
      );

      await tx.wait();

      return {
        txHash: tx.hash,
        sourceChain,
        destinationChain,
        amount,
        status: 'pending_attestation',
        useFastAttestation: useFastAttestation !== false // Default to true
      };
    } catch (error) {
      console.error('CCTP transfer error:', error);
      throw error;
    }
  }

  /**
   * Wait for Circle attestation service to sign the message
   * Uses Fast Attestation - available immediately after transaction confirmation
   * (~20 seconds to 2 minutes instead of ~15 minutes)
   */
  async waitForAttestation(txHash, useFastAttestation = true, maxAttempts = 120) {
    console.log(`Waiting for ${useFastAttestation ? 'FAST' : 'standard'} attestation for tx: ${txHash}`);

    // Fast attestation: poll every 2-3 seconds (available after 2 block confirmations)
    // Standard attestation: poll every 15 seconds (requires more confirmations)
    const pollInterval = useFastAttestation ? 2000 : 15000;
    const timeout = useFastAttestation ? 120000 : 900000; // 2 min vs 15 min

    const startTime = Date.now();

    for (let i = 0; i < maxAttempts; i++) {
      try {
        const response = await axios.get(
          `${this.attestationServiceUrl}/attestations/${txHash}`,
          {
            timeout: 5000 // 5 second timeout per request
          }
        );

        // Check if attestation is ready
        if (response.data.status === 'complete') {
          const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
          console.log(`✓ Attestation received in ${elapsed}s (${useFastAttestation ? 'FAST' : 'standard'})`);
          
          return {
            attestation: response.data.attestation,
            message: response.data.message,
            elapsed: elapsed,
            fast: useFastAttestation
          };
        }

        // Check timeout
        if (Date.now() - startTime > timeout) {
          throw new Error(`Attestation timeout after ${timeout / 1000}s`);
        }

        // Wait before next attempt
        await new Promise(resolve => setTimeout(resolve, pollInterval));
        
        // Log progress for fast attestation
        if (useFastAttestation && i % 10 === 0) {
          const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
          console.log(`  Waiting for fast attestation... ${elapsed}s elapsed`);
        }
      } catch (error) {
        // If it's a timeout error and we haven't exceeded max attempts, continue
        if (error.code === 'ECONNABORTED' && i < maxAttempts - 1) {
          await new Promise(resolve => setTimeout(resolve, pollInterval));
          continue;
        }
        
        if (i === maxAttempts - 1) {
          throw new Error(`Attestation error: ${error.message}`);
        }
      }
    }

    throw new Error('Attestation not received within timeout');
  }

  /**
   * Complete transfer on destination chain (mint)
   */
  async completeTransfer({ attestation, message, destinationChain = 'arc' }) {
    console.log(`Completing CCTP transfer on ${destinationChain}`);

    const provider = this.getProvider(destinationChain);
    
    if (!provider || this.tokenMessengers[destinationChain] === ethers.ZeroAddress) {
      return this.simulateCompletion(destinationChain);
    }

    try {
      // Get MessageTransmitter contract
      const messageTransmitter = new ethers.Contract(
        this.getMessageTransmitterAddress(destinationChain),
        [
          'function receiveMessage(bytes memory message, bytes memory attestation) external'
        ],
        provider // should be signer
      );

      const tx = await messageTransmitter.receiveMessage(message, attestation);
      await tx.wait();

      return {
        txHash: tx.hash,
        status: 'complete'
      };
    } catch (error) {
      console.error('CCTP completion error:', error);
      throw error;
    }
  }

  /**
   * Initiate multiple CCTP transfers in parallel
   */
  async initiateMultipleTransfers(transfers) {
    return Promise.all(
      transfers.map(transfer => this.initiateTransfer(transfer))
    );
  }

  /**
   * Get provider for a chain
   */
  getProvider(chain) {
    const rpcUrls = {
      ethereum: process.env.ETHEREUM_RPC_URL,
      base: process.env.BASE_RPC_URL,
      polygon: process.env.POLYGON_RPC_URL,
      arc: process.env.ARC_RPC_URL
    };

    const url = rpcUrls[chain];
    return url ? new ethers.JsonRpcProvider(url) : null;
  }

  /**
   * Get MessageTransmitter address for a chain
   */
  getMessageTransmitterAddress(chain) {
    const addresses = {
      ethereum: '0x26413e8157CD32011E726065a5462e97dD4d03D9',
      base: '0x26413e8157CD32011E726065a5462e97dD4d03D9',
      arc: process.env.ARC_MESSAGE_TRANSMITTER || ethers.ZeroAddress
    };

    return addresses[chain];
  }

  /**
   * Convert Ethereum address to bytes32 format
   */
  addressToBytes32(address) {
    return '0x' + address.slice(2).padStart(64, '0');
  }

  /**
   * Simulate CCTP transfer for demo purposes
   */
  simulateTransfer(sourceChain, amount, destinationChain) {
    const txHash = '0x' + Math.random().toString(16).slice(2).padStart(64, '0');
    
    console.log(`[SIMULATED] CCTP transfer: ${amount} USDC ${sourceChain} → ${destinationChain}`);
    console.log(`[SIMULATED] TX Hash: ${txHash}`);

    return {
      txHash,
      sourceChain,
      destinationChain,
      amount,
      status: 'simulated_pending',
      simulated: true
    };
  }

  /**
   * Simulate attestation completion
   */
  async simulateCompletion(destinationChain) {
    const txHash = '0x' + Math.random().toString(16).slice(2).padStart(64, '0');
    
    console.log(`[SIMULATED] CCTP completion on ${destinationChain}`);
    console.log(`[SIMULATED] TX Hash: ${txHash}`);

    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 1000));

    return {
      txHash,
      status: 'simulated_complete',
      simulated: true
    };
  }

  /**
   * Get estimated transfer time
   * Uses Fast Attestation by default (available after 2 block confirmations)
   */
  getEstimatedTime(sourceChain, destinationChain, useFastAttestation = true) {
    if (useFastAttestation) {
      // Fast attestation: available after 2 block confirmations
      // Ethereum: ~20 seconds, L2s: ~5-10 seconds, Arc: ~10-15 seconds
      const blockTimes = {
        ethereum: 12,    // 12s per block * 2 = 24s
        base: 2,         // 2s per block * 2 = 4s
        polygon: 2,      // 2s per block * 2 = 4s
        arc: 5,          // ~5s per block * 2 = 10s
        sepolia: 12      // Same as Ethereum
      };
      
      const blockTime = blockTimes[sourceChain] || 5;
      const attestationTime = blockTime * 2 + 10; // 2 blocks + buffer
      
      return {
        attestationTime,      // ~20-30 seconds (fast)
        executionTime: 30,    // 30 seconds for mint execution
        total: attestationTime + 30, // Total ~50-60 seconds
        fast: true
      };
    } else {
      // Standard attestation: requires more confirmations
      return {
        attestationTime: 900, // 15 minutes in seconds
        executionTime: 30,    // 30 seconds for execution
        total: 930,           // Total ~15.5 minutes
        fast: false
      };
    }
  }

  /**
   * Check if CCTP is available for a chain pair
   */
  isAvailable(sourceChain, destinationChain) {
    return (
      this.domains[sourceChain] !== undefined &&
      this.domains[destinationChain] !== undefined &&
      this.usdcAddresses[sourceChain] !== undefined &&
      this.usdcAddresses[destinationChain] !== undefined
    );
  }
}

