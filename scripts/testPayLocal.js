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
// TODO: paste your deployed addresses here
const USDC_ADDRESS   = "0xb35f01ADECF87Ff71741991b45E9536518e25479";
const ROUTER_ADDRESS = "0x4d385E12D8371b02D6791bb89195C74aF14e5c6f";

async function main() {
  const rpcUrl = process.env.ARC_RPC_URL;
  const pk = process.env.PRIVATE_KEY;

  if (!rpcUrl) throw new Error("ARC_RPC_URL not set");
  if (!pk) throw new Error("PRIVATE_KEY not set");

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(pk, provider);

  console.log("Testing from:", wallet.address);

  const routerArtifact = getArtifact("ArcMetaRouter");
  const usdcAbi = [
    "function balanceOf(address) view returns (uint256)",
    "function approve(address spender, uint256 amount) returns (bool)"
  ];

  const router = new ethers.Contract(ROUTER_ADDRESS, routerArtifact.abi, wallet);
  const usdc   = new ethers.Contract(USDC_ADDRESS, usdcAbi, wallet);

  const recipient = ethers.Wallet.createRandom().address;
  const amount = ethers.parseUnits("100", 6); // 100 USDC (6 decimals)
  const paymentId = ethers.id("test-payment-1");

  const balSenderBefore = await usdc.balanceOf(wallet.address);
  const balRecipientBefore = await usdc.balanceOf(recipient);

  console.log("Sender USDC before:", balSenderBefore.toString());
  console.log("Recipient USDC before:", balRecipientBefore.toString());

  console.log("\nApproving router to spend USDC...");
  const approveTx = await usdc.approve(ROUTER_ADDRESS, amount);
  await approveTx.wait();
  console.log("Approval tx:", approveTx.hash);

  console.log("\nCalling payLocal...");
  const tx = await router.payLocal(
    USDC_ADDRESS,
    recipient,
    amount,
    paymentId
  );
  console.log("payLocal tx:", tx.hash);
  await tx.wait();

  const balSenderAfter = await usdc.balanceOf(wallet.address);
  const balRecipientAfter = await usdc.balanceOf(recipient);

  console.log("\nSender USDC after:", balSenderAfter.toString());
  console.log("Recipient USDC after:", balRecipientAfter.toString());
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});