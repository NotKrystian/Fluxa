# Gateway-Based Multi-Chain LP Distribution Implementation Plan

## Overview
Implement Circle Gateway protocol for wrapped token distribution, CCTP for USDC distribution, and enhanced routing system for optimal LP pool utilization across multiple chains.

## Supported Chains (Initial)
- Arc Testnet
- Base Sepolia
- Polygon Amoy

## Implementation Phases

### Phase 1: Gateway Integration Enhancement
- [ ] Enhance GatewayCoordinator with wrapped token creation methods
- [ ] Add deposit → withdraw flow for token distribution
- [ ] Support multiple destination chains in single operation
- [ ] Add Gateway balance tracking per chain

### Phase 2: Modular Deployment Script
- [ ] Step 1: Contract Deployment (TokenRegistry, Vaults, AMM Factory)
- [ ] Step 2: Gateway Transfers (deposit tokens, withdraw wrapped tokens on all chains)
- [ ] Step 3: CCTP Transfers (distribute USDC equally across all chains)
- [ ] Step 4: LP Formation (create equal LP pools on all chains)
- [ ] Add validation and rollback capabilities

### Phase 3: Enhanced Routing System
- [ ] Find all (n) available LPs across all chains
- [ ] Calculate expected output: local vault only (baseline)
- [ ] Calculate expected output: local vault + 1 chain LP - gas fees
- [ ] Calculate expected output: local + multiple chains (i, i+1, ... n) - collective gas
- [ ] Select best route (must be better than all alternatives)
- [ ] FLX price calculation: USDC amount / FLX amount (per pool)
- [ ] Display routing with fee structure explanation

### Phase 4: Pool Migration & Rebalancing
- [ ] Temporarily migrate LP pools to Arc for execution
- [ ] Execute transactions on Arc
- [ ] Rebase all pools to same FLX prices after execution
- [ ] Return pools to original chains

## Technical Details

### Gateway Flow
1. Developer mints token on source chain (e.g., Arc)
2. Deposits token + USDC to Gateway on source chain
3. System withdraws wrapped tokens on destination chains (Base, Polygon)
4. System distributes USDC via CCTP to destination chains
5. System creates equal LP pools on all chains

### Routing Calculation Formula
```
For each route option:
  expectedOutput = sum(FLX_from_each_pool) - totalGasFees
  
FLX_from_pool = (USDC_amount * FLX_reserve) / (USDC_reserve + USDC_amount)
FLX_price = USDC_reserve / FLX_reserve (per pool)

Select route where:
  expectedOutput > all_other_routes AND expectedOutput > local_only
```

### Gas Fee Estimation
- Source chain gas (approve, deposit, etc.)
- Destination chain gas (withdraw, LP creation, etc.)
- CCTP transfer fees
- Gateway withdrawal fees

