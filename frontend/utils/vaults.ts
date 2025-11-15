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
  'function allVaultsLength() external view returns (uint256)'
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
    const rpcUrl = expectedChainId === 5042002 
      ? 'https://rpc.testnet.arc.network'
      : expectedChainId === 11155111
      ? 'https://ethereum-sepolia-rpc.publicnode.com'
      : null;
    
    if (!rpcUrl) {
      throw new Error(`Invalid expectedChainId: ${expectedChainId}`);
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
      const expectedNetwork = expectedChainId === 5042002 ? 'Arc Testnet' : expectedChainId === 11155111 ? 'Sepolia' : `ChainId ${expectedChainId}`;
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
      
      const networkHint = expectedChainId === 5042002 
        ? 'Arc Testnet (chainId: 5042002)'
        : expectedChainId === 11155111
        ? 'Sepolia (chainId: 11155111)'
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

    const [
      projectToken,
      usdc,
      governance,
      reserves,
      userShares,
      totalSupply,
      totalProjectToken,
      totalUSDC
    ] = await Promise.all([
      vault.projectToken(),
      vault.usdc(),
      vault.governance(),
      vault.getReserves(),
      vault.balanceOf(userAddress),
      vault.totalSupply(),
      vault.totalProjectToken(),
      vault.totalUSDC()
    ]);

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

