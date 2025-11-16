import { ethers } from 'ethers';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

async function main() {
  const baseGateway = process.env.BASE_SEPOLIA_GATEWAY || '0x55936f194765CE6bd0d33a374cEFad8c9b34Fb65';
  const baseRpc = process.env.BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org';
  const arcChainId = 5042002;
  const userAddress = '0xe8f14cD50Cfa48e366142815D2b63263849400cE';
  const amount = ethers.parseEther('1000');
  
  const provider = new ethers.JsonRpcProvider(baseRpc);
  
  const GATEWAY_ABI = [
    'function isOrigin() external view returns (bool)',
    'function remoteGateways(uint32) external view returns (address)',
    'function remoteGatewaysBytes(uint32) external view returns (bytes)',
    'function lzEndpoint() external view returns (address)',
    'function token() external view returns (address)',
    'function depositForWrap(uint256 amount, uint32 destinationChain, address destinationRecipient) external payable'
  ];
  
  const gateway = new ethers.Contract(baseGateway, GATEWAY_ABI, provider);
  
  console.log('Checking Gateway state for depositForWrap...');
  console.log(`Gateway: ${baseGateway}`);
  console.log(`Amount: ${ethers.formatEther(amount)} FLX`);
  console.log(`Destination Chain: ${arcChainId} (Arc)`);
  console.log(`Recipient: ${userAddress}\n`);
  
  try {
    const isOrigin = await gateway.isOrigin();
    console.log(`✓ isOrigin: ${isOrigin}`);
    if (!isOrigin) {
      console.error('✗ Gateway is not origin!');
      return;
    }
    
    const remoteGateway = await gateway.remoteGateways(arcChainId);
    console.log(`✓ remoteGateways[${arcChainId}]: ${remoteGateway}`);
    if (!remoteGateway || remoteGateway === ethers.ZeroAddress) {
      console.error('✗ Remote Gateway not set!');
      return;
    }
    
    const remoteGatewayBytes = await gateway.remoteGatewaysBytes(arcChainId);
    console.log(`✓ remoteGatewaysBytes[${arcChainId}]: ${remoteGatewayBytes.length} bytes`);
    if (!remoteGatewayBytes || remoteGatewayBytes.length === 0) {
      console.error('✗ Remote Gateway bytes not set!');
      return;
    }
    
    const lzEndpoint = await gateway.lzEndpoint();
    console.log(`✓ lzEndpoint: ${lzEndpoint}`);
    
    const tokenAddress = await gateway.token();
    console.log(`✓ token: ${tokenAddress}`);
    
    // Check token balance and allowance
    const ERC20_ABI = [
      'function balanceOf(address) external view returns (uint256)',
      'function allowance(address owner, address spender) external view returns (uint256)'
    ];
    const token = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
    const balance = await token.balanceOf(userAddress);
    const allowance = await token.allowance(userAddress, baseGateway);
    
    console.log(`\nToken checks:`);
    console.log(`  Balance: ${ethers.formatEther(balance)} FLX`);
    console.log(`  Allowance: ${ethers.formatEther(allowance)} FLX`);
    console.log(`  Needed: ${ethers.formatEther(amount)} FLX`);
    
    if (balance < amount) {
      console.error('✗ Insufficient balance!');
      return;
    }
    if (allowance < amount) {
      console.error('✗ Insufficient allowance!');
      return;
    }
    
    // Try to call estimateFees
    console.log(`\nTrying to estimate LayerZero fees...`);
    const LZ_ABI = [
      'function estimateFees(uint16 _dstChainId, address _userApplication, bytes calldata _payload, bool _payInZRO, bytes calldata _adapterParams) external view returns (uint nativeFee, uint zroFee)'
    ];
    const lzContract = new ethers.Contract(lzEndpoint, LZ_ABI, provider);
    
    // Build payload
    const dummyNonce = 0n;
    const payload = ethers.AbiCoder.defaultAbiCoder().encode(
      ['address', 'uint256', 'uint256', 'uint32'],
      [userAddress, amount, dummyNonce, 84532] // Base chain ID
    );
    
    try {
      const [nativeFee] = await lzContract.estimateFees(
        30110, // Arc LZ chain ID
        baseGateway,
        payload,
        false,
        '0x'
      );
      console.log(`✓ Fee estimated: ${ethers.formatEther(nativeFee)} ETH`);
    } catch (feeError) {
      console.error(`✗ Fee estimation failed: ${feeError.message}`);
    }
    
    // Try static call to see what would fail
    console.log(`\nTrying static call to depositForWrap...`);
    try {
      await gateway.depositForWrap.staticCall(
        amount,
        arcChainId,
        userAddress,
        { value: ethers.parseEther('0.00011') }
      );
      console.log('✓ Static call succeeded!');
    } catch (staticError) {
      console.error(`✗ Static call failed: ${staticError.message}`);
      if (staticError.data) {
        try {
          const decoded = gateway.interface.parseError(staticError.data);
          console.error(`  Decoded error: ${decoded.name}`);
        } catch {
          console.error(`  Could not decode error data`);
        }
      }
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

main().catch(console.error);
