/**
 * LP Monitor Service
 * 
 * Tracks liquidity pool depths across all supported chains.
 * Monitors reserves, TVL, utilization, and health metrics.
 */

import { ethers } from 'ethers';

export class LPMonitor {
  constructor() {
    this.chains = new Map();
    this.pools = new Map();
    this.updateInterval = null;
    
    // Initialize chain configurations
    this.initializeChains();
  }

  /**
   * Initialize supported chains with RPC endpoints
   */
  initializeChains() {
    const chains = [
      {
        name: 'sepolia',
        chainId: 11155111,
        rpcUrl: process.env.SEPOLIA_RPC_URL || 'https://ethereum-sepolia-rpc.publicnode.com',
        factoryAddress: process.env.SEPOLIA_AMM_FACTORY,
        vaultAddress: process.env.SEPOLIA_FLX_VAULT,
        enabled: true
      },
      {
        name: 'arc',
        chainId: 5042002,
        rpcUrl: process.env.ARC_RPC_URL || 'https://hidden-cosmological-thunder.arc-testnet.quiknode.pro/e18d2b4649fda2fd51ef9f5a2c1d7d8fd132c886',
        factoryAddress: process.env.ARC_AMM_FACTORY,
        vaultAddress: process.env.ARC_FLX_VAULT,
        enabled: true
      }
    ];

    for (const chain of chains) {
      if (chain.enabled) {
        const provider = new ethers.JsonRpcProvider(chain.rpcUrl);
        this.chains.set(chain.name, {
          ...chain,
          provider
        });
      }
    }

    console.log(`Initialized ${this.chains.size} chain(s):`, Array.from(this.chains.keys()));
  }

  /**
   * Start monitoring LP depths
   */
  async start() {
    // Initial fetch
    await this.fetchAllDepths();

    // Update every 30 seconds
    this.updateInterval = setInterval(() => {
      this.fetchAllDepths().catch(console.error);
    }, 30000);
  }

