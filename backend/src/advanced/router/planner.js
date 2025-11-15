// Produces deterministic route plans in canonical format for arc-js commitment.

// Produces canonical route plans and hashes for on-chain commitment.

import { keccakHashOf, stableStringify } from "../utils/hash.js";
import { scoreMany } from "./scorer.js";
import { now } from "../utils/time.js"; // optional helper; we'll fallback if missing

// If you don't have time.js, use Date.now wrapper
function _nowIso() {
  try {
    // try optional helper import (non-fatal)
    return now();
  } catch (e) {
    return new Date().toISOString();
  }
}

/**
 * Expected candidate route object (examples used by scorer/priceImpact):
 * {
 *   id: "candidate-1",
 *   mode: "AGGREGATE_ARC" | "LOCAL" | "EXTERNAL",
 *   family: "USDC",
 *   chain: "arc" | "ethereum" | ...,
 *   amountIn: 100000,
 *   amountOut: 99900,
 *   slippageUSD: 100,
 *   feeUSD: 10,
 *   gasUSD: 5,
 *   usesCCTP: false,
 *   hops: [ { type: 'dex'|'bridge'|'internal', chain, poolId, amountIn, amountOut }, ... ],
 *   meta: { ... }
 * }
 */

/**
 * generateCanonicalPlan(selectedRoute, opts)
 *
 * - selectedRoute: route object (see shape above)
 * - opts:
 *    - requestId (string)
 *    - userAddress (string)
 *    - expirySeconds (int) default 60
 *    - operator (string)
 *
 * Returns: { plan, hash }
 */
export function generateCanonicalPlan(selectedRoute, opts = {}) {
  if (!selectedRoute) throw new Error("selectedRoute required");

  const {
    requestId = null,
    userAddress = null,
    expirySeconds = 60,
    operator = "offchain-router"
  } = opts;

  const timestamp = _nowIso();
  const expiry = new Date(Date.now() + (expirySeconds * 1000)).toISOString();

  // Build canonical plan object (keep field order stable by construction)
  const plan = {
    metadata: {
      requestId,
      operator,
      createdAt: timestamp,
      expiresAt: expiry,
      userAddress: userAddress || null
    },
    execution: {
      mode: selectedRoute.mode || selectedRoute.executionMode || "UNKNOWN",
      family: selectedRoute.family,
      amountIn: Number(selectedRoute.amountIn),
      expectedAmountOut: Number(selectedRoute.amountOut || selectedRoute.expectedAmountOut || 0),
      chain: selectedRoute.chain,
      usesCCTP: !!selectedRoute.usesCCTP,
      score: Number((selectedRoute.score && selectedRoute.score.totalScore) || selectedRoute.totalScore || 0),
      breakdown: {
        slippageUSD: Number(selectedRoute.slippageUSD ?? selectedRoute.slippageUsd ?? 0),
        feeUSD: Number(selectedRoute.feeUSD ?? selectedRoute.feeUsd ?? 0),
        gasUSD: Number(selectedRoute.gasUSD ?? selectedRoute.gasUsd ?? 0),
        riskScore: Number((selectedRoute.score && selectedRoute.score.breakdown && selectedRoute.score.breakdown.riskScore) || 0)
      }
    },
    hops: (selectedRoute.hops || selectedRoute.path || []).map(h => ({
      type: h.type || h.kind || "unknown",
      chain: h.chain || h.fromChain || h.toChain || null,
      poolId: h.poolId || h.poolAddress || null,
      amountIn: Number(h.amountIn ?? h.usedAmountIn ?? 0),
      amountOut: Number(h.amountOut ?? h.expectedOut ?? 0),
      meta: h.meta || {}
    }))
  };

  // Create deterministic hash
  const hash = keccakHashOf(plan);

  return { plan, hash, planJson: stableStringify(plan) };
}

/**
 * generateFallbacks(candidates, topN = 3)
 * Builds a small fallback bundle from the ranked candidate list.
 * Inputs: candidates = array sorted by score desc OR raw (scoreMany will handle)
 */
export function generateFallbacks(candidates = [], topN = 3) {
  if (!Array.isArray(candidates)) return [];

  // If candidates are raw route objects (not scored), call scoreMany
  const first = candidates[0];
  let scored;
  if (first && first.score && typeof first.score.totalScore === "number") {
    // assume already scored: [{ route, score }]
    scored = candidates.map(c => ({ route: c.route || c, score: c.score || c }));
  } else {
    const scoredList = scoreMany(candidates.map(r => r));
    scored = scoredList.map(s => ({ route: s.route, score: s.score }));
  }

  const fallbacks = scored.slice(0, Math.max(1, topN)).map(item => {
    const r = item.route;
    return {
      id: r.id || r.poolId || `${r.mode || r.executionMode}-${r.chain}-${Math.random().toString(36).slice(2,8)}`,
      mode: r.mode || r.executionMode || "unknown",
      chain: r.chain,
      family: r.family,
      score: item.score.totalScore,
      amountIn: r.amountIn,
      amountOut: r.amountOut
    };
  });

  return fallbacks;
}

/**
 * planFromCandidates(candidates, opts)
 * Main helper: takes an array of candidate routes (unsorted), scores them,
 * picks the best route, returns plan + hash + fallbacks + ranked list.
 *
 * candidates: array of route objects (see expected shape)
 * opts:
 *   - topFallbackCount
 *   - requestId, userAddress, expirySeconds, operator
 */
export function planFromCandidates(candidates = [], opts = {}) {
  if (!Array.isArray(candidates) || candidates.length === 0) {
    throw new Error("candidates required");
  }

  // Score many -> returns [{ route, score }]
  const scored = scoreMany(candidates);

  // Best route is first
  const best = scored[0];
  const chosenRoute = best.route;
  // Attach score to route for the planner
  chosenRoute.score = best.score;

  // build canonical plan
  const { plan, hash, planJson } = generateCanonicalPlan(chosenRoute, opts);

  // prepare fallbacks
  const fallbacks = generateFallbacks(scored.map(s => ({ route: s.route, score: s.score })), opts.topFallbackCount ?? 3);

  // return comprehensive object
  return {
    success: true,
    chosenRoute,
    plan,
    hash,
    planJson,
    fallbacks,
    ranked: scored.map(s => ({ route: s.route, score: s.score }))
  };
}

export default {
  generateCanonicalPlan,
  generateFallbacks,
  planFromCandidates
};
