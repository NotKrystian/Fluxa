/**
 * Setup Checker - Verifies environment is ready for Fluxa demo
 * 
 * Run: node scripts/checkSetup.js
 */

import { ethers } from "ethers";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  console.log("\n🔍 FLUXA SETUP CHECKER\n");
  
  let allGood = true;

  // Check .env
  console.log("📋 Environment Variables");
  if (process.env.ARC_RPC_URL) {
    console.log("  ✓ ARC_RPC_URL:", process.env.ARC_RPC_URL);
  } else {
    console.log("  ✗ ARC_RPC_URL missing");
    allGood = false;
  }

  if (process.env.PRIVATE_KEY) {
    console.log("  ✓ PRIVATE_KEY: [REDACTED]");
  } else {
    console.log("  ✗ PRIVATE_KEY missing");
    allGood = false;
  }

  // Check RPC connection
  console.log("\n🌐 Network Connection");
  try {
    const provider = new ethers.JsonRpcProvider(process.env.ARC_RPC_URL);
    const network = await provider.getNetwork();
    console.log("  ✓ Connected to chain ID:", network.chainId.toString());
    
    const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
    const balance = await provider.getBalance(wallet.address);
    console.log("  ✓ Wallet address:", wallet.address);
    console.log("  ✓ Wallet balance:", ethers.formatEther(balance), "ETH");
    
    if (balance === 0n) {
      console.log("  ⚠ Warning: Wallet has 0 balance - you'll need testnet ETH to deploy");
    }
  } catch (err) {
    console.log("  ✗ Failed to connect:", err.message);
    allGood = false;
  }

  // Check compiled contracts
  console.log("\n📦 Compiled Contracts");
  const contracts = ["MockERC20", "ArcAMMFactory", "ArcAMMPool", "ArcMetaRouter"];
  
  for (const contractName of contracts) {
    const artifactPath = path.join(__dirname, "..", "artifacts", "core", `${contractName}.sol`, `${contractName}.json`);
    if (fs.existsSync(artifactPath)) {
      console.log(`  ✓ ${contractName}.sol`);
    } else {
      console.log(`  ✗ ${contractName}.sol (not compiled)`);
      allGood = false;
    }
  }

  // Summary
  console.log("\n" + "═".repeat(50));
  if (allGood) {
    console.log("✅ SETUP COMPLETE - Ready to run demos!");
    console.log("\nNext steps:");
    console.log("  node scripts/quickDemo.js       # Quick demonstration");
    console.log("  node scripts/demoComplete.js    # Full demonstration");
  } else {
    console.log("❌ SETUP INCOMPLETE - Please fix the issues above");
    console.log("\nQuick fixes:");
    console.log("  1. Create .env file with ARC_RPC_URL and PRIVATE_KEY");
    console.log("  2. Run: npx hardhat compile");
    console.log("  3. Fund your wallet with testnet ETH");
  }
  console.log("═".repeat(50) + "\n");
}

main().catch((err) => {
  console.error("\n❌ Error:", err.message);
  process.exit(1);
});


