# 🚀 Fluxa - Complete Setup Guide

This guide will help you set up and run the complete Fluxa multi-chain liquidity routing system with Gateway, CCTP, LP migration, and pool rebasing.

## 📋 Prerequisites

- Node.js 18+ and npm
- MetaMask wallet with testnet funds:
  - **Arc Testnet**: USDC (native token) for gas
  - **Base Sepolia**: ETH for gas
  - **Polygon Amoy**: MATIC for gas
- Circle API keys (optional but recommended):
  - `CIRCLE_API_KEY` or `CIRCLE_GATEWAY_API_KEY` for CCTP and Gateway

---

## 🔧 Step 1: Environment Variables Setup

Create a `.env` file in the project root (`/Users/nk/Desktop/Github/ArcProject/Fluxa/.env`):

```bash
# ============================================================================
# PRIVATE KEYS (REQUIRED)
# ============================================================================
# Wallet private key for deploying contracts and executing transactions
PRIVATE_KEY=your_private_key_here

# CCTP wallet private key (can be same as PRIVATE_KEY)
# This wallet handles all cross-chain USDC transfers
CCTP_PRIVATE_KEY=your_cctp_private_key_here

# Gateway private key (can be same as PRIVATE_KEY)
GATEWAY_PRIVATE_KEY=your_gateway_private_key_here

# ============================================================================
# CIRCLE API KEYS (REQUIRED FOR CCTP & GATEWAY)
# ============================================================================
# Circle API key for CCTP V2 and Gateway operations
CIRCLE_API_KEY=your_circle_api_key_here
# OR use CIRCLE_GATEWAY_API_KEY (either one works)
CIRCLE_GATEWAY_API_KEY=your_circle_gateway_api_key_here

# ============================================================================
# RPC URLs (REQUIRED)
# ============================================================================
# Arc Testnet RPC
ARC_RPC_URL=https://hidden-cosmological-thunder.arc-testnet.quiknode.pro/e18d2b4649fda2fd51ef9f5a2c1d7d8fd132c886

# Base Sepolia RPC
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
# OR
BASE_RPC_URL=https://sepolia.base.org

# Polygon Amoy RPC
POLYGON_AMOY_RPC_URL=https://rpc-amoy.polygon.technology
# OR
POLYGON_RPC_URL=https://rpc-amoy.polygon.technology

# ============================================================================
# USDC CONTRACT ADDRESSES (REQUIRED)
# ============================================================================
# Arc Testnet - USDC is native token (proxy address)
ARC_USDC_ADDRESS=0x3600000000000000000000000000000000000000

# Base Sepolia USDC
BASE_SEPOLIA_USDC_ADDRESS=0x036CbD53842c5426634e7929541eC2318f3dCF7e
# OR
BASE_USDC_ADDRESS=0x036CbD53842c5426634e7929541eC2318f3dCF7e

# Polygon Amoy USDC (get from Circle's documentation)
POLYGON_AMOY_USDC_ADDRESS=your_polygon_amoy_usdc_address
# OR
POLYGON_USDC_ADDRESS=your_polygon_amoy_usdc_address

# ============================================================================
# GATEWAY WALLET ADDRESSES (REQUIRED FOR GATEWAY)
# ============================================================================
# Arc Testnet Gateway Wallet
ARC_GATEWAY_WALLET=0x0077777d7EBA4688BDeF3E311b846F25870A19B9

# Base Sepolia Gateway Wallet (get from Circle's documentation)
BASE_SEPOLIA_GATEWAY_WALLET=your_base_sepolia_gateway_wallet
# OR
BASE_GATEWAY_WALLET=your_base_sepolia_gateway_wallet

# Polygon Amoy Gateway Wallet (get from Circle's documentation)
POLYGON_AMOY_GATEWAY_WALLET=your_polygon_amoy_gateway_wallet
# OR
POLYGON_GATEWAY_WALLET=your_polygon_amoy_gateway_wallet

# ============================================================================
# TOKEN ADDRESSES (OPTIONAL - Will be set after deployment)
# ============================================================================
# FLX token addresses (will be deployed)
ARC_FLX_TOKEN=
BASE_SEPOLIA_FLX_TOKEN=
POLYGON_AMOY_FLX_TOKEN=

# ============================================================================
# BACKEND CONFIGURATION
# ============================================================================
BACKEND_PORT=3001
BACKEND_URL=http://localhost:3001

# ============================================================================
# DEPLOYMENT CONFIGURATION (For Gateway LP Deployment Script)
# ============================================================================
# Token address on Arc (source chain) - set after deploying FLX token
DEPLOY_TOKEN_ADDRESS=

# Total tokens to distribute (18 decimals)
DEPLOY_TOKEN_AMOUNT=1000000000000000000000

# Total USDC to distribute (6 decimals)
DEPLOY_USDC_AMOUNT=1000000000

# Address that will deposit tokens/USDC
DEPLOYER_ADDRESS=your_deployer_address

# Address receiving wrapped tokens (can be same as DEPLOYER_ADDRESS)
RECIPIENT_ADDRESS=your_recipient_address
```

