# Fluxa Simplified Architecture (Hackathon Version)

## Overview

This is a simplified architecture for the hackathon that focuses on getting a proof-of-concept running quickly. The key simplification is that **Arc is the only destination** - all tokens flow TO Arc, and all swaps happen ON Arc.

## Architecture Principles

### 1. **Arc is the Hub**
- All swaps and liquidity operations happen on Arc
- Arc is the **destination** for all cross-chain transfers
- Users ultimately interact with Arc for swaps

### 2. **Other Chains are Sources Only**
- Base, Polygon, Avalanche, etc. only **send** tokens to Arc
- They never receive tokens back from Arc
- They act as liquidity sources via LPs

### 3. **Backend as Trusted Intermediary**
- Backend server acts as a relay/coordinator
- Monitors deposit events on source chains
- Triggers mints on Arc
- Simpler than complex cross-chain messaging protocols

## Token Transfer Flows

### USDC Transfers (via CCTP)

**Flow: LP on Base → USDC to Arc**

```
1. LP on Base has USDC
2. LP sends USDC to backend CCTP wallet on Base
3. Backend uses CCTP to burn USDC on Base
4. CCTP attestation service validates
5. Backend mints USDC on Arc
6. USDC now available on Arc for swaps
```

**Key Points:**
- Uses Circle's official CCTP (Cross-Chain Transfer Protocol)
- USDC → USDC (native on both chains)
- Fast attestation (~20-60 seconds)
- Backend wallet pays gas fees on both chains

### ERC20 Token Transfers (via Simplified Gateway)

**Flow: LP on Base → Project Token to Arc**

```
1. LP on Base has project token (e.g., FLX)
2. LP calls depositForWrap(amount, recipientOnArc) on Base Gateway
3. Base Gateway locks tokens and emits TokenDeposited event
4. Backend monitors event
5. Backend verifies deposit on Base
6. Backend calls mintWrapped() on Arc Gateway
7. Arc Gateway mints wrapped tokens to recipient
8. Wrapped tokens now available on Arc for swaps
```

**Key Points:**
- Source chain Gateway locks real tokens
- Arc Gateway mints wrapped tokens (1:1 backed)
- Backend acts as trusted relay
- No LayerZero needed (simplified for hackathon)
- Wrapped tokens can be swapped on Arc

## Smart Contracts

### FluxaGateway.sol (Simplified)

**On Source Chains (Base, Polygon, etc.):**
```solidity
contract FluxaGateway {
    bool public immutable isSource = true; // Source chain
    
    // Deposit tokens to be wrapped on Arc
    function depositForWrap(uint256 amount, address arcRecipient) external {
        // Lock tokens
        token.transferFrom(msg.sender, address(this), amount);
        totalLocked += amount;
        
        // Emit event for backend to monitor
        emit TokenDeposited(msg.sender, amount, chainId, ARC_CHAIN_ID, arcRecipient, nonce);
    }
}
```

**On Arc:**
```solidity
contract FluxaGateway {
    bool public immutable isSource = false; // Destination (Arc)
    address public coordinator; // Backend wallet
    
    // Mint wrapped tokens (called by backend)
    function mintWrapped(
        uint32 sourceChain,
        address recipient,
        uint256 amount,
        uint256 nonce
    ) external onlyCoordinator {
        // Verify not double-processed
        require(!processedNonces[sourceChain][nonce], "ALREADY_PROCESSED");
        
        // Mark as processed
        processedNonces[sourceChain][nonce] = true;
        
        // Mint wrapped tokens
        WrappedToken(wrappedToken).mint(recipient, amount);
    }
}
```

### Key Changes from Original

| Original | Simplified |
|----------|-----------|
| Bidirectional (wrap & unwrap) | One-way only (source → Arc) |
| LayerZero messaging | Backend relay |
| Complex remote gateway connections | Simple event monitoring |
| Both chains can be source or destination | Fixed: source chains vs Arc |

## Backend Services

### FluxaGatewayCoordinator.js

**Responsibilities:**
1. Monitor `TokenDeposited` events on source chains
2. Verify deposits happened on-chain
3. Call `mintWrapped()` on Arc Gateway
4. Track processed nonces to prevent double-minting

