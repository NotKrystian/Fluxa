#!/bin/bash

# Deploy Test System
# This script deploys all necessary contracts for testing the Fluxa system

set -e

echo "═══════════════════════════════════════════════════════════════"
echo "🚀 FLUXA TEST SYSTEM DEPLOYMENT"
echo "═══════════════════════════════════════════════════════════════"
echo ""

# Check for .env file
if [ ! -f .env ]; then
    echo "❌ Error: .env file not found!"
    echo "   Please create a .env file with the required variables."
    exit 1
fi

# Check for PRIVATE_KEY
if [ -z "$PRIVATE_KEY" ]; then
    echo "❌ Error: PRIVATE_KEY not set in .env"
    echo "   Please set PRIVATE_KEY in your .env file"
    exit 1
fi

echo "📋 Deployment Steps (Arc + Base only):"
echo "   1. Deploy test tokens (MockERC20) on Arc and Base"
echo "   2. Deploy FluxaGateway contracts on Arc and Base"
echo "   3. Deploy FluxaSwapRouter on Base"
echo "   4. Deploy ArcExecutionHub on Arc"
echo "   5. Set up connections between contracts"
echo ""

read -p "Continue with deployment? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Deployment cancelled."
    exit 0
fi

# Step 1: Deploy test tokens
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Step 1: Deploying test tokens..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
node scripts/deployTestTokens.js

# Step 2: Deploy Gateways
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Step 2: Deploying FluxaGateway contracts..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
node scripts/deployGateways.js

# Step 3: Deploy Arc Execution Hub (needed before routers)
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Step 3: Deploying ArcExecutionHub..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
node scripts/deployArcHub.js

# Step 4: Deploy Swap Routers (needs Arc Hub address)
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Step 4: Deploying FluxaSwapRouter contracts..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
node scripts/deploySwapRouters.js

# Step 5: Set up connections
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Step 5: Setting up contract connections..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
node scripts/setupConnections.js

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "✅ DEPLOYMENT COMPLETE!"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "📝 Next Steps:"
echo "   1. Update .env with the deployed contract addresses"
echo "   2. Start the backend: cd backend && npm start"
echo "   3. Start the frontend: cd frontend && npm run dev"
echo "   4. Visit http://localhost:3000/swap-test to test swaps"
echo ""

