// Converts canonical route plans into keccak256 hashes for on-chain verification.
import { keccak256, toUtf8Bytes } from "ethers";

/**
 * canonicalize(obj)
 * Recursively sorts object keys so JSON output is deterministic.
 */
export function canonicalize(obj) {
  if (obj === null || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(canonicalize);
  const out = {};
  const keys = Object.keys(obj).sort();
  for (const k of keys) out[k] = canonicalize(obj[k]);
  return out;
}

/**
 * stableStringify(obj)
 * Returns a deterministic JSON string representation.
 */
export function stableStringify(obj) {
  return JSON.stringify(canonicalize(obj));
}

/**
 * keccakHashOf(obj)
 * Returns 0x-prefixed keccak256 hash of the stable JSON representation.
 */
export function keccakHashOf(obj) {
  const s = stableStringify(obj);
  return keccak256(toUtf8Bytes(s));
}

export default {
  canonicalize,
  stableStringify,
  keccakHashOf
};
