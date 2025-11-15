/**
 * Fluxa Quick Demo - Simplified Version
 * 
 * Shows the core concept in a streamlined way:
 * 1. Deploy contracts
 * 2. Create pool & add liquidity
 * 3. Execute payment
 * 4. Execute swap
 * 
 * Run: node scripts/quickDemo.js
 */

import { ethers } from "ethers";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getArtifact(contractName) {
  const artifactPath = path.join(__dirname, "..", "artifacts", "core", `${contractName}.sol`, `${contractName}.json`);
  if (!fs.existsSync(artifactPath)) {
    throw new Error(`Artifact not found: ${artifactPath}\nRun: npx hardhat compile`);
  }
  return JSON.parse(fs.readFileSync(artifactPath, "utf8"));
}

async function main() {
  console.log("\n🚀 FLUXA PROTOCOL - QUICK DEMO\n");

  const provider = new ethers.JsonRpcProvider(process.env.ARC_RPC_URL);
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
  
  console.log("Deployer:", wallet.address, "\n");

  // Load artifacts
  const mockArtifact = getArtifact("MockERC20");
  const factoryArtifact = getArtifact("ArcAMMFactory");
  const poolArtifact = getArtifact("ArcAMMPool");
  const routerArtifact = getArtifact("ArcMetaRouter");

  // ============================================================================
  // 1. DEPLOY
  // ============================================================================
  console.log("═══ 1. DEPLOYING CONTRACTS ═══");
  
  const MockERC20 = new ethers.ContractFactory(mockArtifact.abi, mockArtifact.bytecode, wallet);
  const usdc = await MockERC20.deploy("USD Coin", "USDC", 6);
  await usdc.waitForDeployment();
  console.log("✓ USDC:", await usdc.getAddress());
  
  const eurc = await MockERC20.deploy("Euro Coin", "EURC", 6);
  await eurc.waitForDeployment();
  console.log("✓ EURC:", await eurc.getAddress());
  
  const Factory = new ethers.ContractFactory(factoryArtifact.abi, factoryArtifact.bytecode, wallet);
  const factory = await Factory.deploy(wallet.address, 30, 0);
  await factory.waitForDeployment();
  console.log("✓ Factory:", await factory.getAddress());
  
  const Router = new ethers.ContractFactory(routerArtifact.abi, routerArtifact.bytecode, wallet);
  const router = await Router.deploy(
    await usdc.getAddress(),
    await eurc.getAddress(),
    ethers.ZeroAddress,
    ethers.ZeroAddress,
    0,
    wallet.address
  );
  await router.waitForDeployment();
  console.log("✓ Router:", await router.getAddress());
  
  await (await router.setAMMFactory(await factory.getAddress())).wait();
  console.log("✓ Factory linked to Router\n");

  // ============================================================================
  // 2. CREATE POOL & ADD LIQUIDITY
  // ============================================================================
  console.log("═══ 2. CREATING POOL & ADDING LIQUIDITY ═══");
  
  await (await factory.createPair(await usdc.getAddress(), await eurc.getAddress())).wait();
  const poolAddress = await factory.getPool(await usdc.getAddress(), await eurc.getAddress());
  console.log("✓ Pool created:", poolAddress);
  
  const pool = new ethers.Contract(poolAddress, poolArtifact.abi, wallet);
  
  // Get the sorted token order from the pool
  const [token0, token1] = await pool.getTokens();
  
  const liqAmount = ethers.parseUnits("50000", 6); // 50k each
  
  // Approve both tokens
  await (await usdc.approve(poolAddress, liqAmount)).wait();
  await (await eurc.approve(poolAddress, liqAmount)).wait();
  
  // Add liquidity with proper amounts based on token order
  await (await pool.addLiquidity(liqAmount, liqAmount, liqAmount, liqAmount, wallet.address)).wait();
  
  const [r0, r1] = await pool.getReserves();
  console.log("✓ Liquidity added:");
  console.log("  Reserve0:", ethers.formatUnits(r0, 6));
  console.log("  Reserve1:", ethers.formatUnits(r1, 6), "\n");

  // ============================================================================
  // 3. PAYMENT
  // ============================================================================
  console.log("═══ 3. STABLECOIN PAYMENT ═══");
  
  const recipient = ethers.Wallet.createRandom().address;
  const payAmount = ethers.parseUnits("100", 6);
  
  await (await usdc.approve(await router.getAddress(), payAmount)).wait();
  await (await router.payLocal(
    await usdc.getAddress(),
    recipient,
    payAmount,
    ethers.id("demo-pay-1")
  )).wait();
  
  const recipientBal = await usdc.balanceOf(recipient);
  console.log("✓ Payment sent:", ethers.formatUnits(payAmount, 6), "USDC");
  console.log("✓ Recipient received:", ethers.formatUnits(recipientBal, 6), "USDC\n");

  // ============================================================================
  // 4. SWAP
  // ============================================================================
  console.log("═══ 4. STABLECOIN SWAP ═══");
  
  const swapAmount = ethers.parseUnits("500", 6);
  const eurcBefore = await eurc.balanceOf(wallet.address);
  
  await (await usdc.approve(await router.getAddress(), swapAmount)).wait();
  await (await router.swapLocal(
    await usdc.getAddress(),
    await eurc.getAddress(),
    swapAmount,
    0,
    wallet.address,
    Math.floor(Date.now() / 1000) + 600
  )).wait();
  
  const eurcAfter = await eurc.balanceOf(wallet.address);
  const eurcReceived = eurcAfter - eurcBefore;
  
  console.log("✓ Swapped:", ethers.formatUnits(swapAmount, 6), "USDC");
  console.log("✓ Received:", ethers.formatUnits(eurcReceived, 6), "EURC");
  console.log("✓ Rate:", (Number(ethers.formatUnits(eurcReceived, 6)) / Number(ethers.formatUnits(swapAmount, 6))).toFixed(6), "\n");

  // ============================================================================
  // COMPLETE
  // ============================================================================
  console.log("════════════════════════════════════════");
  console.log("✅ ALL FEATURES WORKING END-TO-END!");
  console.log("════════════════════════════════════════\n");
}

main().catch((err) => {
  console.error("\n❌ Error:", err.message);
  process.exit(1);
});

