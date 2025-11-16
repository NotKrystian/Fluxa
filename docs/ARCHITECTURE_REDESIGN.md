# Fluxa Architecture Redesign

## Key Constraint

**Users always start and finish on the same chain. Cross-chain is purely internal.**

## User Experience

### What Users See:
- User on Base swaps **FLX → USDC on Base**
- User on Polygon swaps **FLX → USDC on Polygon**
- User on Arc swaps between tokens on Arc

### What Users Don't See:
- Cross-chain routing decisions
- Arc execution hub
- LP rebalancing
- Internal message passing

**Result:** User gets better prices without complexity.

---

## Two Categories of Cross-Chain Actions

### A) Internal Execution via Arc (Hub Execution)

**Flow:**
1. User swaps FLX → USDC on Base
2. Base Router locks/burns FLX_BASE
3. Backend decides: route via Arc for better price
4. Base Router sends LayerZero message to Arc
5. Arc Hub executes swap using deep Arc liquidity
6. Arc Hub sends result back to Base via LayerZero
7. Base Router credits USDC_BASE to user

**User Experience:** "I swapped FLX → USDC on Base at great price."

---

### B) LP Rebalancing and Price Alignment

**Flow:**
1. Backend monitors LP depths across chains
2. Detects imbalance (e.g., too much USDC on Base, not enough on Arc)
3. Moves USDC via CCTP: Base → Arc
4. Moves FLX via Gateway: Base → Arc
5. Updates LP allocations to align prices

**User Experience:** None (completely transparent)

---

## Contract Architecture

### 1. FluxaSwapRouter (on each chain)

**Purpose:** User-facing swap interface

**Functions:**
- `swap(tokenIn, tokenOut, amountIn, minAmountOut)` - User initiates swap
- `confirmRouteAndSend(requestId, routePlan)` - Backend confirms routing
- `completeArcSwap(requestId, tokenOut, amountOut)` - Receives result from Arc

**Key Features:**
- Always settles on same chain user started
- Can execute locally OR route via Arc
- Handles LayerZero messaging to/from Arc

---

### 2. ArcExecutionHub (on Arc only)

**Purpose:** Internal execution hub for better prices

**Functions:**
- `lzReceive(...)` - Receives swap requests from external chains
- `_executeSwap(routePlan)` - Executes swap on Arc pools
- `_sendResultBack(...)` - Sends result back to origin chain

**Key Features:**
- Only called by LayerZero (not users)
- Executes swaps using Arc's deep liquidity
- Returns results to origin chain

---

## Message Flow: User Swap via Arc

```
User (Base)                    Base Router              Arc Hub              Arc Pool
  |                                |                       |                     |
  |-- swap(FLX, USDC, 100k) ----->|                       |                     |
  |                                |                       |                     |
  |                                |-- LZ: RoutePlan ----->|                     |
  |                                |                       |                     |
  |                                |                       |-- swap() ---------->|
  |                                |                       |<-- amountOut -------|
  |                                |                       |                     |
  |                                |<-- LZ: result --------|                     |
  |<-- USDC_BASE ------------------|                       |                     |
```

**User only interacts with Base Router. Arc is invisible.**

---

## Routing Decision Logic

### Backend RouteOptimizer

```javascript
function decideRoute(userChain, tokenIn, tokenOut, amountIn) {
  // Get LP depths across all chains
  const depths = await lpMonitor.getAllDepths();
  
  // Calculate local execution
  const localOutput = calculateLocalSwap(userChain, tokenIn, tokenOut, amountIn);
  
  // Calculate Arc execution (including bridge costs)
  const arcOutput = calculateArcSwap(userChain, tokenIn, tokenOut, amountIn);
  
  // Compare net outputs
  if (arcOutput > localOutput * 1.01) { // 1% better to justify routing
    return {
      strategy: 'VIA_ARC',
      expectedOutput: arcOutput,
      gasEstimate: estimateArcGas(userChain)
    };
  } else {
    return {
      strategy: 'LOCAL_ONLY',
      expectedOutput: localOutput,
      gasEstimate: estimateLocalGas(userChain)
    };
  }
}
```

---

## Token Handling

### USDC
- **On Origin Chain:** Locked or burned via CCTP
- **On Arc:** Received via CCTP mint
- **Back to Origin:** Sent via CCTP mint

### FLX (Project Token)
- **On Origin Chain:** Burned (if wrapped) or locked
- **On Arc:** Minted (if wrapped) or received via Gateway
- **Back to Origin:** Minted (if wrapped) or sent via Gateway

---

## Benefits of This Architecture

### 1. UX Simplicity
- Users never see cross-chain complexity
- No "where did my funds go?" confusion
- Single-chain mental model

### 2. Security & Scope
- Don't need to solve "any asset to any asset across any chain"
- Focus on price improvement and capital efficiency
- Consistent pricing across chains

### 3. Simpler Contracts
- No `userChainIn != userChainOut` logic
- All user swaps have single chain context
- Arc logic optimized as internal clearing house

---

## Implementation Status

✅ **FluxaSwapRouter.sol** - User-facing router (created)
✅ **ArcExecutionHub.sol** - Internal execution hub (created)
⏳ **LayerZero Integration** - Pending
⏳ **Backend RouteOptimizer Update** - Pending
⏳ **Gateway Protocol Update** - For FLX wrapping only (internal)

---

## Next Steps

1. Integrate LayerZero SDK into contracts
2. Update backend RouteOptimizer to use new architecture
3. Update Gateway protocol for internal FLX wrapping only
4. Remove user-facing cross-chain swap features
5. Test end-to-end flow: Base → Arc → Base

