# Decentralized Cross-Chain Messaging Protocols

## Overview

Unlike CCTP's MessageTransmitter (which only works for USDC via TokenMessenger), these protocols allow **arbitrary cross-chain messages** for any application.

## How They Work

### 1. LayerZero

**Architecture:**
- **Ultra Light Node (ULN)**: Lightweight on-chain contract that verifies messages
- **Oracles & Relayers**: Off-chain infrastructure that delivers messages
- **Endpoint**: On-chain contract you interact with to send/receive messages

**Flow:**
1. **Send**: Your contract calls `Endpoint.send()` with destination chain ID and payload
2. **Relay**: LayerZero's relayer network picks up the message
3. **Verify**: Oracle provides block header proof, Relayer provides transaction proof
4. **Receive**: Destination `Endpoint` verifies both proofs and delivers message to your contract

**Key Features:**
- **Decentralized**: Multiple independent oracles and relayers
- **Fast**: ~1-2 minutes for most chains
- **Cost**: Pay gas on both chains + LayerZero fees
- **Security**: Cryptographic verification of messages

**Example Integration:**
```solidity
// Send message
ILayerZeroEndpoint(endpoint).send(
    dstChainId,           // Destination chain ID
    remoteGateway,        // Destination Gateway address (bytes)
    payload,              // Encoded message data
    payable(msg.sender),  // Refund address
    address(0),          // ZRO payment address (optional)
    bytes("")            // Adapter params
);

// Receive message
function lzReceive(
    uint16 _srcChainId,
    bytes calldata _srcAddress,
    uint64 _nonce,
    bytes calldata _payload
) external override {
    require(msg.sender == endpoint, "Only endpoint");
    // Decode and process message
}
```

---

### 2. Wormhole

**Architecture:**
- **Guardian Network**: 19+ independent validators that observe and attest messages
- **Core Contract**: On-chain contract that emits messages
- **VAA (Verifiable Action Approval)**: Signed attestation from Guardian Network
- **Relayer**: Off-chain service that delivers VAAs to destination

**Flow:**
1. **Emit**: Your contract calls `CoreContract.publishMessage()` with payload
2. **Observe**: Guardian Network observes the message on source chain
3. **Attest**: Guardians create VAA (signed by majority)
4. **Relay**: Relayer fetches VAA and submits to destination
5. **Verify**: Destination contract verifies VAA signatures (need 13/19 guardians)

**Key Features:**
- **Highly Decentralized**: 19+ independent guardians
- **Slower**: ~15-30 seconds for finality + VAA generation
- **Cost**: Gas on source + destination + relayer fees
- **Security**: Multi-sig from guardian network

**Example Integration:**
```solidity
// Send message
uint32 nonce = 0;
uint8 consistencyLevel = 200; // Finality level
bytes memory payload = abi.encode(recipient, amount, nonce);

uint64 sequence = wormhole.publishMessage(nonce, payload, consistencyLevel);

// Receive message
function receiveMessage(bytes memory encodedVM) external {
    (IWormhole.VM memory vm, bool valid, string memory reason) = 
        wormhole.parseAndVerifyVM(encodedVM);
    
    require(valid, reason);
    require(vm.emitterChainId == sourceChainId, "Wrong chain");
    
    // Decode and process payload
    (address recipient, uint256 amount, uint256 nonce) = 
        abi.decode(vm.payload, (address, uint256, uint256));
}
```

---

### 3. Hyperlane

**Architecture:**
- **Mailbox**: On-chain contract for sending/receiving messages
- **Validator Set**: Decentralized validators that attest to message delivery
- **Interchain Security Module (ISM)**: Configurable security policy (multi-sig, merkle tree, etc.)
- **Relayer**: Off-chain service that delivers messages

**Flow:**
1. **Send**: Your contract calls `Mailbox.dispatch()` with destination domain and message
2. **Attest**: Validators observe and create attestation
3. **Relay**: Relayer fetches attestation and delivers to destination
4. **Verify**: Destination `Mailbox` verifies attestation via ISM
5. **Deliver**: Message delivered to recipient contract

**Key Features:**
- **Configurable Security**: Choose your ISM (multi-sig, optimistic, etc.)
- **Fast**: ~1-2 minutes
- **Cost**: Gas on both chains + Hyperlane fees
- **Flexible**: Can customize security model per application

**Example Integration:**
```solidity
// Send message
IMailbox(mailbox).dispatch(
    destinationDomain,    // Destination chain domain ID
    remoteGateway,        // Destination Gateway address (bytes32)
    message               // Encoded message data
);

// Receive message
function handle(
    uint32 _origin,
    bytes32 _sender,
    bytes calldata _message
) external override {
    require(msg.sender == mailbox, "Only mailbox");
    // Decode and process message
}
```

---

## Comparison

| Protocol | Security Model | Speed | Cost | Decentralization |
|----------|---------------|-------|------|------------------|
| **LayerZero** | Oracle + Relayer proofs | ~1-2 min | Medium | Medium (multiple oracles/relayers) |
| **Wormhole** | 19+ Guardian signatures | ~15-30 sec | Low | High (19+ independent guardians) |
| **Hyperlane** | Configurable ISM | ~1-2 min | Medium | Medium (validator set) |
| **CCTP** | Circle attestation (USDC only) | ~20-60 sec | Low | Low (Circle-controlled) |

---

## Integration into FluxaGateway

### Option 1: LayerZero Integration

