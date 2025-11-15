/**
 * Complete Fluxa Protocol Demonstration
 * 
 * This script demonstrates all core features of the Fluxa protocol:
 * 1. Deploy all contracts (MockERC20s, Factory, Router)
 * 2. Create a USDC/EURC liquidity pool
 * 3. Add liquidity to the pool
 * 4. Perform a stablecoin payment via payLocal
 * 5. Perform a swap via swapLocal
 * 6. Query pool reserves and balances
 * 
 * Run with: node scripts/demoComplete.js
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
  const artifactPath = path.join(
    __dirname,
    "..",
    "artifacts",
    "core",
    `${contractName}.sol`,
    `${contractName}.json`
  );

  if (!fs.existsSync(artifactPath)) {
    throw new Error(`Artifact not found: ${artifactPath}\nPlease compile contracts first with: npx hardhat compile`);
  }

  const raw = fs.readFileSync(artifactPath, "utf8");
  return JSON.parse(raw);
}

function formatUnits(value, decimals = 6) {
  return ethers.formatUnits(value, decimals);
}

function parseUnits(value, decimals = 6) {
  return ethers.parseUnits(value.toString(), decimals);
}

async function main() {
  console.log("╔════════════════════════════════════════════════════════════════╗");
  console.log("║         FLUXA PROTOCOL - COMPLETE DEMONSTRATION                ║");
  console.log("╚════════════════════════════════════════════════════════════════╝\n");

  // Setup
  const rpcUrl = process.env.ARC_RPC_URL;
  const pk = process.env.PRIVATE_KEY;

  if (!rpcUrl) throw new Error("Missing ARC_RPC_URL in .env");
  if (!pk) throw new Error("Missing PRIVATE_KEY in .env");

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(pk, provider);

  console.log("🔗 Connected to Arc Network");
  console.log("📍 Deployer Address:", wallet.address);
  
  const balance = await provider.getBalance(wallet.address);
  console.log("💰 Deployer Balance:", ethers.formatEther(balance), "ETH\n");

  // Load artifacts
  const mockArtifact = getArtifact("MockERC20");
  const factoryArtifact = getArtifact("ArcAMMFactory");
  const poolArtifact = getArtifact("ArcAMMPool");
  const routerArtifact = getArtifact("ArcMetaRouter");

  // ============================================================================
  // STEP 1: DEPLOY CONTRACTS
  // ============================================================================
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("STEP 1: DEPLOYING CONTRACTS");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  // Deploy Mock USDC
  console.log("📄 Deploying Mock USDC...");
  const MockERC20Factory = new ethers.ContractFactory(
    mockArtifact.abi,
    mockArtifact.bytecode,
    wallet
  );
  const usdc = await MockERC20Factory.deploy("USD Coin", "USDC", 6);
  await usdc.waitForDeployment();
  const usdcAddress = await usdc.getAddress();
  console.log("✅ Mock USDC deployed at:", usdcAddress);

  // Deploy Mock EURC
  console.log("📄 Deploying Mock EURC...");
  const eurc = await MockERC20Factory.deploy("Euro Coin", "EURC", 6);
  await eurc.waitForDeployment();
  const eurcAddress = await eurc.getAddress();
  console.log("✅ Mock EURC deployed at:", eurcAddress);

  // Deploy ArcAMMFactory
  console.log("📄 Deploying ArcAMMFactory...");
  const FactoryFactory = new ethers.ContractFactory(
    factoryArtifact.abi,
    factoryArtifact.bytecode,
    wallet
  );
  const factory = await FactoryFactory.deploy(
    wallet.address, // feeToSetter
    30,             // 0.30% swap fee
    0               // no protocol fee
  );
  await factory.waitForDeployment();
  const factoryAddress = await factory.getAddress();
  console.log("✅ ArcAMMFactory deployed at:", factoryAddress);

  // Deploy ArcMetaRouter
  console.log("📄 Deploying ArcMetaRouter...");
  const RouterFactory = new ethers.ContractFactory(
    routerArtifact.abi,
    routerArtifact.bytecode,
    wallet
  );
  const router = await RouterFactory.deploy(
    usdcAddress,
    eurcAddress,
    ethers.ZeroAddress, // tokenMessenger (not used yet)
    ethers.ZeroAddress, // gatewayWallet (not used yet)
    0,                  // 0% protocol fee
    wallet.address      // feeCollector
  );
  await router.waitForDeployment();
  const routerAddress = await router.getAddress();
  console.log("✅ ArcMetaRouter deployed at:", routerAddress);

  // Link factory to router
  console.log("🔗 Linking AMM Factory to Router...");
  const tx = await router.setAMMFactory(factoryAddress);
  await tx.wait();
  console.log("✅ AMM Factory linked to Router\n");

  // ============================================================================
  // STEP 2: CREATE LIQUIDITY POOL
  // ============================================================================
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("STEP 2: CREATING USDC/EURC LIQUIDITY POOL");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  console.log("🏭 Creating USDC/EURC pool via factory...");
  const createTx = await factory.createPair(usdcAddress, eurcAddress);
  await createTx.wait();
  console.log("✅ Pool creation transaction confirmed");

  const poolAddress = await factory.getPool(usdcAddress, eurcAddress);
  console.log("✅ Pool address:", poolAddress);
  
  const pool = new ethers.Contract(poolAddress, poolArtifact.abi, wallet);
  const [token0, token1] = await pool.getTokens();
  console.log("   Token0:", token0);
  console.log("   Token1:", token1);
  console.log("   Swap Fee:", (await pool.swapFeeBps()).toString(), "bps (0.30%)\n");

  // ============================================================================
  // STEP 3: ADD LIQUIDITY
  // ============================================================================
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("STEP 3: ADDING LIQUIDITY TO POOL");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  const liquidityAmount0 = parseUnits(100000, 6); // 100,000 USDC
  const liquidityAmount1 = parseUnits(100000, 6); // 100,000 EURC

  console.log("💧 Adding liquidity:");
  console.log("   USDC:", formatUnits(liquidityAmount0, 6));
  console.log("   EURC:", formatUnits(liquidityAmount1, 6));

  // Approve pool to spend tokens
  console.log("🔓 Approving pool to spend tokens...");
  await (await usdc.approve(poolAddress, liquidityAmount0)).wait();
  await (await eurc.approve(poolAddress, liquidityAmount1)).wait();
  console.log("✅ Approvals confirmed");

  // Add liquidity
  console.log("💧 Calling addLiquidity...");
  const addLiqTx = await pool.addLiquidity(
    liquidityAmount0,    // amount0Desired
    liquidityAmount1,    // amount1Desired
    liquidityAmount0,    // amount0Min
    liquidityAmount1,    // amount1Min
    wallet.address       // to
  );
  const addLiqReceipt = await addLiqTx.wait();
  console.log("✅ Liquidity added (Gas used:", addLiqReceipt.gasUsed.toString(), ")");

  // Check reserves
  const [reserve0, reserve1] = await pool.getReserves();
  console.log("📊 Pool Reserves:");
  console.log("   Reserve0:", formatUnits(reserve0, 6), "tokens");
  console.log("   Reserve1:", formatUnits(reserve1, 6), "tokens");

  const lpBalance = await pool.balanceOf(wallet.address);
  console.log("🎫 LP Tokens received:", formatUnits(lpBalance, 18), "\n");

  // ============================================================================
  // STEP 4: STABLECOIN PAYMENT (payLocal)
  // ============================================================================
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("STEP 4: STABLECOIN PAYMENT VIA payLocal");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  const recipient = ethers.Wallet.createRandom().address;
  const paymentAmount = parseUnits(500, 6); // 500 USDC
  const paymentId = ethers.id("demo-payment-001");

  console.log("💸 Payment Details:");
  console.log("   From:", wallet.address);
  console.log("   To:", recipient);
  console.log("   Amount:", formatUnits(paymentAmount, 6), "USDC");
  console.log("   PaymentId:", paymentId);

  const senderBalBefore = await usdc.balanceOf(wallet.address);
  console.log("   Sender balance before:", formatUnits(senderBalBefore, 6), "USDC");

  // Approve router
  console.log("🔓 Approving router...");
  await (await usdc.approve(routerAddress, paymentAmount)).wait();

  // Execute payment
  console.log("💸 Executing payment...");
  const payTx = await router.payLocal(
    usdcAddress,
    recipient,
    paymentAmount,
    paymentId
  );
  const payReceipt = await payTx.wait();
  console.log("✅ Payment confirmed (Gas used:", payReceipt.gasUsed.toString(), ")");

  const senderBalAfter = await usdc.balanceOf(wallet.address);
  const recipientBal = await usdc.balanceOf(recipient);
  console.log("   Sender balance after:", formatUnits(senderBalAfter, 6), "USDC");
  console.log("   Recipient balance:", formatUnits(recipientBal, 6), "USDC\n");

  // ============================================================================
  // STEP 5: LOCAL SWAP (swapLocal)
  // ============================================================================
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("STEP 5: STABLECOIN SWAP VIA swapLocal");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  const swapAmount = parseUnits(1000, 6); // Swap 1000 USDC -> EURC
  const minOut = 0n; // No slippage protection for demo
  const deadline = Math.floor(Date.now() / 1000) + 600; // 10 minutes

  console.log("🔄 Swap Details:");
  console.log("   From Token: USDC");
  console.log("   To Token: EURC");
  console.log("   Amount In:", formatUnits(swapAmount, 6), "USDC");

  const usdcBalBefore = await usdc.balanceOf(wallet.address);
  const eurcBalBefore = await eurc.balanceOf(wallet.address);
  console.log("   Wallet USDC before:", formatUnits(usdcBalBefore, 6));
  console.log("   Wallet EURC before:", formatUnits(eurcBalBefore, 6));

  // Approve router
  console.log("🔓 Approving router to spend USDC...");
  await (await usdc.approve(routerAddress, swapAmount)).wait();

  // Execute swap
  console.log("🔄 Executing swap...");
  const swapTx = await router.swapLocal(
    usdcAddress,
    eurcAddress,
    swapAmount,
    minOut,
    wallet.address,
    deadline
  );
  const swapReceipt = await swapTx.wait();
  console.log("✅ Swap confirmed (Gas used:", swapReceipt.gasUsed.toString(), ")");

  const usdcBalAfter = await usdc.balanceOf(wallet.address);
  const eurcBalAfter = await eurc.balanceOf(wallet.address);
  const eurcReceived = eurcBalAfter - eurcBalBefore;

  console.log("   Wallet USDC after:", formatUnits(usdcBalAfter, 6));
  console.log("   Wallet EURC after:", formatUnits(eurcBalAfter, 6));
  console.log("   EURC Received:", formatUnits(eurcReceived, 6));

  // Calculate effective exchange rate
  const effectiveRate = Number(formatUnits(eurcReceived, 6)) / Number(formatUnits(swapAmount, 6));
  console.log("   Effective Rate:", effectiveRate.toFixed(6), "EURC per USDC");

  // Check pool reserves after swap
  const [reserve0After, reserve1After] = await pool.getReserves();
  console.log("\n📊 Pool Reserves After Swap:");
  console.log("   Reserve0:", formatUnits(reserve0After, 6), "tokens");
  console.log("   Reserve1:", formatUnits(reserve1After, 6), "tokens\n");

  // ============================================================================
  // SUMMARY
  // ============================================================================
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("DEMONSTRATION COMPLETE - SUMMARY");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  console.log("✅ All core features verified:");
  console.log("   ✓ Contract deployment");
  console.log("   ✓ Pool creation via factory");
  console.log("   ✓ Liquidity provisioning");
  console.log("   ✓ Stablecoin payments (payLocal)");
  console.log("   ✓ Stablecoin swaps (swapLocal)");
  console.log("   ✓ Constant-product AMM mechanics\n");

  console.log("📋 Deployed Addresses:");
  console.log("   Mock USDC:        ", usdcAddress);
  console.log("   Mock EURC:        ", eurcAddress);
  console.log("   ArcAMMFactory:    ", factoryAddress);
  console.log("   ArcMetaRouter:    ", routerAddress);
  console.log("   USDC/EURC Pool:   ", poolAddress);
  console.log("\n");

  console.log("╔════════════════════════════════════════════════════════════════╗");
  console.log("║   🎉 FLUXA PROTOCOL IS WORKING END-TO-END! 🎉                  ║");
  console.log("╚════════════════════════════════════════════════════════════════╝");
}

main().catch((err) => {
  console.error("\n❌ Demonstration failed:\n", err);
  process.exit(1);
});


