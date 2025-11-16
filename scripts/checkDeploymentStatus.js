/**
 * Check Deployment Status
 * 
 * Shows what's been deployed and what's missing
 */

import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env
const envPath = path.join(__dirname, '../.env');
dotenv.config({ path: envPath });

console.log('\n═══════════════════════════════════════════════════════════════');
console.log('📊 DEPLOYMENT STATUS CHECK');
console.log('═══════════════════════════════════════════════════════════════\n');

const requiredVars = {
  'Test Tokens': {
    'ARC_FLX_TOKEN': 'Arc Test Token',
    'BASE_SEPOLIA_FLX_TOKEN': 'Base Test Token'
  },
  'Gateways': {
    'ARC_GATEWAY': 'Arc Gateway (Origin)',
    'BASE_SEPOLIA_GATEWAY': 'Base Gateway (Destination)',
    'BASE_SEPOLIA_WRAPPED_TOKEN': 'Base Wrapped Token'
  },
  'Arc Execution Hub': {
    'ARC_EXECUTION_HUB': 'Arc Execution Hub'
  },
  'Swap Routers': {
    'BASE_SEPOLIA_SWAP_ROUTER': 'Base Swap Router'
  },
  'Pools (Optional)': {
    'ARC_FLX_VAULT': 'Arc Liquidity Vault (optional)',
    'BASE_SEPOLIA_FLX_VAULT': 'Base Liquidity Vault (optional)'
  }
};

let allGood = true;

for (const [category, vars] of Object.entries(requiredVars)) {
  console.log(`\n${category}:`);
  console.log('─'.repeat(60));
  
  for (const [varName, description] of Object.entries(vars)) {
    const value = process.env[varName];
    if (value && value !== '' && value !== '0x0000000000000000000000000000000000000000') {
      console.log(`  ✅ ${description}`);
      console.log(`     ${varName}=${value.substring(0, 20)}...`);
    } else {
      console.log(`  ❌ ${description} - NOT DEPLOYED`);
      console.log(`     Missing: ${varName}`);
      if (category !== 'Pools (Optional)') {
        allGood = false;
      }
    }
  }
}

// Check deployment result files
console.log('\n📁 Deployment Result Files:');
console.log('─'.repeat(60));

const resultFiles = [
  'deployment-results-tokens.json',
  'deployment-results-gateways.json',
  'deployment-results-arc-hub.json',
  'deployment-results-routers.json',
  'deployment-results-connections.json'
];

for (const file of resultFiles) {
  const filePath = path.join(__dirname, '..', file);
  if (fs.existsSync(filePath)) {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    console.log(`  ✅ ${file} (${new Date(data.timestamp).toLocaleString()})`);
  } else {
    console.log(`  ❌ ${file} - Not found`);
  }
}

console.log('\n═══════════════════════════════════════════════════════════════');
if (allGood) {
  console.log('✅ All required contracts are deployed!');
  console.log('═══════════════════════════════════════════════════════════════\n');
  console.log('Next steps:');
  console.log('  1. Update .env with all deployed addresses');
  console.log('  2. Run: node scripts/setupConnections.js');
  console.log('  3. Start backend: cd backend && npm start');
  console.log('  4. Start frontend: cd frontend && npm run dev');
} else {
  console.log('⚠️  Some contracts are missing!');
  console.log('═══════════════════════════════════════════════════════════════\n');
  console.log('Deployment order:');
  console.log('  1. node scripts/deployTestTokens.js');
  console.log('  2. node scripts/deployGateways.js');
  console.log('  3. node scripts/deployArcHub.js');
  console.log('  4. node scripts/deploySwapRouters.js');
  console.log('  5. node scripts/setupConnections.js');
  console.log('\nOr run all at once:');
  console.log('  ./scripts/deployTestSystem.sh');
}
console.log('');