```solidity
import "@layerzerolabs/solidity-examples/contracts/lzApp/NonblockingLzApp.sol";

contract FluxaGateway is NonblockingLzApp {
    function depositForWrap(
        uint256 amount,
        uint32 destinationChain,
        address destinationRecipient
    ) external {
        // Lock tokens
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        totalLocked += amount;
        
        uint256 nonce = nonces[destinationChain]++;
        
        // Send LayerZero message
        bytes memory payload = abi.encode(
            destinationRecipient,
            amount,
            nonce
        );
        
        _lzSend(
            destinationChain,
            payload,
            payable(msg.sender),
            address(0),
            bytes("")
        );
        
        emit TokenDeposited(msg.sender, amount, destinationChain, destinationRecipient, nonce);
    }
    
    function _nonblockingLzReceive(
        uint16 _srcChainId,
        bytes memory _srcAddress,
        uint64 _nonce,
        bytes memory _payload
    ) internal override {
        (address recipient, uint256 amount, uint256 messageNonce) = 
            abi.decode(_payload, (address, uint256, uint256));
        
        require(!processedNonces[_srcChainId][messageNonce], "ALREADY_PROCESSED");
        processedNonces[_srcChainId][messageNonce] = true;
        
        // Mint wrapped tokens
        totalWrapped[_srcChainId] += amount;
        WrappedToken(wrappedToken).mint(recipient, amount);
    }
}
```

### Option 2: Wormhole Integration

```solidity
import "@wormhole-foundation/wormhole-solidity-sdk/contracts/interfaces/IWormhole.sol";

contract FluxaGateway {
    IWormhole public immutable wormhole;
    
    function depositForWrap(
        uint256 amount,
        uint16 destinationChain,
        address destinationRecipient
    ) external {
        // Lock tokens
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        totalLocked += amount;
        
        uint256 nonce = nonces[destinationChain]++;
        
        // Send Wormhole message
        bytes memory payload = abi.encode(
            destinationRecipient,
            amount,
            nonce
        );
        
        uint64 sequence = wormhole.publishMessage(
            0,              // nonce
            payload,        // payload
            200             // consistency level (finalized)
        );
        
        emit TokenDeposited(msg.sender, amount, destinationChain, destinationRecipient, nonce);
    }
    
    function receiveWormholeMessage(
        bytes memory encodedVM
    ) external {
        (IWormhole.VM memory vm, bool valid, string memory reason) = 
            wormhole.parseAndVerifyVM(encodedVM);
        
        require(valid, reason);
        require(vm.emitterChainId == originChainId, "Wrong chain");
        require(vm.emitterAddress == remoteGateway, "Wrong gateway");
        
        (address recipient, uint256 amount, uint256 messageNonce) = 
            abi.decode(vm.payload, (address, uint256, uint256));
        
        require(!processedNonces[vm.emitterChainId][messageNonce], "ALREADY_PROCESSED");
        processedNonces[vm.emitterChainId][messageNonce] = true;
        
        // Mint wrapped tokens
        totalWrapped[vm.emitterChainId] += amount;
        WrappedToken(wrappedToken).mint(recipient, amount);
    }
}
```

### Option 3: Hyperlane Integration

```solidity
import "@hyperlane-xyz/core/contracts/interfaces/IMailbox.sol";
import "@hyperlane-xyz/core/contracts/interfaces/IInterchainSecurityModule.sol";

contract FluxaGateway is IMessageRecipient {
    IMailbox public immutable mailbox;
    
    function depositForWrap(
        uint256 amount,
        uint32 destinationDomain,
        address destinationRecipient
    ) external {
        // Lock tokens
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        totalLocked += amount;
        
        uint256 nonce = nonces[destinationDomain]++;
        
        // Send Hyperlane message
        bytes32 remoteGateway = addressToBytes32(remoteGateways[destinationDomain]);
        bytes memory message = abi.encode(
            destinationRecipient,
            amount,
            nonce
        );
        
        mailbox.dispatch(destinationDomain, remoteGateway, message);
        
        emit TokenDeposited(msg.sender, amount, destinationDomain, destinationRecipient, nonce);
    }
    
    function handle(
        uint32 _origin,
        bytes32 _sender,
        bytes calldata _message
    ) external override {
        require(msg.sender == address(mailbox), "Only mailbox");
        require(_sender == addressToBytes32(remoteGateways[_origin]), "Wrong gateway");
        
        (address recipient, uint256 amount, uint256 messageNonce) = 
            abi.decode(_message, (address, uint256, uint256));
        
        require(!processedNonces[_origin][messageNonce], "ALREADY_PROCESSED");
        processedNonces[_origin][messageNonce] = true;
        
        // Mint wrapped tokens
        totalWrapped[_origin] += amount;
        WrappedToken(wrappedToken).mint(recipient, amount);
    }
}
```

---

## Recommendation

For FluxaGateway, I'd recommend **LayerZero** because:
1. **Easiest Integration**: Simple `send()` and `receive()` pattern
2. **Good Security**: Oracle + Relayer dual verification
3. **Fast**: ~1-2 minutes for most chains
4. **Widely Supported**: Works on all major chains
5. **Active Development**: Strong ecosystem and documentation

**Next Steps:**
1. Install LayerZero SDK: `npm install @layerzerolabs/solidity-examples`
2. Deploy Endpoint contracts (or use existing ones)
3. Update FluxaGateway to inherit from `NonblockingLzApp`
4. Replace coordinator calls with LayerZero messages

