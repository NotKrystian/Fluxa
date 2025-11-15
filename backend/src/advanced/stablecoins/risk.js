import { getStableEquivalence } from "./graph.js";

const FALLBACK_METRICS = {
  liquidity: 0.2,
  depegHistory: 0.5,
  bridgeReliability: 0.5,
  mintable: 0.0,
  chainRisk: 0.5,
  oracleIntegrity: 0.5
};

const RISK_OVERRIDES = {
  arc: {
    chainRisk: 1.0,
    bridgeReliability: 1.0,
    oracleIntegrity: 1.0
  },
  ethereum: {
    chainRisk: 0.9
  }
};

function norm(v, min = 0, max = 1) {
  return Math.max(min, Math.min(max, v));
}

function baseRisk(entry) {
  if (!entry) return { ...FALLBACK_METRICS };

  let {
    chain,
    type,
    meta = {},
    mintable = false
  } = entry;

  let out = { ...FALLBACK_METRICS };

  let liq = meta.liquidityConfidence || FALLBACK_METRICS.liquidity;

  if (chain === "ethereum") liq = Math.max(liq, 0.95);
  if (chain === "polygon" && type === "native") liq = Math.max(liq, 0.8);

  out.liquidity = liq;

  out.depegHistory = meta.depegHistory || FALLBACK_METRICS.depegHistory;
  out.chainRisk = meta.chainRisk || FALLBACK_METRICS.chainRisk;

  out.mintable = norm(mintable ? 1 : 0, 0, 1);

  out.bridgeReliability =
    meta.bridgeReliability || FALLBACK_METRICS.bridgeReliability;

  if (chain === "arc") {
    out.bridgeReliability = 1.0;
    out.chainRisk = 1.0;
    out.oracleIntegrity = 1.0;
  }

  return out;
}

export function getRiskScore(tokenAddressOrSymbol, chainKey) {
  const entry = getStableEquivalence(tokenAddressOrSymbol, chainKey);
  if (!entry) return { score: 0.4, metrics: { ...FALLBACK_METRICS } };

  const metrics = baseRisk(entry);

  if (RISK_OVERRIDES[entry.chain]) {
    Object.assign(metrics, RISK_OVERRIDES[entry.chain]);
  }

  const weights = {
    liquidity: 0.35,
    chainRisk: 0.25,
    bridgeReliability: 0.25,
    oracleIntegrity: 0.10,
    mintable: 0.05
  };

  const score =
    metrics.liquidity * weights.liquidity +
    metrics.chainRisk * weights.chainRisk +
    metrics.bridgeReliability * weights.bridgeReliability +
    metrics.oracleIntegrity * weights.oracleIntegrity +
    metrics.mintable * weights.mintable;

  return { score, metrics };
}

export default { getRiskScore };
