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
  const raw = fs.readFileSync(artifactPath, "utf8");
  return JSON.parse(raw);
}

// 🔴 FILL THESE WITH YOUR REAL DEPLOYED ADDRESSES

const USDC_ADDRESS    = "0xb35f01ADECF87Ff71741991b45E9536518e25479";
const EURC_ADDRESS    = "0x4fffF9938cd30E435D1ad93DEAd219FACDbEE459";
const FACTORY_ADDRESS = "0xA6184D74b234351E50b77849903116FC6a4e778B";
const ROUTER_ADDRESS  = "0x4d385E12D8371b02D6791bb89195C74aF14e5c6f";

function assertAddress(name, value) {
  if (!/^0x[0-9a-fA-F]{40}$/.test(value)) {
    throw new Error(`Invalid ${name} address: ${value}`);
  }
}

async function main() {
  assertAddress("USDC_ADDRESS", USDC_ADDRESS);
  assertAddress("EURC_ADDRESS", EURC_ADDRESS);
  assertAddress("FACTORY_ADDRESS", FACTORY_ADDRESS);
  assertAddress("ROUTER_ADDRESS", ROUTER_ADDRESS);

  const rpcUrl = process.env.ARC_RPC_URL;
  const pk = process.env.PRIVATE_KEY;

  if (!rpcUrl) throw new Error("ARC_RPC_URL not set");
  if (!pk) throw new Error("PRIVATE_KEY not set");

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(pk, provider);

  console.log("Testing from:", wallet.address);

  const factoryArtifact = getArtifact("ArcAMMFactory");
  const poolArtifact    = getArtifact("ArcAMMPool");
  const routerArtifact  = getArtifact("ArcMetaRouter");

  const factory = new ethers.Contract(FACTORY_ADDRESS, factoryArtifact.abi, wallet);
  const router  = new ethers.Contract(ROUTER_ADDRESS, routerArtifact.abi, wallet);

  const erc20Abi = [
    "function balanceOf(address) view returns (uint256)",
    "function transfer(address to, uint256 amount) returns (bool)",
    "function approve(address spender, uint256 amount) returns (bool)"
  ];
  const usdc = new ethers.Contract(USDC_ADDRESS, erc20Abi, wallet);
  const eurc = new ethers.Contract(EURC_ADDRESS, erc20Abi, wallet);

  // 1. Get or create the pool
  console.log("\n--- Getting/creating pool ---");
  let poolAddress = await factory.getPool(USDC_ADDRESS, EURC_ADDRESS);
  console.log("Existing pool:", poolAddress);

  if (poolAddress === ethers.ZeroAddress) {
    console.log("No pool, creating...");
    // Adjust this if your factory uses a different name/signature
    const tx = await factory.createPair(USDC_ADDRESS, EURC_ADDRESS);
    console.log("createPair tx:", tx.hash);
    await tx.wait();
    poolAddress = await factory.getPool(USDC_ADDRESS, EURC_ADDRESS);
    console.log("New pool address:", poolAddress);
  }

  const pool = new ethers.Contract(poolAddress, poolArtifact.abi, wallet);

  const poolFns = poolArtifact.abi
    .filter((item) => item.type === "function")
    .map((item) => item.name);
  console.log("\nPool functions:", poolFns);

  const addLiquidityFn = poolArtifact.abi.find(
    (item) => item.type === "function" && item.name === "addLiquidity"
  );

  if (!addLiquidityFn) {
    throw new Error("addLiquidity function not found in pool ABI");
  }

  console.log("addLiquidity ABI:", addLiquidityFn);

  // 2. Add liquidity via addLiquidity(...)
  console.log("\n--- Adding liquidity ---");
  const amountUSDC = ethers.parseUnits("10000", 6);
  const amountEURC = ethers.parseUnits("10000", 6);

  console.log("Approving pool to pull USDC/EURC...");
  await (await usdc.approve(poolAddress, amountUSDC)).wait();
  await (await eurc.approve(poolAddress, amountEURC)).wait();

  // Build args according to addLiquidity signature
  const numInputs = addLiquidityFn.inputs.length;
  let addArgs;

  if (numInputs === 2) {
    // e.g. addLiquidity(uint256 amount0, uint256 amount1)
    addArgs = [amountUSDC, amountEURC];
  } else if (numInputs === 3) {
    // e.g. addLiquidity(uint256 amount0, uint256 amount1, address to)
    addArgs = [amountUSDC, amountEURC, wallet.address];
  } else {
    throw new Error(`Unsupported addLiquidity signature with ${numInputs} inputs`);
  }

  console.log("addLiquidity args:", addArgs);

  const addTx = await pool.addLiquidity(...addArgs);
  console.log("addLiquidity tx:", addTx.hash);
  await addTx.wait();
  console.log("Liquidity added.");

  // 3. Swap via router.swapLocal
  console.log("\n--- Preparing swapLocal ---");
  const amountIn = ethers.parseUnits("100", 6); // swap 100 USDC -> EURC
  const minOut   = 0n; // no slippage protection for first test
  const recipient = wallet.address;
  const deadline  = Math.floor(Date.now() / 1000) + 600;

  const balUSDCBefore = await usdc.balanceOf(wallet.address);
  const balEURCBefore = await eurc.balanceOf(wallet.address);

  console.log("Wallet USDC before:", balUSDCBefore.toString());
  console.log("Wallet EURC before:", balEURCBefore.toString());

  console.log("Approving router to spend USDC...");
  await (await usdc.approve(ROUTER_ADDRESS, amountIn)).wait();

  console.log("Calling swapLocal on router...");
  const swapTx = await router.swapLocal(
    USDC_ADDRESS,
    EURC_ADDRESS,
    amountIn,
    minOut,
    recipient,
    deadline
  );
  console.log("swapLocal tx:", swapTx.hash);
  const swapReceipt = await swapTx.wait();
  console.log("swapLocal gas used:", swapReceipt.gasUsed.toString());

  const balUSDAfter = await usdc.balanceOf(wallet.address);
  const balEURCAfter = await eurc.balanceOf(wallet.address);

  console.log("\nWallet USDC after:", balUSDAfter.toString());
  console.log("Wallet EURC after:", balEURCAfter.toString());
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});