// Assigns weighted scores to possible routes based on price, gas, latency, and risk.

// backend/src/router/scorer.js
// Composite scoring engine combining: slippage, gas, risk, failure, latency

import { getRiskScore } from "../stablecoin/risk.js";
import { estimateRouteCost } from "../simulator/gasEstimator.js";
import failureModel from "../simulator/failureModel.js";


/**
 * loadScoringWeights()
 * Reads config or defaults to reasonable global weighting.
 */
export function loadScoringWeights() {
  return {
    slippage: 0.40,
    gas: 0.30,
    risk: 0.20,
    latency: 0.10,
    failure: 0.15,   
    // Note: weights > 1 are normalized automatically
  };
}

/**
 * normalizeScore(val, max)
 * Convert raw value into 0–1 normalized form.
 */
function normalizeScore(val, max) {
  if (max <= 0) return 0;
  return Math.min(Math.max(val / max, 0), 1);
}

/**
 * invert(x)
 * Inverts cost-based metrics so that:
 * high cost → low score
 * low cost → high score
 */
function invert(x) {
  return 1 - Math.min(Math.max(x, 0), 1);
}

/**
 * scoreRoute(options)
 *
 * Inputs:
 * {
 *   amountIn: number,
 *   slippageUSD: number,
 *   pool: liquidity pool used,
 *   chain: chain where execution is happening,
 *   family: stablecoin family (USDC),
 *   usesCCTP: boolean,
 *   cctpSrc: string,
 *   cctpDst: string
 * }
 *
 * Returns:
 *  {
 *    totalScore: number (0–1),
 *    breakdown: { slippageScore, gasScore, riskScore, latencyScore, failureScore }
 *  }
 */
export function scoreRoute(options) {
  const {
    amountIn,
    slippageUSD,
    chain,
    family,
    usesCCTP = false,
    cctpSrc = null,
    cctpDst = null
  } = options;

  const weights = loadScoringWeights();

  /* -------------------------------
     1. Slippage score (lower = better)
     ------------------------------- */
  const slippageRatio = slippageUSD / amountIn; // e.g., $5 slippage on $1000 trade = 0.005
  const slippageScore = invert(normalizeScore(slippageRatio, 0.02)); 
  // 2% max slippage → threshold

  /* -------------------------------
     2. Gas score
     ------------------------------- */
  const gas = estimateRouteCost({
    chain,
    usesCCTP,
    cctpSrc,
    cctpDst
  });

  const gasRatio = gas.totalUsd / amountIn; 
  const gasScore = invert(normalizeScore(gasRatio, 0.03)); 
  // 3% of trade value → threshold

  /* -------------------------------
     3. Stablecoin risk
     ------------------------------- */
  const risk = getRiskScore(family, chain);
  const riskScore = 1 - risk.risk; // 0 = safe, 1 = dangerous → invert

  /* -------------------------------
     4. Latency score
     ------------------------------- */
  let latencyScore = 1.0;
  if (usesCCTP) latencyScore -= 0.35;      // bridging = slower
  if (chain === "arbitrum") latencyScore -= 0.10; // extra delay historically
  if (chain === "polygon") latencyScore -= 0.05;

  latencyScore = Math.max(latencyScore, 0);

/* -------------------------------
   5. Failure score
   ------------------------------- */
  const failureProbability = failureModel.failureForRoute(options);
  const failureScore = 1 - Math.min(Math.max(failureProbability, 0), 1);

  /* -------------------------------
     Combine all weighted factors
     ------------------------------- */

  const weighted =
      slippageScore * weights.slippage +
      gasScore * weights.gas +
      riskScore * weights.risk +
      latencyScore * weights.latency +
      failureScore * weights.failure;

  // normalize to 0–1
  const totalScore = weighted / (
    weights.slippage +
    weights.gas +
    weights.risk +
    weights.latency +
    weights.failure
  );

  return {
    success: true,
    totalScore,
    breakdown: {
      slippageScore,
      gasScore,
      riskScore,
      latencyScore,
      failureScore,
      gasCostUsd: gas.totalUsd,
      slippageUsd: slippageUSD
    }
  };
}

/**
 * scoreMany(routes)
 * Takes a list of candidate route objects and sorts them by best score.
 */
export function scoreMany(routes = []) {
  const scored = routes.map(r => ({
    route: r,
    score: scoreRoute(r)
  }));

  scored.sort((a, b) => b.score.totalScore - a.score.totalScore);

  return scored;
}

export default {
  scoreRoute,
  scoreMany,
  loadScoringWeights
};
