# Fluxa - Multi-Chain Liquidity Management Protocol

**Real multi-chain liquidity vaults with Arc as the intelligent execution hub.**

Token developers deploy liquidity across BSC and Arc testnets. Users maintain full withdrawal rights via ERC20 vault shares. Governance coordinates global liquidity strategy but cannot take custody or block withdrawals.

---

## 🚀 Quick Start

### 1. Setup Environment

Create `.env` in project root:

```bash
# Private Keys
PRIVATE_KEY=your_private_key_here

# RPC URLs
SEPOLIA_RPC_URL=https://ethereum-sepolia-rpc.publicnode.com
ARC_RPC_URL=https://rpc.testnet.arc.network

# Gateway Wallet Addresses (Circle deployments)
ARC_GATEWAY_WALLET=0x0077777d7EBA4688BDeF3E311b846F25870A19B9
ETHEREUM_GATEWAY_WALLET=0x0077777d7EBA4688BDeF3E311b846F25870A19B9  # Sepolia
SEPOLIA_GATEWAY_WALLET=0x0077777d7EBA4688BDeF3E311b846F25870A19B9

# CCTP Configuration (optional - for cross-chain USDC)
CCTP_PRIVATE_KEY=your_private_key_here
ARC_TOKEN_MESSENGER=0x...  # TokenMessenger on Arc
ARC_MESSAGE_TRANSMITTER=0x...  # MessageTransmitter on Arc
ARC_USDC_ADDRESS=0x...  # USDC on Arc

# Gateway API (optional - for Circle Gateway API)
CIRCLE_GATEWAY_API_KEY=your_api_key_here

# Backend
BACKEND_PORT=3001
```

### 2. Compile Contracts

```bash
npm run compile
```

### 3. Deploy to BSC + Arc

```bash
npm run deploy
```

This deploys:
- VaultFactory (manages all vaults)
- Mock USDC (Arc only, uses real USDC on BSC)
- FLX project token
- FLX liquidity vault
- ArcAMMFactory (for AMM pools)
- ArcMetaRouter (for swaps)
- FLX/USDC pool

**Auto-updates `.env` and `frontend/.env.local` with deployed addresses!**

###4. Start Backend

```bash
cd backend
npm install
npm start
```

Runs on: http://localhost:3001

### 5. Start Frontend

```bash
cd frontend
npm install
npm run dev
```

Runs on: http://localhost:3000

---

## 🏗️ Architecture

### Liquidity Vaults

**Smart Contract**: `core/LiquidityVault.sol`

```solidity
// Users deposit liquidity, get ERC20 shares
function deposit(uint256 projectTokenAmount, uint256 usdcAmount, uint256 minShares) 
    external returns (uint256 shares);

// Users withdraw anytime - CANNOT BE BLOCKED
function withdraw(uint256 shares, uint256 minProjectToken, uint256 minUsdc) 
    external returns (uint256, uint256);

// Governance manages strategy ONLY
function rebalance(bytes calldata data) external onlyGovernance;
```

**Key Principle**: Users own shares, governance manages strategy. Withdrawals hardcoded, cannot be blocked.

---

### Multi-Chain Coordination

**Backend Services**:
- `LPMonitor` - Tracks vault depths across BSC + Arc
- `RouteOptimizer` - Calculates best execution path
- `CCTPCoordinator` - Moves USDC cross-chain
- `GatewayCoordinator` - Moves ERC20s cross-chain
- `RebalancingEngine` - Manages post-trade LP distribution

**Flow**:
1. User initiates large swap
2. Backend analyzes liquidity on both chains
3. If multi-chain needed:
   - Pull USDC from BSC via CCTP
   - Pull tokens via Gateway
   - Execute on Arc atomically
   - Rebalance vaults

---

## 📱 Frontend Pages

### `/vaults` - Real Vault Operations

- View vault reserves on BSC or Arc
- Deposit FLX + USDC, receive shares
- Withdraw shares, get tokens back
- **Actually calls smart contracts**

