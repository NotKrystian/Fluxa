import fs from "fs";
import { ethers } from "ethers";

let rpcConfig = null;

/**
 * Load and cache rpc.json only once
 */
function loadRpcConfig() {
  if (!rpcConfig) {
    const raw = fs.readFileSync("./config/rpc.json", "utf-8");
    rpcConfig = JSON.parse(raw);
  }
  return rpcConfig;
}

/**
 * Validate that the chain configuration exists
 */
function validateChainConfig(chainKey, config) {
  if (!config) {
    throw new Error(`RPC config for chain "${chainKey}" does not exist.`);
  }
  if (!config.rpcUrl) {
    throw new Error(`Missing rpcUrl for chain "${chainKey}".`);
  }
  if (!config.chainId) {
    throw new Error(`Missing chainId for chain "${chainKey}".`);
  }
}

/**
 * Returns a JsonRpcProvider for the chain
 */
export function getProvider(chainKey) {
  const cfg = loadRpcConfig()[chainKey];
  validateChainConfig(chainKey, cfg);

  return new ethers.JsonRpcProvider(cfg.rpcUrl, cfg.chainId);
}

/**
 * Return WebSocket provider (if available)
 */
export function getWsProvider(chainKey) {
  const cfg = loadRpcConfig()[chainKey];
  validateChainConfig(chainKey, cfg);

  if (!cfg.wsUrl) return null;

  return new ethers.WebSocketProvider(cfg.wsUrl, cfg.chainId);
}

/**
 * Get raw config entry (for advanced usage)
 */
export function getRpcConfig(chainKey) {
  const cfg = loadRpcConfig()[chainKey];
  validateChainConfig(chainKey, cfg);
  return cfg;
}
