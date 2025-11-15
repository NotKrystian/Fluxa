/**
 * Token Registry Service
 * 
 * Interfaces with on-chain TokenRegistry contract to validate cross-chain token operations
 */

import { ethers } from 'ethers';

export class TokenRegistryService {
  constructor() {
    this.registryAddress = process.env.TOKEN_REGISTRY;
    this.arcRpcUrl = process.env.ARC_RPC_URL;
    
    if (!this.registryAddress) {
      console.warn('⚠ TOKEN_REGISTRY not set - registry validation disabled');
      return;
    }

    this.provider = new ethers.JsonRpcProvider(this.arcRpcUrl);
    
    this.abi = [
      'function isTokenRegistered(bytes32 tokenId, uint32 chainId) external view returns (bool)',
      'function getTokenInfo(bytes32 tokenId, uint32 chainId) external view returns (tuple(bool registered, string symbol, string name, uint8 decimals, address vaultAddress))',
      'function getVault(bytes32 tokenId, uint32 chainId) external view returns (address)',
      'function getGatewayWallet(uint32 chainId) external view returns (address)',
      'function getTokenChains(bytes32 tokenId) external view returns (uint32[])',
      'function getAllTokens() external view returns (bytes32[])',
      'function getAllChains() external view returns (uint32[])'
    ];

    this.contract = new ethers.Contract(this.registryAddress, this.abi, this.provider);
    
    console.log('✓ TokenRegistry service initialized:', this.registryAddress);
  }

  /**
   * Check if token is registered on a chain
   */
  async isTokenRegistered(tokenId, chainId) {
    if (!this.contract) return false;

    try {
      return await this.contract.isTokenRegistered(tokenId, chainId);
    } catch (error) {
      console.error(`Error checking token registration:`, error);
      return false;
    }
  }

  /**
   * Get token info from registry
   */
  async getTokenInfo(tokenId, chainId) {
    if (!this.contract) throw new Error('Registry not initialized');

    try {
      const info = await this.contract.getTokenInfo(tokenId, chainId);
      return {
        registered: info.registered,
        symbol: info.symbol,
        name: info.name,
        decimals: info.decimals,
        vaultAddress: info.vaultAddress
      };
    } catch (error) {
      console.error(`Error getting token info:`, error);
      throw error;
    }
  }

  /**
   * Get vault address for a token on a chain
   */
  async getVault(tokenId, chainId) {
    if (!this.contract) throw new Error('Registry not initialized');

    try {
      return await this.contract.getVault(tokenId, chainId);
    } catch (error) {
      console.error(`Error getting vault:`, error);
      throw error;
    }
  }

  /**
   * Get Gateway wallet address for a chain
   */
  async getGatewayWallet(chainId) {
    if (!this.contract) return ethers.ZeroAddress;

    try {
      return await this.contract.getGatewayWallet(chainId);
    } catch (error) {
      console.error(`Error getting gateway wallet:`, error);
      return ethers.ZeroAddress;
    }
  }

  /**
   * Get all chains where a token is registered
   */
  async getTokenChains(tokenId) {
    if (!this.contract) return [];

    try {
      return await this.contract.getTokenChains(tokenId);
    } catch (error) {
      console.error(`Error getting token chains:`, error);
      return [];
    }
  }

  /**
   * Get all registered tokens
   */
  async getAllTokens() {
    if (!this.contract) return [];

    try {
      return await this.contract.getAllTokens();
    } catch (error) {
      console.error(`Error getting all tokens:`, error);
      return [];
    }
  }

  /**
   * Get all registered chains
   */
  async getAllChains() {
    if (!this.contract) return [];

    try {
      const chains = await this.contract.getAllChains();
      return chains.map(Number); // Convert from BigInt to number
    } catch (error) {
      console.error(`Error getting all chains:`, error);
      return [];
    }
  }

  /**
   * Create token ID from symbol
   */
  getTokenId(symbol) {
    return ethers.id(symbol); // keccak256(symbol)
  }

  /**
   * Validate operation is allowed by registry
   */
  async validateCrossChainOperation(tokenSymbol, sourceChainId, targetChainId) {
    if (!this.contract) {
      console.warn('Registry not configured - skipping validation');
      return true;
    }

    const tokenId = this.getTokenId(tokenSymbol);

    // Check token registered on source
    const registeredOnSource = await this.isTokenRegistered(tokenId, sourceChainId);
    if (!registeredOnSource) {
      throw new Error(`Token ${tokenSymbol} not registered on source chain ${sourceChainId}`);
    }

    // Check token registered on target
    const registeredOnTarget = await this.isTokenRegistered(tokenId, targetChainId);
    if (!registeredOnTarget) {
      throw new Error(`Token ${tokenSymbol} not registered on target chain ${targetChainId}`);
    }

    return true;
  }
}