  /**
   * Stop monitoring
   */
  stop() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
  }

  /**
   * Fetch LP depths from all chains
   */
  async fetchAllDepths() {
    const chainNames = Array.from(this.chains.keys());
    console.log(`Fetching LP depths for chains: ${chainNames.join(', ')}`);
    
    const results = await Promise.allSettled(
      chainNames.map(chain => this.fetchChainDepths(chain))
    );

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const chainName = chainNames[i];
      
      if (result.status === 'fulfilled') {
        const depths = result.value;
        console.log(`✅ ${chainName}: Found ${depths.length} pool(s), TVL: $${depths.reduce((sum, d) => sum + (d.tvl || 0), 0).toLocaleString()}`);
      } else {
        console.error(`❌ Error fetching ${chainName} depths:`, result.reason?.message || result.reason);
        // Store mock data on error
        this.pools.set(chainName, this.generateMockDepths(chainName));
      }
    }
  }

  /**
   * Fetch LP depths for a specific chain
   * Vaults ARE the pools - we only check vaults, not separate pool contracts
   */
  async fetchChainDepths(chainName) {
    const chain = this.chains.get(chainName);
    if (!chain) throw new Error(`Chain ${chainName} not found`);

    const depths = [];

    // Only check vaults - vaults ARE the liquidity pools
    if (chain.vaultAddress && chain.vaultAddress !== 'undefined') {
      try {
        const vaultDepth = await this.fetchVaultDepth(chainName, chain.vaultAddress);
        const reserve0BigInt = BigInt(vaultDepth.reserve0 || '0');
        const reserve1BigInt = BigInt(vaultDepth.reserve1 || '0');
        if (vaultDepth && (reserve0BigInt > 0n || reserve1BigInt > 0n)) {
          depths.push(vaultDepth);
          console.log(`✅ ${chainName}: Vault (pool) has liquidity - FLX: ${vaultDepth.reserve0Formatted}, USDC: ${vaultDepth.reserve1Formatted}`);
        } else {
          console.log(`⚠️  ${chainName}: Vault exists but has no liquidity yet`);
        }
      } catch (error) {
        console.warn(`Could not fetch vault depth for ${chainName}:`, error.message);
      }
    } else {
      console.log(`⚠️  ${chainName}: No vault address configured`);
    }

    // If no depths found from vaults, use mock data
    if (depths.length === 0) {
      console.log(`No liquidity found on ${chainName} vault, using mock data`);
      return this.generateMockDepths(chainName);
    }

    // Store depths
    this.pools.set(chainName, depths);
    
    return depths;
  }

  /**
   * Fetch depth data for a specific pool
   */
  async fetchPoolDepth(chainName, poolAddress) {
    const chain = this.chains.get(chainName);
    
    const pool = new ethers.Contract(
      poolAddress,
      [
        'function getTokens() view returns (address, address)',
        'function getReserves() view returns (uint112, uint112)',
        'function totalSupply() view returns (uint256)',
        'function swapFeeBps() view returns (uint24)'
      ],
      chain.provider
    );

    const [token0, token1] = await pool.getTokens();
    const [reserve0, reserve1] = await pool.getReserves();
    const totalSupply = await pool.totalSupply();
    const swapFeeBps = await pool.swapFeeBps();

    // Get token decimals
    const ERC20_ABI = ['function decimals() view returns (uint8)'];
    const token0Contract = new ethers.Contract(token0, ERC20_ABI, chain.provider);
    const token1Contract = new ethers.Contract(token1, ERC20_ABI, chain.provider);
    
    let decimals0 = 18; // Default
    let decimals1 = 6;  // Default
    
    try {
      decimals0 = await token0Contract.decimals();
    } catch (err) {
      console.warn(`Could not get decimals for token0 ${token0}, using default 18`);
    }
    
    try {
      decimals1 = await token1Contract.decimals();
    } catch (err) {
      console.warn(`Could not get decimals for token1 ${token1}, using default 6`);
    }

    // Format reserves with correct decimals
    const reserve0Formatted = ethers.formatUnits(reserve0, decimals0);
    const reserve1Formatted = ethers.formatUnits(reserve1, decimals1);

    // Calculate TVL based on actual price from reserves
    // For FLX/USDC pool: reserve0 = FLX, reserve1 = USDC
    // Price of FLX in USDC = reserve1 / reserve0
    // TVL = USDC value + (FLX amount * FLX price in USDC)
    const usdcAmount = parseFloat(reserve1Formatted) || 0;
    const flxAmount = parseFloat(reserve0Formatted) || 0;
    
    let flxPriceInUsdc = 0;
    if (flxAmount > 0 && usdcAmount > 0) {
      flxPriceInUsdc = usdcAmount / flxAmount; // Price per FLX in USDC
    }
    
    const flxValueInUsdc = flxAmount * flxPriceInUsdc; // Total FLX value in USDC terms
    const tvl = usdcAmount + flxValueInUsdc; // Total value locked in USDC terms
    
    // If pool has no liquidity, still return the data but with 0 TVL
    if (tvl === 0) {
      console.log(`Pool ${poolAddress} on ${chainName} has no liquidity yet`);
    }

    return {
      chain: chainName,
      poolAddress,
      token0,
      token1,
      reserve0: reserve0.toString(),
      reserve1: reserve1.toString(),
      reserve0Formatted,
      reserve1Formatted,
      totalSupply: totalSupply.toString(),
      swapFeeBps: swapFeeBps.toString(),
      tvl,
      utilization: 0, // TODO: Calculate based on pending trades
      lastUpdate: Date.now()
    };
  }

  /**
   * Fetch depth data from a vault (vaults hold the actual liquidity)
   */
  async fetchVaultDepth(chainName, vaultAddress) {
    const chain = this.chains.get(chainName);
    
    const vault = new ethers.Contract(
      vaultAddress,
      [
        'function projectToken() view returns (address)',
        'function usdc() view returns (address)',
        'function totalProjectToken() view returns (uint256)',
        'function totalUSDC() view returns (uint256)'
      ],
      chain.provider
    );

    try {
      const [projectToken, usdc, totalProjectToken, totalUSDC] = await Promise.all([
        vault.projectToken(),
        vault.usdc(),
        vault.totalProjectToken(),
        vault.totalUSDC()
      ]);

      // Get token decimals
      const ERC20_ABI = ['function decimals() view returns (uint8)'];
      const projectTokenContract = new ethers.Contract(projectToken, ERC20_ABI, chain.provider);
      const usdcContract = new ethers.Contract(usdc, ERC20_ABI, chain.provider);
      
      let projectTokenDecimals = 18; // Default
      let usdcDecimals = 6;  // Default
      
      try {
        projectTokenDecimals = await projectTokenContract.decimals();
      } catch (err) {
        console.warn(`Could not get decimals for projectToken ${projectToken}, using default 18`);
      }
      
      try {
        usdcDecimals = await usdcContract.decimals();
      } catch (err) {
        console.warn(`Could not get decimals for USDC ${usdc}, using default 6`);
      }

      // Format reserves with correct decimals
      const reserve0Formatted = ethers.formatUnits(totalProjectToken, projectTokenDecimals);
      const reserve1Formatted = ethers.formatUnits(totalUSDC, usdcDecimals);

      // Calculate TVL based on actual price
      // Price of FLX in USDC = USDC reserves / FLX reserves
      // TVL = USDC value + (FLX amount * FLX price in USDC)
      const usdcAmount = parseFloat(reserve1Formatted) || 0;
      const flxAmount = parseFloat(reserve0Formatted) || 0;
      
      let flxPriceInUsdc = 0;
      if (flxAmount > 0 && usdcAmount > 0) {
        flxPriceInUsdc = usdcAmount / flxAmount; // Price per FLX in USDC
      }
      
      const flxValueInUsdc = flxAmount * flxPriceInUsdc; // Total FLX value in USDC terms
      const tvl = usdcAmount + flxValueInUsdc; // Total value locked in USDC terms

      // Return in same format as pool depth, but mark as vault
      return {
        chain: chainName,
        poolAddress: vaultAddress, // Using vault address as poolAddress for routing
        token0: projectToken,
        token1: usdc,
        reserve0: totalProjectToken.toString(),
        reserve1: totalUSDC.toString(),
        reserve0Formatted,
        reserve1Formatted,
        totalSupply: '0', // Vaults don't have LP tokens in the same way
        swapFeeBps: '30', // Default swap fee (0.3%)
        tvl,
        utilization: 0,
        lastUpdate: Date.now(),
        isVault: true // Mark as vault for routing logic
      };
    } catch (error) {
      console.error(`Error fetching vault depth for ${vaultAddress}:`, error.message);
      throw error;
    }
  }

  /**
   * Generate mock depth data showing available liquidity before pools are created
   */
  generateMockDepths(chainName) {
    // Use actual deployed addresses from env
    const prefix = chainName.toUpperCase();
    const USDC = process.env[`${prefix}_USDC`] || '0x' + '1'.repeat(40);
    const FLX = process.env[`${prefix}_FLX_TOKEN`] || '0x' + '2'.repeat(40);
    const poolAddr = process.env[`${prefix}_FLX_USDC_POOL`] || '0x' + '3'.repeat(40);

    // Generate realistic mock data based on chain
    // User has 1 USDC + 1000 FLX on each chain
    const baseReserves = {
      sepolia: { flx: 1000, usdc: 1 },
      arc: { flx: 1000, usdc: 1 }
    };

    const reserves = baseReserves[chainName] || { flx: 1000, usdc: 1 };

    // Calculate TVL based on actual price from reserves
    // Price of FLX in USDC = USDC reserves / FLX reserves = 1 / 1000 = 0.001 USDC per FLX
    // TVL = USDC value + (FLX amount * FLX price in USDC)
    // TVL = 1 USDC + (1000 FLX * 0.001 USDC/FLX) = 1 + 1 = $2
    const flxPriceInUsdc = reserves.usdc / reserves.flx; // 1 / 1000 = 0.001
    const flxValueInUsdc = reserves.flx * flxPriceInUsdc; // 1000 * 0.001 = 1 USDC
    const tvl = reserves.usdc + flxValueInUsdc; // 1 + 1 = $2

    const depth = {
      chain: chainName,
      poolAddress: poolAddr,
      token0: FLX, // Using FLX/USDC pair
      token1: USDC,
      reserve0: ethers.parseUnits(reserves.flx.toString(), 18).toString(), // FLX is 18 decimals
      reserve1: ethers.parseUnits(reserves.usdc.toString(), 6).toString(),  // USDC is 6 decimals
      reserve0Formatted: reserves.flx.toString(),
      reserve1Formatted: reserves.usdc.toString(),
      totalSupply: ethers.parseUnits('100000', 18).toString(),
      swapFeeBps: '30',
      tvl: tvl, // Total value locked in USD (USDC side + FLX side at current ratio)
      utilization: 0,
      lastUpdate: Date.now(),
      mock: true
    };

    // Store mock data
    if (!this.pools.has(chainName)) {
      this.pools.set(chainName, []);
    }
    this.pools.set(chainName, [depth]);

    return [depth];
  }

  /**
   * Get all LP depths across all chains
   */
  async getAllDepths() {
    // If pools are empty, fetch fresh data first
    if (this.pools.size === 0) {
      console.log('No cached LP depths, fetching fresh data...');
      await this.fetchAllDepths();
    }
    
    const allDepths = {};
    
    for (const [chain, depths] of this.pools.entries()) {
      allDepths[chain] = depths;
    }

    // If still empty, return mock data for all chains
    if (Object.keys(allDepths).length === 0) {
      console.log('No LP depths found, returning mock data for all chains');
      for (const chainName of this.chains.keys()) {
        allDepths[chainName] = this.generateMockDepths(chainName);
      }
    }

    return allDepths;
  }

  /**
   * Get LP depths for a specific chain
   */
  async getChainDepths(chainName) {
    if (!this.chains.has(chainName)) {
      throw new Error(`Chain ${chainName} not supported`);
    }

    // If no cached data, fetch now
    if (!this.pools.has(chainName)) {
      await this.fetchChainDepths(chainName);
    }

    return this.pools.get(chainName) || [];
  }

  /**
   * Get total liquidity available for a token pair across all chains
   */
  async getTotalLiquidity(token0, token1) {
    const allDepths = await this.getAllDepths();
    let totalToken0 = 0n;
    let totalToken1 = 0n;

    for (const depths of Object.values(allDepths)) {
      for (const depth of depths) {
        // Check if this pool matches the token pair (consider both orderings)
        if (
          (depth.token0.toLowerCase() === token0.toLowerCase() &&
           depth.token1.toLowerCase() === token1.toLowerCase()) ||
          (depth.token0.toLowerCase() === token1.toLowerCase() &&
           depth.token1.toLowerCase() === token0.toLowerCase())
        ) {
          totalToken0 += BigInt(depth.reserve0);
          totalToken1 += BigInt(depth.reserve1);
        }
      }
    }

    return {
      token0,
      token1,
      totalReserve0: totalToken0.toString(),
      totalReserve1: totalToken1.toString(),
      chains: Object.keys(allDepths).length
    };
  }

  /**
   * Find best pool for a specific token pair and amount
   */
  async findBestPool(tokenIn, tokenOut, amountIn) {
    const allDepths = await this.getAllDepths();
    let bestPool = null;
    let bestOutput = 0n;

    for (const [chain, depths] of Object.entries(allDepths)) {
      for (const depth of depths) {
        // Check if this pool matches the token pair
        const isMatch = 
          (depth.token0.toLowerCase() === tokenIn.toLowerCase() &&
           depth.token1.toLowerCase() === tokenOut.toLowerCase()) ||
          (depth.token0.toLowerCase() === tokenOut.toLowerCase() &&
           depth.token1.toLowerCase() === tokenIn.toLowerCase());

        if (!isMatch) continue;

        // Calculate expected output
        const output = this.calculateOutput(depth, tokenIn, amountIn);
        
        if (output > bestOutput) {
          bestOutput = output;
          bestPool = { ...depth, chain, expectedOutput: output.toString() };
        }
      }
    }

    return bestPool;
  }

  /**
   * Calculate expected output for a swap using constant product formula
   */
  calculateOutput(depth, tokenIn, amountIn) {
    console.log(`[CALC_OUTPUT] Calculating output for pool ${depth.poolAddress}`);
    console.log(`  TokenIn: ${tokenIn}`);
    console.log(`  AmountIn (raw): ${amountIn}`);
    console.log(`  Reserve0 (raw): ${depth.reserve0}`);
    console.log(`  Reserve1 (raw): ${depth.reserve1}`);
    
    const isToken0 = depth.token0.toLowerCase() === tokenIn.toLowerCase();
    const reserveIn = BigInt(isToken0 ? depth.reserve0 : depth.reserve1);
    const reserveOut = BigInt(isToken0 ? depth.reserve1 : depth.reserve0);
    
    console.log(`  IsToken0: ${isToken0}`);
    console.log(`  ReserveIn (raw): ${reserveIn.toString()}`);
    console.log(`  ReserveOut (raw): ${reserveOut.toString()}`);
    
    // Check for zero reserves
    if (reserveIn === 0n || reserveOut === 0n) {
      console.warn(`Pool ${depth.poolAddress} has zero reserves - cannot calculate output`);
      return 0n;
    }
    
    // Check for insufficient liquidity
    const amountInBigInt = BigInt(amountIn);
    if (amountInBigInt === 0n) {
      return 0n;
    }
    
    // Apply fee
    const feeBps = BigInt(depth.swapFeeBps || 30);
    const amountInAfterFee = amountInBigInt * (10000n - feeBps) / 10000n;
    
    console.log(`  Fee BPS: ${feeBps.toString()}`);
    console.log(`  AmountInAfterFee (raw): ${amountInAfterFee.toString()}`);
    
    // Constant product formula: (amountIn * reserveOut) / (reserveIn + amountIn)
    const numerator = amountInAfterFee * reserveOut;
    const denominator = reserveIn + amountInAfterFee;
    
    console.log(`  Numerator: ${numerator.toString()}`);
    console.log(`  Denominator: ${denominator.toString()}`);
    
    // Check for division by zero
    if (denominator === 0n) {
      console.warn(`Division by zero in calculateOutput for pool ${depth.poolAddress}`);
      return 0n;
    }
    
    const output = numerator / denominator;
    console.log(`  Output (raw): ${output.toString()}`);
    
    // Validate output is reasonable (not zero and not extremely small relative to input)
    // If output is less than 1% of what we'd expect from a simple ratio, something is wrong
    const expectedRatio = reserveOut / reserveIn;
    const expectedOutput = amountInAfterFee * expectedRatio;
    const minExpectedOutput = expectedOutput / 100n; // At least 1% of expected
    
    if (output < minExpectedOutput && output > 0n) {
      console.warn(`  ⚠️  Output seems too small: ${output.toString()} (expected at least ${minExpectedOutput.toString()})`);
      console.warn(`  This might indicate incorrect reserve or token identification`);
    }
    
    return output;
  }
}

