/**
 * Real Vault Contract Interactions
 */

import { ethers } from 'ethers';

export const VAULT_ABI = [
  'function deposit(uint256 projectTokenAmount, uint256 usdcAmount, uint256 minShares) external returns (uint256)',
  'function withdraw(uint256 shares, uint256 minProjectToken, uint256 minUsdc) external returns (uint256, uint256)',
  'function previewWithdraw(uint256 shares) external view returns (uint256, uint256)',
  'function getReserves() external view returns (uint256, uint256)',
  'function balanceOf(address) external view returns (uint256)',
  'function totalSupply() external view returns (uint256)',
  'function projectToken() external view returns (address)',
  'function usdc() external view returns (address)',
  'function governance() external view returns (address)',
  'function totalProjectToken() external view returns (uint256)',
  'function totalUSDC() external view returns (uint256)'
];

export const VAULT_FACTORY_ABI = [
  'function createVault(address projectToken, string name, string symbol) external returns (address)',
  'function getVault(address projectToken) external view returns (address)',
  'function allVaults(uint256) external view returns (address)',
  'function allVaultsLength() external view returns (uint256)',
  'function getVaultByIndex(uint256) external view returns (address vault, address projectToken)'
];

export const ERC20_ABI = [
  'function balanceOf(address) external view returns (uint256)',
  'function approve(address spender, uint256 amount) external returns (bool)',
  'function allowance(address owner, address spender) external view returns (uint256)',
  'function decimals() external view returns (uint8)',
  'function symbol() external view returns (string)',
  'function name() external view returns (string)'
];

export async function getVaultContract(vaultAddress: string, signerOrProvider: ethers.Signer | ethers.Provider) {
  return new ethers.Contract(vaultAddress, VAULT_ABI, signerOrProvider);
}

