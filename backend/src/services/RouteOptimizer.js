/**
 * Route Optimizer Service
 * 
 * Evaluates all possible routing combinations and selects the one with highest net output.
 * Formula: Net Output = Gross Output - Gas Cost (in token terms)
 */

export class RouteOptimizer {
  constructor(lpMonitor) {
    this.lpMonitor = lpMonitor;
    
    // Multi-chain fee for ETH testnet is 10 cents
    this.multiChainFeeUSD = 0.10;
    
    // Local gas cost (Arc) - 0.02 cents
    this.localGasCostUSD = 0.0002;
    
    // Token address mappings per chain (from env vars)
    // These map logical tokens (FLX, USDC) to their addresses on each chain
    this.tokenAddresses = {
      arc: {
        flx: process.env.ARC_FLX_TOKEN || '',
        usdc: process.env.ARC_USDC_ADDRESS || '0x3600000000000000000000000000000000000000'
      },
      sepolia: {
        flx: process.env.SEPOLIA_FLX_TOKEN || '',
        // Real USDC on Sepolia testnet (Circle-supported)
        usdc: process.env.SEPOLIA_USDC_ADDRESS || '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238'
      }
    };
    
    console.log('[ROUTE_OPTIMIZER] Token address mappings:');
    console.log('  Arc - FLX:', this.tokenAddresses.arc.flx || 'NOT CONFIGURED');
    console.log('  Arc - USDC:', this.tokenAddresses.arc.usdc || 'NOT CONFIGURED');
    console.log('  Sepolia - FLX:', this.tokenAddresses.sepolia.flx || 'NOT CONFIGURED');
    console.log('  Sepolia - USDC:', this.tokenAddresses.sepolia.usdc || 'NOT CONFIGURED');
    
    // Warn if Sepolia addresses are missing
    if (!this.tokenAddresses.sepolia.flx || !this.tokenAddresses.sepolia.usdc) {
      console.warn('⚠️  WARNING: Sepolia token addresses not fully configured!');
      console.warn('   Set SEPOLIA_FLX_TOKEN and SEPOLIA_USDC_ADDRESS in .env');
    }
  }
  
  /**
   * Get token address for a logical token on a specific chain
   * Logical tokens: 'FLX' or 'USDC'
   */
  getTokenAddressOnChain(logicalToken, chain) {
    const chainMap = this.tokenAddresses[chain];
    if (!chainMap) return null;
    
    const tokenKey = logicalToken.toLowerCase();
    return chainMap[tokenKey] || null;
  }
  
  /**
   * Determine logical token (FLX or USDC) from an address on source chain
   */
  getLogicalToken(address, sourceChain) {
    const chainMap = this.tokenAddresses[sourceChain];
    if (!chainMap) return null;
    
    const addr = address.toLowerCase();
    if (addr === chainMap.flx?.toLowerCase()) return 'FLX';
    if (addr === chainMap.usdc?.toLowerCase()) return 'USDC';
    
    return null;
  }

  /**
   * Get FLX price in USDC from a pool
   * Price = USDC reserves / FLX reserves
   */
  getFlxPrice(pool) {
    const reserveUSDC = BigInt(pool.reserve1 || '0'); // USDC is token1
    const reserveFLX = BigInt(pool.reserve0 || '0'); // FLX is token0
    
    if (reserveFLX === 0n) return 0;
    
    // Price = USDC reserves / FLX reserves
    const usdcAmount = Number(reserveUSDC) / 1e6; // USDC has 6 decimals
    const flxAmount = Number(reserveFLX) / 1e18; // FLX has 18 decimals
    
    if (flxAmount === 0) return 0;
    
    return usdcAmount / flxAmount; // Price per FLX in USDC
  }

