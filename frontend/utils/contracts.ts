/**
 * Smart Contract Utilities
 * 
 * Helpers for interacting with Fluxa contracts on Arc
 */

import { ethers } from 'ethers';

// Contract addresses (from deployment)
export const CONTRACTS = {
  ROUTER: process.env.NEXT_PUBLIC_ARC_ROUTER_ADDRESS || '',
  FACTORY: process.env.NEXT_PUBLIC_ARC_FACTORY_ADDRESS || '',
  USDC: process.env.NEXT_PUBLIC_ARC_USDC_ADDRESS || '',
  EURC: process.env.NEXT_PUBLIC_ARC_EURC_ADDRESS || '',
};

// Arc RPC
export const ARC_RPC_URL = process.env.NEXT_PUBLIC_ARC_RPC_URL || 'https://rpc.testnet.arc.network';
export const ARC_CHAIN_ID = 5042002;

// ABIs (simplified)
export const ROUTER_ABI = [
  'function payLocal(address token, address recipient, uint256 amount, bytes32 paymentId) external',
  'function swapLocal(address tokenIn, address tokenOut, uint256 amountIn, uint256 minAmountOut, address recipient, uint256 deadline) external returns (uint256)',
  'function previewFee(uint256 amount) external view returns (uint256)',
  'event LocalPayment(address indexed payer, address indexed recipient, address indexed token, uint256 amount, bytes32 paymentId)',
  'event LocalSwap(address indexed sender, address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut, address recipient)',
];

export const ERC20_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
];

export const POOL_ABI = [
  'function getReserves() view returns (uint112, uint112)',
  'function getTokens() view returns (address, address)',
  'function swapFeeBps() view returns (uint24)',
];

/**
 * Get provider for Arc
 */
export function getArcProvider(): ethers.JsonRpcProvider {
  return new ethers.JsonRpcProvider(ARC_RPC_URL);
}

/**
 * Get signer from MetaMask or injected provider
 */
export async function getSigner(): Promise<ethers.Signer | null> {
  if (typeof window === 'undefined') return null;
  
  const ethereum = (window as any).ethereum;
  if (!ethereum) return null;

  try {
    await ethereum.request({ method: 'eth_requestAccounts' });
    const provider = new ethers.BrowserProvider(ethereum);
    return provider.getSigner();
  } catch (error) {
    console.error('Error getting signer:', error);
    return null;
  }
}

/**
 * Check if MetaMask is connected to Arc
 */
export async function isConnectedToArc(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  
  const ethereum = (window as any).ethereum;
  if (!ethereum) return false;

  try {
    const chainId = await ethereum.request({ method: 'eth_chainId' });
    return parseInt(chainId, 16) === ARC_CHAIN_ID;
  } catch (error) {
    return false;
  }
}

/**
 * Switch to Arc network
 */
export async function switchToArc(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  
  const ethereum = (window as any).ethereum;
  if (!ethereum) return false;

  try {
    await ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: `0x${ARC_CHAIN_ID.toString(16)}` }],
    });
    return true;
  } catch (switchError: any) {
    // Chain not added, try to add it
    if (switchError.code === 4902) {
      try {
        await ethereum.request({
          method: 'wallet_addEthereumChain',
          params: [{
            chainId: `0x${ARC_CHAIN_ID.toString(16)}`,
            chainName: 'Arc Testnet',
            nativeCurrency: {
              name: 'ETH',
              symbol: 'ETH',
              decimals: 18,
            },
            rpcUrls: [ARC_RPC_URL],
            blockExplorerUrls: ['https://testnet.arcscan.net/'],
          }],
        });
        return true;
      } catch (addError) {
        console.error('Error adding Arc network:', addError);
        return false;
      }
    }
    console.error('Error switching to Arc:', switchError);
    return false;
  }
}

/**
 * Format token amount for display
 */
export function formatTokenAmount(amount: bigint | string, decimals: number = 6): string {
  try {
    // Handle up to 18 decimals safely
    if (decimals > 18) decimals = 18;
    if (decimals < 0) decimals = 0;
    
    // Convert to string if it's a bigint
    const amountStr = typeof amount === 'bigint' ? amount.toString() : amount;
    
    // Use formatUnits which handles the decimals correctly
    const formatted = ethers.formatUnits(amountStr, decimals);
    
    // Parse as number to clean up trailing zeros
    const num = parseFloat(formatted);
    if (num === 0) return '0';
    if (isNaN(num)) return '0';
    
    // Never use exponential notation - always show full number
    // Format with appropriate decimal places based on the number size
    if (num >= 1000) {
      // Large numbers: no decimals
      return Math.floor(num).toLocaleString();
    } else if (num >= 1) {
      // Medium numbers: up to 2 decimals
      return num.toFixed(2).replace(/\.?0+$/, '');
    } else if (num >= 0.01) {
      // Small numbers: up to 4 decimals
      return num.toFixed(4).replace(/\.?0+$/, '');
    } else {
      // Very small numbers: up to 6 decimals, but never exponential
      return num.toFixed(6).replace(/\.?0+$/, '');
    }
  } catch (error) {
    console.error('Error formatting token amount:', error, { amount, decimals });
    // Fallback: try with 18 decimals max
    try {
      const amountStr = typeof amount === 'bigint' ? amount.toString() : amount;
      return ethers.formatUnits(amountStr, Math.min(decimals, 18));
    } catch {
      return '0';
    }
  }
}

