# How to Run Fluxa - Real System

## ✅ You Have Everything Ready

All code is written. Contracts compiled. Just need to deploy and run!

---

## 📋 Step-by-Step Instructions

### Step 1: Compile (if not done)

```bash
cd /Users/nk/Desktop/Github/ArcProject/Fluxa
npm run compile
```

---

### Step 2: Deploy to BSC + Arc

```bash
npm run deploy
```

**What this does:**
- Deploys VaultFactory, FLX token, Vault, AMM Factory, Router, and Pool to BSC
- Deploys same to Arc
- Auto-updates `.env` and `frontend/.env.local` with all addresses

**Requirements:**
- BNB on BSC testnet for gas
- ETH on Arc testnet for gas

**If you get "0 balance" error:**
- Fund wallet on that chain
- Re-run `npm run deploy`

---

### Step 3: Start Backend (Terminal 1)

```bash
cd backend
npm install   # Only first time
npm start
```

**Expected:**
```
Initialized 2 chain(s): [ 'bsc', 'arc' ]
✓ LP Monitor started
🚀 Fluxa Backend running on port 3001
```

**Leave this terminal running!**

---

### Step 4: Start Frontend (Terminal 2)

```bash
cd frontend
npm install   # Only first time
npm run dev
```

**Expected:**
```
ready - started server on 0.0.0.0:3000
```

**Leave this terminal running!**

---

### Step 5: Use the App

**Open browser:**
```
http://localhost:3000
```

**Pages:**
- `/vaults` - Real vault deposits/withdrawals
- `/swap` - Real token swaps on Arc
- `/highvalue` - Multi-chain routing analysis

---

## 🔧 Real Operations You Can Do

### Deposit to Vault (Real Transaction)

1. Go to http://localhost:3000/vaults
2. Select "BSC Testnet" or "Arc Testnet"
3. Click "Connect Wallet"
4. Make sure MetaMask is on correct network
5. Enter FLX amount
6. Enter USDC amount
7. Click "Deposit Liquidity"
8. **Approve tokens** (2 MetaMask popups)
9. **Confirm deposit** (1 MetaMask popup)
10. **You receive vault shares!**

**This is a REAL on-chain transaction.**

---

### Withdraw from Vault (Real Transaction)

1. Same page, scroll to withdraw section
2. Enter shares to burn
3. Click "Withdraw Liquidity"
4. **Confirm in MetaMask**
5. **You receive FLX + USDC back!**

**Governance CANNOT block this - it's hardcoded in the contract.**

---

### Execute Swap (Real Transaction)

1. Go to http://localhost:3000/swap
2. Connect MetaMask
3. Switch to Arc Testnet
4. Enter amount (e.g., 100 USDC)
5. Click "Swap"
6. **Approve USDC** (MetaMask)
7. **Confirm swap** (MetaMask)
8. **You receive FLX tokens!**

**This is a REAL swap on the Arc AMM.**

---

### Analyze Multi-Chain Route (Real Analysis)

1. Go to http://localhost:3000/highvalue
2. Enter large amount (e.g., 100000)
3. Click "Analyze Route"
4. **Backend actually checks BSC and Arc vault depths**
5. Shows real liquidity distribution
6. Shows if multi-chain pull is needed

**This uses the real backend routing engine.**

---

## 📊 What You Deployed

### BSC Testnet:
```
VaultFactory:  (check .env for BSC_VAULT_FACTORY)
FLX Token:     (check .env for BSC_FLX_TOKEN)
FLX Vault:     (check .env for BSC_FLX_VAULT)
AMM Factory:   (check .env for BSC_AMM_FACTORY)
Router:        (check .env for BSC_ROUTER)
FLX/USDC Pool: (check .env for BSC_FLX_USDC_POOL)
```

### Arc Testnet:
```
VaultFactory:  (check .env for ARC_VAULT_FACTORY)
USDC:          (check .env for ARC_USDC)
FLX Token:     (check .env for ARC_FLX_TOKEN)
FLX Vault:     (check .env for ARC_FLX_VAULT)
AMM Factory:   (check .env for ARC_AMM_FACTORY)
Router:        (check .env for ARC_ROUTER)
FLX/USDC Pool: (check .env for ARC_FLX_USDC_POOL)
```

---

## ✅ Verification Checklist

After deployment:

- [ ] `.env` file has all BSC_ and ARC_ addresses
- [ ] `frontend/.env.local` exists with NEXT_PUBLIC_ variables
- [ ] Backend starts without errors
- [ ] Frontend loads at http://localhost:3000
- [ ] Vaults page shows correct vault address
- [ ] Can connect MetaMask
- [ ] Can see vault reserves

---

## 🎯 Recommended Flow

### 1. Deploy (5-10 minutes)

Run deployment script, get contracts on both chains

### 2. Add Vault Liquidity (5 minutes)

- Visit `/vaults` on BSC
- Deposit FLX + USDC
- Switch to Arc
- Deposit FLX + USDC on Arc

**Now you have liquidity on both chains!**

### 3. Test Swaps (2 minutes)

- Visit `/swap`
- Execute FLX ↔ USDC swap on Arc
- Verify it works

### 4. Test High-Value Analysis (1 minute)

- Visit `/highvalue`
- Enter 100000
- Click "Analyze Route"
- See real liquidity data from both chains

---

## 🔍 How to Check It's Real

### Vault Deposits Are Real

- After depositing, check your wallet:
  - FLX balance should decrease
  - USDC balance should decrease
  - Vault share balance should increase

- Check on block explorer:
  - BSC: https://testnet.bscscan.com
  - Arc: https://testnet.arcscan.net

### Swaps Are Real

- After swapping, check balances change
- Transaction hash links to real explorer
- Pool reserves update on-chain

### Backend Uses Real RPC

- Backend connects to BSC and Arc RPCs
- Fetches actual pool reserves
- Calculates based on real on-chain data

---

## 📝 Summary

**To deploy and run everything:**

```bash
# Step 1: Deploy
npm run deploy

# Step 2: Backend (Terminal 1)
cd backend && npm start

# Step 3: Frontend (Terminal 2)
cd frontend && npm run dev

# Step 4: Visit
open http://localhost:3000
```

**Everything from this point is REAL:**
- Real smart contracts
- Real transactions
- Real vault operations
- Real backend analysis
- Real frontend interactions

**No simulations. No demos. Production code.** ✅

---

## 🎉 You're Ready

Follow the steps above and you'll have a real, working multi-chain liquidity vault system running on BSC and Arc testnets!

