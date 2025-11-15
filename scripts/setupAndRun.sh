#!/bin/bash

# Fluxa Automated Setup and Run Script
# This script will:
# 1. Compile smart contracts
# 2. Deploy to multiple chains
# 3. Update .env files automatically
# 4. Install dependencies
# 5. Start backend and frontend in separate terminals

set -e # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m' # No Color

# Project root
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo -e "${PURPLE}"
echo "═══════════════════════════════════════════════════════════════════"
echo "                 FLUXA AUTOMATED SETUP & RUN"
echo "═══════════════════════════════════════════════════════════════════"
echo -e "${NC}"

# Check if .env exists
if [ ! -f "$PROJECT_ROOT/.env" ]; then
    echo -e "${YELLOW}⚠️  .env file not found. Creating from template...${NC}"
    cat > "$PROJECT_ROOT/.env" << 'EOF'
# Private Key (DO NOT COMMIT)
PRIVATE_KEY=your_private_key_here

# RPC URLs
SEPOLIA_RPC_URL=https://rpc.sepolia.org
BSC_TESTNET_RPC_URL=https://data-seed-prebsc-1-s1.binance.org:8545
ARC_RPC_URL=https://rpc.testnet.arc.network

# Backend
BACKEND_PORT=3001
EOF
    echo -e "${GREEN}✅ Created .env file${NC}"
    echo -e "${YELLOW}⚠️  Please edit .env and add your PRIVATE_KEY, then run this script again${NC}"
    exit 1
fi

# Check if PRIVATE_KEY is set
if grep -q "your_private_key_here" "$PROJECT_ROOT/.env"; then
    echo -e "${RED}❌ Please set your PRIVATE_KEY in .env file${NC}"
    exit 1
fi

echo -e "${BLUE}📦 Step 1: Installing Dependencies${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Install root dependencies
cd "$PROJECT_ROOT"
if [ ! -d "node_modules" ]; then
    echo "Installing root dependencies..."
    yarn install || npm install
fi

# Install backend dependencies
cd "$PROJECT_ROOT/backend"
if [ ! -d "node_modules" ]; then
    echo "Installing backend dependencies..."
    npm install
fi

# Install frontend dependencies
cd "$PROJECT_ROOT/frontend"
if [ ! -d "node_modules" ]; then
    echo "Installing frontend dependencies..."
    npm install
fi

echo -e "${GREEN}✅ Dependencies installed${NC}\n"

echo -e "${BLUE}📦 Step 2: Compiling Smart Contracts${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

cd "$PROJECT_ROOT"
npx hardhat compile

echo -e "${GREEN}✅ Contracts compiled${NC}\n"

echo -e "${BLUE}🚀 Step 3: Deploying to Multiple Chains${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

node scripts/deployMultiChain.js

echo -e "${GREEN}✅ Multi-chain deployment complete${NC}\n"

echo -e "${BLUE}🖥️  Step 4: Starting Services${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Detect OS
OS="$(uname -s)"

# Function to open new terminal and run command
open_terminal() {
    local title=$1
    local command=$2
    
    case "$OS" in
        Darwin) # macOS
            osascript <<EOF
tell application "Terminal"
    do script "cd '$PROJECT_ROOT' && clear && echo '═══════════════════════════════════════' && echo '   $title' && echo '═══════════════════════════════════════' && echo '' && $command"
    activate
end tell
EOF
            ;;
        Linux)
            if command -v gnome-terminal &> /dev/null; then
                gnome-terminal --title="$title" -- bash -c "cd '$PROJECT_ROOT' && clear && echo '═══════════════════════════════════════' && echo '   $title' && echo '═══════════════════════════════════════' && echo '' && $command; exec bash"
            elif command -v konsole &> /dev/null; then
                konsole --title "$title" -e bash -c "cd '$PROJECT_ROOT' && clear && echo '═══════════════════════════════════════' && echo '   $title' && echo '═══════════════════════════════════════' && echo '' && $command; exec bash"
            elif command -v xterm &> /dev/null; then
                xterm -title "$title" -e "cd '$PROJECT_ROOT' && clear && echo '═══════════════════════════════════════' && echo '   $title' && echo '═══════════════════════════════════════' && echo '' && $command; exec bash" &
            else
                echo -e "${YELLOW}⚠️  Could not detect terminal emulator. Please start manually:${NC}"
                echo "   $command"
            fi
            ;;
        *)
            echo -e "${YELLOW}⚠️  Unsupported OS. Please start manually:${NC}"
            echo "   $command"
            ;;
    esac
}

echo "Opening backend terminal..."
open_terminal "Fluxa Backend" "cd backend && npm start"

sleep 2

echo "Opening frontend terminal..."
open_terminal "Fluxa Frontend" "cd frontend && npm run dev"

sleep 2

echo -e "${GREEN}"
echo "═══════════════════════════════════════════════════════════════════"
echo "                    🎉 SETUP COMPLETE!"
echo "═══════════════════════════════════════════════════════════════════"
echo -e "${NC}"

echo -e "${GREEN}✅ Backend started on:${NC} http://localhost:3001"
echo -e "${GREEN}✅ Frontend started on:${NC} http://localhost:3000"
echo ""
echo -e "${BLUE}📱 Open in browser:${NC}"
echo "   Home: http://localhost:3000"
echo "   Deployment UI: http://localhost:3000/deploy"
echo "   Vault Management: http://localhost:3000/vaults"
echo ""
echo -e "${YELLOW}💡 Tips:${NC}"
echo "   • Check the new terminal windows for backend and frontend logs"
echo "   • Press Ctrl+C in each terminal to stop the services"
echo "   • Run this script again to restart everything"
echo ""
echo -e "${PURPLE}🚀 Happy building!${NC}"
echo ""

