// backend/src/dex/internal.js
// Internal pool abstraction for your protocol's owned liquidity.
// Node ESM, no external deps beyond fs + path. Uses simple constant-product math as default AMM model.

import fs from 'fs';
import path from 'path';
import chainsMeta from '../chains/index.js'; // expects default export object { arc, ethereum, ... }

const CONFIG_PATH = path.resolve(process.cwd(), 'config', 'internal_pools.json');

/**
 * Expected pool config shape (per entry in config/internal_pools.json):
 * {
 *   "id": "arc-usdc-1",
 *   "family": "USDC",
 *   "chain": "arc",
 *   "poolType": "internal-amm", // "internal-amm" | "stablepool" ...
 *   "token": "USDC",
 *   "decimals": 6,
 *   "reserve": 1000000.00,      // amount in token units (not wei)
 *   "fee": 0.001,               // e.g. 0.001 = 0.1% fee
 *   "meta": {}
 * }
 *
 * For stablecoin families the token/decimals will usually be the same.
 */

/* ---------------------------
   Config loading & caching
   --------------------------- */
let POOLS_CACHE = null;

function loadPoolsConfig() {
  if (POOLS_CACHE) return POOLS_CACHE;
  if (!fs.existsSync(CONFIG_PATH)) {
    console.warn('internal/dex: config/internal_pools.json not found — returning empty set');
    POOLS_CACHE = [];
    return POOLS_CACHE;
  }
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    // Normalize addresses/strings, ensure numeric types
    POOLS_CACHE = parsed.map(p => ({
      id: p.id,
      family: p.family,
      chain: p.chain,
      poolType: p.poolType || 'internal-amm',
      token: p.token,
      decimals: Number(p.decimals ?? 6),
      reserve: Number(p.reserve ?? 0),
      fee: Number(p.fee ?? 0.001),
      meta: p.meta || {}
    }));
    return POOLS_CACHE;
  } catch (e) {
    console.error('internal/dex: failed to parse internal_pools.json', e);
    POOLS_CACHE = [];
    return POOLS_CACHE;
  }
}

/* Allow runtime refresh (ops may update config file) */
export function refreshPoolsCache() {
  POOLS_CACHE = null;
  return loadPoolsConfig();
}

/* ---------------------------
   Basic getters
   --------------------------- */

export function getAllInternalPools() {
  return loadPoolsConfig().map(p => ({ ...p }));
}

/**
 * getInternalPoolsForFamily(family, optionalChain)
 * returns array of pools for the family. If optionalChain provided, filters by chain.
 */
export function getInternalPoolsForFamily(family, chain = null) {
  if (!family) return [];
  const all = loadPoolsConfig();
  return all
    .filter(p => p.family === family && (chain ? p.chain === chain : true))
    .map(p => ({ ...p }));
}

/* ---------------------------
   Utility: convert decimals and value helpers
   --------------------------- */

function toSafeNumber(n) {
  const num = Number(n);
  if (Number.isNaN(num) || !isFinite(num)) return 0;
  return num;
}

/* ---------------------------
   AMM math helpers (constant-product)
   --------------------------- */

/**
 * getAmountOutCP(amountIn, reserveIn, reserveOut, fee)
 * amountIn, reserves are assumed in token units (not wei) and same decimals
 * returns amountOut (token units)
 */
function getAmountOutCP(amountIn, reserveIn, reserveOut, fee) {
  const amountInWithFee = amountIn * (1 - fee);
  const numerator = amountInWithFee * reserveOut;
  const denominator = reserveIn + amountInWithFee;
  if (denominator === 0) return 0;
  return numerator / denominator;
}

/* ---------------------------
   Aggregation helpers
   --------------------------- */

/**
 * aggregateReserves(pools)
 * For a family where token decimals are the same, return totalReserve and a breakdown.
 */
function aggregateReserves(pools) {
  const breakdown = pools.map(p => ({ id: p.id, chain: p.chain, reserve: toSafeNumber(p.reserve), fee: p.fee }));
  const totalReserve = breakdown.reduce((s, b) => s + b.reserve, 0);
  return { totalReserve, breakdown };
}