  /**
   * Convert USD gas cost to token output (FLX)
   * Uses average FLX price from all pools
   * 
   * Formula: Gas Cost (Token) = Gas Cost (USD) / FLX Price
   * Where FLX Price = USDC reserves / FLX reserves (from each pool)
   */
  convertGasCostToToken(gasCostUSD, tokenOut, pools) {
    console.log(`\n[GAS_CONVERSION] Converting $${gasCostUSD.toFixed(2)} USD to token terms`);
    console.log(`   Token Out: ${tokenOut}`);
    
    // If output is USDC, return gas cost directly (in USDC terms)
    if (tokenOut.toLowerCase().includes('usdc') || tokenOut.toLowerCase() === '0x3600000000000000000000000000000000000000') {
      const usdcAmount = BigInt(Math.floor(gasCostUSD * 1e6)); // Convert to USDC (6 decimals)
      console.log(`   Output is USDC - direct conversion: ${usdcAmount.toString()} (raw)`);
      return usdcAmount;
    }
    
    // Output is FLX, need to convert USD to FLX using pool price
    // Use average price from all pools
    console.log(`   Output is FLX - calculating average FLX price from pools...`);
    let totalPrice = 0;
    let poolCount = 0;
    const prices = [];
    
    for (const pool of pools) {
      const price = this.getFlxPrice(pool);
      if (price > 0) {
        prices.push(price);
        totalPrice += price;
        poolCount++;
        console.log(`     Pool ${pool.chain}: FLX Price = ${price.toFixed(6)} USDC per FLX`);
      }
    }
    
    if (poolCount === 0) {
      console.log(`   ⚠️  No valid prices found, returning 0`);
      return 0n;
    }
    
    const avgPrice = totalPrice / poolCount;
    console.log(`   Average FLX Price: ${avgPrice.toFixed(6)} USDC per FLX (from ${poolCount} pool(s))`);
    console.log(`   Calculation: $${gasCostUSD.toFixed(2)} / ${avgPrice.toFixed(6)} = ${(gasCostUSD / avgPrice).toFixed(6)} FLX`);
    
    const flxAmount = gasCostUSD / avgPrice;
    const flxAmountRaw = BigInt(Math.floor(flxAmount * 1e18)); // Convert to FLX (18 decimals)
    
    console.log(`   Gas Cost in FLX: ${flxAmount.toFixed(6)} FLX = ${flxAmountRaw.toString()} (raw)`);
    console.log('');
    
    return flxAmountRaw;
  }

  /**
   * Calculate total output from a set of pools
   */
  calculateTotalOutput(pools, amountIn) {
    let totalOutput = 0n;
    let remaining = BigInt(amountIn);

    for (const pool of pools) {
      if (remaining === 0n) break;
      
      const reserveIn = BigInt(pool.reserveIn || '0');
      if (reserveIn === 0n) continue;
      
      // Use max 50% of pool capacity
      const capacity = reserveIn / 2n;
      const amount = remaining < capacity ? remaining : capacity;
      
      if (amount === 0n) continue;
      
      // Use tokenIn from pool (set in findMatchingPools)
      const tokenIn = pool.tokenIn || pool.token0;
      const output = this.lpMonitor.calculateOutput(pool, tokenIn, amount.toString());
      
      if (output === 0n || output === undefined) continue;
      
      totalOutput += output;
      remaining -= amount;
    }

    return totalOutput;
  }

  /**
   * Get a quote for a trade
   */
  async getQuote({ tokenIn, tokenOut, amountIn, sourceChain = 'arc' }) {
    // Use findOptimalRoute to get the best route
    const optimalRoute = await this.findOptimalRoute({
      tokenIn,
      tokenOut,
      amountIn,
      sourceChain
    });
    
    return {
      ...optimalRoute,
      recommendation: optimalRoute.requiresMultiChain ? 'multiChain' : 'local'
    };
  }

  /**
   * Find optimal route - evaluates all combinations
   * 
   * Structure:
   * 1. Local vault only
   * 2. Local + chain 1
   * 3. Local + chain 1 + chain 2
   * ... up to all chains
   * 
   * For each: Gross Output - Gas Cost (in tokens) = Net Output
   * Pick highest net output
   */
  async findOptimalRoute({ tokenIn, tokenOut, amountIn, sourceChain }) {
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('🔍 [ROUTE_OPTIMIZER] Starting route calculation');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`   Input Amount: ${amountIn} (raw)`);
    console.log(`   Token In: ${tokenIn}`);
    console.log(`   Token Out: ${tokenOut}`);
    console.log(`   Source Chain: ${sourceChain}`);
    console.log('');
    