### `/swap` - Real Token Swaps

- Connect MetaMask
- Swap FLX ↔ USDC on Arc
- Uses deployed ArcMetaRouter
- **Real on-chain transactions**

### `/highvalue` - Multi-Chain Routing

- Enter large trade amount
- Backend analyzes global liquidity
- Shows optimal route across chains
- Executes via real API calls

### `/deploy` - Deployment Info

- Shows which chains are deployed
- Instructions for CLI deployment
- Contract addresses

---

## 🔧 Real Contract Interactions

### Deposit to Vault

```typescript
// Frontend calls real contract
import { depositToVault } from '@/utils/vaults'

const result = await depositToVault(
  vaultAddress,
  projectTokenAmount,  // e.g., ethers.parseUnits('1000', 18)
  usdcAmount,          // e.g., ethers.parseUnits('1000', 6)
  minShares,
  signer
)

// Returns: { success, txHash, shares }
```

### Withdraw from Vault

```typescript
const result = await withdrawFromVault(
  vaultAddress,
  shares,
  minProjectToken,
  minUsdc,
  signer
)

// Returns: { success, txHash, projectToken, usdc }
```

### Execute Swap

```typescript
import { executeSwap } from '@/utils/contracts'

const result = await executeSwap(
  tokenIn,
  tokenOut,
  amountIn,
  minAmountOut,
  recipient,
  signer
)

// Returns: { success, txHash }
```

---

## 🌐 Supported Chains

| Chain | Chain ID | USDC | Native Currency | Status |
|-------|----------|------|-----------------|--------|
| Ethereum Sepolia | 11155111 | 0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238 | ETH | ✅ Ready |
| Arc Testnet | 5042002 | ERC20 wrapper deployed | **USDC** (native) | ✅ Ready |

**Note:** Arc's native token is USDC. We deploy an ERC20 wrapper for contract interactions (vaults, AMM), but the underlying value is native USDC.

---

## 🔑 Key Features

### Non-Custodial

✅ Users own vault shares (ERC20)  
✅ Withdraw anytime by burning shares  
✅ Cannot be blocked by governance  
✅ Proportional ownership guaranteed  

### Governance-Coordinated

✅ Manages liquidity strategy across chains  
✅ Combines pools for large trades  
✅ Rebalances after trades  
✅ Cannot take funds or block withdrawals  

### Multi-Chain Native

✅ Deploy on BSC, Arc, and more  
✅ CCTP for USDC movement  
✅ Gateway for ERC20 movement  
✅ Intelligent routing engine  

---

## 📊 Deployed Addresses

After running `npm run deploy`, check `.env` for:

```bash
# BSC Testnet
BSC_VAULT_FACTORY=0x...
BSC_FLX_TOKEN=0x...
BSC_FLX_VAULT=0x...
BSC_ROUTER=0x...

# Arc Testnet  
ARC_VAULT_FACTORY=0x...
ARC_FLX_TOKEN=0x...
ARC_FLX_VAULT=0x...
ARC_ROUTER=0x...
```

---

## 🧪 Testing

### Real Vault Operations

```bash
# 1. Deploy contracts
npm run deploy

# 2. Start backend
cd backend && npm start

# 3. Start frontend
cd frontend && npm run dev

# 4. Visit http://localhost:3000/vaults
# 5. Connect MetaMask
# 6. Deposit liquidity (real transaction!)
# 7. Withdraw liquidity (real transaction!)
```

### Real Swaps

```bash
# Visit http://localhost:3000/swap
# Connect MetaMask to Arc
# Execute swap (real transaction!)
```

---

## 🎯 Usage

### For Token Developers

**Deploy Liquidity:**
1. Visit `/vaults`
2. Select chain (BSC or Arc)
3. Connect wallet
4. Enter FLX and USDC amounts
5. Click "Deposit Liquidity"
6. Receive vault shares (ERC20)

**Withdraw Liquidity:**
1. Enter shares to burn
2. Click "Withdraw Liquidity"
3. Receive proportional FLX + USDC
4. **Cannot be blocked!**