export async function depositToVault(
  vaultAddress: string,
  projectTokenAmount: bigint,
  usdcAmount: bigint,
  minShares: bigint,
  signer: ethers.Signer,
  expectedChainId?: number
): Promise<{ success: boolean; shares?: string; txHash?: string; error?: string }> {
  try {
    if (!signer.provider) {
      throw new Error('No provider available. Please connect your wallet.');
    }

    // Get the correct RPC URL for the expected network
    // Support multiple chains via environment variables or defaults
    let rpcUrl: string | null = null;
    
    if (expectedChainId === 5042002) {
      // Arc Testnet
      rpcUrl = process.env.NEXT_PUBLIC_ARC_RPC_URL || 'https://rpc.testnet.arc.network';
    } else if (expectedChainId === 11155111) {
      // Ethereum Sepolia
      rpcUrl = process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL || 'https://ethereum-sepolia-rpc.publicnode.com';
    } else if (expectedChainId === 84532) {
      // Base Sepolia
      rpcUrl = process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org';
    } else if (expectedChainId === 80002) {
      // Polygon Amoy
      rpcUrl = process.env.NEXT_PUBLIC_POLYGON_AMOY_RPC_URL || 'https://rpc-amoy.polygon.technology';
    } else if (expectedChainId === 421614) {
      // Arbitrum Sepolia
      rpcUrl = process.env.NEXT_PUBLIC_ARBITRUM_SEPOLIA_RPC_URL || 'https://sepolia-rollup.arbitrum.io/rpc';
    } else if (expectedChainId === 43113) {
      // Avalanche Fuji
      rpcUrl = process.env.NEXT_PUBLIC_AVALANCHE_FUJI_RPC_URL || 'https://api.avax-test.network/ext/bc/C/rpc';
    } else if (expectedChainId === 11155420) {
      // Optimism Sepolia
      rpcUrl = process.env.NEXT_PUBLIC_OPTIMISM_SEPOLIA_RPC_URL || 'https://sepolia.optimism.io';
    }
    
    if (!rpcUrl) {
      throw new Error(`Unsupported chain ID: ${expectedChainId}. Please add RPC URL configuration for this chain.`);
    }
    
    // Use public RPC provider for contract verification (more reliable)
    const publicProvider = new ethers.JsonRpcProvider(rpcUrl);
    
    // Check network via public RPC
    const network = await publicProvider.getNetwork();
    const chainId = Number(network.chainId);
    const networkName = network.name || 'unknown';
    console.log(`Verifying vault on network: ${networkName} (chainId: ${chainId})`);
    console.log(`Vault address: ${vaultAddress}`);
    
    // Verify we're on the expected network
    if (expectedChainId && chainId !== expectedChainId) {
      const networkNames: Record<number, string> = {
        5042002: 'Arc Testnet',
        11155111: 'Ethereum Sepolia',
        84532: 'Base Sepolia',
        80002: 'Polygon Amoy',
        421614: 'Arbitrum Sepolia',
        43113: 'Avalanche Fuji',
        11155420: 'Optimism Sepolia'
      };
      const expectedNetwork = networkNames[expectedChainId] || `ChainId ${expectedChainId}`;
      throw new Error(
        `Network mismatch!\n\n` +
        `RPC returned: ${networkName} (chainId: ${chainId})\n` +
        `Expected: ${expectedNetwork} (chainId: ${expectedChainId})\n\n` +
        `Please check your RPC URL configuration.`
      );
    }
    
    // Verify contract exists using public RPC (reliable source)
    console.log('Checking if contract exists...');
    const code = await publicProvider.getCode(vaultAddress);
    console.log(`Contract code length: ${code ? code.length : 0} chars`);
    
    if (!code || code === '0x' || code.length <= 2) {
      const blockNumber = await publicProvider.getBlockNumber();
      console.error('Contract check failed:', {
        vaultAddress,
        chainId,
        networkName,
        blockNumber,
        codeLength: code?.length || 0,
        expectedChainId,
        rpcUrl
      });
      
      const networkNames: Record<number, string> = {
        5042002: 'Arc Testnet',
        11155111: 'Ethereum Sepolia',
        84532: 'Base Sepolia',
        80002: 'Polygon Amoy',
        421614: 'Arbitrum Sepolia',
        43113: 'Avalanche Fuji',
        11155420: 'Optimism Sepolia'
      };
      const networkHint = networkNames[expectedChainId] 
        ? `${networkNames[expectedChainId]} (chainId: ${expectedChainId})`
        : `chainId: ${expectedChainId}`;
      
      throw new Error(
        `No contract found at ${vaultAddress} on ${networkName} (chainId: ${chainId}).\n\n` +
        `This usually means:\n` +
        `1. The vault address is incorrect\n` +
        `2. The contract wasn't deployed to this network\n` +
        `3. The RPC endpoint is wrong\n\n` +
        `Expected network: ${networkHint}\n` +
        `RPC URL: ${rpcUrl}\n` +
        `Block number: ${blockNumber}\n\n` +
        `Please verify the vault address and network configuration.`
      );
    }
    
    console.log(`Vault contract exists, fetching token addresses...`);
    const vault = new ethers.Contract(vaultAddress, VAULT_ABI, signer);
    
    // Try to get projectToken with better error handling
    let projectToken: string;
    let usdc: string;
    
    try {
      projectToken = await vault.projectToken();
      usdc = await vault.usdc();
      console.log(`Vault tokens: projectToken=${projectToken}, usdc=${usdc}`);
    } catch (err: any) {
      console.error('Error calling vault functions:', err);
      throw new Error(`Failed to read vault contract. This usually means:\n1. Wrong network (vault is on a different chain)\n2. Wrong vault address\n3. Contract not properly initialized\n\nError: ${err.message}`);
    }
    
    if (!projectToken || !usdc || projectToken === ethers.ZeroAddress || usdc === ethers.ZeroAddress) {
      throw new Error('Vault returned invalid token addresses. Contract may not be properly initialized.');
    }

    // Approve tokens
    const tokenContract = new ethers.Contract(projectToken, ERC20_ABI, signer);
    const usdcContract = new ethers.Contract(usdc, ERC20_ABI, signer);

    console.log('Approving tokens...');
    const approveTx1 = await tokenContract.approve(vaultAddress, projectTokenAmount);
    await approveTx1.wait();
    
    const approveTx2 = await usdcContract.approve(vaultAddress, usdcAmount);
    await approveTx2.wait();

    // Deposit
    console.log('Depositing to vault...');
    const tx = await vault.deposit(projectTokenAmount, usdcAmount, minShares);
    const receipt = await tx.wait();

    // Get shares from event or return value
    return {
      success: true,
      txHash: receipt.hash,
      shares: 'Check transaction for minted shares'
    };
  } catch (error: any) {
    console.error('Deposit error:', error);
    return {
      success: false,
      error: error.message || 'Deposit failed'
    };
  }
}

export async function withdrawFromVault(
  vaultAddress: string,
  shares: bigint,
  minProjectToken: bigint,
  minUsdc: bigint,
  signer: ethers.Signer
): Promise<{ success: boolean; projectToken?: string; usdc?: string; txHash?: string; error?: string }> {
  try {
    const vault = new ethers.Contract(vaultAddress, VAULT_ABI, signer);

    console.log('Withdrawing from vault...');
    const tx = await vault.withdraw(shares, minProjectToken, minUsdc);
    const receipt = await tx.wait();

    return {
      success: true,
      txHash: receipt.hash
    };
  } catch (error: any) {
    console.error('Withdraw error:', error);
    return {
      success: false,
      error: error.message || 'Withdrawal failed'
    };
  }
}

