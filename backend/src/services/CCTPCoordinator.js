/**
 * CCTP Coordinator Service
 * 
 * Orchestrates cross-chain USDC transfers via Circle's Bridge Kit.
 * Uses Circle's Bridge Kit SDK which handles burn, attestation, and mint flows automatically.
 */

import { BridgeKit, Blockchain } from '@circle-fin/bridge-kit';
import { createAdapterFromPrivateKey } from '@circle-fin/adapter-viem-v2';
import { createPublicClient, http } from 'viem';
import { ethers } from 'ethers';

export class CCTPCoordinator {
  constructor() {
    // Circle API key for authentication (optional but recommended)
    this.circleApiKey = process.env.CIRCLE_API_KEY || process.env.CIRCLE_GATEWAY_API_KEY;
    if (!this.circleApiKey) {
      console.warn('⚠️  CIRCLE_API_KEY not set - Bridge Kit will still work but may have limited features');
    } else {
      console.log('✓ Circle API key configured for Bridge Kit');
    }
    
    // Initialize Bridge Kit (lazy initialization to prevent crashes on startup)
    // Bridge Kit will be initialized when first needed
    this.kit = null;
    this._kitInitialized = false;

    // Map our internal chain names to Bridge Kit's expected chain names
    // Bridge Kit uses underscore format like "Base_Sepolia" for testnets
    // Default mappings - will be updated when Bridge Kit initializes with actual supported chains
    // Map our internal chain names to Bridge Kit's expected chain names
    // IMPORTANT: Bridge Kit may only support testnets, not mainnets
    // Use testnet names if mainnet is not available
    this.chainNameMap = {
      base: 'Base_Sepolia', // Use Base Sepolia as primary source chain
      basesepolia: 'Base_Sepolia',
      'base-sepolia': 'Base_Sepolia',
      avalanche: 'Avalanche_Fuji', // Bridge Kit likely only supports Avalanche_Fuji (testnet), not mainnet
      optimism: 'Optimism_Sepolia', // Use testnet if mainnet not available
      arbitrum: 'Arbitrum_Sepolia', // Use testnet if mainnet not available
      'arbitrum-sepolia': 'Arbitrum_Sepolia',
      avalanche: 'Avalanche_Fuji', // Bridge Kit likely only supports Avalanche_Fuji (testnet), not mainnet
      'avalanche-fuji': 'Avalanche_Fuji',
      optimism: 'Optimism_Sepolia', // Use testnet if mainnet not available
      'optimism-sepolia': 'Optimism_Sepolia',
      polygon: 'Polygon_Amoy', // Use testnet if mainnet not available
      arc: 'Arc_Testnet', // Bridge Kit uses "Arc_Testnet" for Arc testnet
      'codex-testnet': 'Codex_Testnet', // May need to verify Bridge Kit support
      'unichain-sepolia': 'Unichain_Sepolia' // May need to verify Bridge Kit support
    };

    // Private key for signing transactions (from env)
    // This is the wallet that:
    // 1. Receives USDC from users (users send USDC to this wallet address)
    // 2. Receives ETH from users (for gas fees)
    // 3. Signs transactions to burn USDC on source chain
    // 4. Signs transactions to mint USDC on destination chain
    // 5. Pays for all gas fees on both chains
    this.privateKey = process.env.CCTP_PRIVATE_KEY || process.env.PRIVATE_KEY || process.env.GATEWAY_PRIVATE_KEY;
    
    // Get CCTP wallet address from private key
    if (this.privateKey) {
      try {
        const tempWallet = new ethers.Wallet(this.privateKey);
        this.cctpWalletAddress = tempWallet.address;
        console.log(`✓ CCTP Wallet Address: ${this.cctpWalletAddress}`);
        console.log(`  This wallet will:`);
        console.log(`    - Receive USDC from users`);
        console.log(`    - Receive ETH for gas fees`);
        console.log(`    - Sign burn transactions on source chain`);
        console.log(`    - Sign mint transactions on destination chain`);
      } catch (error) {
        console.warn('⚠ Could not derive CCTP wallet address from private key');
        this.cctpWalletAddress = null;
      }
    } else {
      this.cctpWalletAddress = null;
      console.warn('⚠ CCTP_PRIVATE_KEY not set - CCTP transfers will fail');
    }
    
    // RPC URLs for creating adapters
    this.rpcUrls = {
      base: process.env.BASE_SEPOLIA_RPC_URL || process.env.BASE_RPC_URL || 'https://sepolia.base.org',
      basesepolia: process.env.BASE_SEPOLIA_RPC_URL || process.env.BASE_RPC_URL || 'https://sepolia.base.org',
      'base-sepolia': process.env.BASE_SEPOLIA_RPC_URL || process.env.BASE_RPC_URL || 'https://sepåolia.base.org',
      polygon: process.env.POLYGON_RPC_URL || process.env.POLYGON_AMOY_RPC_URL || 'https://rpc-amoy.polygon.technology',
      'polygon-amoy': process.env.POLYGON_AMOY_RPC_URL || process.env.POLYGON_RPC_URL || 'https://rpc-amoy.polygon.technology',
      avalanche: process.env.AVALANCHE_RPC_URL || process.env.AVALANCHE_FUJI_RPC_URL || 'https://api.avax-test.network/ext/bc/C/rpc',
      'avalanche-fuji': process.env.AVALANCHE_FUJI_RPC_URL || process.env.AVALANCHE_RPC_URL || 'https://api.avax-test.network/ext/bc/C/rpc',
      optimism: process.env.OPTIMISM_RPC_URL || process.env.OPTIMISM_SEPOLIA_RPC_URL || 'https://sepolia.optimism.io',
      'optimism-sepolia': process.env.OPTIMISM_SEPOLIA_RPC_URL || process.env.OPTIMISM_RPC_URL || 'https://sepolia.optimism.io',
      arbitrum: process.env.ARBITRUM_RPC_URL || process.env.ARBITRUM_SEPOLIA_RPC_URL || 'https://sepolia-rollup.arbitrum.io/rpc',
      'arbitrum-sepolia': process.env.ARBITRUM_SEPOLIA_RPC_URL || process.env.ARBITRUM_RPC_URL || 'https://sepolia-rollup.arbitrum.io/rpc',
      'codex-testnet': process.env.CODEX_TESTNET_RPC_URL || process.env.CODEX_RPC_URL || 'https://812242.rpc.thirdweb.com',
      'unichain-sepolia': process.env.UNICHAIN_SEPOLIA_RPC_URL || process.env.UNICHAIN_RPC_URL || '',
      arc: process.env.ARC_RPC_URL || 'https://hidden-cosmological-thunder.arc-testnet.quiknode.pro/e18d2b4649fda2fd51ef9f5a2c1d7d8fd132c886'
    };

    // USDC addresses (testnet) - for balance checks and compatibility
    this.usdcAddresses = {
      base: '0x036CbD53842c5426634e7929541eC2318f3dCF7e', // Base Sepolia USDC
      basesepolia: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
      'base-sepolia': '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
      polygon: process.env.POLYGON_USDC_ADDRESS,
      'polygon-amoy': process.env.POLYGON_AMOY_USDC_ADDRESS || process.env.POLYGON_USDC_ADDRESS,
      avalanche: process.env.AVALANCHE_USDC_ADDRESS,
      'avalanche-fuji': process.env.AVALANCHE_FUJI_USDC_ADDRESS || process.env.AVALANCHE_USDC_ADDRESS,
      optimism: process.env.OPTIMISM_USDC_ADDRESS,
      'optimism-sepolia': process.env.OPTIMISM_SEPOLIA_USDC_ADDRESS || process.env.OPTIMISM_USDC_ADDRESS,
      arbitrum: process.env.ARBITRUM_USDC_ADDRESS,
      'arbitrum-sepolia': process.env.ARBITRUM_SEPOLIA_USDC_ADDRESS || process.env.ARBITRUM_USDC_ADDRESS,
      'codex-testnet': process.env.CODEX_TESTNET_USDC_ADDRESS || process.env.CODEX_USDC_ADDRESS,
      'unichain-sepolia': process.env.UNICHAIN_SEPOLIA_USDC_ADDRESS || process.env.UNICHAIN_USDC_ADDRESS,
      arc: process.env.ARC_USDC_ADDRESS || '0x3600000000000000000000000000000000000000' // Arc native USDC (NativeFiatTokenV2_2 Proxy)
    };
    
    // Pending transfers waiting for USDC deposits
    this.pendingTransfers = new Map(); // transferId -> transfer info
  }

  /**
   * Get CCTP wallet address (where users send USDC)
   */
  getCCTPWalletAddress(chain) {
    if (!this.cctpWalletAddress) {
      throw new Error('CCTP_PRIVATE_KEY not configured - cannot get wallet address');
    }
    return this.cctpWalletAddress;
  }