**Important Notes:**
- Get Circle API keys from: https://console.circle.com
- Gateway wallet addresses are provided by Circle (check their documentation)
- USDC addresses are Circle's official testnet addresses
- Keep your private keys secure and never commit them to git

---

## 📦 Step 2: Install Dependencies

### Root Directory
```bash
cd /Users/nk/Desktop/Github/ArcProject/Fluxa
npm install
```

### Backend
```bash
cd backend
npm install
```

### Frontend
```bash
cd frontend
npm install
```

---

## 🏗️ Step 3: Deploy Contracts (Optional - First Time Only)

If you haven't deployed contracts yet, you can use the existing deployment script:

```bash
cd /Users/nk/Desktop/Github/ArcProject/Fluxa
npm run deploy
```

This deploys contracts to Base Sepolia and Arc Testnet.

---

## 🚀 Step 4: Deploy Multi-Chain LP System (New Feature)

The new Gateway-based LP deployment script sets up complete multi-chain liquidity:

```bash
cd /Users/nk/Desktop/Github/ArcProject/Fluxa
node scripts/deployGatewayLP.js
```

**What this does:**
1. **Step 1**: Deploys contracts on all chains (Arc, Base Sepolia, Polygon Amoy)
   - Project Token (FLX) on Arc
   - VaultFactory, ArcAMMFactory, ArcMetaRouter on all chains
2. **Step 2**: Gateway transfers - distributes wrapped tokens
   - Deposits FLX on Arc
   - Withdraws wrapped FLX on Base Sepolia and Polygon Amoy
3. **Step 3**: CCTP transfers - distributes USDC equally
   - Creates CCTP transfers from Arc to each destination chain
   - **Note**: You'll need to send USDC to the wallet addresses shown
4. **Step 4**: LP pool formation
   - Creates AMM pools on all chains
   - Adds equal liquidity to each pool

**Before running:**
- Set `DEPLOY_TOKEN_ADDRESS` in `.env` (FLX token address on Arc)
- Set `DEPLOYER_ADDRESS` in `.env` (your wallet address)
- Ensure you have USDC on Arc for CCTP transfers
- Ensure you have gas tokens on all chains

---

## 🖥️ Step 5: Start Backend Server

Open **Terminal 1**:

```bash
cd /Users/nk/Desktop/Github/ArcProject/Fluxa/backend
npm start
```

**Expected output:**
```
[CCTP Backend] Initializing Bridge Kit...
[CCTP Backend] Bridge Kit initialized successfully
[GATEWAY] Real Circle Gateway API configured
[ROUTE_OPTIMIZER] Token address mappings:
  Arc - FLX: 0x...
  Arc - USDC: 0x3600000000000000000000000000000000000000
  Base Sepolia - FLX: 0x...
  Base Sepolia - USDC: 0x036CbD53842c5426634e7929541eC2318f3dCF7e
  Polygon Amoy - FLX: 0x...
  Polygon Amoy - USDC: 0x...
🚀 Fluxa Backend running on port 3001
```

**Leave this terminal running!**

---

## 🎨 Step 6: Start Frontend

Open **Terminal 2** (new terminal):

```bash
cd /Users/nk/Desktop/Github/ArcProject/Fluxa/frontend
npm run dev
```

**Expected output:**
```
  ▲ Next.js 14.0.4
  - Local:        http://localhost:3000
  - ready - started server on 0.0.0.0:3000
```

**Leave this terminal running!**

---

## 🌐 Step 7: Access the Application

Open your browser and navigate to:

```
http://localhost:3000
```

### Available Pages:

1. **`/swap`** - Main swap interface with routing
   - Shows optimal routing across chains
   - Displays gas costs and net output
   - Executes multi-chain swaps

2. **`/test`** - CCTP and Gateway testing
   - Test CCTP transfers (USDC)
   - Test Gateway transfers (tokens)
   - Monitor transfer status

3. **`/vaults`** - Vault operations
   - Deposit/withdraw from liquidity vaults

4. **`/highvalue`** - High-value swap analysis
   - Analyze optimal routes for large swaps

---

## 🧪 Step 8: Test the System

### Test CCTP Transfer (USDC)

1. Go to `/test`
2. Select source chain (e.g., Base Sepolia)
3. Select destination chain (e.g., Arc)
4. Enter USDC amount
5. Click "Create CCTP Transfer"
6. Send USDC to the wallet address shown
7. Click "Execute Transfer"

### Test Multi-Chain Swap

1. Go to `/swap`
2. Connect MetaMask to Arc
3. Enter swap amount
4. Click "Check Optimal Route"
5. Review routing options (local vs multi-chain)
6. Execute swap if multi-chain route is better

### Test Gateway LP Deployment

1. Run the deployment script:
   ```bash
   node scripts/deployGatewayLP.js
   ```
2. Follow the prompts for each step
3. Send USDC to CCTP wallet addresses when shown
4. Execute CCTP transfers
5. Verify LP pools are created on all chains

---

## 🔍 Verification Checklist

After setup, verify:

- [ ] Backend starts without errors
- [ ] Frontend loads at http://localhost:3000
- [ ] Can connect MetaMask wallet
- [ ] `/swap` page shows routing options
- [ ] `/test` page can create CCTP transfers
- [ ] Backend logs show Bridge Kit initialized
- [ ] No console errors in browser

---

## 🐛 Troubleshooting

### Backend won't start

```bash
cd backend
rm -rf node_modules
npm install
npm start
```

### Frontend won't load

```bash
cd frontend
rm -rf node_modules .next
npm install
npm run dev
```

### "No RPC configured" error

- Check `.env` file has all RPC URLs set
- Verify RPC URLs are accessible
- Check network names match (e.g., `base-sepolia` vs `basesepolia`)

### "Circle API key not configured"

- Add `CIRCLE_API_KEY` or `CIRCLE_GATEWAY_API_KEY` to `.env`
- Get API key from https://console.circle.com

### "USDC address not configured"

- Add USDC addresses for all chains to `.env`
- Use Circle's official testnet USDC addresses

### "Transfer stuck on pending_deposit"

- Ensure you sent USDC to the CCTP wallet address
- Check the wallet has sufficient balance
- Verify transaction was confirmed on blockchain

### "Invalid destination domain" error

- Check chain names match Bridge Kit's expected format
- Verify CCTP domain IDs are correct
- Check RPC URLs are for the correct networks

---

## 📚 Key Features

### ✅ Multi-Chain Routing
- Evaluates all available LP pools across chains
- Calculates gas costs and CCTP fees
- Selects optimal route (local vs multi-chain)

### ✅ LP Pool Migration
- Temporarily migrates pools from remote chains to Arc
- Consolidates liquidity for better execution
- Uses Gateway and CCTP for transfers

### ✅ Pool Rebasing
- Ensures all pools have same FLX price after swaps
- Analyzes price differences
- Plans rebalancing actions

### ✅ CCTP V2 Integration
- Fast transfers (20-60 seconds)
- Automatic fee calculation
- Bridge Kit SDK integration

### ✅ Gateway Integration
- Wrapped token creation
- Multi-chain token distribution
- Unified custody

---

## 🎯 Next Steps

1. **Deploy contracts** (if not done)
2. **Run Gateway LP deployment** to set up multi-chain liquidity
3. **Test CCTP transfers** on `/test` page
4. **Test multi-chain swaps** on `/swap` page
5. **Monitor routing** and gas costs

---

## 📞 Support

If you encounter issues:
1. Check the troubleshooting section above
2. Review backend logs for error messages
3. Verify all environment variables are set correctly
4. Ensure you have sufficient testnet funds

---

**You're all set! 🎉**

The system is now ready to:
- Route swaps across multiple chains
- Migrate LP pools for optimal execution
- Rebase pools to maintain price consistency
- Handle CCTP and Gateway transfers

