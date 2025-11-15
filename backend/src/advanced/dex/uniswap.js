// Handles liquidity queries from DEXes to feed the routing engine.
// Fetch pool states, reserves, and fees from specific DEX protocols.



import { ethers } from "ethers";
import { getProvider } from "../utils/providers.js";

const UNISWAP_V2_ABI = [
  "function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)",
  "function token0() view returns (address)",
  "function token1() view returns (address)"
];

/**
 * Loads a Uniswap V2-style pool and returns normalized liquidity info
 */
export async function getUniswapV2Pool(chainKey, poolAddress, fee = 0.003) {
  try {
    const provider = getProvider(chainKey);
    const pool = new ethers.Contract(poolAddress, UNISWAP_V2_ABI, provider);

    const [token0, token1] = await Promise.all([
      pool.token0(),
      pool.token1()
    ]);

    const { reserve0, reserve1 } = await pool.getReserves();

    return {
      chain: chainKey,
      protocol: "uniswap-v2",
      poolAddress,
      token0: token0.toLowerCase(),
      token1: token1.toLowerCase(),
      reserve0: Number(reserve0),
      reserve1: Number(reserve1),
      fee
    };
  } catch (err) {
    console.error(`UniswapV2 fetch error on ${chainKey}:`, err);
    return null;
  }
}

/**
 * Simple helper to fetch many pools at once
 */
export async function fetchUniswapV2Pools(chainKey, poolAddresses) {
  const promises = poolAddresses.map(addr =>
    getUniswapV2Pool(chainKey, addr)
  );
  const results = await Promise.all(promises);
  return results.filter(x => x !== null);
}

export default {
  getUniswapV2Pool,
  fetchUniswapV2Pools
};