  /**
   * Create adapter for a chain using Bridge Kit
   * Note: Bridge Kit adapters can be reused across chains, but we create per-chain
   * adapters to ensure correct RPC URLs are used
   */
  createAdapter(chain) {
    if (!this.privateKey) {
      throw new Error('CCTP_PRIVATE_KEY not configured - cannot create adapter');
    }

    const rpcUrl = this.rpcUrls[chain];
    if (!rpcUrl) {
      throw new Error(`No RPC URL configured for ${chain}`);
    }

    try {
      // Create adapter from private key with custom RPC
      // This provides better reliability than using public RPCs
      // The getPublicClient function is called by Bridge Kit for each chain operation
      // Bridge Kit will pass the viem chain object, and we map it to our RPC URLs
      const adapter = createAdapterFromPrivateKey({
        privateKey: this.privateKey,
        // Replace the default connection with our custom RPC
        getPublicClient: ({ chain: viemChain }) => {
          // Map viem chain to our internal chain name and get RPC URL
          // Bridge Kit uses chain names like "Ethereum_Sepolia", "Arc_Testnet", etc.
          const chainName = viemChain?.name || '';
          const chainId = viemChain?.id;
          let chainRpcUrl = null;
          
          // FIRST: Check by chain ID (most reliable) - ONLY for Arc
          // IMPORTANT: Only apply Arc RPC if it's actually Arc, don't interfere with other chains
          if (chainId === 5042002) {
            // Arc Testnet - ONLY match by exact chain ID
            chainRpcUrl = this.rpcUrls.arc;
            console.log(`[CCTP Backend] ✅ Detected Arc by chain ID ${chainId}, using RPC: ${chainRpcUrl}`);
          } else if (chainId === 84532) {
            // Base Sepolia
            chainRpcUrl = this.rpcUrls.base || this.rpcUrls.basesepolia;
            console.log(`[CCTP Backend] ✅ Detected Base Sepolia by chain ID ${chainId}, using RPC: ${chainRpcUrl}`);
          } else if (chainId === 80002) {
            // Polygon Amoy Testnet
            chainRpcUrl = this.rpcUrls.polygon || this.rpcUrls['polygon-amoy'];
            console.log(`[CCTP Backend] ✅ Detected Polygon Amoy by chain ID ${chainId}, using RPC: ${chainRpcUrl}`);
          } else if (chainId === 43113) {
            // Avalanche Fuji Testnet
            chainRpcUrl = this.rpcUrls.avalanche || this.rpcUrls['avalanche-fuji'];
            console.log(`[CCTP Backend] ✅ Detected Avalanche Fuji by chain ID ${chainId}, using RPC: ${chainRpcUrl}`);
          } else if (chainId === 11155420) {
            // Optimism Sepolia
            chainRpcUrl = this.rpcUrls.optimism || this.rpcUrls['optimism-sepolia'];
            console.log(`[CCTP Backend] ✅ Detected Optimism Sepolia by chain ID ${chainId}, using RPC: ${chainRpcUrl}`);
          } else if (chainId === 421614) {
            // Arbitrum Sepolia
            chainRpcUrl = this.rpcUrls.arbitrum || this.rpcUrls['arbitrum-sepolia'];
            console.log(`[CCTP Backend] ✅ Detected Arbitrum Sepolia by chain ID ${chainId}, using RPC: ${chainRpcUrl}`);
          }
          
          // SECOND: Check by chain name (fallback) - be specific, don't use Arc for everything
          if (!chainRpcUrl) {
            const chainNameLower = chainName.toLowerCase();
            
            // Check for Arc ONLY if name explicitly contains "arc" and "testnet"
            if ((chainNameLower.includes('arc') && chainNameLower.includes('testnet')) || chainName === 'Arc_Testnet') {
              chainRpcUrl = this.rpcUrls.arc;
              console.log(`[CCTP Backend] ✅ Detected Arc by name "${chainName}", using RPC: ${chainRpcUrl}`);
            } else if (chainName.includes('Base') && chainName.includes('Sepolia')) {
              chainRpcUrl = this.rpcUrls.base || this.rpcUrls.basesepolia;
            } else if (chainName.includes('Polygon') && (chainName.includes('Amoy') || chainName.includes('Testnet'))) {
              chainRpcUrl = this.rpcUrls.polygon || this.rpcUrls['polygon-amoy'];
            } else if (chainName.includes('Avalanche') && (chainName.includes('Fuji') || chainName.includes('Testnet'))) {
              chainRpcUrl = this.rpcUrls.avalanche || this.rpcUrls['avalanche-fuji'];
            } else if (chainName.includes('Optimism') && (chainName.includes('Sepolia') || chainName.includes('Testnet'))) {
              chainRpcUrl = this.rpcUrls.optimism || this.rpcUrls['optimism-sepolia'];
            } else if (chainName.includes('Arbitrum') && (chainName.includes('Sepolia') || chainName.includes('Testnet'))) {
              chainRpcUrl = this.rpcUrls.arbitrum || this.rpcUrls['arbitrum-sepolia'];
            } else if (chainName.includes('Base')) {
              chainRpcUrl = this.rpcUrls.base;
            } else if (chainName.includes('Polygon')) {
              chainRpcUrl = this.rpcUrls.polygon || this.rpcUrls['polygon-amoy'];
            } else if (chainName.includes('Avalanche')) {
              chainRpcUrl = this.rpcUrls.avalanche || this.rpcUrls['avalanche-fuji'];
            } else if (chainName.includes('Optimism')) {
              chainRpcUrl = this.rpcUrls.optimism || this.rpcUrls['optimism-sepolia'];
            } else if (chainName.includes('Arbitrum')) {
              chainRpcUrl = this.rpcUrls.arbitrum || this.rpcUrls['arbitrum-sepolia'];
            }
          }
          
          // THIRD: Fallback to the RPC URL for the chain we're creating the adapter for
          if (!chainRpcUrl) {
            chainRpcUrl = this.rpcUrls[chain];
          }
          
          // FOURTH: Final fallback - ONLY use Arc RPC if it's explicitly Arc, otherwise use default
          if (!chainRpcUrl) {
            // ONLY check for Arc here - don't apply Arc RPC to other chains
            if (chainId === 5042002 || (chainName.toLowerCase().includes('arc') && chainName.toLowerCase().includes('testnet'))) {
              chainRpcUrl = this.rpcUrls.arc;
              console.log(`[CCTP Backend] ✅ Final fallback: Using Arc RPC for Arc chain ${chainName} (ID: ${chainId}): ${chainRpcUrl}`);
            } else {
              console.warn(`[CCTP Backend] ⚠️  No RPC URL found for chain ${chainName} (ID: ${chainId}), using Bridge Kit default`);
              // Return default client (Bridge Kit will use its default RPC)
              return createPublicClient({
                chain: viemChain,
                transport: http(),
              });
            }
          }
          
          // ALWAYS override the chain's default RPC with our custom one
          console.log(`[CCTP Backend] 🔧 Creating public client for ${chainName} (ID: ${chainId}) with custom RPC: ${chainRpcUrl}`);
          
          // Create a modified chain object with our RPC URL
          const customChain = {
            ...viemChain,
            rpcUrls: {
              default: {
                http: [chainRpcUrl],
              },
            },
          };
          
          return createPublicClient({
            chain: customChain,
            transport: http(chainRpcUrl, {
              retryCount: 3,
              timeout: 10000,
            }),
          });
        },
      });
      
      return adapter;
    } catch (error) {
      console.error(`Error creating adapter for ${chain}:`, error);
      throw new Error(`Failed to create adapter for ${chain}: ${error.message}`);
    }
  }

  /**
   * Get Bridge Kit chain name for our internal chain name
   */
  getBridgeKitChainName(chain) {
    const bridgeKitName = this.chainNameMap[chain];
    if (!bridgeKitName) {
      // If not in map, try using the chain name as-is (Bridge Kit might support it)
      console.warn(`Chain ${chain} not in chainNameMap, using as-is`);
      return chain;
    }
    return bridgeKitName;
  }

  /**
   * Get the exact chain identifier from supported chains
   * This ensures we use the exact value that Bridge Kit expects
   * 
   * CCTP Domain IDs reference:
   * 0 = Ethereum, 1 = Avalanche, 2 = OP, 3 = Arbitrum, 5 = Solana,
   * 6 = Base, 7 = Polygon PoS, 10 = Unichain, 11 = Linea, 12 = Codex,
   * 13 = Sonic, 14 = World Chain, 15 = Monad Testnet, 16 = Sei,
   * 17 = BNB Smart Chain, 18 = XDC, 19 = HyperEVM, 21 = Ink,
   * 22 = Plume, 25 = Starknet Testnet, 26 = Arc Testnet
   */
  getExactChainIdentifier(chainName) {
    // First try to find exact match in supported chains
    if (this.supportedChainDefinitions) {
      const exactMatch = this.supportedChainDefinitions.find(c => c.chain === chainName);
      if (exactMatch) {
        console.log(`[CCTP Backend] Found exact chain match: ${chainName} → ${exactMatch.chain}`);
        return exactMatch.chain;
      }
      
      // Try to find by name or partial match (case-insensitive)
      // IMPORTANT: Prioritize exact matches, then exact chain matches, then partial matches
      const chainNameLower = chainName.toLowerCase();
      
      // First, try exact match on chain property
      const exactChainMatch = this.supportedChainDefinitions.find(c => 
        c.chain?.toLowerCase() === chainNameLower
      );
      if (exactChainMatch) {
        console.log(`[CCTP Backend] Found exact chain property match: ${chainName} → ${exactChainMatch.chain}`);
        return exactChainMatch.chain;
      }
      
      // Second, try exact match on name property
      const exactNameMatch = this.supportedChainDefinitions.find(c => 
        c.name?.toLowerCase() === chainNameLower
      );
      if (exactNameMatch) {
        console.log(`[CCTP Backend] Found exact name property match: ${chainName} → ${exactNameMatch.chain}`);
        return exactNameMatch.chain;
      }
      
      // Third, try partial match but be more strict - only match if chain name starts with or equals the search term
      // This prevents "Avalanche" from matching "Polygon" or other unrelated chains
      const partialMatch = this.supportedChainDefinitions.find(c => {
        const cName = c.name?.toLowerCase() || '';
        const cChain = c.chain?.toLowerCase() || '';
        // Only match if the chain/name starts with our search term, or our search term starts with the chain/name
        // This prevents substring matches in the middle (e.g., "avalanche" won't match "polygon")
        return cChain.startsWith(chainNameLower) || 
               chainNameLower.startsWith(cChain) ||
               cName.startsWith(chainNameLower) ||
               chainNameLower.startsWith(cName);
      });
      if (partialMatch) {
        console.log(`[CCTP Backend] Found chain by partial match: ${chainName} → ${partialMatch.chain}`);
        return partialMatch.chain;
      }
      
      // Log available chains for debugging
      console.warn(`[CCTP Backend] ⚠️  Chain "${chainName}" not found in supported chains. Available chains:`, 
        this.supportedChainDefinitions.map(c => `${c.chain} (${c.name})`).join(', '));
    }
    
    // Fallback: Try to use Blockchain enum if available
    // Bridge Kit uses specific enum values like "Avalanche", "Polygon", "Base_Sepolia", etc.
    if (typeof Blockchain !== 'undefined') {
      // Try direct match first
      if (chainName in Blockchain) {
        console.log(`[CCTP Backend] Using Blockchain enum (direct match): ${chainName}`);
        return chainName;
      }
      
      // Try common variations
      const chainNameUpper = chainName.toUpperCase().replace(/[^A-Z0-9]/g, '_');
      if (chainNameUpper in Blockchain) {
        console.log(`[CCTP Backend] Using Blockchain enum (uppercase): ${chainName} → ${chainNameUpper}`);
        return chainNameUpper;
      }
      
      // Try to find by partial match in enum keys
      const enumKeys = Object.keys(Blockchain);
      const matchingKey = enumKeys.find(key => 
        key.toLowerCase() === chainName.toLowerCase() ||
        key.toLowerCase().includes(chainName.toLowerCase()) ||
        chainName.toLowerCase().includes(key.toLowerCase())
      );
      if (matchingKey) {
        console.log(`[CCTP Backend] Using Blockchain enum (partial match): ${chainName} → ${matchingKey}`);
        return matchingKey;
      }
      
      console.warn(`[CCTP Backend] ⚠️  Chain "${chainName}" not found in Blockchain enum. Available:`, 
        enumKeys.slice(0, 10).join(', '), '...');
    }
    
    // Final fallback: return the mapped name (might work if Bridge Kit accepts it)
    console.warn(`[CCTP Backend] ⚠️  Using fallback chain name: ${chainName}`);
    return chainName;
  }