**Key Functions:**
```javascript
// Process a deposit from source chain
async processDeposit(sourceChain, arcGatewayAddress, depositTxHash) {
    // 1. Verify deposit on source chain
    const deposit = await this.verifyDepositEvent(sourceChain, depositTxHash);
    
    // 2. Check if already processed
    const isProcessed = await arcGateway.isNonceProcessed(sourceChain, deposit.nonce);
    if (isProcessed) return;
    
    // 3. Mint wrapped tokens on Arc
    await arcGateway.mintWrapped(
        sourceChainId,
        deposit.recipient,
        deposit.amount,
        deposit.nonce
    );
}
```

### CCTPCoordinator.js

**Responsibilities:**
1. Create pending USDC transfers from source chains to Arc
2. Monitor for USDC deposits to backend wallet
3. Execute CCTP burn on source chain
4. Wait for attestation
5. Execute CCTP mint on Arc

**Flow:**
```javascript
// User sends USDC to backend wallet on Base
// Backend detects deposit
// Backend executes CCTP transfer
const transfer = await cctpCoordinator.createPendingTransfer({
    sourceChain: 'base',
    destinationChain: 'arc',
    amount: usdcAmount,
    recipient: userAddress,
    useFastAttestation: true
});
```

## Deployment Architecture

### Source Chains (Base, Polygon, Avalanche, etc.)

**Deploy on each source chain:**
1. `FluxaGateway` (isSource=true)
   - Constructor: token address, isSource=true, chainId, backend coordinator address
   - Purpose: Lock tokens when users deposit
2. Mock project tokens (for testing)

**No need for:**
- WrappedToken contracts (only on Arc)
- LayerZero endpoints
- Complex gateway connections

### Arc (Destination Chain)

**Deploy on Arc:**
1. `FluxaGateway` (isSource=false)
   - Constructor: wrapped token address, isSource=false, chainId, backend coordinator address
   - Purpose: Mint wrapped tokens when backend relays
2. `WrappedToken` contracts (one per source token)
   - Constructor: token name, symbol, origin chainId, origin token address
   - Purpose: Represent wrapped tokens on Arc
3. AMM infrastructure for swaps
   - ArcAMMFactory
   - ArcMetaRouter
   - Liquidity pools

## Environment Variables

### Backend (.env)

```bash
# Backend coordinator wallet (pays gas on Arc)
GATEWAY_PRIVATE_KEY=0x...
CCTP_PRIVATE_KEY=0x...  # Can be same as GATEWAY_PRIVATE_KEY

# RPC URLs
ARC_RPC_URL=https://...
BASE_SEPOLIA_RPC_URL=https://...
POLYGON_AMOY_RPC_URL=https://...
# ... other chains

# Gateway addresses (deployed contracts)
ARC_GATEWAY=0x...          # Gateway on Arc
BASE_GATEWAY=0x...         # Gateway on Base
POLYGON_GATEWAY=0x...      # Gateway on Polygon
# ... other chains

# USDC addresses
ARC_USDC_ADDRESS=0x3600000000000000000000000000000000000000  # Native USDC on Arc
BASE_SEPOLIA_USDC=0x036CbD53842c5426634e7929541eC2318f3dCF7e
# ... other chains
```

## API Endpoints

### Gateway Endpoints

**POST /api/gateway/process-deposit**
- Process a token deposit from source chain to Arc
- Backend verifies and triggers mint on Arc

```json
{
  "sourceChain": "base",
  "arcGatewayAddress": "0x...",
  "depositTxHash": "0x..."
}
```

**GET /api/gateway/coordinator-address**
- Get backend coordinator wallet address
- Returns address that must be set in Gateway contracts

**GET /api/gateway/arc-balance**
- Check coordinator wallet balance on Arc
- Ensures backend has gas for minting operations

### CCTP Endpoints

**POST /api/cctp/create-transfer**
- Create pending USDC transfer from source to Arc
- Returns wallet address for user to send USDC

```json
{
  "sourceChain": "base",
  "destinationChain": "arc",
  "amount": "1000000",
  "recipient": "0x...",
  "useFastAttestation": true
}
```

**POST /api/cctp/execute/:transferId**
- Execute pending USDC transfer
- Burns on source, waits for attestation, mints on Arc

## User Flows

### LP Providing Liquidity

**Option 1: LP provides USDC**