export async function getVaultInfo(vaultAddress: string, userAddress: string, provider: ethers.Provider) {
  try {
    // First, check if contract exists at this address
    const code = await provider.getCode(vaultAddress);
    if (code === '0x') {
      console.error(`No contract found at vault address: ${vaultAddress}`);
      throw new Error(`No contract deployed at ${vaultAddress}. Please verify the address and network.`);
    }

    const vault = new ethers.Contract(vaultAddress, VAULT_ABI, provider);

    console.log(`Fetching vault info from ${vaultAddress}...`);

    // Fetch vault info with individual error handling for each call
    let projectToken, usdc, governance, reserves, userShares, totalSupply, totalProjectToken, totalUSDC;
    
    try {
      projectToken = await vault.projectToken();
    } catch (e: any) {
      throw new Error(`Failed to fetch projectToken: ${e.message}`);
    }
    
    try {
      usdc = await vault.usdc();
    } catch (e: any) {
      throw new Error(`Failed to fetch usdc: ${e.message}`);
    }
    
    try {
      governance = await vault.governance();
    } catch (e: any) {
      console.warn(`Could not fetch governance, using zero address`);
      governance = ethers.ZeroAddress;
    }
    
    try {
      reserves = await vault.getReserves();
    } catch (e: any) {
      console.warn(`Could not fetch reserves, using zeros`);
      reserves = [0n, 0n];
    }
    
    try {
      userShares = await vault.balanceOf(userAddress);
    } catch (e: any) {
      console.warn(`Could not fetch user shares, using zero`);
      userShares = 0n;
    }
    
    try {
      totalSupply = await vault.totalSupply();
    } catch (e: any) {
      console.warn(`Could not fetch totalSupply, using zero. Error: ${e.message}`);
      totalSupply = 0n;
    }
    
    try {
      totalProjectToken = await vault.totalProjectToken();
    } catch (e: any) {
      console.warn(`Could not fetch totalProjectToken, using zero`);
      totalProjectToken = 0n;
    }
    
    try {
      totalUSDC = await vault.totalUSDC();
    } catch (e: any) {
      console.warn(`Could not fetch totalUSDC, using zero`);
      totalUSDC = 0n;
    }

    console.log('Vault info loaded:', {
      projectToken,
      usdc,
      governance,
      totalProjectToken: totalProjectToken.toString(),
      totalUSDC: totalUSDC.toString(),
      userShares: userShares.toString()
    });

    return {
      projectToken,
      usdc,
      governance,
      reserve0: reserves[0].toString(),
      reserve1: reserves[1].toString(),
      userShares: userShares.toString(),
      totalSupply: totalSupply.toString(),
      totalProjectToken: totalProjectToken.toString(),
      totalUSDC: totalUSDC.toString()
    };
  } catch (error: any) {
    console.error('Error fetching vault info:', error);
    throw error; // Re-throw to show error message to user
  }
}

/**
 * Get all vaults from VaultFactory and filter by user's token balances
 */
export async function getUserVaults(
  vaultFactoryAddress: string,
  userAddress: string,
  provider: ethers.Provider
): Promise<Array<{ vault: string; projectToken: string; tokenBalance: string; tokenSymbol: string; tokenName: string }>> {
  try {
    if (!vaultFactoryAddress || vaultFactoryAddress === ethers.ZeroAddress) {
      return [];
    }

    // Check if factory contract exists
    const factoryCode = await provider.getCode(vaultFactoryAddress);
    if (factoryCode === '0x') {
      console.warn(`VaultFactory not found at ${vaultFactoryAddress}`);
      return [];
    }

    const factory = new ethers.Contract(vaultFactoryAddress, VAULT_FACTORY_ABI, provider);
    
    // Get total number of vaults
    const vaultCount = await factory.allVaultsLength();
    console.log(`Found ${vaultCount} vaults in factory`);

    if (vaultCount === 0n) {
      return [];
    }

    // Get all vaults and check user's token balances
    const vaults: Array<{ vault: string; projectToken: string; tokenBalance: string; tokenSymbol: string; tokenName: string }> = [];
    
    for (let i = 0; i < Number(vaultCount); i++) {
      try {
        const [vaultAddress, projectTokenAddress] = await factory.getVaultByIndex(i);
        
        if (vaultAddress === ethers.ZeroAddress || projectTokenAddress === ethers.ZeroAddress) {
          continue;
        }

        // Check user's balance of the project token
        const tokenContract = new ethers.Contract(projectTokenAddress, ERC20_ABI, provider);
        let balance = 0n;
        try {
          balance = await tokenContract.balanceOf(userAddress);
        } catch (e) {
          console.warn(`Could not fetch balance for ${projectTokenAddress}:`, e);
        }
        
        // Get token metadata
        let tokenSymbol = 'TOKEN';
        let tokenName = 'Token';
        try {
          tokenSymbol = await tokenContract.symbol();
          tokenName = await tokenContract.name();
        } catch (e) {
          console.warn(`Could not fetch token metadata for ${projectTokenAddress}:`, e);
        }

        // Include all vaults (not just ones where user has tokens)
        // This allows users to see and interact with vaults even if they don't have tokens yet
        vaults.push({
          vault: vaultAddress,
          projectToken: projectTokenAddress,
          tokenBalance: balance.toString(),
          tokenSymbol,
          tokenName
        });
      } catch (error: any) {
        console.warn(`Error fetching vault at index ${i}:`, error.message);
        continue;
      }
    }

    console.log(`Found ${vaults.length} vaults (showing all vaults, not just ones with user tokens)`);
    return vaults;
  } catch (error: any) {
    console.error('Error getting user vaults:', error);
    return [];
  }
}

