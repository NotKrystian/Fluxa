// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {WrappedToken} from "./WrappedToken.sol";

/**
 * @title ILiquidityVault
 * @notice Interface for vault liquidity management
 */
interface ILiquidityVault {
    function withdrawForAggregation(uint32 destinationChain) external returns (uint256, uint256);
    function returnLiquidity(uint256 projectTokenAmount, uint256 usdcAmount) external;
}

/**
 * @title FluxaGateway
 * @notice Simplified Gateway protocol for hackathon - Backend-assisted token bridging to Arc
 * 
 * Simplified Architecture (Hackathon Version):
 * - Arc is the ONLY destination (all tokens flow TO Arc)
 * - Other chains (Base, Polygon, etc.) are ONLY sources (tokens flow FROM them)
 * - Backend server acts as trusted intermediary/relay
 * - No LayerZero - backend monitors events and triggers mints
 * 
 * Flow:
 * 1. User deposits tokens on source chain (Base, Polygon, etc.) → Gateway locks tokens
 * 2. Backend monitors TokenDeposited event
 * 3. Backend calls mintWrapped() on Arc Gateway to mint wrapped tokens
 * 4. User receives wrapped tokens on Arc
 * 
 * Security Model (Hackathon):
 * - Backend wallet is trusted to relay messages correctly
 * - Source chains: Normal contracts that lock tokens (no minting)
 * - Arc chain: Can only mint when backend calls mintWrapped() with valid signature
 * - Nonce system: Prevents replay attacks
 * 
 * @dev This is a simplified version for hackathon. Production would use LayerZero or similar.
 */
