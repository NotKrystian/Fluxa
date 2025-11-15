// backend/src/dex/index.js
// Master liquidity aggregator — merges internal pools + external DEX pools
// All external DEX modules must normalize to the same pool format.

import internal from "./internal.js";
import uniswap from "./uniswap.js";


import fs from "fs";
import path from "path";

/**
 * Optional config file:
 *   config/external_pools.json
 *
 * Example:
 * {
 *   "uniswap": {
 *     "ethereum": [
 *       "0xPoolAddr1",
 *       "0xPoolAddr2"
 *     ]
 *   }
 * }
 */
const EXT_CONFIG_PATH = path.resolve(process.cwd(), "config", "external_pools.json");

function loadExternalPoolConfig() {
  if (!fs.existsSync(EXT_CONFIG_PATH)) {
    console.warn("dex/index: No external_pools.json found — only internal liquidity will be used.");
    return {};
  }
  try {
    const raw = fs.readFileSync(EXT_CONFIG_PATH, "utf8");
    return JSON.parse(raw);
  } catch (err) {
    console.error("dex/index: Failed to parse external_pools.json:", err);
    return {};
  }
}

/* ---------------------------------------------
   1. Load Internal Liquidity Pools
------------------------------------------------*/

export function getInternalLiquidity(family = null, chain = null) {
  if (!family) return internal.getAllInternalPools();
  return internal.getInternalPoolsForFamily(family, chain);
}

/* ---------------------------------------------
   2. Load External Liquidity (Uniswap/Aero/Curve)
------------------------------------------------*/

async function loadUniswapPools(config) {
  if (!config?.uniswap) return [];

  let all = [];
  for (const chainKey of Object.keys(config.uniswap)) {
    const poolList = config.uniswap[chainKey];
    if (!Array.isArray(poolList)) continue;

    const pools = await uniswap.fetchUniswapV2Pools(chainKey, poolList);
    all = all.concat(pools);
  }
  return all;
}

// Templates for future expansion
async function loadAerodromePools(config) {
  if (!config?.aerodrome) return [];
  // TODO: integrate aerodrome.fetchPools
  return [];
}

async function loadVelodromePools(config) {
  if (!config?.velodrome) return [];
  // TODO: integrate velodrome.fetchPools
  return [];
}

async function loadCurvePools(config) {
  if (!config?.curve) return [];
  // TODO: integrate curve.fetchPools
  return [];
}

/* ---------------------------------------------
   3. Master Aggregator
------------------------------------------------*/

/**
 * getAllLiquidity(options)
 *
 * options:
 *   - family: optional stablecoin family ("USDC")
 *   - chain: restrict external pools to a chain
 *   - includeExternal: boolean (default true)
 *   - includeInternal: boolean (default true)
 *
 * RETURNS unified pool list:
 * [
 *   {
 *     chain: "ethereum",
 *     protocol: "uniswap-v2" | "internal",
 *     poolAddress: "0x...",
 *     token0: "...",
 *     token1: "...",
 *     reserve0: number,
 *     reserve1: number,
 *     fee: 0.003
 *   }
 * ]
 */
export async function getAllLiquidity(options = {}) {
  const {
    family = null,
    chain = null,
    includeExternal = true,
    includeInternal = true
  } = options;

  const externalConfig = loadExternalPoolConfig();

  let pools = [];

  // 1. Internal pools
  if (includeInternal) {
    const internalPools = getInternalLiquidity(family, chain).map(p => ({
      chain: p.chain,
      protocol: "internal",
      poolId: p.id,
      poolAddress: null, // internal pool doesn't have on-chain contract
      token0: p.token,
      token1: p.token, // internal swaps are same-token
      reserve0: p.reserve,
      reserve1: p.reserve,
      fee: p.fee,
      family: p.family,
      poolType: p.poolType
    }));
    pools = pools.concat(internalPools);
  }

  // 2. External pools
  if (includeExternal) {
    const [uni, aero, velo, curve] = await Promise.all([
      loadUniswapPools(externalConfig),
      loadAerodromePools(externalConfig),
      loadVelodromePools(externalConfig),
      loadCurvePools(externalConfig)
    ]);

    let externalPools = [...uni, ...aero, ...velo, ...curve];

    // Filter by chain if needed
    if (chain) {
      externalPools = externalPools.filter(p => p.chain === chain);
    }

    pools = pools.concat(externalPools);
  }

  return pools;
}

/* ---------------------------------------------
   Utility: Get liquidity for a specific chain
------------------------------------------------*/

export async function getLiquidityForChain(chainKey) {
  return getAllLiquidity({ chain: chainKey });
}