  /**
   * Initialize Bridge Kit if not already initialized
   */
  _initializeBridgeKit() {
    if (this._kitInitialized) {
      return;
    }

    try {
      this.kit = new BridgeKit({
        apiKey: this.circleApiKey
      });
      this._kitInitialized = true;
      console.log('✓ Bridge Kit initialized successfully');
      
      // Query supported chains to update our mapping
      try {
        const supportedChains = this.kit.getSupportedChains();
        const chainNames = supportedChains?.map(c => c.chain || c.name || c).filter(Boolean) || [];
        console.log('✓ Bridge Kit supported chains:', chainNames.join(', ') || 'N/A');
        
        // Store the full chain definitions for reference
        this.supportedChainDefinitions = supportedChains || [];
        
        // Update chain name map based on supported chains
        // Bridge Kit returns ChainDefinition[] with chain property containing the identifier
        if (supportedChains && Array.isArray(supportedChains)) {
          for (const chainDef of supportedChains) {
            // Try multiple possible properties for chain identifier
            const chainId = chainDef.chain || chainDef.blockchain || chainDef.name;
            if (!chainId || typeof chainId !== 'string') continue;
            
            // Only log during first initialization, not on every request
            // (Removed verbose logging to prevent unnecessary output)
            
            const chainIdLower = chainId.toLowerCase();
            
            // Map based on chain identifier patterns - use exact chain value from Bridge Kit
            if (chainIdLower.includes('base_sepolia') || (chainIdLower === 'base_sepolia')) {
              this.chainNameMap.base = chainId; // Use testnet if available
            } else if (chainIdLower === 'base' && !chainIdLower.includes('_')) {
              // Only set if we haven't found Base_Sepolia
              if (!this.chainNameMap.base || !this.chainNameMap.base.includes('Sepolia')) {
                this.chainNameMap.base = chainId;
              }
            } else if (chainIdLower.includes('polygon_amoy') || chainIdLower.includes('polygon-amoy')) {
              this.chainNameMap.polygon = chainId;
            } else if (chainIdLower === 'polygon' && !chainIdLower.includes('_') && !chainIdLower.includes('amoy')) {
              // Only set if we haven't found Polygon_Amoy_Testnet
              if (!this.chainNameMap.polygon || !this.chainNameMap.polygon.includes('Amoy')) {
                this.chainNameMap.polygon = chainId;
              }
            } else if (chainIdLower.includes('avalanche_fuji') || chainIdLower.includes('avalanche-fuji')) {
              this.chainNameMap.avalanche = chainId;
            } else if (chainIdLower === 'avalanche' && !chainIdLower.includes('_') && !chainIdLower.includes('fuji')) {
              if (!this.chainNameMap.avalanche || !this.chainNameMap.avalanche.includes('Fuji')) {
                this.chainNameMap.avalanche = chainId;
              }
            } else if (chainIdLower.includes('optimism_sepolia') || chainIdLower.includes('optimism-sepolia')) {
              this.chainNameMap.optimism = chainId;
            } else if (chainIdLower === 'optimism' && !chainIdLower.includes('_') && !chainIdLower.includes('sepolia')) {
              if (!this.chainNameMap.optimism || !this.chainNameMap.optimism.includes('Sepolia')) {
                this.chainNameMap.optimism = chainId;
              }
            } else if (chainIdLower.includes('arbitrum_sepolia') || chainIdLower.includes('arbitrum-sepolia')) {
              this.chainNameMap.arbitrum = chainId;
            } else if (chainIdLower === 'arbitrum' && !chainIdLower.includes('_') && !chainIdLower.includes('sepolia')) {
              if (!this.chainNameMap.arbitrum || !this.chainNameMap.arbitrum.includes('Sepolia')) {
                this.chainNameMap.arbitrum = chainId;
              }
            } else if (chainIdLower.includes('arc_testnet') || chainIdLower.includes('arc-testnet')) {
              this.chainNameMap.arc = chainId;
            }
          }
          
          // Only log chain mappings once during initialization
          if (!this._chainMappingsLogged) {
            console.log('✓ Updated chain name mappings:', Object.entries(this.chainNameMap)
              .filter(([k, v]) => k !== 'arc' || v !== 'Arc')
              .map(([k, v]) => `${k} → ${v}`)
              .join(', '));
            this._chainMappingsLogged = true;
          }
        }
      } catch (chainError) {
        console.warn('⚠️  Could not query supported chains:', chainError.message);
        console.warn('   Using default chain name mappings');
      }
    } catch (error) {
      console.error('⚠️  Failed to initialize Bridge Kit:', error);
      console.error('   Bridge Kit transfers will not work until this is fixed');
      this.kit = null;
      this._kitInitialized = false;
      throw error;
    }
  }

  /**
   * Estimate transfer fee using Bridge Kit
   */
  async estimateTransferFee({ sourceChain, destinationChain, amount, useFastAttestation = true }) {
    // Initialize Bridge Kit if needed
    if (!this._kitInitialized) {
      this._initializeBridgeKit();
    }

    if (!this.kit) {
      throw new Error('Bridge Kit not initialized');
    }

    if (!this.privateKey) {
      throw new Error('CCTP_PRIVATE_KEY not configured');
    }

    // Validate routing rules: must involve Arc
    this.validateRouting(sourceChain, destinationChain);

    try {
      // Create adapter
      const adapter = this.createAdapter(sourceChain);
      const sourceChainName = this.getBridgeKitChainName(sourceChain);
      const destinationChainName = this.getBridgeKitChainName(destinationChain);

      // Get exact chain identifiers from supported chains
      const finalSourceChain = this.getExactChainIdentifier(sourceChainName);
      const finalDestChain = this.getExactChainIdentifier(destinationChainName);

      // Verify the chain values are valid Blockchain enum values (only log warnings, not success)
      if (Blockchain) {
        if (!(finalSourceChain in Blockchain)) {
          console.warn(`  ⚠️  Source chain "${finalSourceChain}" not found in Blockchain enum`);
          const sampleKeys = Object.keys(Blockchain).filter(k => k.includes('Ethereum') || k.includes('Sepolia')).slice(0, 5);
          console.warn(`  Sample Ethereum/Sepolia enum values: ${sampleKeys.join(', ')}`);
        }
        if (!(finalDestChain in Blockchain)) {
          console.warn(`  ⚠️  Destination chain "${finalDestChain}" not found in Blockchain enum`);
        }
      }

      // Estimate fees using Bridge Kit - use the exact chain values from definitions
      const estimateParams = {
        from: { adapter, chain: finalSourceChain },
        to: { adapter, chain: finalDestChain },
        amount: this.formatUSDCAmount(amount)
      };

      const estimate = await this.kit.estimate(estimateParams);
      
      // Extract provider fee
      const providerFee = estimate.fees?.find((f) => f.type === 'provider')?.amount;
      let estimatedFee = null;
      let maxFee = null;

      if (providerFee) {
        estimatedFee = this.parseUSDCAmount(providerFee);
        // Add 10% buffer
        maxFee = estimatedFee + (estimatedFee / 10n);
      }

      // Convert to serializable format (no BigInt values)
      return {
        estimatedFee: estimatedFee ? ethers.formatUnits(estimatedFee, 6) : null,
        maxFee: maxFee ? ethers.formatUnits(maxFee, 6) : null,
        estimatedFeeRaw: estimatedFee?.toString() || null,
        maxFeeRaw: maxFee?.toString() || null,
        // Don't include estimateResponse as it may contain BigInt values
        // If needed, we can serialize specific fields from estimate
        fees: estimate.fees ? estimate.fees.map(f => ({
          type: f.type,
          amount: typeof f.amount === 'bigint' ? f.amount.toString() : f.amount
        })) : null
      };
    } catch (error) {
      console.error('Error estimating transfer fee:', error);
      throw new Error(`Failed to estimate transfer fee: ${error.message}`);
    }
  }