/**
 * Parse token amount from user input
 */
export function parseTokenAmount(amount: string, decimals: number = 6): bigint {
  return ethers.parseUnits(amount, decimals);
}

/**
 * Get ERC20 contract instance
 */
export function getERC20Contract(address: string, signerOrProvider: ethers.Signer | ethers.Provider): ethers.Contract {
  return new ethers.Contract(address, ERC20_ABI, signerOrProvider);
}

/**
 * Get Router contract instance
 */
export function getRouterContract(signerOrProvider: ethers.Signer | ethers.Provider): ethers.Contract {
  return new ethers.Contract(CONTRACTS.ROUTER, ROUTER_ABI, signerOrProvider);
}

/**
 * Check and approve token if needed
 */
export async function ensureApproval(
  tokenAddress: string,
  spender: string,
  amount: bigint,
  signer: ethers.Signer
): Promise<boolean> {
  try {
    console.log(`[APPROVAL] Checking approval for ${tokenAddress} -> ${spender}`);
    const token = getERC20Contract(tokenAddress, signer);
    const owner = await signer.getAddress();
    const currentAllowance = await token.allowance(owner, spender);
    console.log(`[APPROVAL] Current allowance: ${currentAllowance.toString()}, Required: ${amount.toString()}`);

    if (currentAllowance < amount) {
      console.log(`[APPROVAL] Approving ${amount.toString()}...`);
      // Reset approval first (required for USDC and some tokens)
      try {
        const resetTx = await token.approve(spender, 0n);
        await resetTx.wait();
        console.log('[APPROVAL] Reset approval successful');
      } catch (resetError) {
        console.warn('[APPROVAL] Reset approval failed (may not be needed):', resetError);
      }
      
      const tx = await token.approve(spender, amount);
      console.log(`[APPROVAL] Approval transaction: ${tx.hash}`);
      await tx.wait();
      console.log('[APPROVAL] Approval confirmed');
    } else {
      console.log('[APPROVAL] Sufficient allowance already exists');
    }

    return true;
  } catch (error: any) {
    console.error('[APPROVAL] Approval error:', error);
    console.error('[APPROVAL] Error details:', {
      message: error.message,
      code: error.code,
      reason: error.reason
    });
    return false;
  }
}

/**
 * Execute swap on Arc
 */
export async function executeSwap(
  tokenIn: string,
  tokenOut: string,
  amountIn: bigint,
  minAmountOut: bigint,
  recipient: string,
  signer: ethers.Signer
): Promise<{ success: boolean; txHash?: string; error?: string }> {
  try {
    console.log('[SWAP] Starting swap execution');
    console.log(`  TokenIn: ${tokenIn}`);
    console.log(`  TokenOut: ${tokenOut}`);
    console.log(`  AmountIn: ${amountIn.toString()}`);
    console.log(`  MinAmountOut: ${minAmountOut.toString()}`);
    console.log(`  Recipient: ${recipient}`);
    
    // Approve router to spend tokenIn
    console.log('[SWAP] Approving router...');
    const approved = await ensureApproval(tokenIn, CONTRACTS.ROUTER, amountIn, signer);
    if (!approved) {
      console.error('[SWAP] Approval failed');
      return { success: false, error: 'Approval failed' };
    }
    console.log('[SWAP] Approval successful');

    // Execute swap
    const router = getRouterContract(signer);
    const deadline = Math.floor(Date.now() / 1000) + 600; // 10 minutes
    console.log(`[SWAP] Calling router.swapLocal (deadline: ${deadline})`);

    const tx = await router.swapLocal(
      tokenIn,
      tokenOut,
      amountIn,
      minAmountOut,
      recipient,
      deadline
    );
    console.log(`[SWAP] Transaction sent: ${tx.hash}`);
    console.log('[SWAP] Waiting for confirmation...');

    const receipt = await tx.wait();
    console.log(`[SWAP] Transaction confirmed: ${receipt.hash}`);
    console.log(`[SWAP] Gas used: ${receipt.gasUsed.toString()}`);
    
    return { success: true, txHash: receipt.hash };
  } catch (error: any) {
    console.error('[SWAP] Swap error:', error);
    console.error('[SWAP] Error details:', {
      message: error.message,
      code: error.code,
      data: error.data,
      reason: error.reason
    });
    return { success: false, error: error.message || error.reason || 'Swap failed' };
  }
}

/**
 * Get token balance
 */
export async function getTokenBalance(
  tokenAddress: string,
  userAddress: string,
  provider: ethers.Provider
): Promise<bigint> {
  try {
    const token = getERC20Contract(tokenAddress, provider);
    return await token.balanceOf(userAddress);
  } catch (error) {
    console.error('Error getting balance:', error);
    return 0n;
  }
}

