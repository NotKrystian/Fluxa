/**
 * Stablecoin Family Graph (cross-chain)
 * Each family groups tokens that represent the same off-chain asset.
 */

export const GRAPH = {
  USDC: [
    // Arc
    {
      family: "USDC",
      chain: "arc",
      address: "0xarc-usdc",             // placeholder
      symbol: "USDC",
      type: "native",
      decimals: 6,
      mintable: true,
      meta: { origin: "circle" }
    },

    // Ethereum
    {
      family: "USDC",
      chain: "ethereum",
      address: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
      symbol: "USDC",
      type: "native",
      decimals: 6,
      mintable: true
    },

    // Polygon USDC.e (bridged)
    {
      family: "USDC",
      chain: "polygon",
      address: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174",
      symbol: "USDC.e",
      type: "bridged",
      decimals: 6
    },

    // Arbitrum native USDC
    {
      family: "USDC",
      chain: "arbitrum",
      address: "0xaf88d065e77c8cc2239327c5edb3a432268e5831",
      symbol: "USDC",
      type: "native",
      decimals: 6
    }
  ],

  EURC: [
    {
      family: "EURC",
      chain: "ethereum",
      address: "0x1e4abf7e2c4040e20b5a99a9cd09bd18a66fc2ee",
      symbol: "EURC",
      type: "native",
      decimals: 6
    }
  ]
};

/**
 * Helpers
 */

function findEntryByAddress(address, chainKey) {
  if (!address || !chainKey) return null;
  const needle = address.toLowerCase();
  for (const family of Object.keys(GRAPH)) {
    const hit = GRAPH[family].find(
      e => e.chain === chainKey && e.address.toLowerCase() === needle
    );
    if (hit) return hit;
  }
  return null;
}

function findEntryBySymbol(symbol, chainKey) {
  if (!symbol || !chainKey) return null;
  const needle = symbol.toLowerCase();
  for (const family of Object.keys(GRAPH)) {
    const hit = GRAPH[family].find(
      e => e.chain === chainKey && e.symbol.toLowerCase() === needle
    );
    if (hit) return hit;
  }
  return null;
}

export function getStableEquivalence(tokenAddressOrSymbol, chainKey) {
  if (!tokenAddressOrSymbol) return null;

  const isAddress =
    typeof tokenAddressOrSymbol === "string" &&
    tokenAddressOrSymbol.startsWith("0x");

  let e = null;

  if (isAddress) e = findEntryByAddress(tokenAddressOrSymbol, chainKey);
  if (!e) e = findEntryBySymbol(tokenAddressOrSymbol, chainKey);

  return e ? { ...e } : null;
}

export function getEntriesForFamily(family) {
  return GRAPH[family] ? GRAPH[family].map(e => ({ ...e })) : [];
}

export function normalizeToken(tokenAddressOrSymbol, chainKey, preferChain = null) {
  const eq = getStableEquivalence(tokenAddressOrSymbol, chainKey);
  if (!eq) return null;

  const fam = eq.family;
  const entries = getEntriesForFamily(fam);

  if (preferChain) {
    const pref = entries.find(e => e.chain === preferChain);
    if (pref) return pref;
  }

  const nativeSame = entries.find(
    e => e.chain === chainKey && e.type === "native"
  );
  if (nativeSame) return nativeSame;

  const nativeAny = entries.find(e => e.type === "native");
  if (nativeAny) return nativeAny;

  const bridgedSame = entries.find(
    e => e.chain === chainKey && e.type === "bridged"
  );
  if (bridgedSame) return bridgedSame;

  return entries[0];
}

export function listFamilies() {
  return Object.keys(GRAPH);
}

export function debugDumpGraph() {
  return JSON.parse(JSON.stringify(GRAPH));
}

export default {
  GRAPH,
  getStableEquivalence,
  normalizeToken,
  getEntriesForFamily,
  listFamilies
};