contract FluxaGateway is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ============================================================================
    // State Variables
    // ============================================================================

    /// @notice The token being wrapped (on source chain) or wrapped token contract (on Arc)
    address public immutable token;

    /// @notice Whether this is a source chain (locks tokens) or Arc (mints wrapped)
    bool public immutable isSource;

    /// @notice Chain ID of this chain
    uint32 public immutable chainId;

    /// @notice Backend coordinator address (trusted relay)
    address public coordinator;

    /// @notice Total tokens locked on source chain (backing all wrapped tokens)
    uint256 public totalLocked;

    /// @notice Total wrapped tokens minted on Arc (per source chain)
    mapping(uint32 => uint256) public totalWrapped;

    /// @notice Nonce counter for deposits (per destination chain)
    mapping(uint32 => uint256) public depositNonces;

    /// @notice Nonce counter for burns (per origin chain)
    mapping(uint32 => uint256) public burnNonces;

    /// @notice Mapping: (sourceChain, nonce) => processed
    mapping(uint32 => mapping(uint256 => bool)) public processedNonces;

    /// @notice Wrapped token contract (on destination chain with wrapped tokens)
    address public wrappedToken;

    /// @notice USDC aggregator wallet address for cross-chain bridging
    address public immutable usdcAggregator;

    /// @notice Liquidity vault address on this chain
    address public vault;

    /// @notice USDC token address on this chain
    address public immutable usdc;

    // ============================================================================
    // Pending Transaction Queue (for backend processing)
    // ============================================================================

    struct PendingDeposit {
        uint32 sourceChain;
        address recipient;
        uint256 amount;
        uint256 nonce;
        uint256 timestamp;
        uint256 priorityFee; // FLX tokens paid for faster processing
        bool processed;
    }

    struct PendingBurn {
        uint32 destChain;
        address recipient;
        uint256 amount;
        uint256 nonce;
        uint256 timestamp;
        uint256 priorityFee; // FLX tokens paid for faster processing
        bool processed;
    }

    /// @notice Queue of pending deposits to be processed by coordinator
    PendingDeposit[] public pendingDeposits;

    /// @notice Queue of pending burns to be processed by coordinator
    PendingBurn[] public pendingBurns;

    /// @notice Minimum time before a pending item can be processed (safety delay)
    uint256 public constant PROCESSING_DELAY = 10; // 10 seconds

    /// @notice Accumulated priority fees (in FLX tokens)
    uint256 public accumulatedFees;

    // ============================================================================
    // Events
    // ============================================================================

    event TokenDeposited(
        address indexed depositor,
        uint256 amount,
        uint32 sourceChain,
        uint32 destinationChain, // Always Arc
        address destinationRecipient,
        uint256 nonce
    );

    event WrappedTokensMinted(
        uint32 indexed sourceChain,
        address indexed recipient,
        uint256 amount,
        uint256 nonce
    );

    event WrappedTokensBurned(
        address indexed burner,
        uint256 amount,
        uint32 destinationChain,
        uint32 originChain,
        address originRecipient,
        uint256 nonce
    );

    event TokensReleased(
        uint32 indexed sourceChain,
        address indexed recipient,
        uint256 amount,
        uint256 nonce
    );

    event CoordinatorUpdated(address indexed oldCoordinator, address indexed newCoordinator);
    event WrappedTokenUpdated(address indexed wrappedToken);
    event VaultSet(address indexed vault);
    event LiquidityAggregationInitiated(uint32 indexed destChain, uint256 flxAmount, uint256 usdcAmount);
    event LiquidityRepopulated(uint256 flxAmount, uint256 usdcAmount);

    // ============================================================================
    // Modifiers
    // ============================================================================

    modifier onlyCoordinator() {
        require(msg.sender == coordinator, "ONLY_COORDINATOR");
        _;
    }

    // ============================================================================
    // Constructor
    // ============================================================================

    constructor(
        address _token,
        bool _isSource,
        uint32 _chainId,
        address _coordinator,
        address _usdcAggregator,
        address _usdc
    ) Ownable(msg.sender) {
        require(_token != address(0), "ZERO_TOKEN");
        require(_coordinator != address(0), "ZERO_COORDINATOR");
        require(_usdc != address(0), "ZERO_USDC");
        
        token = _token;
        isSource = _isSource;
        chainId = _chainId;
        coordinator = _coordinator;
        usdcAggregator = _usdcAggregator; // Can be address(0) initially
        usdc = _usdc;
    }

    // ============================================================================
    // Admin Functions
    // ============================================================================

    /**
     * @notice Update coordinator address (backend relay wallet)
     */
    function setCoordinator(address _coordinator) external onlyOwner {
        require(_coordinator != address(0), "ZERO_ADDRESS");
        address oldCoordinator = coordinator;
        coordinator = _coordinator;
        emit CoordinatorUpdated(oldCoordinator, _coordinator);
    }

    /**
     * @notice Set wrapped token contract (Arc only)
     */
    function setWrappedToken(address _wrappedToken) external onlyOwner {
        require(!isSource, "SOURCE_NO_WRAPPED");
        require(_wrappedToken != address(0), "ZERO_ADDRESS");
        wrappedToken = _wrappedToken;
        emit WrappedTokenUpdated(_wrappedToken);
    }

    // ============================================================================
    // Vault Management Functions - CROSS-CHAIN LIQUIDITY AGGREGATION
    // ============================================================================

    /**
     * @notice Set vault address for this chain
     * @param _vault Address of the liquidity vault
     */
    function setVault(address _vault) external onlyOwner {
        require(_vault != address(0), "ZERO_VAULT");
        vault = _vault;
        emit VaultSet(_vault);
    }

    /**
     * @notice Aggregate liquidity from vault for cross-chain swap
     * @dev Only coordinator can call this to initiate cross-chain aggregation
     * @param destChain Destination chain ID where liquidity is being aggregated
     * @return flxAmount Amount of FLX/wFLX withdrawn
     * @return usdcAmount Amount of USDC withdrawn
     */
    function aggregateLiquidity(uint32 destChain) 
        external 
        onlyCoordinator
        nonReentrant 
        returns (uint256 flxAmount, uint256 usdcAmount) 
    {
        require(vault != address(0), "NO_VAULT");
        
        // Call vault to withdraw all liquidity
        (flxAmount, usdcAmount) = ILiquidityVault(vault).withdrawForAggregation(destChain);
        
        // If this is Base (source chain with wFLX), burn wFLX to unlock FLX on Arc
        if (isSource && wrappedToken != address(0)) {
            // wFLX is already in this contract, will be burned via normal flow
            // Backend will process this as deposit to Arc
        }
        
        // Send USDC to aggregator wallet for CCTP bridging
        if (usdcAmount > 0 && usdcAggregator != address(0)) {
            IERC20(usdc).safeTransfer(usdcAggregator, usdcAmount);
        }
        
        emit LiquidityAggregationInitiated(destChain, flxAmount, usdcAmount);
        
        return (flxAmount, usdcAmount);
    }

    /**
     * @notice Return liquidity to vault after cross-chain swap
     * @dev Only coordinator can call this to return liquidity with new proportions
     * @param flxAmount Amount of FLX/wFLX to return
     * @param usdcAmount Amount of USDC to return
     */
    function repopulateVault(uint256 flxAmount, uint256 usdcAmount) 
        external 
        onlyCoordinator
        nonReentrant 
    {
        require(vault != address(0), "NO_VAULT");
        
        // Approve vault to pull tokens
        if (flxAmount > 0) {
            IERC20(token).safeIncreaseAllowance(vault, flxAmount);
        }
        if (usdcAmount > 0) {
            IERC20(usdc).safeIncreaseAllowance(vault, usdcAmount);
        }
        
        // Call vault to return liquidity
        ILiquidityVault(vault).returnLiquidity(flxAmount, usdcAmount);
        
        emit LiquidityRepopulated(flxAmount, usdcAmount);
    }

    // ============================================================================
    // Source Chain Functions (Deposit)
    // ============================================================================

    /**
     * @notice Deposit tokens to be wrapped on destination chain
     * @param amount Amount of tokens to deposit
     * @param destinationChain Chain ID where wrapped tokens will be minted
     * @param destinationRecipient Address to receive wrapped tokens on destination
     * @param priorityFee Optional FLX tokens to pay for faster processing (higher = faster)
     */
    function depositForWrap(
        uint256 amount,
        uint32 destinationChain,
        address destinationRecipient,
        uint256 priorityFee
    ) external nonReentrant returns (uint256 nonce) {
        require(isSource, "NOT_SOURCE");
        require(amount > 0, "ZERO_AMOUNT");
        require(destinationChain != 0, "ZERO_CHAIN");
        require(destinationRecipient != address(0), "ZERO_RECIPIENT");

        // Transfer tokens from user (amount + priority fee)
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount + priorityFee);
        
        // Update locked balance (only the actual amount, not the fee)
        totalLocked += amount;
        
        // Accumulate priority fee
        if (priorityFee > 0) {
            accumulatedFees += priorityFee;
        }

        // Increment nonce for this destination chain
        nonce = depositNonces[destinationChain]++;
        
        // Add to pending queue for coordinator to process
        pendingDeposits.push(PendingDeposit({
            sourceChain: chainId,
            recipient: destinationRecipient,
            amount: amount,
            nonce: nonce,
            timestamp: block.timestamp,
            priorityFee: priorityFee,
            processed: false
        }));
        
        emit TokenDeposited(
            msg.sender,
            amount,
            chainId, // Source chain (this chain)
            destinationChain, // Destination chain (Base, Arc, etc.)
            destinationRecipient,
            nonce
        );

        return nonce;
    }

    // ============================================================================
    // Arc Chain Functions (Mint)
    // ============================================================================

    /**
     * @notice Mint wrapped tokens on Arc (called by backend coordinator)
     * @param sourceChain Chain ID where tokens were deposited
     * @param recipient Address to receive wrapped tokens
     * @param amount Amount of wrapped tokens to mint
     * @param nonce Nonce from the deposit message
     */
    function mintWrapped(
        uint32 sourceChain,
        address recipient,
        uint256 amount,
        uint256 nonce
    ) external nonReentrant onlyCoordinator {
        require(!isSource, "NOT_ARC");
        require(amount > 0, "ZERO_AMOUNT");
        require(recipient != address(0), "ZERO_RECIPIENT");
        require(!processedNonces[sourceChain][nonce], "ALREADY_PROCESSED");
        require(wrappedToken != address(0), "NO_WRAPPED_TOKEN");

        // Mark nonce as processed
        processedNonces[sourceChain][nonce] = true;

        // Update wrapped total
        totalWrapped[sourceChain] += amount;

        // Mint wrapped tokens
        WrappedToken(wrappedToken).mint(recipient, amount);

        emit WrappedTokensMinted(sourceChain, recipient, amount, nonce);
    }

    // ============================================================================
    // Destination Chain Functions (Burn wrapped tokens)
    // ============================================================================

    /**
     * @notice Burn wrapped tokens to unwrap on origin chain
     * @param amount Amount of wrapped tokens to burn
     * @param originChain Chain ID where real tokens will be released
     * @param originRecipient Address to receive real tokens on origin chain
     * @param priorityFee Optional wFLX tokens to pay for faster processing (higher = faster)
     */
    function burnForUnwrap(
        uint256 amount,
        uint32 originChain,
        address originRecipient,
        uint256 priorityFee
    ) external nonReentrant returns (uint256 nonce) {
        require(!isSource, "NOT_DESTINATION");
        require(amount > 0, "ZERO_AMOUNT");
        require(originChain != 0, "ZERO_CHAIN");
        require(originRecipient != address(0), "ZERO_RECIPIENT");
        require(wrappedToken != address(0), "NO_WRAPPED_TOKEN");

        // Burn wrapped tokens from user
        WrappedToken(wrappedToken).burn(msg.sender, amount);
        
        // If priority fee provided, burn it as well (fees collected in wFLX on destination)
        if (priorityFee > 0) {
            WrappedToken(wrappedToken).burn(msg.sender, priorityFee);
            accumulatedFees += priorityFee;
        }

        // Update wrapped total
        require(totalWrapped[originChain] >= amount, "INSUFFICIENT_WRAPPED");
        totalWrapped[originChain] -= amount;

        // Increment nonce for this origin chain
        nonce = burnNonces[originChain]++;

        // Add to pending queue for coordinator to process
        pendingBurns.push(PendingBurn({
            destChain: chainId,
            recipient: originRecipient,
            amount: amount,
            nonce: nonce,
            timestamp: block.timestamp,
            priorityFee: priorityFee,
            processed: false
        }));
        
        emit WrappedTokensBurned(
            msg.sender,
            amount,
            chainId, // Current chain (destination)
            originChain, // Origin chain where tokens will be released
            originRecipient,
            nonce
        );

        return nonce;
    }

    // ============================================================================
    // Source Chain Functions (Release tokens after burn)
    // ============================================================================

    /**
     * @notice Release tokens on source chain (called by backend coordinator after burn)
     * @param destChain Chain ID where tokens were burned
     * @param recipient Address to receive tokens
     * @param amount Amount of tokens to release
     * @param nonce Nonce from the burn message
     */
    function releaseTokens(
        uint32 destChain,
        address recipient,
        uint256 amount,
        uint256 nonce
    ) external nonReentrant onlyCoordinator {
        require(isSource, "NOT_SOURCE");
        require(amount > 0, "ZERO_AMOUNT");
        require(recipient != address(0), "ZERO_RECIPIENT");
        require(!processedNonces[destChain][nonce], "ALREADY_PROCESSED");
        require(totalLocked >= amount, "INSUFFICIENT_LOCKED");

        // Mark nonce as processed
        processedNonces[destChain][nonce] = true;

        // Update locked balance
        totalLocked -= amount;

        // Transfer tokens to recipient
        IERC20(token).safeTransfer(recipient, amount);

        emit TokensReleased(destChain, recipient, amount, nonce);
    }

    // ============================================================================
    // Queue Processing Functions ("Shake" functions for coordinator)
    // ============================================================================

    /**
     * @notice Get pending deposits ready for processing (sorted by priority fee, highest first)
     * @dev Called by coordinator to "shake" the queue and get ready items
     */
    function processPendingDepositsInfo() external view returns (
        uint256[] memory readyIndices,
        uint32[] memory sourceChains,
        address[] memory recipients,
        uint256[] memory amounts,
        uint256[] memory nonces,
        uint256[] memory priorityFees
    ) {
        // Count ready items
        uint256 readyCount = 0;
        for (uint256 i = 0; i < pendingDeposits.length; i++) {
            if (!pendingDeposits[i].processed && 
                block.timestamp >= pendingDeposits[i].timestamp + PROCESSING_DELAY) {
                readyCount++;
            }
        }

        // Allocate arrays
        readyIndices = new uint256[](readyCount);
        sourceChains = new uint32[](readyCount);
        recipients = new address[](readyCount);
        amounts = new uint256[](readyCount);
        nonces = new uint256[](readyCount);
        priorityFees = new uint256[](readyCount);

        // Fill arrays (unsorted)
        uint256 j = 0;
        for (uint256 i = 0; i < pendingDeposits.length; i++) {
            if (!pendingDeposits[i].processed && 
                block.timestamp >= pendingDeposits[i].timestamp + PROCESSING_DELAY) {
                readyIndices[j] = i;
                sourceChains[j] = pendingDeposits[i].sourceChain;
                recipients[j] = pendingDeposits[i].recipient;
                amounts[j] = pendingDeposits[i].amount;
                nonces[j] = pendingDeposits[i].nonce;
                priorityFees[j] = pendingDeposits[i].priorityFee;
                j++;
            }
        }

        // Sort by priority fee (highest first) using simple bubble sort
        for (uint256 i = 0; i < readyCount; i++) {
            for (uint256 k = i + 1; k < readyCount; k++) {
                if (priorityFees[k] > priorityFees[i]) {
                    // Swap all arrays
                    (readyIndices[i], readyIndices[k]) = (readyIndices[k], readyIndices[i]);
                    (sourceChains[i], sourceChains[k]) = (sourceChains[k], sourceChains[i]);
                    (recipients[i], recipients[k]) = (recipients[k], recipients[i]);
                    (amounts[i], amounts[k]) = (amounts[k], amounts[i]);
                    (nonces[i], nonces[k]) = (nonces[k], nonces[i]);
                    (priorityFees[i], priorityFees[k]) = (priorityFees[k], priorityFees[i]);
                }
            }
        }
    }

    /**
     * @notice Mark deposits as processed after coordinator mints them
     * @param indices Array of indices to mark as processed
     */
    function markDepositsProcessed(uint256[] calldata indices) external onlyCoordinator {
        for (uint256 i = 0; i < indices.length; i++) {
            require(indices[i] < pendingDeposits.length, "INVALID_INDEX");
            pendingDeposits[indices[i]].processed = true;
        }
    }

    /**
     * @notice Get pending burns ready for processing (sorted by priority fee, highest first)
     * @dev Called by coordinator to get burns that need token release
     */
    function processPendingBurnsInfo() external view returns (
        uint256[] memory readyIndices,
        uint32[] memory destChains,
        address[] memory recipients,
        uint256[] memory amounts,
        uint256[] memory nonces,
        uint256[] memory priorityFees
    ) {
        // Count ready items
        uint256 readyCount = 0;
        for (uint256 i = 0; i < pendingBurns.length; i++) {
            if (!pendingBurns[i].processed && 
                block.timestamp >= pendingBurns[i].timestamp + PROCESSING_DELAY) {
                readyCount++;
            }
        }

        // Allocate arrays
        readyIndices = new uint256[](readyCount);
        destChains = new uint32[](readyCount);
        recipients = new address[](readyCount);
        amounts = new uint256[](readyCount);
        nonces = new uint256[](readyCount);
        priorityFees = new uint256[](readyCount);

        // Fill arrays (unsorted)
        uint256 j = 0;
        for (uint256 i = 0; i < pendingBurns.length; i++) {
            if (!pendingBurns[i].processed && 
                block.timestamp >= pendingBurns[i].timestamp + PROCESSING_DELAY) {
                readyIndices[j] = i;
                destChains[j] = pendingBurns[i].destChain;
                recipients[j] = pendingBurns[i].recipient;
                amounts[j] = pendingBurns[i].amount;
                nonces[j] = pendingBurns[i].nonce;
                priorityFees[j] = pendingBurns[i].priorityFee;
                j++;
            }
        }

        // Sort by priority fee (highest first) using simple bubble sort
        for (uint256 i = 0; i < readyCount; i++) {
            for (uint256 k = i + 1; k < readyCount; k++) {
                if (priorityFees[k] > priorityFees[i]) {
                    // Swap all arrays
                    (readyIndices[i], readyIndices[k]) = (readyIndices[k], readyIndices[i]);
                    (destChains[i], destChains[k]) = (destChains[k], destChains[i]);
                    (recipients[i], recipients[k]) = (recipients[k], recipients[i]);
                    (amounts[i], amounts[k]) = (amounts[k], amounts[i]);
                    (nonces[i], nonces[k]) = (nonces[k], nonces[i]);
                    (priorityFees[i], priorityFees[k]) = (priorityFees[k], priorityFees[i]);
                }
            }
        }
    }

    /**
     * @notice Mark burns as processed after coordinator releases tokens
     * @param indices Array of indices to mark as processed
     */
    function markBurnsProcessed(uint256[] calldata indices) external onlyCoordinator {
        for (uint256 i = 0; i < indices.length; i++) {
            require(indices[i] < pendingBurns.length, "INVALID_INDEX");
            pendingBurns[indices[i]].processed = true;
        }
    }

    // ============================================================================
    // View Functions
    // ============================================================================

    function getTotalLocked() external view returns (uint256) {
        return totalLocked;
    }

    function getPendingDepositsCount() external view returns (uint256) {
        return pendingDeposits.length;
    }

    function getPendingBurnsCount() external view returns (uint256) {
        return pendingBurns.length;
    }

    function getTotalWrapped(uint32 sourceChain) external view returns (uint256) {
        return totalWrapped[sourceChain];
    }

    function getAccumulatedFees() external view returns (uint256) {
        return accumulatedFees;
    }

    // ============================================================================
    // Admin Functions
    // ============================================================================

    /**
     * @notice Withdraw accumulated priority fees
     * @param recipient Address to receive the fees
     * @param amount Amount to withdraw (must be <= accumulatedFees)
     */
    function withdrawFees(address recipient, uint256 amount) external onlyOwner {
        require(recipient != address(0), "ZERO_RECIPIENT");
        require(amount > 0 && amount <= accumulatedFees, "INVALID_AMOUNT");
        
        accumulatedFees -= amount;
        IERC20(token).safeTransfer(recipient, amount);
    }

    function isNonceProcessed(uint32 sourceChain, uint256 nonce) external view returns (bool) {
        return processedNonces[sourceChain][nonce];
    }

    function getDepositNonce(uint32 destChain) external view returns (uint256) {
        return depositNonces[destChain];
    }
}