    // Get all available liquidity
    const allDepths = await this.lpMonitor.getAllDepths();
    console.log(`📊 Available chains: ${Object.keys(allDepths).join(', ')}`);
    
    // Find matching pools across all chains (using logical token mapping)
    const matchingPools = this.findMatchingPools(allDepths, tokenIn, tokenOut, sourceChain);
    console.log(`   Found ${matchingPools.length} matching pools across all chains`);
    
    if (matchingPools.length === 0) {
      throw new Error('No liquidity available across any chain');
    }

    // Filter valid pools (with liquidity)
    const validPools = matchingPools.filter(p => {
      const reserve = BigInt(p.reserveIn || '0');
      return reserve > 0n;
    });
    
    console.log(`   Valid pools (with liquidity): ${validPools.length}`);
    validPools.forEach((pool, i) => {
      const reserveIn = BigInt(pool.reserveIn || '0');
      const reserveOut = BigInt(pool.reserveOut || '0');
      const flxPrice = this.getFlxPrice(pool);
      console.log(`     Pool ${i + 1}: ${pool.chain}`);
      console.log(`       Address: ${pool.poolAddress}`);
      console.log(`       Reserve In: ${reserveIn.toString()}`);
      console.log(`       Reserve Out: ${reserveOut.toString()}`);
      console.log(`       FLX Price: ${flxPrice.toFixed(6)} USDC per FLX`);
    });
    console.log('');

    // Separate local and remote pools
    const localPools = validPools.filter(p => p.chain === sourceChain);
    const remotePools = validPools.filter(p => p.chain !== sourceChain);
    
    console.log(`📍 Local pools (${sourceChain}): ${localPools.length}`);
    console.log(`🌐 Remote pools: ${remotePools.length}`);
    console.log('');

    // Evaluate all routing options
    const routingOptions = [];

    // OPTION 1: Local vault only
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📋 OPTION 1: Local Vault Only');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    if (localPools.length > 0) {
      const grossOutput = this.calculateTotalOutput(localPools, amountIn);
      const gasCostUSD = this.localGasCostUSD;
      const gasCostToken = this.convertGasCostToToken(gasCostUSD, tokenOut, validPools);
      const netOutput = grossOutput > gasCostToken ? grossOutput - gasCostToken : 0n;
      
      console.log(`   Pools used: ${localPools.length} (all on ${sourceChain})`);
      console.log(`   Gross Output: ${grossOutput.toString()} (raw)`);
      console.log(`   Gas Cost (USD): $${gasCostUSD.toFixed(2)}`);
      console.log(`   Gas Cost (Token): ${gasCostToken.toString()} (raw)`);
      console.log(`   Net Output: ${netOutput.toString()} (raw)`);
      
