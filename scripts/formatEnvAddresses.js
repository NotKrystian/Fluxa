/**
 * Format Deployment Addresses for .env
 * 
 * Extracts addresses from deployment results and formats them for .env file
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load deployment results
const tokensPath = path.join(__dirname, '../deployment-results-tokens.json');
const gatewaysPath = path.join(__dirname, '../deployment-results-gateways.json');
const hubPath = path.join(__dirname, '../deployment-results-arc-hub.json');
const factoryPath = path.join(__dirname, '../deployment-results-base-factory.json');
const vaultPath = path.join(__dirname, '../deployment-results-base-vault.json');
const routersPath = path.join(__dirname, '../deployment-results-routers.json');

const tokens = JSON.parse(fs.readFileSync(tokensPath, 'utf8'));
const gateways = JSON.parse(fs.readFileSync(gatewaysPath, 'utf8'));
const hub = JSON.parse(fs.readFileSync(hubPath, 'utf8'));
const factory = fs.existsSync(factoryPath) ? JSON.parse(fs.readFileSync(factoryPath, 'utf8')) : null;
const vault = fs.existsSync(vaultPath) ? JSON.parse(fs.readFileSync(vaultPath, 'utf8')) : null;
const routers = fs.existsSync(routersPath) ? JSON.parse(fs.readFileSync(routersPath, 'utf8')) : null;

console.log('# ============================================');
console.log('# DEPLOYED CONTRACT ADDRESSES');
console.log('# ============================================');
console.log('# Generated from deployment results');
console.log('#');
console.log('');

console.log('# --- Test Tokens (MockERC20) ---');
if (tokens.tokens?.arc?.address) {
  console.log(`ARC_FLX_TOKEN=${tokens.tokens.arc.address}`);
  console.log(`NEXT_PUBLIC_ARC_FLX_TOKEN=${tokens.tokens.arc.address}`);
}
if (tokens.tokens?.base?.address) {
  console.log(`BASE_SEPOLIA_FLX_TOKEN=${tokens.tokens.base.address}`);
  console.log(`NEXT_PUBLIC_BASE_SEPOLIA_FLX_TOKEN=${tokens.tokens.base.address}`);
}
console.log('');

console.log('# --- Fluxa Gateway Contracts ---');
if (gateways.gateways?.arc?.gatewayAddress) {
  console.log(`ARC_GATEWAY=${gateways.gateways.arc.gatewayAddress}`);
  console.log(`NEXT_PUBLIC_ARC_GATEWAY=${gateways.gateways.arc.gatewayAddress}`);
}
if (gateways.gateways?.base?.gatewayAddress) {
  console.log(`BASE_SEPOLIA_GATEWAY=${gateways.gateways.base.gatewayAddress}`);
  console.log(`NEXT_PUBLIC_BASE_SEPOLIA_GATEWAY=${gateways.gateways.base.gatewayAddress}`);
}
if (gateways.gateways?.base?.wrappedTokenAddress) {
  console.log(`BASE_SEPOLIA_WRAPPED_TOKEN=${gateways.gateways.base.wrappedTokenAddress}`);
  console.log(`NEXT_PUBLIC_BASE_SEPOLIA_WRAPPED_TOKEN=${gateways.gateways.base.wrappedTokenAddress}`);
}
console.log('');

console.log('# --- Arc Execution Hub ---');
if (hub.hub?.address) {
  console.log(`ARC_EXECUTION_HUB=${hub.hub.address}`);
  console.log(`NEXT_PUBLIC_ARC_EXECUTION_HUB=${hub.hub.address}`);
}
console.log('');

console.log('# --- VaultFactory (Base) ---');
if (factory?.vaultFactory?.address) {
  console.log(`BASE_SEPOLIA_VAULT_FACTORY=${factory.vaultFactory.address}`);
  console.log(`NEXT_PUBLIC_BASE_SEPOLIA_VAULT_FACTORY=${factory.vaultFactory.address}`);
}
console.log('');

console.log('# --- Liquidity Vaults ---');
if (hub.hub?.pool) {
  console.log(`# ARC_FLX_VAULT=${hub.hub.pool}  # Already exists`);
  console.log(`# NEXT_PUBLIC_ARC_FLX_VAULT=${hub.hub.pool}  # Already exists`);
}
if (vault?.vault?.address) {
  console.log(`BASE_SEPOLIA_FLX_VAULT=${vault.vault.address}`);
  console.log(`NEXT_PUBLIC_BASE_SEPOLIA_FLX_VAULT=${vault.vault.address}`);
}
console.log('');

console.log('# --- Swap Routers ---');
if (routers?.routers?.base?.routerAddress) {
  console.log(`BASE_SEPOLIA_SWAP_ROUTER=${routers.routers.base.routerAddress}`);
  console.log(`NEXT_PUBLIC_BASE_SEPOLIA_SWAP_ROUTER=${routers.routers.base.routerAddress}`);
}
console.log('');

console.log('# ============================================');
console.log('# END OF DEPLOYED ADDRESSES');
console.log('# ============================================');

