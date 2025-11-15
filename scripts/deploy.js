import { ethers } from "ethers";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load Hardhat artifacts manually (works without Hardhat Runtime)
function getArtifact(contractName) {
  const artifactPath = path.join(
    __dirname,
    "..",
    "artifacts",
    "core",
    `${contractName}.sol`,
    `${contractName}.json`
  );

  console.log(`\nLoading artifact for ${contractName}:`);
  console.log(artifactPath);

  if (!fs.existsSync(artifactPath)) {
    throw new Error(`Artifact not found: ${artifactPath}`);
  }

  const raw = fs.readFileSync(artifactPath, "utf8");
  const json = JSON.parse(raw);

  const ctor = json.abi.find((item) => item.type === "constructor") || null;
  console.log(`Constructor ABI for ${contractName}:`, ctor);

  return json;
}

async function main() {
  console.log("Using RPC URL:", process.env.ARC_RPC_URL);
  console.log("PRIVATE_KEY present:", !!process.env.PRIVATE_KEY);

  const rpcUrl = process.env.ARC_RPC_URL;
  const pk = process.env.PRIVATE_KEY;

  if (!rpcUrl) throw new Error("Missing ARC_RPC_URL in .env");
  if (!pk) throw new Error("Missing PRIVATE_KEY in .env");

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(pk, provider);

  console.log("\nDeploying from:", wallet.address);

  // Load contract artifacts
  const mockArtifact = getArtifact("MockERC20");
  const factoryArtifact = getArtifact("ArcAMMFactory");
  const routerArtifact = getArtifact("ArcMetaRouter");

  // ---------------------------------------
  // 1. Deploy Mock USDC
  // ---------------------------------------
  console.log("\n--- Deploying Mock USDC ---");
  const MockERC20Factory = new ethers.ContractFactory(
    mockArtifact.abi,
    mockArtifact.bytecode,
    wallet
  );

  const usdc = await MockERC20Factory.deploy("USD Coin", "USDC", 6);
  await usdc.waitForDeployment();
  const usdcAddress = await usdc.getAddress();
  console.log("Mock USDC deployed at:", usdcAddress);

  // ---------------------------------------
  // 2. Deploy Mock EURC
  // ---------------------------------------
  console.log("\n--- Deploying Mock EURC ---");
  const eurc = await MockERC20Factory.deploy("Euro Coin", "EURC", 6);
  await eurc.waitForDeployment();
  const eurcAddress = await eurc.getAddress();
  console.log("Mock EURC deployed at:", eurcAddress);

  // ---------------------------------------
  // 3. Deploy ArcAMMFactory
  // ---------------------------------------
  console.log("\n--- Deploying ArcAMMFactory ---");
  const FactoryFactory = new ethers.ContractFactory(
    factoryArtifact.abi,
    factoryArtifact.bytecode,
    wallet
  );

  const defaultSwapFeeBps = 30; // 0.30% swap fee
  const defaultProtocolFeeShareBps = 0; // no protocol fee for now
  const factoryArgs = [wallet.address, defaultSwapFeeBps, defaultProtocolFeeShareBps];
  console.log("Factory constructor ABI:", factoryArtifact.abi.find(x => x.type === "constructor"));
  console.log("Factory deploy args:", factoryArgs);

  const factory = await FactoryFactory.deploy(...factoryArgs);
  await factory.waitForDeployment();
  const factoryAddress = await factory.getAddress();
  console.log("ArcAMMFactory deployed at:", factoryAddress);

  // ---------------------------------------
  // 4. Deploy ArcMetaRouter
  // ---------------------------------------
  console.log("\n--- Deploying ArcMetaRouter ---");
  const RouterFactory = new ethers.ContractFactory(
    routerArtifact.abi,
    routerArtifact.bytecode,
    wallet
  );

  const tokenMessenger = ethers.ZeroAddress;
  const gatewayWallet = ethers.ZeroAddress;
  const feeBps = 0;
  const feeCollector = wallet.address;

  const routerArgs = [
    usdcAddress,
    eurcAddress,
    tokenMessenger,
    gatewayWallet,
    feeBps,
    feeCollector,
  ];

  console.log("Router constructor ABI:", routerArtifact.abi.find(x => x.type === "constructor"));
  console.log("Router deploy args:", routerArgs);

  const router = await RouterFactory.deploy(...routerArgs);
  await router.waitForDeployment();
  const routerAddress = await router.getAddress();
  console.log("ArcMetaRouter deployed at:", routerAddress);

  // ---------------------------------------
  // 5. Wire AMM factory to router
  // ---------------------------------------
  console.log("\n--- Linking AMM Factory to Router ---");
  const routerContract = new ethers.Contract(routerAddress, routerArtifact.abi, wallet);

  const tx = await routerContract.setAMMFactory(factoryAddress);
  console.log("setAMMFactory tx:", tx.hash);
  await tx.wait();
  console.log("AMM Factory set:", factoryAddress);

  console.log("\n\nDeployment complete!");
}

main().catch((err) => {
  console.error("\nDeployment failed:\n", err);
  process.exit(1);
});