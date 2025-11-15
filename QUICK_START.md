# ⚡ Quick Start Guide

## 🚀 Fast Setup (3 Commands)

### 1. Install Dependencies
```bash
# Root
npm install

# Backend
cd backend && npm install && cd ..

# Frontend  
cd frontend && npm install && cd ..
```

### 2. Start Backend (Terminal 1)
```bash
cd backend
npm start
```

### 3. Start Frontend (Terminal 2)
```bash
cd frontend
npm run dev
```

### 4. Open Browser
```
http://localhost:3000
```

---

## 📝 Required Environment Variables

Make sure your `.env` file has:

**Minimum Required:**
```bash
PRIVATE_KEY=your_private_key
CCTP_PRIVATE_KEY=your_cctp_private_key
CIRCLE_API_KEY=your_circle_api_key
ARC_RPC_URL=https://hidden-cosmological-thunder.arc-testnet.quiknode.pro/e18d2b4649fda2fd51ef9f5a2c1d7d8fd132c886
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
POLYGON_AMOY_RPC_URL=https://rpc-amoy.polygon.technology
ARC_USDC_ADDRESS=0x3600000000000000000000000000000000000000
BASE_SEPOLIA_USDC_ADDRESS=0x036CbD53842c5426634e7929541eC2318f3dCF7e
```

**See `SETUP_GUIDE.md` for complete list.**

---

## 🎯 What to Test

1. **CCTP Transfer**: `/test` → Create transfer → Send USDC → Execute
2. **Multi-Chain Swap**: `/swap` → Enter amount → Check route → Execute
3. **Gateway LP Deployment**: `node scripts/deployGatewayLP.js`

---

## ✅ Verify It's Working

- Backend shows: `🚀 Fluxa Backend running on port 3001`
- Frontend shows: `ready - started server on 0.0.0.0:3000`
- No errors in console
- Can connect MetaMask

---

**For detailed setup, see `SETUP_GUIDE.md`**