      routingOptions.push({
        name: 'Local Only',
        pools: localPools,
        chains: [sourceChain],
        remoteChains: [],
        grossOutput: grossOutput,
        gasCostUSD: gasCostUSD,
        gasCostToken: gasCostToken,
        netOutput: netOutput
      });
    } else {
      console.log(`   ⚠️  No local pools available`);
    }
    console.log('');

    // OPTIONS 2-N: Local + remote chains (all combinations)
    // Generate combinations: Local + 1 chain, Local + 2 chains, ..., Local + all chains
    for (let i = 1; i <= remotePools.length; i++) {
      const combinations = this.getCombinations(remotePools, i);
      
      for (const remoteCombo of combinations) {
        const allPoolsForOption = [...localPools, ...remoteCombo];
        const chains = [...new Set(allPoolsForOption.map(p => p.chain))];
        const remoteChains = chains.filter(c => c !== sourceChain);
        
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log(`📋 OPTION ${routingOptions.length + 1}: Local + ${remoteChains.join(', ')}`);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log(`   Pools used: ${allPoolsForOption.length} (${localPools.length} local, ${remoteCombo.length} remote)`);
        console.log(`   Chains: ${chains.join(', ')}`);
        
        // Calculate gross output from all pools
        const grossOutput = this.calculateTotalOutput(allPoolsForOption, amountIn);
        
        // Calculate gas cost: local gas + multi-chain fee (10 cents)
        const gasCostUSD = this.localGasCostUSD + this.multiChainFeeUSD;
        
        // Convert gas cost to token terms
        const gasCostToken = this.convertGasCostToToken(gasCostUSD, tokenOut, validPools);
        
        // Net output = Gross output - Gas cost (in tokens)
        const netOutput = grossOutput > gasCostToken ? grossOutput - gasCostToken : 0n;
        
        console.log(`   Gross Output: ${grossOutput.toString()} (raw)`);
        console.log(`   Gas Cost (USD): $${gasCostUSD.toFixed(2)}`);
        console.log(`   Gas Cost (Token): ${gasCostToken.toString()} (raw)`);
        console.log(`   Net Output: ${netOutput.toString()} (raw)`);
        
        routingOptions.push({
          name: `Local + ${remoteChains.join(', ')}`,
          pools: allPoolsForOption,
          chains: chains,
          remoteChains: remoteChains,
          grossOutput: grossOutput,
          gasCostUSD: gasCostUSD,
          gasCostToken: gasCostToken,
          netOutput: netOutput
        });
        console.log('');
      }
    }

    // Find best option (highest net output)
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('🏆 ROUTING DECISION');
    console.log('═══════════════════════════════════════════════════════════════');
    
    if (routingOptions.length === 0) {
      throw new Error('No valid routing options found');
    }

    // Sort by net output (descending) - always pick the better option
    routingOptions.sort((a, b) => {
      if (b.netOutput > a.netOutput) return 1;
      if (b.netOutput < a.netOutput) return -1;
      return 0;
    });

    console.log(`   Evaluated ${routingOptions.length} routing options:`);
    routingOptions.forEach((option, i) => {
      const isBest = i === 0;
      const marker = isBest ? '🏆 BEST' : `   ${i + 1}.`;
      console.log(`${marker} ${option.name}`);
      console.log(`      Chains: ${option.chains.join(', ')}`);
      console.log(`      Gross Output: ${option.grossOutput.toString()} (raw)`);
      console.log(`      Gas Cost: $${option.gasCostUSD.toFixed(2)} (${option.gasCostToken.toString()} tokens)`);
      console.log(`      Net Output: ${option.netOutput.toString()} (raw)`);
    });
    console.log('');

    const bestOption = routingOptions[0];
    const isMultiChain = bestOption.chains.length > 1 || bestOption.remoteChains.length > 0;
    
    console.log(`✅ Selected: ${bestOption.name}`);
    console.log(`   Chains: ${bestOption.chains.join(' → ')}`);
    console.log(`   Gross Output: ${bestOption.grossOutput.toString()} (raw)`);
    console.log(`   Net Output: ${bestOption.netOutput.toString()} (raw)`);
    console.log(`   Multi-Chain: ${isMultiChain}`);
    console.log('═══════════════════════════════════════════════════════════════\n');

    // Build detailed route information
    const route = this.buildDetailedRoute(bestOption, amountIn, tokenIn, tokenOut);
    
    return {
      requiresMultiChain: isMultiChain,
      tokenIn,
      tokenOut,
      totalAmountIn: amountIn,
      executionChain: sourceChain,
      estimatedOutput: bestOption.grossOutput.toString(),
      netOutput: bestOption.netOutput.toString(),
      totalGasCost: bestOption.gasCostUSD,
      gasCostToken: bestOption.gasCostToken.toString(),
      routingOptions: routingOptions.map(opt => ({
        name: opt.name,
        netOutput: opt.netOutput.toString(),
        grossOutput: opt.grossOutput.toString(),
        gasCostUSD: opt.gasCostUSD,
        chains: opt.chains,
        remoteChains: opt.remoteChains || []
      })),
      ...route
    };
  }

  /**
   * Get all combinations of k elements from array
   */
  getCombinations(arr, k) {
    if (k === 0) return [[]];
    if (k > arr.length) return [];
    
    const combinations = [];
    
    function combine(start, combo) {
      if (combo.length === k) {
        combinations.push([...combo]);
        return;
      }
      
      for (let i = start; i < arr.length; i++) {
        combo.push(arr[i]);
        combine(i + 1, combo);
        combo.pop();
      }
    }
    
    combine(0, []);
    return combinations;
  }

  /**
   * Build detailed route information
   */
  buildDetailedRoute(option, amountIn, tokenIn, tokenOut) {
    const sources = [];
    const cctpTransfers = [];
    let remainingAmount = BigInt(amountIn);
    
    // Sort pools by chain (local first, then remote)
    const sortedPools = [...option.pools].sort((a, b) => {
      if (a.chain === 'arc' && b.chain !== 'arc') return -1;
      if (a.chain !== 'arc' && b.chain === 'arc') return 1;
      return 0;
    });
    
    for (const pool of sortedPools) {
      if (remainingAmount === 0n) break;
      
      const reserveIn = BigInt(pool.reserveIn || '0');
      const capacity = reserveIn / 2n;
      const amountFromPool = remainingAmount < capacity ? remainingAmount : capacity;
      
      if (amountFromPool === 0n) continue;
      
      const tokenInAddress = pool.tokenIn || pool.token0;
      const output = this.lpMonitor.calculateOutput(pool, tokenInAddress, amountFromPool.toString());
      
      if (output === 0n) continue;
      
      sources.push({
        chain: pool.chain,
        poolAddress: pool.poolAddress,
        amount: amountFromPool.toString(),
        expectedOutput: output.toString()
      });
      
      if (pool.chain !== 'arc') {
        cctpTransfers.push({
          sourceChain: pool.chain,
          amount: amountFromPool.toString(),
          destinationChain: 'arc'
        });
      }
      
      remainingAmount -= amountFromPool;
    }
    
    return {
      sourcePools: sources,
      cctpTransfers: cctpTransfers,
      gatewayWithdrawals: []
    };
  }

  /**
   * Find matching pools for a token pair across all chains
   * Uses logical token mapping to match pools across chains
   */
  findMatchingPools(allDepths, tokenIn, tokenOut, sourceChain = 'arc') {
    const matching = [];
    
    console.log(`[FIND_MATCHING_POOLS] Looking for pools matching:`);
    console.log(`   Token In (${sourceChain}): ${tokenIn}`);
    console.log(`   Token Out (${sourceChain}): ${tokenOut}`);
    console.log(`   Available chains: ${Object.keys(allDepths).join(', ')}`);

    // Determine logical tokens from source chain addresses
    const logicalTokenIn = this.getLogicalToken(tokenIn, sourceChain);
    const logicalTokenOut = this.getLogicalToken(tokenOut, sourceChain);
    
    console.log(`   Logical Token In: ${logicalTokenIn || 'UNKNOWN'}`);
    console.log(`   Logical Token Out: ${logicalTokenOut || 'UNKNOWN'}`);
    console.log(`   Source chain token addresses:`);
    console.log(`     FLX: ${this.tokenAddresses[sourceChain]?.flx || 'NOT CONFIGURED'}`);
    console.log(`     USDC: ${this.tokenAddresses[sourceChain]?.usdc || 'NOT CONFIGURED'}`);
    
    if (!logicalTokenIn || !logicalTokenOut) {
      console.warn(`   ⚠️  Could not determine logical tokens from source chain addresses`);
      console.warn(`   Token In: ${tokenIn}`);
      console.warn(`   Token Out: ${tokenOut}`);
      console.warn(`   Source Chain: ${sourceChain}`);
      console.warn(`   Falling back to exact address matching for source chain only`);
      console.warn(`   This will prevent cross-chain routing!`);
    }

    for (const [chain, depths] of Object.entries(allDepths)) {
      console.log(`   Checking chain: ${chain} (${depths.length} pools)`);
      
      // Get token addresses for this chain
      const chainTokenIn = logicalTokenIn ? this.getTokenAddressOnChain(logicalTokenIn, chain) : null;
      const chainTokenOut = logicalTokenOut ? this.getTokenAddressOnChain(logicalTokenOut, chain) : null;
      
      console.log(`     Chain ${chain} token addresses:`);
      console.log(`       ${logicalTokenIn || 'tokenIn'}: ${chainTokenIn || 'N/A (NOT CONFIGURED)'}`);
      console.log(`       ${logicalTokenOut || 'tokenOut'}: ${chainTokenOut || 'N/A (NOT CONFIGURED)'}`);
      
      if (!chainTokenIn || !chainTokenOut) {
        console.warn(`       ⚠️  Chain ${chain} token addresses not configured - pools on this chain will be skipped!`);
        console.warn(`       Configure ${chain.toUpperCase()}_FLX_TOKEN and ${chain.toUpperCase()}_USDC_ADDRESS in .env`);
      }
      
      for (const depth of depths) {
        console.log(`     Pool: ${depth.poolAddress}`);
        console.log(`       token0: ${depth.token0}`);
        console.log(`       token1: ${depth.token1}`);
        console.log(`       reserve0: ${depth.reserve0}`);
        console.log(`       reserve1: ${depth.reserve1}`);
        
        // Match using logical tokens if available, otherwise use exact addresses
        let isToken0In = false;
        let isToken1In = false;
        let isToken0Out = false;
        let isToken1Out = false;
        
        if (logicalTokenIn && logicalTokenOut && chainTokenIn && chainTokenOut) {
          // Use logical token matching
          isToken0In = depth.token0 && depth.token0.toLowerCase() === chainTokenIn.toLowerCase();
          isToken1In = depth.token1 && depth.token1.toLowerCase() === chainTokenIn.toLowerCase();
          isToken0Out = depth.token0 && depth.token0.toLowerCase() === chainTokenOut.toLowerCase();
          isToken1Out = depth.token1 && depth.token1.toLowerCase() === chainTokenOut.toLowerCase();
        } else if (chain === sourceChain) {
          // Fallback to exact address matching for source chain
          isToken0In = depth.token0 && depth.token0.toLowerCase() === tokenIn.toLowerCase();
          isToken1In = depth.token1 && depth.token1.toLowerCase() === tokenIn.toLowerCase();
          isToken0Out = depth.token0 && depth.token0.toLowerCase() === tokenOut.toLowerCase();
          isToken1Out = depth.token1 && depth.token1.toLowerCase() === tokenOut.toLowerCase();
        } else {
          // For remote chains, try to infer logical tokens from vault structure
          // Vaults have projectToken (FLX) and usdc (USDC)
          // If this is a vault, we can infer which token is which
          if (depth.isVault) {
            // For vaults: token0 = projectToken (FLX), token1 = usdc (USDC)
            // Try to match based on this assumption
            if (logicalTokenIn === 'FLX' && logicalTokenOut === 'USDC') {
              // FLX -> USDC swap
              isToken0In = true; // token0 is FLX
              isToken1Out = true; // token1 is USDC
            } else if (logicalTokenIn === 'USDC' && logicalTokenOut === 'FLX') {
              // USDC -> FLX swap
              isToken1In = true; // token1 is USDC
              isToken0Out = true; // token0 is FLX
            }
            console.log(`       Using vault structure inference (token0=FLX, token1=USDC)`);
          }
        }

        console.log(`       isToken0In: ${isToken0In}, isToken1In: ${isToken1In}`);
        console.log(`       isToken0Out: ${isToken0Out}, isToken1Out: ${isToken1Out}`);

        if ((isToken0In && isToken1Out) || (isToken1In && isToken0Out)) {
          console.log(`       ✅ MATCH! Adding to matching pools`);
          
          // Use the chain-specific token addresses for this pool
          const poolTokenIn = isToken0In ? depth.token0 : depth.token1;
          const poolTokenOut = isToken0In ? depth.token1 : depth.token0;
          
          matching.push({
            ...depth,
            chain,
            tokenIn: poolTokenIn, // Use chain-specific token address
            tokenOut: poolTokenOut, // Use chain-specific token address
            reserveIn: isToken0In ? depth.reserve0 : depth.reserve1,
            reserveOut: isToken0In ? depth.reserve1 : depth.reserve0
          });
        } else {
          console.log(`       ❌ No match`);
        }
      }
    }

    console.log(`[FIND_MATCHING_POOLS] Found ${matching.length} matching pools\n`);
    return matching;
  }

  /**
   * Calculate slippage for a pool
   */
  calculateSlippage(pool, amountIn) {
    const reserveIn = BigInt(pool.reserveIn || '0');
    if (reserveIn === 0n) return 10000; // 100% slippage if no liquidity
    
    const amountInBigInt = BigInt(amountIn);
    const priceImpact = Number(amountInBigInt * 10000n / reserveIn);
    return priceImpact;
  }
}