/* ---------------------------
   Gas estimation
   --------------------------- */

/**
 * estimateInternalGasUSD(mode, chainKey, amountUSD)
 * mode: 'aggregate' -> Arc execution (use arc metadata), 'local' -> local chain
 * Uses chain metadata from ../chains (fallbacks included)
 */
export function estimateInternalGasUSD(mode = 'aggregate', chainKey = 'arc', amountUSD = 0) {
  const meta = chainsMeta[chainKey] || chainsMeta.arc || {};
  // prefer explicit averageGasPrice & averageGasUsed if provided (both in native units or USDC for Arc)
  // For Arc, averageGasPrice is expected to be expressed in settlement token (USDC)
  const avgGasPrice = toSafeNumber(meta.averageGasPrice ?? 0); // if Arc, this is USDC per gas unit or flat USD
  const avgGasUsed = toSafeNumber(meta.averageGasUsed ?? 0);

  // If chain uses native ETH-like gas and avgGasPrice looks like gwei (small number), we cannot convert here.
  // For simplicity make assumptions:
  // - If chain.gasCurrency === 'USDC' or meta.nativeSymbol === 'USDC', treat avgGasPrice*avgGasUsed as USD directly.
  if (meta.gasCurrency && meta.gasCurrency.toUpperCase() === 'USDC') {
    // avgGasPrice (USDC per gas unit) * avgGasUsed => USDC
    const gasUSD = avgGasPrice * avgGasUsed;
    return Number(gasUSD || 0);
  }

  // If avgGasPrice seems like a small number (< 1) assume it's gasPrice in USD-per-unit already
  if (avgGasPrice > 0 && avgGasPrice < 1) {
    return avgGasPrice * avgGasUsed;
  }

  // Fallback: use static small flat fee per internal execution (very conservative)
  return 1.0; // $1 USD fallback
}

/* ---------------------------
   Simulation functions
   --------------------------- */

/**
 * simulateInternalSwap(amountIn, family, options)
 *
 * options:
 *  - mode: 'aggregate' | 'local'
 *  - chain: (required for 'local' mode) chainKey string
 *  - splitPools: boolean (if true, will attempt proportional routing across multiple pools; default true for aggregate)
 *
 * Returns:
 *  {
 *    success: true,
 *    family,
 *    mode,
 *    amountIn,
 *    expectedAmountOut,
 *    slippageUSD,
 *    feeUSD,
 *    gasUSD,
 *    breakdown: [ { poolId, chain, usedAmountIn, amountOut, feeUSD, slippageUSD } ],
 *    notes: string
 *  }
 */