### For Traders

**Execute Swaps:**
1. Visit `/swap`
2. Connect MetaMask
3. Enter amount
4. Execute swap on Arc AMM

**Large Trades:**
1. Visit `/highvalue`
2. Enter large amount
3. System analyzes multi-chain liquidity
4. Pulls from BSC vaults if needed
5. Executes on Arc

---

## 🔐 Security Model

### User Protection

```solidity
// Withdrawals CANNOT be blocked
function withdraw(...) external {
    // No onlyGovernance modifier
    // No pause functionality
    // Always executable
}
```

### Governance Limitations

```solidity
// Governance can ONLY manage strategy
function rebalance(...) external onlyGovernance {
    // Cannot transfer user funds
    // Cannot change share balances
    // Cannot prevent withdrawals
}
```

---

## 📝 Commands Reference

```bash
# Compile contracts
npm run compile

# Deploy to BSC + Arc
npm run deploy

# Start backend
npm run backend

# Start frontend
npm run frontend
```

---

## 🛠️ Environment Variables

### Root `.env`

```bash
PRIVATE_KEY=...
BSC_RPC_URL=https://data-seed-prebsc-1-s1.binance.org:8545
ARC_RPC_URL=https://rpc.testnet.arc.network
BACKEND_PORT=3001
```

### `frontend/.env.local` (auto-generated by deployment)

```bash
NEXT_PUBLIC_BACKEND_URL=http://localhost:3001

# BSC addresses (from deployment)
NEXT_PUBLIC_BSC_VAULT_FACTORY=0x...
NEXT_PUBLIC_BSC_FLX_VAULT=0x...
NEXT_PUBLIC_BSC_ROUTER=0x...

# Arc addresses (from deployment)
NEXT_PUBLIC_ARC_VAULT_FACTORY=0x...
NEXT_PUBLIC_ARC_FLX_VAULT=0x...
NEXT_PUBLIC_ARC_ROUTER=0x...
```

---

## 🎓 How It Works

### 1. Liquidity Provision

Token developers deposit FLX + USDC into vaults on BSC and Arc:

```
Developer → deposit(1000 FLX, 1000 USDC) → Vault
Vault → mints shares → Developer owns shares
Shares = proportional ownership (ERC20)
```

### 2. Global Monitoring

Backend monitors all vaults:

```
LPMonitor → Checks BSC vault reserves
LPMonitor → Checks Arc vault reserves
Total liquidity = BSC + Arc
```

### 3. High-Value Execution

Large trade needs multi-chain liquidity:

```
User: 100k USDC → FLX
Arc vault: 20k available (insufficient)
BSC vault: 80k available

Route Optimizer → Pull 80k from BSC via CCTP
CCTP → Burn on BSC, mint on Arc
Execute swap on Arc with 100k total
Rebalance → Return excess to BSC
```

### 4. Withdrawal Rights

Developer can withdraw anytime:

```
Developer → burn 500 shares
Vault → calculates proportional amounts
Vault → returns FLX + USDC to developer
Governance → CANNOT block this
```

---

## 🚀 Production Deployment

### Mainnet Chains (Future)

- Ethereum Mainnet
- BSC Mainnet
- Arc Mainnet
- Base Mainnet
- Polygon Mainnet

### Real Circle Integration

Update `.env`:
```bash
# Real CCTP
BSC_TOKEN_MESSENGER=<real address>
ARC_TOKEN_MESSENGER=<real address>

# Real Gateway
CIRCLE_GATEWAY_API_KEY=<your key>
CIRCLE_GATEWAY_WALLET=<real address>

# Real Circle Wallets
CIRCLE_WALLETS_API_KEY=<your key>
```

---

## 📞 Support

- Smart Contracts: `core/` directory
- Backend: `backend/README.md`
- Frontend: `frontend/README.md`

---

**Fluxa: Non-custodial multi-chain liquidity with intelligent routing on Arc.**

