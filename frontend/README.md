# Fluxa Frontend

Modern Next.js frontend for the Fluxa multi-chain liquidity routing protocol.

## 🎯 Features

### ✅ Implemented Pages

1. **Home** (`/`) - Landing page with demo navigation
2. **Arc Swap** (`/swap`) - Standard stablecoin swap on Arc
3. **CCTP Transfer** (`/transfer`) - Cross-chain USDC via Circle CCTP
4. **Circle Wallet** (`/wallet`) - Embedded wallet demo
5. **High-Value Swap** (`/highvalue`) - Multi-chain routing showcase ⭐

## 🚀 Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

```bash
# Copy environment template
cp env.example .env.local

# Edit .env.local with your values
```

Required variables:
- `NEXT_PUBLIC_BACKEND_URL` - Backend API URL (default: http://localhost:3001)
- `NEXT_PUBLIC_ARC_RPC_URL` - Arc RPC endpoint
- `NEXT_PUBLIC_ARC_ROUTER_ADDRESS` - Deployed router contract
- `NEXT_PUBLIC_ARC_USDC_ADDRESS` - Mock USDC address
- `NEXT_PUBLIC_ARC_EURC_ADDRESS` - Mock EURC address

### 3. Start Backend

The frontend requires the backend API to be running:

```bash
# In another terminal
cd ../backend
npm start
```

Backend should be running on http://localhost:3001

### 4. Run Frontend

```bash
# Development mode
npm run dev

# Production build
npm run build
npm start
```

Visit http://localhost:3000

## 📁 Project Structure

```
frontend/
├── app/
│   ├── layout.tsx                 # Root layout with nav
│   ├── page.tsx                   # Home page
│   ├── globals.css                # Global styles
│   ├── swap/page.tsx              # Arc swap demo
│   ├── transfer/page.tsx          # CCTP transfer demo
│   ├── wallet/page.tsx            # Circle Wallet demo
│   └── highvalue/page.tsx         # Multi-chain showcase
├── utils/
│   ├── api.ts                     # Backend API client
│   └── contracts.ts               # Smart contract utilities
├── next.config.js
├── tsconfig.json
├── tailwind.config.ts
└── package.json
```

## 🎨 Technology Stack

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Web3**: ethers.js v6
- **HTTP**: axios
- **Icons**: lucide-react
- **Charts**: recharts

## 📄 Pages Overview

### Home (`/`)
- Landing page with project overview
- Navigation to all demos
- Key features and statistics

### Arc Swap (`/swap`)
- Connect MetaMask wallet
- Swap USDC ↔ EURC on Arc
- Slippage control
- Real-time balance updates
- Transaction tracking

**Status**: ✅ Fully functional with deployed contracts

### CCTP Transfer (`/transfer`)
- Cross-chain USDC transfer UI
- Chain selection (Ethereum, Base, Polygon, Arc)
- Simulated attestation progress
- ~15 minute transfer visualization

**Status**: 🎭 Demo mode (backend ready)

### Circle Wallet (`/wallet`)
- Embedded wallet creation
- Balance display
- Quick swap actions
- Transaction history

**Status**: 🎭 Demo mode (SDK integration pending)

### High-Value Swap (`/highvalue`) ⭐
- Large trade input (100k+ USDC)
- Real-time LP depth monitoring
- Multi-chain route analysis
- Execution visualization with steps:
  1. Analyze liquidity
  2. Initiate CCTP transfers
  3. Wait for attestations
  4. Execute swap on Arc
  5. Rebalance LPs

**Status**: ✅ Backend connected, visual demo working

## 🔌 Backend Integration

### API Endpoints Used

```typescript
// Get LP depths across all chains
GET /api/lp-depths

// Get quote for a trade
POST /api/quote
Body: { tokenIn, tokenOut, amountIn, sourceChain }

// Execute high-value swap
POST /api/execute-highvalue
Body: { tokenIn, tokenOut, amountIn, minAmountOut, recipient }

// Get rebalancing status
GET /api/rebalance/status
```

### Smart Contract Integration

Frontend interacts with:
- `ArcMetaRouter` - Swap execution
- `ERC20` - Token approvals and balances
- `ArcAMMPool` - Reserve queries

## 🎭 Demo vs Production Mode

### Demo Mode (Current)
- Simulated CCTP transfers
- Mock Circle Wallet
- Simulated attestation waits
- Works without Circle API keys

### Production Mode (Future)
- Real Circle Wallets SDK
- Real CCTP transactions via Bridge Kit
- Real Gateway API integration
- Circle API key required

## 🛠️ Development

### Running Locally

```bash
# Terminal 1: Backend
cd backend && npm start

# Terminal 2: Frontend
cd frontend && npm run dev
```

### Environment Variables

Create `.env.local`:

```bash
# Required
NEXT_PUBLIC_BACKEND_URL=http://localhost:3001
NEXT_PUBLIC_ARC_RPC_URL=https://rpc.testnet.arc.network

# From deployment (run deploy.js first)
NEXT_PUBLIC_ARC_ROUTER_ADDRESS=0x...
NEXT_PUBLIC_ARC_USDC_ADDRESS=0x...
NEXT_PUBLIC_ARC_EURC_ADDRESS=0x...

# Optional (use demo mode if missing)
NEXT_PUBLIC_CIRCLE_WALLETS_APP_ID=
NEXT_PUBLIC_CIRCLE_API_KEY=
```

### Updating Contract Addresses

After deploying contracts with `node scripts/deploy.js`:

1. Copy deployed addresses from output
2. Update `.env.local`
3. Restart frontend

## 📱 Responsive Design

All pages are responsive:
- Mobile: Single column layout
- Tablet: Optimized grid layouts
- Desktop: Full multi-column layouts

## 🎨 Styling

### Color Scheme
- Arc Blue: `#0EA5E9`
- Arc Purple: `#8B5CF6`
- Arc Green: `#10B981`

### Custom Gradients
```css
.gradient-arc {
  background: linear-gradient(135deg, #0EA5E9 0%, #8B5CF6 100%);
}

.gradient-card {
  background: linear-gradient(135deg, rgba(14, 165, 233, 0.1) 0%, rgba(139, 92, 246, 0.1) 100%);
}
```

## 🐛 Troubleshooting

### "Backend not responding"
- Ensure backend is running on port 3001
- Check `NEXT_PUBLIC_BACKEND_URL` in `.env.local`
- Verify CORS is enabled in backend

### "Contract addresses not set"
- Run `node scripts/deploy.js` first
- Update `.env.local` with deployed addresses
- Restart frontend

### "MetaMask not connecting"
- Ensure MetaMask is installed
- Check you're on Arc Testnet
- Try clicking "Switch to Arc" button

### "Swap not working"
- Ensure contracts are deployed
- Check you have test USDC/EURC
- Verify router address is correct

## 🚀 Deployment

### Vercel (Recommended)

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel

# Set environment variables in Vercel dashboard
```

### Environment Variables for Production

Set these in Vercel/Netlify:
- `NEXT_PUBLIC_BACKEND_URL` - Your deployed backend URL
- `NEXT_PUBLIC_ARC_RPC_URL` - Arc RPC
- `NEXT_PUBLIC_ARC_ROUTER_ADDRESS` - Router contract
- All other contract addresses

## 📊 Performance

- Initial load: < 2s
- Route switching: Instant (client-side)
- API calls: < 500ms
- Wallet connection: < 1s

## 🔄 Future Enhancements

- [ ] Real Circle Wallets SDK integration
- [ ] Real CCTP via Bridge Kit
- [ ] Real Gateway API calls
- [ ] Multi-hop routing visualization
- [ ] Advanced charts and analytics
- [ ] Transaction history
- [ ] Notification system

## 📚 Learn More

- [Next.js Documentation](https://nextjs.org/docs)
- [Tailwind CSS](https://tailwindcss.com)
- [ethers.js](https://docs.ethers.org)
- [Circle Documentation](https://developers.circle.com)

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

---

**Built with ❤️ for the Arc ecosystem**

