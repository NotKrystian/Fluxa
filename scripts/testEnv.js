/**
 * Test .env file loading
 * Run this to debug .env loading issues
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('Testing .env file loading...\n');

// Try loading from project root
const envPath = path.join(__dirname, '../.env');
console.log(`Looking for .env at: ${envPath}`);

const result = dotenv.config({ path: envPath });

if (result.error) {
  console.error('❌ Error loading .env:', result.error.message);
  console.log('\nTrying current directory...');
  dotenv.config(); // Try current directory
}

console.log(`Current working directory: ${process.cwd()}`);
console.log(`Environment file path: ${envPath}`);

// Check for private key
const privateKey = process.env.PRIVATE_KEY || process.env.DEPLOYER_PRIVATE_KEY;

if (privateKey) {
  console.log('\n✅ PRIVATE_KEY found!');
  console.log(`   Length: ${privateKey.length} characters`);
  console.log(`   Starts with 0x: ${privateKey.startsWith('0x')}`);
  console.log(`   Has quotes: ${(privateKey.startsWith('"') || privateKey.startsWith("'"))}`);
  console.log(`   First 10 chars: ${privateKey.substring(0, 10)}...`);
  console.log(`   Last 10 chars: ...${privateKey.substring(privateKey.length - 10)}`);
  
  // Try to create wallet to verify it's valid
  try {
    const { ethers } = await import('ethers');
    let normalized = privateKey.trim();
    if ((normalized.startsWith('"') && normalized.endsWith('"')) || 
        (normalized.startsWith("'") && normalized.endsWith("'"))) {
      normalized = normalized.slice(1, -1);
    }
    normalized = normalized.startsWith('0x') ? normalized : `0x${normalized}`;
    const wallet = new ethers.Wallet(normalized);
    console.log(`   Wallet address: ${wallet.address}`);
    console.log('\n✅ Private key is valid!');
  } catch (error) {
    console.error('\n❌ Private key is invalid:', error.message);
  }
} else {
  console.error('\n❌ PRIVATE_KEY not found!');
  console.log('\nTroubleshooting:');
  console.log('  1. Check that .env file exists at:', envPath);
  console.log('  2. Verify it contains: PRIVATE_KEY=0x...');
  console.log('  3. Make sure there are no spaces around the = sign');
  console.log('  4. If using quotes, they will be automatically removed');
  console.log('\nAll environment variables with "PRIVATE" in name:');
  const privateVars = Object.keys(process.env).filter(k => k.includes('PRIVATE'));
  if (privateVars.length > 0) {
    privateVars.forEach(k => console.log(`  - ${k}`));
  } else {
    console.log('  (none found)');
  }
}

console.log('\nDone!');

