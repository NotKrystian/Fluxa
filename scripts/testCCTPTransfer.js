/**
 * Simple standalone CCTP transfer test
 * 
 * Usage: node scripts/testCCTPTransfer.js
 * Note: This script should be run from the backend directory:
 *       cd backend && node ../scripts/testCCTPTransfer.js
 * 
 * Or use: cd backend && node testCCTPTransfer.js
 */

/**
 * NOTE: This script requires packages from backend/node_modules
 * Run it from the backend directory: cd backend && node testCCTPTransfer.js
 * Or use the version in backend/testCCTPTransfer.js
 */

console.error('⚠️  Please run this script from the backend directory:');
console.error('   cd backend && node testCCTPTransfer.js');
console.error('');
console.error('Or use: node scripts/testCCTPTransfer.js (from project root)');
process.exit(1);

const RECIPIENT_ADDRESS = '0xe8f14cD50Cfa48e366142815D2b63263849400cE';
const AMOUNT = '1.0'; // 0.1 USDC
const SOURCE_CHAIN = 'Base_Sepolia';
const DEST_CHAIN = 'Arc_Testnet';

async function testTransfer() {
  console.log('🧪 Testing CCTP Transfer');
  console.log('========================');
  console.log(`Source Chain: ${SOURCE_CHAIN}`);
  console.log(`Destination Chain: ${DEST_CHAIN}`);
  console.log(`Amount: ${AMOUNT} USDC`);
  console.log(`Recipient: ${RECIPIENT_ADDRESS}`);
  console.log('');

  try {
    // Get private key from env
    const privateKey = process.env.CCTP_PRIVATE_KEY || process.env.PRIVATE_KEY;
    if (!privateKey) {
      throw new Error('CCTP_PRIVATE_KEY or PRIVATE_KEY not found in .env');
    }

    // Get RPC URLs
    const baseSepoliaRpc = process.env.BASE_SEPOLIA_RPC_URL || process.env.BASE_RPC_URL || 'https://sepolia.base.org';
    const arcRpc = process.env.ARC_RPC_URL || 'https://rpc.testnet.arc.network';

    console.log('✅ Environment variables loaded');
    console.log('');

    // Initialize Bridge Kit
    const kit = new BridgeKit();
    console.log('✅ Bridge Kit initialized');
    console.log('');

    // Create adapter with custom RPCs
    const adapter = createAdapterFromPrivateKey({
      privateKey: privateKey,
      getPublicClient: ({ chain: viemChain }) => {
        const chainName = viemChain?.name || '';
        let rpcUrl = null;

        if (chainName.includes('Base') && chainName.includes('Sepolia')) {
          rpcUrl = baseSepoliaRpc;
        } else if (chainName.includes('Arc') || chainName === 'Arc_Testnet') {
          rpcUrl = arcRpc;
        }

        if (!rpcUrl) {
          console.warn(`No RPC found for ${chainName}, using default`);
          return createPublicClient({
            chain: viemChain,
            transport: http(),
          });
        }

        return createPublicClient({
          chain: viemChain,
          transport: http(rpcUrl, {
            retryCount: 3,
            timeout: 10000,
          }),
        });
      },
    });

    console.log('✅ Adapter created');
    console.log('');

    // Execute transfer
    console.log('🚀 Starting transfer...');
    const result = await kit.bridge({
      from: { adapter, chain: SOURCE_CHAIN },
      to: {
        adapter,
        chain: DEST_CHAIN,
        recipientAddress: RECIPIENT_ADDRESS
      },
      amount: AMOUNT,
      config: {
        transferSpeed: 'FAST'
      }
    });

    console.log('');
    console.log('✅ Transfer completed!');
    console.log('Result:', JSON.stringify(result, null, 2));
    
  } catch (error) {
    console.error('');
    console.error('❌ Transfer failed:');
    console.error(error.message);
    console.error('');
    if (error.stack) {
      console.error('Stack trace:');
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Run the test
testTransfer();