```
1. LP has USDC on Base
2. LP sends USDC to backend CCTP wallet
3. Backend executes CCTP transfer to Arc
4. LP receives USDC on Arc
5. LP provides USDC liquidity to Arc pools
```

**Option 2: LP provides Project Token**

```
1. LP has FLX on Base
2. LP calls depositForWrap(amount, lpAddressOnArc) on Base Gateway
3. Backend monitors event and mints wFLX on Arc
4. LP receives wFLX on Arc
5. LP provides wFLX liquidity to Arc pools
```

### User Swapping

**All swaps happen on Arc:**

```
1. User has tokens on Arc (either native or wrapped)
2. User calls swap on ArcMetaRouter
3. Swap executes on Arc pools
4. User receives output tokens on Arc
```

## Security Considerations

### Trust Assumptions (Hackathon)

**What we trust:**
- Backend coordinator wallet is honest
- Backend will relay messages correctly
- Backend will not double-mint

**What is secured:**
- Nonce system prevents replay attacks
- Source gateways can only lock, not mint
- Arc gateway can only mint with valid coordinator signature
- All deposits are verifiable on-chain

### Production Recommendations

For production deployment, consider:
1. **Replace backend relay with LayerZero or Axelar**
   - Decentralized cross-chain messaging
   - No trusted intermediary needed
2. **Multi-sig coordinator**
   - Require multiple signatures for mints
3. **Time-delayed mints**
   - Allow fraud challenges before minting
4. **Insurance fund**
   - Protect against relay failures

## Deployment Steps

### 1. Deploy Source Chain Gateways

```bash
# On Base
npx hardhat run scripts/deploySourceGateway.js --network base

# On Polygon
npx hardhat run scripts/deploySourceGateway.js --network polygon-amoy
```

### 2. Deploy Arc Infrastructure

```bash
# Deploy Arc Gateway and WrappedTokens
npx hardhat run scripts/deployArcGateway.js --network arc

# Deploy AMM infrastructure
npx hardhat run scripts/deployArcAMM.js --network arc
```

### 3. Configure Backend

```bash
# Set gateway addresses in .env
# Set coordinator address in gateway contracts
# Fund coordinator wallet on Arc with USDC (for gas)
```

### 4. Start Backend Server

```bash
cd backend
npm start

# Backend will:
# - Monitor deposits on source chains
# - Process CCTP transfers
# - Relay mints to Arc
```

## Testing

### Test Gateway Flow

```bash
# 1. Deploy test token on Base
# 2. Deposit tokens to Base Gateway
# 3. Backend processes and mints on Arc
# 4. Verify wrapped tokens minted on Arc
```

### Test CCTP Flow

```bash
# 1. Send USDC to backend wallet on Base
# 2. Backend executes CCTP transfer
# 3. Verify USDC received on Arc
```

### Test Swap Flow

```bash
# 1. Have tokens on Arc (USDC + wFLX)
# 2. Provide liquidity to Arc pool
# 3. Execute swap on Arc
# 4. Verify swap output
```

## Comparison: Original vs Simplified

### Original Architecture
- ✓ Fully decentralized
- ✓ Bidirectional transfers
- ✗ Complex LayerZero integration
- ✗ Longer development time
- ✗ More contracts to deploy and test

### Simplified Architecture (This)
- ✓ Fast to implement
- ✓ Easy to understand and debug
- ✓ Sufficient for proof-of-concept
- ✗ Requires trusted backend
- ✗ One-way transfers only
- ✗ Not production-ready security model

## Migration Path to Production

When ready to productionize:

1. **Phase 1: Keep backend, add monitoring**
   - Add fraud detection
   - Multi-sig coordinator
   - Monitoring dashboards

2. **Phase 2: Replace backend with LayerZero**
   - Deploy LayerZero adapters
   - Update gateways to use LZ directly
   - Remove backend relay

3. **Phase 3: Add bidirectional support**
   - Allow unwrapping (Arc → source chains)
   - User experience: seamless cross-chain swaps

## Conclusion

This simplified architecture allows us to:
- ✅ Get a working proof-of-concept quickly
- ✅ Demonstrate cross-chain liquidity aggregation
- ✅ Show USDC + ERC20 token bridging
- ✅ Prove the concept works before building full decentralization

The backend acts as a temporary trusted intermediary until we can replace it with proper cross-chain messaging infrastructure.

