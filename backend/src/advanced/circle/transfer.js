// Wraps Circle’s transfer primitives for backend use.

import { ethers } from 'ethers';
import axios from 'axios';

export class CircleTransfer {
  constructor() {
    this.apiUrl = 'https://iris-api-sandbox.circle.com';
    
    this.tokenMessengers = {
      ethereum: '0xBd3fa81B58Ba92a82136038B25aDec7066af3155',
      base: '0xBd3fa81B58Ba92a82136038B25aDec7066af3155',
      arbitrum: '0xBd3fa81B58Ba92a82136038B25aDec7066af3155',
      arc: process.env.ARC_TOKEN_MESSENGER
    };

    this.messageTransmitters = {
      ethereum: '0x26413e8157CD32011E726065a5462e97dD4d03D9',
      base: '0x26413e8157CD32011E726065a5462e97dD4d03D9',
      arbitrum: '0x26413e8157CD32011E726065a5462e97dD4d03D9',
      arc: process.env.ARC_MESSAGE_TRANSMITTER
    };

    this.usdcAddresses = {
      ethereum: '0x07865c6E87B9F70255377e024ace6630C1Eaa37F',
      base: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
      arbitrum: '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d',
      arc: process.env.ARC_USDC_ADDRESS || '0x3600000000000000000000000000000000000000'
    };

    this.domains = {
      ethereum: 0,
      base: 6,
      arbitrum: 3,
      arc: 999
    };
  }

  async initiateBurn(options) {
    const { sourceChain, destinationChain, amount, recipient, signer } = options;
    
    try {
      const tokenMessengerAddress = this.tokenMessengers[sourceChain];
      const usdcAddress = this.usdcAddresses[sourceChain];
      const destinationDomain = this.domains[destinationChain];

      const tokenMessengerABI = [
        'function depositForBurn(uint256 amount, uint32 destinationDomain, bytes32 mintRecipient, address burnToken) external returns (uint64)'
      ];

      const tokenMessenger = new ethers.Contract(tokenMessengerAddress, tokenMessengerABI, signer);
      const usdc = new ethers.Contract(
        usdcAddress,
        ['function approve(address spender, uint256 amount) external returns (bool)'],
        signer
      );

      const approveTx = await usdc.approve(tokenMessengerAddress, amount);
      await approveTx.wait();

      const mintRecipient = '0x' + recipient.slice(2).padStart(64, '0');
      const burnTx = await tokenMessenger.depositForBurn(amount, destinationDomain, mintRecipient, usdcAddress);
      const receipt = await burnTx.wait();

      return {
        success: true,
        txHash: receipt.hash,
        sourceChain,
        destinationChain,
        amount: amount.toString(),
        status: 'pending_attestation'
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async waitForAttestation(txHash, useFastAttestation = true, maxWaitSeconds = 120) {
    const attestationUrl = `${this.apiUrl}/attestations/${txHash}`;
    const pollInterval = useFastAttestation ? 2000 : 15000;
    const maxAttempts = Math.floor((maxWaitSeconds * 1000) / pollInterval);
    const startTime = Date.now();

    for (let i = 0; i < maxAttempts; i++) {
      try {
        const response = await axios.get(attestationUrl, { timeout: 5000 });
        if (response.data.status === 'complete') {
          const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
          return {
            success: true,
            attestation: response.data.attestation,
            message: response.data.message,
            elapsed,
            fast: useFastAttestation
          };
        }
        await new Promise(resolve => setTimeout(resolve, pollInterval));
      } catch (error) {
        if (i === maxAttempts - 1) {
          return { success: false, error: 'Attestation timeout' };
        }
        await new Promise(resolve => setTimeout(resolve, pollInterval));
      }
    }
    return { success: false, error: 'Attestation timeout' };
  }

  async completeMint(options) {
    const { destinationChain, attestation, message, signer } = options;
    
    try {
      const messageTransmitterAddress = this.messageTransmitters[destinationChain];
      const messageTransmitterABI = [
        'function receiveMessage(bytes memory message, bytes memory attestation) external returns (bool)'
      ];

      const messageTransmitter = new ethers.Contract(messageTransmitterAddress, messageTransmitterABI, signer);
      const mintTx = await messageTransmitter.receiveMessage(message, attestation);
      const receipt = await mintTx.wait();

      return {
        success: true,
        txHash: receipt.hash,
        destinationChain,
        status: 'complete'
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async executeFullTransfer(options) {
    const { sourceChain, destinationChain, amount, recipient, sourceSigner, destinationSigner, useFastAttestation = true } = options;

    const burnResult = await this.initiateBurn({
      sourceChain, destinationChain, amount, recipient, signer: sourceSigner
    });

    if (!burnResult.success) {
      return { success: false, stage: 'burn', error: burnResult.error };
    }

    const attestationResult = await this.waitForAttestation(burnResult.txHash, useFastAttestation);

    if (!attestationResult.success) {
      return { success: false, stage: 'attestation', error: attestationResult.error, burnTx: burnResult.txHash };
    }

    const mintResult = await this.completeMint({
      destinationChain,
      attestation: attestationResult.attestation,
      message: attestationResult.message,
      signer: destinationSigner
    });

    if (!mintResult.success) {
      return { success: false, stage: 'mint', error: mintResult.error, burnTx: burnResult.txHash };
    }

    return {
      success: true,
      burnTx: burnResult.txHash,
      mintTx: mintResult.txHash,
      attestationTime: attestationResult.elapsed
    };
  }
}

