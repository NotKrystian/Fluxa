/**
 * Extract Deployment Addresses
 * 
 * Reads deployment result JSON files and prints addresses to add to .env
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const resultFiles = {
  tokens: 'deployment-results-tokens.json',
  gateways: 'deployment-results-gateways.json',
  arcHub: 'deployment-results-arc-hub.json',
  routers: 'deployment-results-routers.json'
};

console.log('\n═══════════════════════════════════════════════════════════════');
console.log('📋 EXTRACTING DEPLOYED ADDRESSES');
console.log('═══════════════════════════════════════════════════════════════\n');
console.log('Copy these to your .env file:\n');

// Tokens
const tokensPath = path.join(__dirname, '..', resultFiles.tokens);
if (fs.existsSync(tokensPath)) {
  const data = JSON.parse(fs.readFileSync(tokensPath, 'utf8'));
  console.log('# Test Tokens');
  for (const [chainKey, result] of Object.entries(data.tokens || {})) {
    if (result.address && !result.error) {
      const envVar = chainKey === 'arc' ? 'ARC_FLX_TOKEN' : 'BASE_SEPOLIA_FLX_TOKEN';
      console.log(`${envVar}=${result.address}`);
      console.log(`NEXT_PUBLIC_${envVar}=${result.address}`);
    }
  }
  console.log('');
}

// Gateways
const gatewaysPath = path.join(__dirname, '..', resultFiles.gateways);
if (fs.existsSync(gatewaysPath)) {
  const data = JSON.parse(fs.readFileSync(gatewaysPath, 'utf8'));
  console.log('# Gateways');
  for (const [chainKey, result] of Object.entries(data.gateways || {})) {
    if (result.gatewayAddress && !result.error) {
      const envPrefix = chainKey === 'arc' ? 'ARC' : 'BASE_SEPOLIA';
      console.log(`${envPrefix}_GATEWAY=${result.gatewayAddress}`);
      if (result.wrappedTokenAddress) {
        console.log(`${envPrefix}_WRAPPED_TOKEN=${result.wrappedTokenAddress}`);
      }
    }
  }
  console.log('');
}

// Arc Hub
const hubPath = path.join(__dirname, '..', resultFiles.arcHub);
if (fs.existsSync(hubPath)) {
  const data = JSON.parse(fs.readFileSync(hubPath, 'utf8'));
  if (data.hub && data.hub.address) {
    console.log('# Arc Execution Hub');
    console.log(`ARC_EXECUTION_HUB=${data.hub.address}`);
    console.log(`NEXT_PUBLIC_ARC_EXECUTION_HUB=${data.hub.address}`);
    console.log('');
  }
}

// Routers
const routersPath = path.join(__dirname, '..', resultFiles.routers);
if (fs.existsSync(routersPath)) {
  const data = JSON.parse(fs.readFileSync(routersPath, 'utf8'));
  console.log('# Swap Routers');
  for (const [chainKey, result] of Object.entries(data.routers || {})) {
    if (result.routerAddress && !result.error) {
      const envPrefix = 'BASE_SEPOLIA';
      console.log(`${envPrefix}_SWAP_ROUTER=${result.routerAddress}`);
      console.log(`NEXT_PUBLIC_${envPrefix}_SWAP_ROUTER=${result.routerAddress}`);
    }
  }
  console.log('');
}

console.log('═══════════════════════════════════════════════════════════════\n');

