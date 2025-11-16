import hre from 'hardhat';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  console.log('\n========================================');
  console.log('🪙 Transfer FLX Tokens');
  console.log('========================================\n');

  // Get recipient from command line or env
  const recipientAddress = process.argv[2] || process.env.TEST_WALLET_ADDRESS;
  
  if (!recipientAddress) {
    console.error('❌ No recipient address provided!');
    console.error('\nUsage: node scripts/transferFLX.js <recipient_address>');
    console.error('   Or: Set TEST_WALLET_ADDRESS in .env');
    process.exit(1);
  }

  // Validate address
  if (!hre.ethers.isAddress(recipientAddress)) {
    console.error('❌ Invalid recipient address:', recipientAddress);
    process.exit(1);
  }

  console.log(`Recipient: ${recipientAddress}`);
  
  // Amount to transfer (default 10,000 FLX)
  const amountToTransfer = hre.ethers.parseUnits('10000', 18);
  
  // FLX token address on Arc
  const FLX_TOKEN = '0xcAabDfB6b9E1Cb899670e1bF417B42Ff2DB97CaA';
  
  // Switch to Arc network
  await hre.changeNetwork('arc-testnet');
  const [deployer] = await hre.ethers.getSigners();
  
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Amount: ${hre.ethers.formatUnits(amountToTransfer, 18)} FLX\n`);

  // Get FLX contract
  const flxContract = await hre.ethers.getContractAt('MockERC20', FLX_TOKEN);
  
  // Check deployer balance
  console.log('Checking deployer balance...');
  const deployerBalance = await flxContract.balanceOf(deployer.address);
  console.log(`✓ Deployer has ${hre.ethers.formatUnits(deployerBalance, 18)} FLX`);
  
  if (deployerBalance < amountToTransfer) {
    console.error(`❌ Insufficient balance! Need ${hre.ethers.formatUnits(amountToTransfer, 18)} FLX`);
    process.exit(1);
  }
  
  // Check recipient balance before
  const recipientBalanceBefore = await flxContract.balanceOf(recipientAddress);
  console.log(`Recipient balance before: ${hre.ethers.formatUnits(recipientBalanceBefore, 18)} FLX\n`);
  
  // Transfer
  console.log('Transferring FLX...');
  const tx = await flxContract.transfer(recipientAddress, amountToTransfer);
  console.log(`✓ Transaction sent: ${tx.hash}`);
  
  await delay(2000);
  await tx.wait();
  console.log('✓ Transaction confirmed!\n');
  
  // Check balances after
  await delay(2000);
  const deployerBalanceAfter = await flxContract.balanceOf(deployer.address);
  const recipientBalanceAfter = await flxContract.balanceOf(recipientAddress);
  
  console.log('========================================');
  console.log('✅ Transfer Complete!');
  console.log('========================================');
  console.log(`Deployer: ${hre.ethers.formatUnits(deployerBalanceAfter, 18)} FLX`);
  console.log(`Recipient: ${hre.ethers.formatUnits(recipientBalanceAfter, 18)} FLX`);
  console.log(`Transferred: ${hre.ethers.formatUnits(amountToTransfer, 18)} FLX\n`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