export function simulateInternalSwap(amountIn, family, options = {}) {
  const amt = toSafeNumber(amountIn);
  const mode = options.mode || 'aggregate';
  const splitPools = options.splitPools === undefined ? true : !!options.splitPools;

  if (!family) {
    return { success: false, error: 'family required' };
  }
  if (amt <= 0) {
    return { success: false, error: 'amountIn must be > 0' };
  }

  if (mode === 'local' && !options.chain) {
    return { success: false, error: 'chain required for local mode' };
  }

  // gather pools
  const pools = mode === 'aggregate'
    ? getInternalPoolsForFamily(family)
    : getInternalPoolsForFamily(family, options.chain);

  if (!pools || pools.length === 0) {
    return { success: false, error: `no internal pools found for family=${family} chain=${options.chain || 'any'}` };
  }

  // If splitPools true: attempt to route proportionally across pools by reserve share.
  // Otherwise, try to consume pools in order (largest reserve first).
  const { totalReserve, breakdown } = aggregateReserves(pools);

  if (totalReserve <= 0) {
    return { success: false, error: 'totalReserve is zero' };
  }

  const results = [];
  let remaining = amt;
  let totalOut = 0;
  let totalFee = 0;
  let totalSlippage = 0;

  // simple proportional split logic
  const poolsSorted = [...pools].sort((a, b) => b.reserve - a.reserve);

  if (splitPools) {
    for (const p of poolsSorted) {
      const share = p.reserve / totalReserve;
      const take = amt * share;
      const reserveIn = p.reserve;
      // we assume same token for both sides so reserveOut == reserveIn for internal mid-market
      // to simulate swap, treat AMM as pair of same-token? For stablecoin->stablecoin swaps within family, output is same token,
      // so we model small price impact using a constant-product style with symmetric reserves.
      // In effect: swapping tokenA->tokenB when both are same underlying stable requires pair representation.
      // For simplicity we assume reserveOut == reserveIn and use CP formula (conservative).
      const amountOut = getAmountOutCP(take, reserveIn, reserveIn, p.fee);
      const feeUSD = take * p.fee; // token is stable -> fee in USD
      const slippageUSD = (take - amountOut); // because token==USD
      results.push({
        poolId: p.id,
        chain: p.chain,
        usedAmountIn: take,
        amountOut,
        feeUSD,
        slippageUSD
      });
      totalOut += amountOut;
      totalFee += feeUSD;
      totalSlippage += slippageUSD;
    }
  } else {
    // consume pools greedily
    for (const p of poolsSorted) {
      if (remaining <= 0) break;
      const take = Math.min(remaining, p.reserve * 0.5); // don't exceed 50% of pool as a naive safety rule
      const amountOut = getAmountOutCP(take, p.reserve, p.reserve, p.fee);
      const feeUSD = take * p.fee;
      const slippageUSD = take - amountOut;
      results.push({
        poolId: p.id,
        chain: p.chain,
        usedAmountIn: take,
        amountOut,
        feeUSD,
        slippageUSD
      });
      totalOut += amountOut;
      totalFee += feeUSD;
      totalSlippage += slippageUSD;
      remaining -= take;
    }

    // if still remaining, attempt proportional on remaining pools (degraded but better than failing)
    if (remaining > 0) {
      for (const p of poolsSorted) {
        if (remaining <= 0) break;
        const take = Math.min(remaining, p.reserve * 0.25);
        const amountOut = getAmountOutCP(take, p.reserve, p.reserve, p.fee);
        const feeUSD = take * p.fee;
        const slippageUSD = take - amountOut;
        results.push({
          poolId: p.id,
          chain: p.chain,
          usedAmountIn: take,
          amountOut,
          feeUSD,
          slippageUSD
        });
        totalOut += amountOut;
        totalFee += feeUSD;
        totalSlippage += slippageUSD;
        remaining -= take;
      }
    }
  }

  // gas estimation
  const chainForGas = mode === 'aggregate' ? 'arc' : (options.chain || poolsSorted[0].chain);
  const gasUSD = estimateInternalGasUSD(mode === 'aggregate' ? 'aggregate' : 'local', chainForGas, amt);

  return {
    success: true,
    family,
    mode,
    amountIn: amt,
    expectedAmountOut: totalOut,
    slippageUSD: totalSlippage,
    feeUSD: totalFee,
    gasUSD,
    breakdown: results,
    note: `simulated ${mode} using ${pools.length} pool(s)`
  };
}

/* ---------------------------
   Example convenience wrapper:
   simulateAggregateOnArc(amount, family)
   simulateLocalOnChain(amount, family, chain)
   --------------------------- */

export function simulateAggregateOnArc(amountIn, family, opts = {}) {
  return simulateInternalSwap(amountIn, family, { ...opts, mode: 'aggregate', splitPools: true });
}

export function simulateLocalOnChain(amountIn, family, chain, opts = {}) {
  return simulateInternalSwap(amountIn, family, { ...opts, mode: 'local', chain, splitPools: opts.splitPools });
}

/* ---------------------------
   Export default
   --------------------------- */
export default {
  getAllInternalPools,
  getInternalPoolsForFamily,
  refreshPoolsCache,
  simulateInternalSwap,
  simulateAggregateOnArc,
  simulateLocalOnChain,
  estimateInternalGasUSD
};