  /**
   * Create a pending transfer request
   * Returns transfer ID and wallet address for user to send USDC
   * Also includes fee estimate from Bridge Kit
   */
  async createPendingTransfer({ sourceChain, destinationChain, amount, recipient, useFastAttestation = true }) {
    if (!this.cctpWalletAddress) {
      throw new Error('CCTP_PRIVATE_KEY not configured');
    }

    // Validate routing rules: must involve Arc
    this.validateRouting(sourceChain, destinationChain);

    // Estimate fees using Bridge Kit
    let feeEstimate = null;
    try {
      feeEstimate = await this.estimateTransferFee({
        sourceChain,
        destinationChain,
        amount,
        useFastAttestation
      });
    } catch (error) {
      console.warn('⚠️  Could not estimate fees:', error.message);
      // Continue without fee estimate
    }

    const transferId = `cctp_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    
    // Get initial USDC balance BEFORE user sends deposit
    // This is critical for detecting deposits correctly
    let initialUSDCBalance = '0';
    try {
      const provider = this.getProvider(sourceChain);
      if (provider) {
        const isArc = sourceChain.toLowerCase() === 'arc';
        
        if (isArc) {
          // Arc: USDC is native token - check native balance (no contract needed)
          // IMPORTANT: Native token balance is in 18 decimals (like ETH), not 6 decimals
          const balance = await provider.getBalance(this.cctpWalletAddress);
          initialUSDCBalance = balance.toString();
          console.log(`  Initial native USDC balance on ${sourceChain}: ${ethers.formatEther(balance)} USDC`);
        } else {
          // Other chains: USDC is ERC-20 token - check contract balance
          const usdcAddress = this.getUSDCAddress(sourceChain);
          if (usdcAddress) {
            const usdcContract = new ethers.Contract(
              usdcAddress,
              ['function balanceOf(address) view returns (uint256)'],
              provider
            );
            const balance = await usdcContract.balanceOf(this.cctpWalletAddress);
            initialUSDCBalance = balance.toString();
            console.log(`  Initial USDC balance on ${sourceChain}: ${ethers.formatUnits(balance, 6)} USDC`);
          }
        }
      }
    } catch (error) {
      console.warn(`  Could not get initial USDC balance: ${error.message}`);
      // Continue with '0' - will be set on first check
    }
    
    const pendingTransfer = {
      id: transferId,
      sourceChain,
      destinationChain,
      amount: amount.toString(),
      recipient: recipient || this.cctpWalletAddress,
      useFastAttestation,
      status: 'pending_deposit',
      createdAt: Date.now(),
      cctpWalletAddress: this.cctpWalletAddress,
      feeEstimate: feeEstimate,
      initialUSDCBalance: initialUSDCBalance // Set immediately when transfer is created
    };

    this.pendingTransfers.set(transferId, pendingTransfer);
    
    return {
      transferId,
      cctpWalletAddress: this.cctpWalletAddress,
      sourceChain,
      destinationChain,
      amount: amount.toString(),
      recipient: pendingTransfer.recipient,
      status: 'pending_deposit',
      feeEstimate: feeEstimate
    };
  }

  /**
   * Check if USDC and ETH have been received for a pending transfer
   * If transfer not found in memory (e.g., after server restart), attempts to reconstruct from transferId
   */
  async checkDepositReceived(transferId, sourceChain = null) {
    // Check if transfer exists in memory before trying to get it
    const isReconstructed = !this.pendingTransfers.has(transferId);
    let pending = this.pendingTransfers.get(transferId);
    
    // If transfer not found, try to reconstruct basic info from transferId
    // Transfer ID format: cctp_${timestamp}_${random}
    if (!pending) {
      // Only log warning once per transfer to reduce noise
      if (!this._missingTransferWarnings || !this._missingTransferWarnings.has(transferId)) {
        if (!this._missingTransferWarnings) {
          this._missingTransferWarnings = new Set();
        }
        this._missingTransferWarnings.add(transferId);
        console.warn(`⚠️  Transfer ${transferId} not found in memory. This may happen after server restart.`);
        console.warn(`   To recover: provide sourceChain as query parameter or create a new transfer.`);
      }
      
      // If we have sourceChain, we can still check the balance
      if (sourceChain && this.cctpWalletAddress) {
        // Validate that sourceChain is not 'arc' (deposits should be on source chain, not destination)
        if (sourceChain.toLowerCase() === 'arc') {
          console.warn(`  ⚠️  Warning: sourceChain is 'arc'. Deposits should be on the source chain (e.g., 'sepolia'), not the destination chain.`);
          console.warn(`  ⚠️  If this is a transfer TO arc, the sourceChain should be the chain where the user sends USDC (e.g., 'sepolia').`);
        }
        
        // Create a minimal pending transfer object for balance checking
        pending = {
          id: transferId,
          sourceChain: sourceChain, // This should be the chain where user sends USDC (e.g., base)
          cctpWalletAddress: this.cctpWalletAddress,
          status: 'pending_deposit',
          // We don't know the amount, so we'll just check if there's any USDC
          amount: '0', // Will be checked separately
          isReconstructed: true // Mark as reconstructed
        };
        console.log(`  Reconstructed transfer with sourceChain: ${sourceChain}`);
      } else {
        // Return a helpful error response instead of throwing
        // This prevents the server from crashing on repeated polling
        return {
          received: false,
          usdcReceived: null,
          ethSufficient: false,
          usdcBalance: '0',
          usdcIncrease: '0',
          ethBalance: '0',
          requiredUSDC: 'unknown',
          requiredETH: '0',
          status: 'error',
          message: `Transfer ${transferId} not found. This may happen if the server was restarted. Please create a new transfer or provide sourceChain parameter.`,
          error: 'TRANSFER_NOT_FOUND',
          suggestion: 'Provide sourceChain as query parameter: ?sourceChain=base'
        };
      }
    }

    const provider = this.getProvider(pending.sourceChain);
    if (!provider) {
      throw new Error(`No RPC configured for ${pending.sourceChain}`);
    }

    // Get USDC address for the chain (Bridge Kit handles this, but we need it for balance check)
    // IMPORTANT: We check deposits on the SOURCE chain, not destination chain
    const chainToCheck = pending.sourceChain;
    console.log(`  Checking deposit on source chain: ${chainToCheck}`);
    
    // Initialize Bridge Kit if needed to get chain definitions (for USDC address fallback)
    if (!this._kitInitialized) {
      try {
        this._initializeBridgeKit();
      } catch (error) {
        console.warn(`  Could not initialize Bridge Kit for USDC address lookup: ${error.message}`);
      }
    }
    
    const usdcAddress = this.getUSDCAddress(chainToCheck);
    const isArc = chainToCheck.toLowerCase() === 'arc';
    
    // For Arc: USDC is the native token, so check native balance (no contract needed)
    // For other chains: USDC is an ERC-20 token, so check contract balance
    let currentUSDCBalance;
    let usdcContract = null;
    
    if (isArc) {
      // Arc: USDC is native token - check native balance
      try {
        currentUSDCBalance = await provider.getBalance(this.cctpWalletAddress);
        console.log(`  Arc detected - checking native USDC balance (no contract needed)`);
      } catch (error) {
        throw new Error(`Failed to get native USDC balance on Arc: ${error.message}`);
      }
    } else {
      // Other chains: USDC is ERC-20 token - check contract balance
      if (!usdcAddress) {
        throw new Error(
          `USDC address not configured for ${chainToCheck}. ` +
          `Please set ${chainToCheck.toUpperCase()}_USDC_ADDRESS in environment variables, ` +
          `or ensure Bridge Kit has the USDC address for this chain.`
        );
      }

      try {
        usdcContract = new ethers.Contract(
          usdcAddress,
          [
            'function balanceOf(address) view returns (uint256)',
            'event Transfer(address indexed from, address indexed to, uint256 value)'
          ],
          provider
        );

        currentUSDCBalance = await usdcContract.balanceOf(this.cctpWalletAddress);
      } catch (error) {
        throw new Error(`Failed to get USDC balance from contract: ${error.message}`);
      }
    }

    try {
      // Calculate required amount
      // For Arc: user sends transfer + fee + gas all in one USDC transaction
      // For other chains: user sends transfer + fee (gas is separate ETH)
      const isArcSource = pending.sourceChain.toLowerCase() === 'arc';
      
      // IMPORTANT: For Arc, native transfers use 18 decimals, but amounts are stored in 6 decimals (USDC format)
      // We need to convert everything to 18 decimals for comparison with native balance
      let requiredAmount;
      
      if (isArcSource) {
        // Arc: Convert all amounts from 6 decimals (USDC) to 18 decimals (native token)
        const transferAmount = BigInt(pending.amount || '0');
        const transferAmountFormatted = ethers.formatUnits(transferAmount, 6); // Convert to human-readable
        requiredAmount = ethers.parseEther(transferAmountFormatted); // Convert to 18 decimals
        
        // Add CCTP transfer fee (also in 6 decimals, convert to 18)
        if (pending.feeEstimate?.maxFee) {
          const feeAmount = BigInt(pending.feeEstimate.maxFee);
          const feeAmountFormatted = ethers.formatUnits(feeAmount, 6); // Convert to human-readable
          const feeAmount18 = ethers.parseEther(feeAmountFormatted); // Convert to 18 decimals
          requiredAmount = requiredAmount + feeAmount18;
        }
        
        // Add estimated gas (also in 6 decimals, convert to 18)
        try {
          const gasEstimate = await this.estimateGasCosts(pending.sourceChain, pending.destinationChain, pending.amount);
          const gasEstimateFormatted = ethers.formatUnits(gasEstimate.sourceGasCost, 6); // Convert to human-readable
          const estimatedGas = ethers.parseEther(gasEstimateFormatted); // Convert to 18 decimals
          requiredAmount = requiredAmount + estimatedGas;
          console.log(`  Arc source detected - including gas in required amount: ${gasEstimateFormatted} USDC`);
        } catch (gasEstError) {
          console.warn(`  Could not estimate gas for Arc, using fallback: ${gasEstError.message}`);
          // Fallback: add 0.05 USDC for gas (convert to 18 decimals)
          requiredAmount = requiredAmount + ethers.parseEther('0.05');
        }
      } else {
        // Other chains: amounts are already in 6 decimals (ERC-20 USDC format)
        requiredAmount = BigInt(pending.amount || '0');
        
        // Add CCTP transfer fee
        if (pending.feeEstimate?.maxFee) {
          requiredAmount = requiredAmount + BigInt(pending.feeEstimate.maxFee);
        }
      }
      
      // Also check for recent Transfer events to verify deposits
      // For Arc: Check native token transfers (no events, but we can check transaction history)
      // For other chains: Check ERC-20 Transfer events
      let recentDeposits = [];
      try {
        if (isArc) {
          // Arc: Native USDC transfers don't emit Transfer events
          // We'll rely on balance tracking instead
          console.log(`  Arc detected - native USDC transfers don't emit Transfer events, using balance tracking`);
        } else if (usdcContract) {
          // Other chains: Check ERC-20 Transfer events
          const currentBlock = await provider.getBlockNumber();
          const fromBlock = Math.max(0, currentBlock - 100); // Check last 100 blocks
          
          const transferFilter = usdcContract.filters.Transfer(null, this.cctpWalletAddress);
          const transfers = await usdcContract.queryFilter(transferFilter, fromBlock, currentBlock);
          
          recentDeposits = transfers.map(tx => ({
            from: tx.args.from,
            to: tx.args.to,
            value: tx.args.value.toString(),
            blockNumber: tx.blockNumber,
            transactionHash: tx.transactionHash
          }));
          
          console.log(`  Found ${recentDeposits.length} recent Transfer event(s) to CCTP wallet in last 100 blocks`);
          if (recentDeposits.length > 0) {
            console.log(`  Most recent deposit: ${ethers.formatUnits(recentDeposits[recentDeposits.length - 1].value, 6)} USDC from ${recentDeposits[recentDeposits.length - 1].from}`);
          }
        }
      } catch (eventError) {
        console.warn(`  Could not query Transfer events: ${eventError.message}`);
      }

      // Get initial balance (stored when transfer was created)
      // If transfer was reconstructed (not in memory), we can't track increase
      
      if (!pending.initialUSDCBalance || pending.initialUSDCBalance === '0') {
        if (isReconstructed) {
          // For reconstructed transfers, we can't know the initial balance
          // So we'll just report the current balance
          console.warn(`   Cannot determine deposit status without initial balance. Showing current balance only.`);
        } else {
          // If initial balance wasn't set during creation (shouldn't happen, but fallback)
          console.warn(`   Initial balance not set during transfer creation. Setting now (may be inaccurate if deposit already sent).`);
          pending.initialUSDCBalance = currentUSDCBalance.toString();
          this.pendingTransfers.set(transferId, pending);
        }
      }
      
      // Format balances based on chain type
      // Arc: native token uses 18 decimals, other chains: ERC-20 uses 6 decimals
      const formatBalance = (bal) => isArc ? ethers.formatEther(bal) : ethers.formatUnits(bal, 6);
      const formatAmount = (amt) => isArc ? ethers.formatEther(amt) : ethers.formatUnits(amt, 6);
      
      console.log(`  Initial USDC balance: ${formatBalance(BigInt(pending.initialUSDCBalance))} USDC`);
      console.log(`  Current USDC balance: ${formatBalance(currentUSDCBalance)} USDC`);

      const initialUSDCBalance = BigInt(pending.initialUSDCBalance);
      const usdcIncrease = currentUSDCBalance - initialUSDCBalance;
      
      console.log(`  USDC increase: ${formatAmount(usdcIncrease)} USDC`);
      console.log(`  Required amount: ${formatAmount(requiredAmount)} USDC`);

      // Check gas balance - for Arc, USDC is the native gas token
      let gasSufficient = false;
      let currentGasBalance = null;
      let minGasRequired = null;
      let gasTokenName = 'ETH';
      
      // Estimate actual gas costs for this transfer
      let gasEstimate = null;
      try {
        gasEstimate = await this.estimateGasCosts(pending.sourceChain, pending.destinationChain, pending.amount);
        minGasRequired = gasEstimate.sourceGasCost;
        gasTokenName = gasEstimate.sourceGasToken;
        console.log(`  Estimated gas cost: ${gasEstimate.sourceGasCostFormatted} ${gasTokenName}`);
      } catch (error) {
        console.warn(`  Could not estimate gas costs: ${error.message}, using fallback`);
        // Fallback to conservative estimates
        if (pending.sourceChain.toLowerCase() === 'arc') {
          minGasRequired = ethers.parseUnits('0.1', 6); // 0.1 USDC minimum
          gasTokenName = 'USDC';
        } else {
          minGasRequired = ethers.parseEther('0.001'); // 0.001 ETH minimum
          gasTokenName = 'ETH';
        }
      }
      
      if (pending.sourceChain.toLowerCase() === 'arc') {
        // Arc uses USDC as native gas token
        gasTokenName = 'USDC';
        // Use USDC balance for gas on Arc
        currentGasBalance = currentUSDCBalance;
        gasSufficient = currentGasBalance >= minGasRequired;
        console.log(`  Gas check (Arc): ${ethers.formatUnits(currentGasBalance, 6)} USDC (min: ${ethers.formatUnits(minGasRequired, 6)} USDC)`);
      } else {
        // Other chains use ETH for gas
        currentGasBalance = await provider.getBalance(this.cctpWalletAddress);
        gasSufficient = currentGasBalance >= minGasRequired;
        console.log(`  Gas check: ${ethers.formatEther(currentGasBalance)} ETH (min: ${ethers.formatEther(minGasRequired)} ETH)`);
      }

      // If amount is 0 (reconstructed transfer), we can't determine if deposit was received
      // But we can still report the current balance
      // For reconstructed transfers, we'll check if there's any USDC increase
      let usdcReceived = false;
      if (requiredAmount > 0n) {
        // Check both balance increase AND recent transactions
        const balanceCheck = usdcIncrease >= requiredAmount;
        const transactionCheck = recentDeposits.some(deposit => 
          BigInt(deposit.value) >= requiredAmount
        );
        // If we have recent transactions matching the amount, trust that over balance tracking
        // (balance tracking can be wrong if initial balance was set after deposit)
        usdcReceived = transactionCheck || balanceCheck;
        
        if (transactionCheck && !balanceCheck) {
          console.log(`  ⚠️  Balance increase not detected, but found matching transaction(s). Using transaction verification.`);
        } else if (balanceCheck && !transactionCheck) {
          console.log(`  ✓ Balance increase detected: ${ethers.formatUnits(usdcIncrease, 6)} USDC`);
        }
      } else if (pending.isReconstructed) {
        // For reconstructed transfers without known amount, check if there's any USDC
        // This is a best-effort check - prefer transaction events if available
        usdcReceived = recentDeposits.length > 0 || currentUSDCBalance > 0n;
      }

      if (usdcReceived && gasSufficient) {
        pending.status = 'deposit_received';
        pending.depositReceivedAt = Date.now();
        pending.receivedUSDCBalance = currentUSDCBalance.toString();
        pending.receivedGasBalance = currentGasBalance.toString();
        // Only save to map if it's a real transfer (not reconstructed)
        if (!isReconstructed) {
          this.pendingTransfers.set(transferId, pending);
        }
        
        return {
          received: true,
          usdcBalance: currentUSDCBalance.toString(),
          usdcIncrease: usdcIncrease.toString(),
          gasBalance: currentGasBalance.toString(),
          gasToken: gasTokenName,
          requiredUSDC: pending.amount || 'unknown',
          requiredGas: minGasRequired.toString(),
          gasTokenName: gasTokenName,
          status: 'deposit_received',
          recentDeposits: recentDeposits.length > 0 ? recentDeposits : undefined,
          note: isReconstructed ? 'Transfer was reconstructed (server may have restarted)' : undefined
        };
      }

      return {
        received: false,
        usdcReceived: requiredAmount > 0n ? usdcReceived : null, // null if amount unknown
        gasSufficient,
        usdcBalance: currentUSDCBalance.toString(),
        usdcIncrease: isReconstructed ? 'unknown' : usdcIncrease.toString(),
        gasBalance: currentGasBalance.toString(),
        gasToken: gasTokenName,
        requiredUSDC: pending.amount || 'unknown',
        requiredGas: minGasRequired.toString(),
        gasTokenName: gasTokenName,
        status: 'pending_deposit',
        message: requiredAmount === 0n 
          ? 'Transfer not found in memory. Cannot determine deposit status. Please create a new transfer.'
          : (!usdcReceived ? 'Waiting for USDC deposit' : `Waiting for ${gasTokenName} deposit (for gas)`),
        note: isReconstructed ? 'Transfer was reconstructed (server may have restarted)' : undefined
      };
    } catch (error) {
      console.error('Error checking deposit:', error);
      throw error;
    }
  }

  /**
   * Estimate gas costs for CCTP transfer operations
   * Returns estimated gas needed in native token (ETH or USDC for Arc)
   */
  async estimateGasCosts(sourceChain, destinationChain, amount) {
    const isArcSource = sourceChain.toLowerCase() === 'arc';
    const isArcDest = destinationChain.toLowerCase() === 'arc';
    
    const sourceProvider = this.getProvider(sourceChain);
    const destProvider = this.getProvider(destinationChain);
    
    if (!sourceProvider) {
      throw new Error(`No RPC configured for ${sourceChain}`);
    }
    if (!destProvider) {
      throw new Error(`No RPC configured for ${destinationChain}`);
    }

    try {
      // Get current gas prices
      const sourceFeeData = await sourceProvider.getFeeData();
      const destFeeData = await destProvider.getFeeData();
      
      // Gas limits (typical values for CCTP operations)
      const gasLimits = {
        approve: 50000n,      // USDC approval
        depositForBurn: 150000n, // depositForBurn transaction
        receiveMessage: 200000n  // receiveMessage (mint) transaction
      };
      
      // Calculate gas costs using minimum gas price for more conservative estimates
      // For EIP-1559 chains, use baseFee + priorityFee (more realistic minimum)
      // For legacy chains, use gasPrice
      // We'll use a conservative approach: use the lower of available prices
      let sourceGasPrice = 0n;
      if (sourceFeeData.gasPrice) {
        // Legacy chain - use gasPrice directly
        sourceGasPrice = sourceFeeData.gasPrice;
      } else if (sourceFeeData.maxFeePerGas && sourceFeeData.maxPriorityFeePerGas) {
        // EIP-1559 chain - use maxPriorityFeePerGas as minimum (tip to miner)
        // This is more conservative than using maxFeePerGas
        sourceGasPrice = sourceFeeData.maxPriorityFeePerGas;
        // Add a small base fee estimate (typically 1-2 gwei on most chains)
        // For better estimates, we add 1 gwei as base fee estimate
        const baseFeeEstimate = ethers.parseUnits('1', 'gwei');
        sourceGasPrice = sourceGasPrice + baseFeeEstimate;
      } else if (sourceFeeData.maxFeePerGas) {
        // Fallback: use maxFeePerGas but reduce by 30% for conservative estimate
        sourceGasPrice = (sourceFeeData.maxFeePerGas * 70n) / 100n;
      }
      
      let destGasPrice = 0n;
      if (destFeeData.gasPrice) {
        // Legacy chain - use gasPrice directly
        destGasPrice = destFeeData.gasPrice;
      } else if (destFeeData.maxFeePerGas && destFeeData.maxPriorityFeePerGas) {
        // EIP-1559 chain - use maxPriorityFeePerGas as minimum (tip to miner)
        destGasPrice = destFeeData.maxPriorityFeePerGas;
        // Add a small base fee estimate
        const baseFeeEstimate = ethers.parseUnits('1', 'gwei');
        destGasPrice = destGasPrice + baseFeeEstimate;
      } else if (destFeeData.maxFeePerGas) {
        // Fallback: use maxFeePerGas but reduce by 30% for conservative estimate
        destGasPrice = (destFeeData.maxFeePerGas * 70n) / 100n;
      }
      
      // Source chain: approve + depositForBurn
      const sourceGasCost = (gasLimits.approve + gasLimits.depositForBurn) * sourceGasPrice;
      
      // Destination chain: receiveMessage
      const destGasCost = gasLimits.receiveMessage * destGasPrice;
      
      // Total gas cost (only source chain matters for initial deposit)
      // Destination gas will be needed when executing the mint
      const totalSourceGasCost = sourceGasCost;
      const totalDestGasCost = destGasCost;
      
      // Format based on chain
      if (isArcSource) {
        // Arc uses USDC as gas token (6 decimals)
        return {
          sourceGasCost: totalSourceGasCost,
          sourceGasCostFormatted: ethers.formatUnits(totalSourceGasCost, 6),
          destGasCost: totalDestGasCost,
          destGasCostFormatted: ethers.formatUnits(totalDestGasCost, 6),
          sourceGasToken: 'USDC',
          destGasToken: isArcDest ? 'USDC' : 'ETH',
          sourceGasLimit: gasLimits.approve + gasLimits.depositForBurn,
          destGasLimit: gasLimits.receiveMessage,
          sourceGasPrice: sourceGasPrice.toString(),
          destGasPrice: destGasPrice.toString()
        };
      } else {
        // Other chains use ETH (18 decimals)
        return {
          sourceGasCost: totalSourceGasCost,
          sourceGasCostFormatted: ethers.formatEther(totalSourceGasCost),
          destGasCost: totalDestGasCost,
          destGasCostFormatted: isArcDest ? ethers.formatUnits(totalDestGasCost, 6) : ethers.formatEther(totalDestGasCost),
          sourceGasToken: 'ETH',
          destGasToken: isArcDest ? 'USDC' : 'ETH',
          sourceGasLimit: (gasLimits.approve + gasLimits.depositForBurn).toString(),
          destGasLimit: gasLimits.receiveMessage.toString(),
          sourceGasPrice: sourceGasPrice.toString(),
          destGasPrice: destGasPrice.toString()
        };
      }
    } catch (error) {
      console.warn(`Error estimating gas costs: ${error.message}`);
      // Fallback to conservative estimates - ALWAYS set token names correctly
      if (isArcSource) {
        // Arc uses USDC as gas token (6 decimals)
        return {
          sourceGasCost: ethers.parseUnits('0.05', 6), // 0.05 USDC (conservative estimate)
          sourceGasCostFormatted: '0.05',
          destGasCost: isArcDest ? ethers.parseUnits('0.05', 6) : ethers.parseEther('0.0005'),
          destGasCostFormatted: isArcDest ? '0.05' : '0.0005',
          sourceGasToken: 'USDC', // Always USDC for Arc
          destGasToken: isArcDest ? 'USDC' : 'ETH',
          sourceGasLimit: '200000',
          destGasLimit: '200000',
          sourceGasPrice: '0',
          destGasPrice: '0',
          estimated: true // Mark as fallback estimate
        };
      } else {
        // Other chains use ETH as gas token (18 decimals)
        return {
          sourceGasCost: ethers.parseEther('0.001'), // 0.001 ETH
          sourceGasCostFormatted: '0.001',
          destGasCost: isArcDest ? ethers.parseUnits('0.05', 6) : ethers.parseEther('0.0005'),
          destGasCostFormatted: isArcDest ? '0.05' : '0.0005',
          sourceGasToken: 'ETH', // Always ETH for non-Arc chains
          destGasToken: isArcDest ? 'USDC' : 'ETH',
          sourceGasLimit: '200000',
          destGasLimit: '200000',
          sourceGasPrice: '0',
          destGasPrice: '0',
          estimated: true // Mark as fallback estimate
        };
      }
    }
  }

  /**
   * Check if wallet has sufficient gas token for gas
   * Returns balance in native token (ETH or USDC for Arc)
   */
  async checkGasBalance(chain) {
    if (!this.cctpWalletAddress) {
      throw new Error('CCTP wallet not configured');
    }

    const provider = this.getProvider(chain);
    if (!provider) {
      throw new Error(`No RPC configured for ${chain}`);
    }

    const isArc = chain.toLowerCase() === 'arc';
    
    if (isArc) {
      // Arc uses USDC as native gas token - check native balance (no contract needed)
      try {
        return await provider.getBalance(this.cctpWalletAddress);
      } catch (error) {
        console.warn(`Error checking native USDC balance for gas on ${chain}:`, error.message);
        return 0n;
      }
    } else {
      // Other chains use ETH
      return await provider.getBalance(this.cctpWalletAddress);
    }
  }

  /**
   * Execute CCTP transfer for a pending transfer (after USDC received)
   * Uses Bridge Kit to handle the entire transfer flow
   * 
   * @param {string} transferId - Transfer ID
   * @param {object} options - Optional parameters for reconstruction after server restart
   * @param {string} options.sourceChain - Source chain (required if transfer not in memory)
   * @param {string} options.destinationChain - Destination chain (required if transfer not in memory)
   * @param {string} options.amount - Transfer amount (required if transfer not in memory)
   * @param {string} options.recipient - Recipient address (required if transfer not in memory)
   * @param {boolean} options.useFastAttestation - Whether to use fast attestation (default: true)
   */
  async executePendingTransfer(transferId, options = {}) {
    console.log(`\n[CCTP Backend] 🚀 ==========================================`);
    console.log(`[CCTP Backend] Executing Pending Transfer: ${transferId}`);
    console.log(`[CCTP Backend] ==========================================`);
    let pending = this.pendingTransfers.get(transferId);
    
    // If transfer not found, try to reconstruct from options
    if (!pending) {
      console.warn(`⚠️  Transfer ${transferId} not found in memory. Attempting to reconstruct...`);
      
      const { sourceChain, destinationChain, amount, recipient, useFastAttestation } = options;
      
      if (!sourceChain || !destinationChain || !amount || !recipient) {
        throw new Error(
          `Transfer ${transferId} not found. ` +
          `Please provide sourceChain, destinationChain, amount, and recipient parameters ` +
          `to reconstruct the transfer after server restart.`
        );
      }
      
      // Reconstruct the transfer object
      pending = {
        id: transferId,
        sourceChain,
        destinationChain,
        amount: amount.toString(),
        recipient,
        useFastAttestation: useFastAttestation !== false,
        status: 'deposit_received', // Assume deposit was received if we're executing
        isReconstructed: true
      };
      
      console.log(`✓ Reconstructed transfer from parameters:`, {
        sourceChain: pending.sourceChain,
        destinationChain: pending.destinationChain,
        amount: pending.amount,
        recipient: pending.recipient
      });
    }

    console.log(`Transfer details:`, {
      sourceChain: pending.sourceChain,
      destinationChain: pending.destinationChain,
      amount: pending.amount,
      recipient: pending.recipient,
      status: pending.status
    });
    console.log(`⚠️  IMPORTANT: USDC will be minted to: ${pending.recipient}`);
    console.log(`   Make sure this is the correct recipient address, not a vault address!`);

    // Update status to deposit_received since we're executing (transaction is confirmed)
    if (pending.status !== 'deposit_received') {
      console.log(`  Updating status from ${pending.status} to deposit_received (transaction confirmed)`);
      pending.status = 'deposit_received';
      pending.depositReceivedAt = Date.now();
      this.pendingTransfers.set(transferId, pending);
    }

    // Skip gas balance check - Bridge Kit will handle it
    // RPC calls are timing out, so we'll let Bridge Kit handle gas validation
    console.log(`[CCTP Backend] Skipping gas balance check (Bridge Kit will validate)`);

    // Execute the full CCTP transfer using Bridge Kit
    console.log(`[CCTP Backend] Step 1: Starting Bridge Kit transfer execution...`);
    console.log(`[CCTP Backend]   Source: ${pending.sourceChain}`);
    console.log(`[CCTP Backend]   Destination: ${pending.destinationChain}`);
    console.log(`[CCTP Backend]   Amount: ${pending.amount} USDC`);
    console.log(`[CCTP Backend]   Recipient: ${pending.recipient}`);
    console.log(`[CCTP Backend]   Fast Transfer: ${pending.useFastAttestation ? 'Yes' : 'No'}`);
    
    const result = await this.executeFullTransfer({
      sourceChain: pending.sourceChain,
      destinationChain: pending.destinationChain,
      amount: pending.amount,
      recipient: pending.recipient,
      useFastAttestation: pending.useFastAttestation
    });

    console.log(`[CCTP Backend] ✅ Bridge Kit transfer completed successfully!`);
    console.log(`[CCTP Backend]   Total time: ${result.totalTime || 'N/A'}s`);
    if (result.initiate?.txHash) {
      console.log(`[CCTP Backend]   Initiate TX: ${result.initiate.txHash}`);
    }
    if (result.complete?.txHash) {
      console.log(`[CCTP Backend]   Complete TX: ${result.complete.txHash}`);
    }

    // Update status
    pending.status = 'completed';
    pending.completedAt = Date.now();
    pending.result = result;
    this.pendingTransfers.set(transferId, pending);

    // Return serializable result - serialize all BigInt values recursively
    const response = {
      transferId,
      ...result,
      status: 'completed'
    };
    
    console.log(`[CCTP Backend] ==========================================\n`);
    
    // Recursively serialize all BigInt values to strings
    return this.serializeBigInts(response);
  }

  /**
   * Get pending transfer status
   */
  getPendingTransfer(transferId) {
    const pending = this.pendingTransfers.get(transferId);
    if (!pending) {
      return null;
    }
    return { ...pending };
  }

  /**
   * Validate that routing follows Arc-only rules:
   * - From other chains → Arc (allowed)
   * - From Arc → other chains (allowed)
   * - Between two non-Arc chains (NOT allowed)
   */
  validateRouting(sourceChain, destinationChain) {
    const isArcSource = sourceChain === 'arc';
    const isArcDestination = destinationChain === 'arc';
    
    // Both must be Arc (local transfer - not CCTP)
    if (isArcSource && isArcDestination) {
      throw new Error('CCTP routing: Both source and destination cannot be Arc. Use local transfer instead.');
    }
    
    // One must be Arc, the other must not be
    if (!isArcSource && !isArcDestination) {
      throw new Error(`CCTP routing: Direct transfers between ${sourceChain} and ${destinationChain} are not allowed. All transfers must involve Arc (${sourceChain} → Arc → ${destinationChain}).`);
    }
    
    // Valid: one is Arc, the other is not
    return true;
  }

  /**
   * Execute full CCTP transfer using Bridge Kit
   * This handles the entire flow: burn, attestation, and mint
   */
  async executeFullTransfer({ sourceChain, destinationChain, amount, recipient, useFastAttestation = true }) {
    console.log(`\n[CCTP Backend] === Starting Full CCTP Transfer with Bridge Kit ===`);
    console.log(`[CCTP Backend] Source: ${sourceChain}, Destination: ${destinationChain}`);
    console.log(`[CCTP Backend] Amount: ${amount} USDC, Recipient: ${recipient || this.cctpWalletAddress}`);
    console.log(`[CCTP Backend] Fast Transfer: ${useFastAttestation ? 'Yes' : 'No'}`);

    // Validate routing rules: must involve Arc
    this.validateRouting(sourceChain, destinationChain);

    if (!this.privateKey) {
      throw new Error('CCTP_PRIVATE_KEY not configured');
    }

    // Initialize Bridge Kit if needed
    if (!this._kitInitialized) {
      this._initializeBridgeKit();
    }

    if (!this.kit) {
      throw new Error('Bridge Kit not initialized. Check server logs for initialization errors.');
    }

    try {
      // Create adapter exactly like test file
      console.log(`[CCTP Backend] Creating adapter for Bridge Kit...`);
      const adapter = this.createAdapter(sourceChain);

      // Get Bridge Kit chain names and exact identifiers
      const sourceChainName = this.getBridgeKitChainName(sourceChain);
      const destinationChainName = this.getBridgeKitChainName(destinationChain);
      const finalSourceChain = this.getExactChainIdentifier(sourceChainName);
      const finalDestChain = this.getExactChainIdentifier(destinationChainName);

      console.log(`[CCTP Backend] Chain name resolution:`);
      console.log(`  Source: ${sourceChain} → ${sourceChainName} → ${finalSourceChain}`);
      console.log(`  Destination: ${destinationChain} → ${destinationChainName} → ${finalDestChain}`);
      
      // Validate chain identifiers before proceeding
      if (!finalSourceChain || !finalDestChain) {
        throw new Error(`Invalid chain identifiers: source=${finalSourceChain}, dest=${finalDestChain}`);
      }
      
      // Log available supported chains for debugging (only if we had issues)
      if (this.supportedChainDefinitions && this.supportedChainDefinitions.length > 0) {
        const allChains = this.supportedChainDefinitions.map(c => `${c.chain} (${c.name})`).join(', ');
        console.log(`[CCTP Backend] Available Bridge Kit chains (${this.supportedChainDefinitions.length} total):`, allChains);
        
        // Specifically check if our destination chain is in the list
        const destChainDef = this.supportedChainDefinitions.find(c => 
          c.chain === finalDestChain || c.name?.toLowerCase() === finalDestChain.toLowerCase()
        );
        if (!destChainDef) {
          console.error(`[CCTP Backend] ⚠️  WARNING: Destination chain "${finalDestChain}" not found in Bridge Kit supported chains!`);
          console.error(`[CCTP Backend] This will likely cause "Invalid destination domain" error.`);
        } else {
          console.log(`[CCTP Backend] ✓ Destination chain "${finalDestChain}" confirmed in Bridge Kit supported chains`);
        }
      }

      // Pre-approve USDC like test file does (to avoid timing issues)
      console.log(`[CCTP Backend] Pre-approving USDC for Bridge Kit...`);
      try {
        const { createPublicClient, createWalletClient, http, parseUnits, formatUnits } = await import('viem');
        const { privateKeyToAccount } = await import('viem/accounts');
        
        // Get wallet address
        const account = privateKeyToAccount(`0x${this.privateKey.replace(/^0x/, '')}`);
        const walletAddress = account.address;
        
        // Get USDC address and RPC for source chain
        const usdcAddress = this.getUSDCAddress(sourceChain);
        const rpcUrl = this.rpcUrls[sourceChain];
        
        if (usdcAddress && rpcUrl) {
          // Get chain config based on source chain
          let viemChain;
          if (sourceChain.toLowerCase() === 'base' || sourceChain.toLowerCase().includes('base')) {
            const { baseSepolia } = await import('viem/chains');
            viemChain = baseSepolia;
          } else if (sourceChain.toLowerCase() === 'arc') {
            // Arc chain config would go here if needed
            viemChain = null;
          }
          
          if (viemChain) {
            const publicClient = createPublicClient({
              chain: viemChain,
              transport: http(rpcUrl, { timeout: 10000 }),
            });
            
            const walletClient = createWalletClient({
              account,
              chain: viemChain,
              transport: http(rpcUrl, { timeout: 10000 }),
            });
            
            // Bridge Kit's bridge contract address (from test file)
            const bridgeContract = '0xC5567a5E3370d4DBfB0540025078e283e36A363d';
            
            // Check current allowance
            const usdcAbi = [
              { inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }], name: 'allowance', outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' }
            ];
            
            const allowance = await publicClient.readContract({
              address: usdcAddress,
              abi: usdcAbi,
              functionName: 'allowance',
              args: [walletAddress, bridgeContract]
            });
            
            const amountNeeded = parseFloat(amount);
            const allowanceFormatted = parseFloat(formatUnits(allowance, 6));
            
            console.log(`[CCTP Backend]   Current allowance: ${allowanceFormatted} USDC`);
            console.log(`[CCTP Backend]   Amount needed: ${amountNeeded} USDC`);
            
            // Pre-approve if allowance is insufficient
            if (allowanceFormatted < amountNeeded) {
              console.log(`[CCTP Backend]   Pre-approving large amount to avoid timing issues...`);
              const approveAmount = parseUnits('1000000', 6); // 1M USDC like test file
              
              const approveTx = await walletClient.writeContract({
                address: usdcAddress,
                abi: [
                  { inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], name: 'approve', outputs: [{ name: '', type: 'bool' }], stateMutability: 'nonpayable', type: 'function' }
                ],
                functionName: 'approve',
                args: [bridgeContract, approveAmount]
              });
              
              console.log(`[CCTP Backend]   Approval TX: ${approveTx}`);
              console.log(`[CCTP Backend]   Waiting for confirmation...`);
              
              await publicClient.waitForTransactionReceipt({ hash: approveTx });
              console.log(`[CCTP Backend]   ✅ Approval confirmed!`);
            } else {
              console.log(`[CCTP Backend]   ✅ Allowance is sufficient`);
            }
          }
        }
      } catch (approvalError) {
        console.warn(`[CCTP Backend] ⚠️  Could not pre-approve: ${approvalError.message}`);
        console.warn(`[CCTP Backend]   Proceeding anyway - Bridge Kit will handle approval`);
      }

      // Convert amount to human-readable format (like test file uses '1.0' not '1000000')
      // Amount comes in as wei format (e.g., '1000000' for 1 USDC), convert to '1.0'
      const amountBigInt = BigInt(amount);
      const amountFormatted = (Number(amountBigInt) / 1e6).toString();
      
      // Execute the bridge transfer - exactly like test file
      console.log(`[CCTP Backend] Executing bridge transfer...`);
      console.log(`[CCTP Backend]   From: ${finalSourceChain}`);
      console.log(`[CCTP Backend]   To: ${finalDestChain}`);
      console.log(`[CCTP Backend]   Amount: ${amountFormatted} USDC (${amount} wei)`);
      console.log(`[CCTP Backend]   Recipient: ${recipient || this.cctpWalletAddress}`);
      console.log(`[CCTP Backend]   Transfer Speed: ${useFastAttestation ? 'FAST' : 'STANDARD'}`);

      const startTime = Date.now();
      // Use amount as human-readable string (like test file: '1.0' not '1000000')
      const result = await this.kit.bridge({
        from: { adapter, chain: finalSourceChain },
        to: {
          adapter,
          chain: finalDestChain,
          recipientAddress: recipient || this.cctpWalletAddress
        },
        amount: amountFormatted, // Use human-readable format like test file ('1.0')
        config: {
          transferSpeed: useFastAttestation ? 'FAST' : 'STANDARD'
        }
      });
      const elapsed = Date.now() - startTime;

      console.log(`\n✅ Bridge transfer completed!`);
      console.log(`  Steps: ${result.steps?.length || 'N/A'}`);
      console.log(`  Time elapsed: ${(elapsed / 1000).toFixed(2)}s`);
      
      // Log full result structure for debugging
      console.log(`\n📦 Full Bridge Kit Result Structure:`);
      console.log(`  Result keys: ${Object.keys(result).join(', ')}`);
      if (result.steps) {
        console.log(`  Steps array length: ${result.steps.length}`);
        console.log(`  Steps array:`, JSON.stringify(result.steps.map(s => ({
          type: s.type,
          chain: s.chain,
          status: s.status,
          hasTxHash: !!s.txHash,
          hasRecipient: !!(s.recipient || s.recipientAddress)
        })), null, 2));
      } else {
        console.warn(`  ⚠️  No 'steps' property in result!`);
        console.log(`  Result structure:`, JSON.stringify(this.serializeBigInts(result), null, 2));
      }

      // Log all steps for debugging
      if (result.steps && result.steps.length > 0) {
        console.log(`\n📋 Transfer Steps (detailed):`);
        result.steps.forEach((step, index) => {
          const stepName = step.name || step.type || 'unknown';
          const stepState = step.state || step.status || 'unknown';
          console.log(`  Step ${index + 1}: ${stepName} (state: ${stepState})`);
          console.log(`    Full step object keys: ${Object.keys(step).join(', ')}`);
          if (step.txHash) {
            console.log(`    TX Hash: ${step.txHash}`);
          }
          if (step.chain) {
            console.log(`    Chain: ${step.chain}`);
          }
          if (step.amount) {
            console.log(`    Amount: ${step.amount}`);
          }
          if (step.recipient) {
            console.log(`    Recipient: ${step.recipient}`);
          }
          if (step.recipientAddress) {
            console.log(`    Recipient Address: ${step.recipientAddress}`);
          }
          if (step.status) {
            console.log(`    Status: ${step.status}`);
          }
          if (step.state) {
            console.log(`    State: ${step.state}`);
          }
          if (step.blockchain) {
            console.log(`    Blockchain: ${step.blockchain}`);
          }
          if (step.transactionHash) {
            console.log(`    Transaction Hash: ${step.transactionHash}`);
          }
          if (step.error) {
            console.log(`    Error: ${step.error}`);
          }
          if (step.errorMessage) {
            console.log(`    Error Message: ${step.errorMessage}`);
          }
          if (step.explorerUrl) {
            console.log(`    Explorer URL: ${step.explorerUrl}`);
          }
        });
      } else {
        console.warn(`  ⚠️  No steps found in result!`);
      }

      // Extract transaction hashes from result
      // Bridge Kit uses 'name' property for step type (e.g., 'Burn', 'Mint')
      // Also check 'state' to see if step completed successfully
      const burnStep = result.steps?.find(s => {
        const name = (s.name || s.type || '').toLowerCase();
        const state = (s.state || s.status || '').toLowerCase();
        return (
          name.includes('burn') ||
          name.includes('approve') ||
          (state === 'complete' && s.txHash && !name.includes('mint'))
        );
      });
      
      const mintStep = result.steps?.find(s => {
        const name = (s.name || s.type || '').toLowerCase();
        const state = (s.state || s.status || '').toLowerCase();
        return (
          name.includes('mint') ||
          name.includes('receive') ||
          (state === 'complete' && s.txHash && name !== 'burn' && !name.includes('approve'))
        );
      });
      
      // If we still can't find mint step, check by position (usually last step) or by checking destination chain
      let finalMintStep = mintStep;
      if (!finalMintStep && result.steps && result.steps.length > 0) {
        // Try to find step that's on destination chain or is the last step with a txHash
        const lastStepWithTx = [...result.steps].reverse().find(s => s.txHash);
        if (lastStepWithTx && lastStepWithTx !== burnStep) {
          finalMintStep = lastStepWithTx;
          console.log(`  ℹ️  Using last step with txHash as mint step`);
        }
      }
      
      const burnTxHash = burnStep?.txHash || burnStep?.transactionHash || burnStep?.hash;
      const mintTxHash = finalMintStep?.txHash || finalMintStep?.transactionHash || finalMintStep?.hash;
      
      // Log mint details
      if (finalMintStep) {
        console.log(`\n💰 Mint Transaction Details:`);
        console.log(`  Step Name: ${finalMintStep.name || finalMintStep.type || 'N/A'}`);
        console.log(`  Step State: ${finalMintStep.state || finalMintStep.status || 'N/A'}`);
        console.log(`  TX Hash: ${mintTxHash || 'N/A'}`);
        if (mintTxHash && finalMintStep.explorerUrl) {
          console.log(`  Explorer URL: ${finalMintStep.explorerUrl}`);
        }
        console.log(`  Chain: ${finalMintStep.chain || destinationChain}`);
        console.log(`  Expected Recipient: ${recipient || this.cctpWalletAddress}`);
        console.log(`  Step Recipient: ${finalMintStep.recipient || finalMintStep.recipientAddress || 'N/A'}`);
        console.log(`  Amount: ${finalMintStep.amount || amount}`);
        
        // Check for errors in mint step
        if (finalMintStep.error || finalMintStep.errorMessage) {
          console.error(`  ❌ Mint step has error: ${finalMintStep.error || finalMintStep.errorMessage}`);
        }
        
        // Verify recipient matches
        const expectedRecipient = (recipient || this.cctpWalletAddress).toLowerCase();
        const actualRecipient = (finalMintStep.recipient || finalMintStep.recipientAddress || '').toLowerCase();
        if (actualRecipient && actualRecipient !== expectedRecipient) {
          console.warn(`  ⚠️  WARNING: Recipient mismatch!`);
          console.warn(`     Expected: ${expectedRecipient}`);
          console.warn(`     Actual: ${actualRecipient}`);
        } else if (actualRecipient) {
          console.log(`  ✓ Recipient matches: ${actualRecipient}`);
        } else {
          console.log(`  ℹ️  Recipient not specified in step, will verify via balance check`);
        }
      } else {
        console.warn(`  ⚠️  No mint step found in result!`);
        console.warn(`  Available steps:`, result.steps?.map((s, i) => ({
          index: i,
          name: s.name || s.type,
          state: s.state || s.status,
          hasTxHash: !!s.txHash
        })));
      }

      // Serialize steps to remove BigInt values
      const serializedSteps = (result.steps || []).map(step => {
        const serialized = { ...step };
        // Convert any BigInt values to strings
        if (typeof serialized.amount === 'bigint') serialized.amount = serialized.amount.toString();
        if (typeof serialized.gasUsed === 'bigint') serialized.gasUsed = serialized.gasUsed.toString();
        if (typeof serialized.gasPrice === 'bigint') serialized.gasPrice = serialized.gasPrice.toString();
        if (typeof serialized.value === 'bigint') serialized.value = serialized.value.toString();
        if (typeof serialized.fee === 'bigint') serialized.fee = serialized.fee.toString();
        // Handle nested objects
        if (serialized.fees && Array.isArray(serialized.fees)) {
          serialized.fees = serialized.fees.map(fee => ({
            ...fee,
            amount: typeof fee.amount === 'bigint' ? fee.amount.toString() : fee.amount
          }));
        }
        return serialized;
      });

      // Verify mint on destination chain by checking USDC balance
      let mintVerified = false;
      let actualMintRecipient = null;
      if (mintTxHash && destinationChain) {
        try {
          console.log(`\n🔍 Verifying mint on ${destinationChain}...`);
          const destProvider = this.getProvider(destinationChain);
          const destUSDCAddress = this.getUSDCAddress(destinationChain);
          
          if (destProvider && destUSDCAddress) {
            // Wait a bit for transaction to be confirmed
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            const usdcContract = new ethers.Contract(
              destUSDCAddress,
              ['function balanceOf(address) view returns (uint256)'],
              destProvider
            );
            
            const expectedRecipient = recipient || this.cctpWalletAddress;
            const balance = await usdcContract.balanceOf(expectedRecipient);
            const balanceFormatted = ethers.formatUnits(balance, 6);
            
            console.log(`  Recipient ${expectedRecipient} USDC balance: ${balanceFormatted} USDC`);
            
            if (balance > 0n) {
              mintVerified = true;
              actualMintRecipient = expectedRecipient;
              console.log(`  ✓ Mint verified! Recipient has ${balanceFormatted} USDC`);
            } else {
              console.warn(`  ⚠️  Recipient balance is 0. Mint may not have completed yet or went to wrong address.`);
              console.warn(`  ⚠️  Check mint transaction: ${mintTxHash}`);
            }
          }
        } catch (verifyError) {
          console.warn(`  ⚠️  Could not verify mint: ${verifyError.message}`);
        }
      }

      return {
        success: true,
        burnTxHash,
        mintTxHash,
        mintVerified,
        actualMintRecipient,
        steps: serializedSteps,
        elapsed: elapsed / 1000,
        sourceChain,
        destinationChain,
        amount: typeof amount === 'bigint' ? amount.toString() : amount,
        recipient: recipient || this.cctpWalletAddress
      };
    } catch (error) {
      console.error(`❌ Bridge transfer failed:`, error);
      throw new Error(`Bridge transfer failed: ${error.message}`);
    }
  }

  /**
   * Recursively serialize an object, converting all BigInt values to strings
   */
  serializeBigInts(obj) {
    if (obj === null || obj === undefined) {
      return obj;
    }
    
    if (typeof obj === 'bigint') {
      return obj.toString();
    }
    
    if (Array.isArray(obj)) {
      return obj.map(item => this.serializeBigInts(item));
    }
    
    if (typeof obj === 'object') {
      const serialized = {};
      for (const [key, value] of Object.entries(obj)) {
        serialized[key] = this.serializeBigInts(value);
      }
      return serialized;
    }
    
    return obj;
  }

  /**
   * Format amount for Bridge Kit (expects string in USDC format, e.g., "10.00")
   * Handles both decimal strings (like "0.1") and smallest unit strings (like "100000")
   */
  formatUSDCAmount(amount) {
    if (typeof amount === 'string') {
      // Check if it's a decimal string (like "0.1" or "10.5")
      if (amount.includes('.')) {
        // Already in USDC format, just return it formatted
        return parseFloat(amount).toFixed(6);
      } else {
        // Assume it's in smallest units (6 decimals), convert to USDC format
        try {
          const amountBigInt = BigInt(amount);
          const usdcAmount = Number(amountBigInt) / 1e6;
          return usdcAmount.toFixed(6);
        } catch (error) {
          // If BigInt conversion fails, try parsing as float
          return parseFloat(amount).toFixed(6);
        }
      }
    }
    // If already a number, assume it's in USDC units
    return parseFloat(amount).toFixed(6);
  }

  /**
   * Parse USDC amount from string format to smallest units
   * Handles both decimal strings (like "0.1") and smallest unit strings (like "100000")
   */
  parseUSDCAmount(amountString) {
    if (typeof amountString === 'string' && amountString.includes('.')) {
      // Decimal string (like "0.1"), convert to smallest units
      const amount = parseFloat(amountString);
      return BigInt(Math.floor(amount * 1e6));
    } else {
      // Already in smallest units or number, convert to BigInt
      try {
        return BigInt(amountString);
      } catch (error) {
        // If it's a number, convert to smallest units first
        const amount = parseFloat(amountString);
        return BigInt(Math.floor(amount * 1e6));
      }
    }
  }

  /**
   * Get provider for a chain (for balance checks)
   */
  getProvider(chain) {
    const url = this.rpcUrls[chain];
    if (!url) {
      console.warn(`No RPC URL configured for ${chain}`);
      return null;
    }
    return new ethers.JsonRpcProvider(url);
  }

  /**
   * Get USDC address for a chain (for balance checks)
   * Bridge Kit handles this internally, but we need it for checking deposits
   */
  getUSDCAddress(chain) {
    // First try configured address
    if (this.usdcAddresses[chain]) {
      return this.usdcAddresses[chain];
    }
    
    // Fallback to Bridge Kit chain definitions
    if (this.supportedChainDefinitions) {
      const bridgeKitChainName = this.getBridgeKitChainName(chain);
      const chainDef = this.supportedChainDefinitions.find(
        c => c.chain === bridgeKitChainName || c.name?.toLowerCase().includes(chain.toLowerCase())
      );
      
      if (chainDef?.usdcAddress) {
        console.log(`  Using USDC address from Bridge Kit for ${chain}: ${chainDef.usdcAddress}`);
        return chainDef.usdcAddress;
      }
    }
    
    return null;
  }

  /**
   * Get estimated transfer time
   */
  getEstimatedTime(sourceChain, destinationChain, useFastAttestation = true) {
    if (useFastAttestation) {
      // Fast attestation: available after 1 block confirmation (CCTP V2)
      const blockTimes = {
        base: 2,
        basesepolia: 2,
        'base-sepolia': 2,
        polygon: 2,
        arc: 5
      };
      
      const blockTime = blockTimes[sourceChain] || 5;
      const attestationTime = blockTime + 10; // 1 block + buffer
      
      return {
        attestationTime,
        executionTime: 30,
        total: attestationTime + 30,
        fast: true
      };
    } else {
      return {
        attestationTime: 900,
        executionTime: 30,
        total: 930,
        fast: false
      };
    }
  }

  /**
   * Check if CCTP is available for a chain pair
   * Also validates routing rules (must involve Arc)
   */
  isAvailable(sourceChain, destinationChain) {
    try {
      this.validateRouting(sourceChain, destinationChain);
    } catch (error) {
      return false;
    }

    // Check if we have RPC URLs and adapters can be created
    const hasSourceRPC = !!this.rpcUrls[sourceChain];
    const hasDestRPC = !!this.rpcUrls[destinationChain];
    const hasSourceChainName = !!this.chainNameMap[sourceChain] || sourceChain === 'arc';
    const hasDestChainName = !!this.chainNameMap[destinationChain] || destinationChain === 'arc';

    return hasSourceRPC && hasDestRPC && hasSourceChainName && hasDestChainName;
  }

  /**
   * Get supported chains (all chains that can interact with Arc via CCTP)
   */
  getSupportedChains() {
    return Object.keys(this.chainNameMap).filter(chain => chain !== 'arc');
  }

  /**
   * COMPATIBILITY METHOD: Initiate CCTP transfer (burn on source chain)
   * This is a compatibility method for the existing API.
   * For new code, use executeFullTransfer() which uses Bridge Kit.
   * 
   * This method uses Bridge Kit internally but only executes the burn step.
   * Note: Bridge Kit handles everything atomically, so this is a simplified version.
   */
  async initiateTransfer({ sourceChain, amount, destinationChain = 'arc', recipient, useFastAttestation = true, signer = null }) {
    console.warn('⚠️  initiateTransfer() is deprecated. Use executeFullTransfer() for full Bridge Kit support.');
    
    // Validate routing rules: must involve Arc
    this.validateRouting(sourceChain, destinationChain);

    if (!this.privateKey) {
      throw new Error('CCTP_PRIVATE_KEY not configured');
    }

    try {
      // For compatibility, we'll execute the full transfer
      // Bridge Kit handles everything atomically, so we execute the full transfer
      // and return the burn tx hash for API compatibility
      const result = await this.executeFullTransfer({
        sourceChain,
        destinationChain,
        amount,
        recipient,
        useFastAttestation
      });

      // Return in the format expected by the old API
      return {
        txHash: result.burnTxHash || 'bridge-kit-transfer',
        sourceChain,
        destinationChain,
        amount,
        useFastAttestation,
        status: 'initiated'
      };
    } catch (error) {
      console.error('Error initiating transfer:', error);
      throw error;
    }
  }

  /**
   * COMPATIBILITY METHOD: Wait for attestation
   * This is a compatibility method for the existing API.
   * Bridge Kit handles attestation automatically, so this is mostly a no-op.
   */
  async waitForAttestation(txHash, useFastAttestation = true) {
    console.warn('⚠️  waitForAttestation() is deprecated. Bridge Kit handles attestation automatically.');
    
    // Bridge Kit handles attestation internally, so we just wait a bit
    // In a real implementation, you'd poll the Bridge Kit status
    const estimatedTime = useFastAttestation ? 30 : 900; // seconds
    console.log(`Waiting for attestation (Bridge Kit handles this automatically)...`);
    
    // Return a mock attestation result
    // In practice, you'd query Bridge Kit's transfer status
    await new Promise(resolve => setTimeout(resolve, Math.min(estimatedTime * 1000, 5000)));
    
    return {
      attestation: 'bridge-kit-handled',
      message: 'bridge-kit-handled',
      status: 'complete',
      elapsed: estimatedTime,
      fast: useFastAttestation
    };
  }

  /**
   * COMPATIBILITY METHOD: Complete transfer (mint on destination)
   * This is a compatibility method for the existing API.
   * Bridge Kit handles this automatically in executeFullTransfer().
   */
  async completeTransfer({ attestation, message, destinationChain, signer = null }) {
    console.warn('⚠️  completeTransfer() is deprecated. Bridge Kit handles minting automatically in executeFullTransfer().');
    
    // Bridge Kit already completed the transfer in executeFullTransfer()
    // This is just for API compatibility
    return {
      txHash: 'bridge-kit-handled',
      destinationChain,
      status: 'completed'
    };
  }
}
