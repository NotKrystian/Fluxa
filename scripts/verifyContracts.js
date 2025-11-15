/**
 * Verify deployed contracts on Arc Testnet
 * 
 * Usage:
 *   npx hardhat run scripts/verifyContracts.js --network arcTestnet
 */

import hre from "hardhat";
import dotenv from "dotenv";

dotenv.config();

// Get deployed addresses from .env
function getDeployedAddresses(chain) {
  const prefix = chain.toUpperCase();
  return {
    projectToken: process.env[`${prefix}_FLX_TOKEN`],
    vaultFactory: process.env[`${prefix}_VAULT_FACTORY`],
    vault: process.env[`${prefix}_FLX_VAULT`],
    ammFactory: process.env[`${prefix}_AMM_FACTORY`],
    router: process.env[`${prefix}_ROUTER`],
    pool: process.env[`${prefix}_FLX_USDC_POOL`],
    usdc: process.env[`${prefix}_USDC`],
  };
}

// Get deployer address
async function getDeployerAddress() {
  const [signer] = await hre.ethers.getSigners();
  return signer.address;
}

async function verifyContract(name, address, constructorArgs = []) {
  console.log(`\n${"=".repeat(70)}`);
  console.log(`Verifying ${name}...`);
  console.log(`Address: ${address}`);
  if (constructorArgs.length > 0) {
    console.log(`Constructor args:`, constructorArgs);
  }
  console.log(`${"=".repeat(70)}`);

  try {
    await hre.run("verify:verify", {
      address: address,
      constructorArguments: constructorArgs,
    });
    console.log(`✅ ${name} verified successfully!`);
    return true;
  } catch (error) {
    if (error.message.includes("Already Verified")) {
      console.log(`ℹ️  ${name} already verified`);
      return true;
    } else {
      console.error(`❌ Failed to verify ${name}:`, error.message);
      return false;
    }
  }
}

async function main() {
  const network = hre.network.name;
  console.log(`\n${"=".repeat(70)}`);
  console.log(`VERIFYING CONTRACTS ON ${network.toUpperCase()}`);
  console.log(`${"=".repeat(70)}\n`);

  if (network !== "arcTestnet") {
    console.error(`❌ Unsupported network: ${network}`);
    console.log(`Supported networks: arcTestnet`);
    return;
  }

  const chain = "arc";
  const addresses = getDeployedAddresses(chain);
  const deployer = await getDeployerAddress();

  // Check if addresses exist
  if (!addresses.projectToken) {
    console.error(`❌ No deployed addresses found for ${chain}`);
    console.log(`Make sure .env file has ${chain.toUpperCase()}_* addresses`);
    return;
  }

  console.log(`Deployer: ${deployer}`);
  console.log(`Chain: ${chain}`);
  console.log(`\nDeployed addresses:`);
  Object.entries(addresses).forEach(([key, value]) => {
    console.log(`  ${key}: ${value || "NOT SET"}`);
  });

  const results = {
    verified: [],
    failed: [],
    skipped: [],
  };

  // 1. Verify MockERC20 (FLX Token)
  if (addresses.projectToken) {
    const success = await verifyContract(
      "MockERC20 (FLX)",
      addresses.projectToken,
      ["Fluxa Token", "FLX", 18]
    );
    if (success) results.verified.push("MockERC20");
    else results.failed.push("MockERC20");
  }

  // 2. Verify VaultFactory
  if (addresses.vaultFactory && addresses.usdc) {
    const success = await verifyContract(
      "VaultFactory",
      addresses.vaultFactory,
      [addresses.usdc, deployer]
    );
    if (success) results.verified.push("VaultFactory");
    else results.failed.push("VaultFactory");
  }

  // 3. Verify LiquidityVault (created via factory)
  // Note: Vault is created via factory.createVault(), so we need to verify it separately
  // The constructor args are: (projectToken, usdc, governance, name, symbol)
  if (addresses.vault && addresses.projectToken && addresses.usdc) {
    const success = await verifyContract(
      "LiquidityVault",
      addresses.vault,
      [
        addresses.projectToken,
        addresses.usdc,
        deployer, // governance
        "Fluxa Vault Shares",
        "vFLX",
      ]
    );
    if (success) results.verified.push("LiquidityVault");
    else results.failed.push("LiquidityVault");
  }

  // 4. Verify ArcAMMFactory
  if (addresses.ammFactory) {
    const success = await verifyContract(
      "ArcAMMFactory",
      addresses.ammFactory,
      [deployer, 30, 0] // feeToSetter, swapFeeBps, protocolFeeShareBps
    );
    if (success) results.verified.push("ArcAMMFactory");
    else results.failed.push("ArcAMMFactory");
  }

  // 5. Verify ArcMetaRouter
  if (addresses.router && addresses.usdc) {
    const success = await verifyContract(
      "ArcMetaRouter",
      addresses.router,
      [
        addresses.usdc, // USDC
        addresses.usdc, // EURC (using USDC for now)
        hre.ethers.ZeroAddress, // tokenMessenger
        hre.ethers.ZeroAddress, // gatewayWallet
        0, // feeBps
        deployer, // owner
      ]
    );
    if (success) results.verified.push("ArcMetaRouter");
    else results.failed.push("ArcMetaRouter");
  }

  // 6. Verify ArcAMMPool (created via factory)
  // Note: Pool is created via factory.createPair(), constructor is just (token0, token1)
  if (addresses.pool && addresses.projectToken && addresses.usdc) {
    // Determine token0 and token1 (sorted order)
    const token0 = addresses.projectToken < addresses.usdc 
      ? addresses.projectToken 
      : addresses.usdc;
    const token1 = addresses.projectToken < addresses.usdc 
      ? addresses.usdc 
      : addresses.projectToken;

    const success = await verifyContract(
      "ArcAMMPool",
      addresses.pool,
      [token0, token1]
    );
    if (success) results.verified.push("ArcAMMPool");
    else results.failed.push("ArcAMMPool");
  }

  // 7. Verify TokenRegistry (only on Arc)
  if (network === "arcTestnet" && process.env.TOKEN_REGISTRY) {
    const success = await verifyContract(
      "TokenRegistry",
      process.env.TOKEN_REGISTRY,
      [] // No constructor args
    );
    if (success) results.verified.push("TokenRegistry");
    else results.failed.push("TokenRegistry");
  }

  // Summary
  console.log(`\n${"=".repeat(70)}`);
  console.log(`VERIFICATION SUMMARY`);
  console.log(`${"=".repeat(70)}`);
  console.log(`✅ Verified: ${results.verified.length}`);
  results.verified.forEach((name) => console.log(`   - ${name}`));
  
  if (results.failed.length > 0) {
    console.log(`\n❌ Failed: ${results.failed.length}`);
    results.failed.forEach((name) => console.log(`   - ${name}`));
  }

  console.log(`\n✅ Verification complete!`);
  console.log(`\nView verified contracts at:`);
  console.log(`   https://testnet.arcscan.net/address/<CONTRACT_ADDRESS>`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

