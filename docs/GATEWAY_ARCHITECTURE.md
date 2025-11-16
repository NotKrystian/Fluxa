# Fluxa Gateway Architecture

## Overview

The Fluxa Gateway protocol enables wrapping arbitrary ERC20 tokens across chains using LayerZero for secure cross-chain messaging.

## Architecture Components

### 1. **WrappedToken Contract** (on Destination Chain)

- **Purpose**: ERC20 token representing wrapped version of tokens from origin chain
- **Deployment**: Deployed separately on destination chain
- **Ownership**: Controlled by Gateway contract (via `gateway` address)
- **Functions**:
  - `mint(address to, uint256 amount)`: Only Gateway can call this
  - `burn(address from, uint256 amount)`: Only Gateway can call this
- **Key Point**: The WrappedToken is **passive** - it doesn't distribute tokens itself. It only mints/burns when the Gateway tells it to.

### 2. **Gateway Contract** (on Both Chains)

#### Origin Gateway (e.g., Base Sepolia)
- **Purpose**: Locks real tokens when users wrap
- **Functions**:
  - `depositForWrap()`: User deposits tokens → Gateway locks them → Sends LayerZero message
  - `releaseTokens()`: Receives LayerZero message → Releases locked tokens to user
- **Token Storage**: Holds real tokens as collateral

#### Destination Gateway (e.g., Arc Testnet)
- **Purpose**: Mints wrapped tokens when receiving LayerZero messages
- **Functions**:
  - `mintWrapped()`: Receives LayerZero message → Calls `WrappedToken.mint()`
  - `burnForUnwrap()`: User burns wrapped tokens → Sends LayerZero message
- **WrappedToken Control**: Owns/controls the WrappedToken contract

## Flow: Wrapping Tokens (Base → Arc)

1. **User on Base**: Calls `depositForWrap()` on Base Gateway
   - Transfers real FLX tokens to Base Gateway
   - Base Gateway locks tokens (increases `totalLocked`)
   - Base Gateway sends LayerZero message to Arc Gateway

2. **LayerZero**: Securely delivers message to Arc Gateway

3. **Arc Gateway**: Receives message via `lzReceive()`
   - Verifies message authenticity
   - Calls `WrappedToken.mint(recipient, amount)` on the WrappedToken contract
   - WrappedToken mints wFLX tokens to recipient

## Flow: Unwrapping Tokens (Arc → Base)

1. **User on Arc**: Calls `burnForUnwrap()` on Arc Gateway
   - Burns wFLX tokens (via `WrappedToken.burn()`)
   - Arc Gateway sends LayerZero message to Base Gateway

2. **LayerZero**: Securely delivers message to Base Gateway

3. **Base Gateway**: Receives message via `lzReceive()`
   - Verifies message authenticity
   - Calls `releaseTokens()` to transfer locked FLX tokens to user

## Key Points

- **WrappedToken is NOT self-distributing**: It's a passive ERC20 that only the Gateway can mint/burn
- **Gateway controls WrappedToken**: The Gateway contract calls `mint()` and `burn()` on the WrappedToken
- **1:1 Backing**: Every wrapped token is backed by 1 real token locked on the origin chain
- **Security**: LayerZero provides cryptographic verification of cross-chain messages

## Contract Ownership

```
Origin Chain (Base):
├── Gateway Contract (locks real tokens)
└── Real FLX Token Contract

Destination Chain (Arc):
├── Gateway Contract (controls WrappedToken)
└── WrappedToken Contract (mints/burns wFLX)
    └── Controlled by Gateway via `gateway` address
```

The Gateway contract **owns and controls** the WrappedToken contract. The WrappedToken contract itself does not distribute tokens - it only responds to mint/burn calls from the Gateway.

