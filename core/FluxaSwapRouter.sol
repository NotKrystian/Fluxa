// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title FluxaSwapRouter
 * @notice User-facing swap router that always settles on the same chain
 * 
 * Key Constraint: Users always start and finish on the same chain.
 * Cross-chain routing is purely internal for better execution.
 * 
 * Architecture:
 * - User calls swap() on their chain (e.g., Base)
 * - Router can execute locally OR route via Arc (internal)
 * - Results always go back to user on the same chain
 * 
 * Flow:
 * 1. User swaps FLX → USDC on Base
 * 2. Router decides: LOCAL_ONLY or VIA_ARC
 * 3. If LOCAL_ONLY: Swap on Base pools, send result to user
 * 4. If VIA_ARC: Lock assets, send LZ message to Arc, Arc executes, Arc sends back, Router credits user
 * 5. User receives USDC on Base (same chain they started)
 */
contract FluxaSwapRouter is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ============================================================================
    // State Variables
    // ============================================================================

    /// @notice Local AMM/Vault for executing swaps on this chain
    address public localPool;

    /// @notice Arc Router address (for routing via Arc)
    address public arcRouter;

    /// @notice LayerZero Endpoint (for cross-chain messages)
    address public lzEndpoint;

    /// @notice Chain ID of this chain
    uint32 public immutable chainId;

    /// @notice Arc chain ID
    uint32 public constant ARC_CHAIN_ID = 5042002;

    /// @notice Pending swap requests (requestId => SwapRequest)
    mapping(bytes32 => SwapRequest) public pendingSwaps;

    /// @notice Request ID counter
    uint256 public requestIdCounter;

    // ============================================================================
    // Structs
    // ============================================================================

    enum SwapStrategy {
        LOCAL_ONLY,  // Execute swap on local chain only
        VIA_ARC      // Route via Arc for better execution
    }

    struct SwapRequest {
        address user;
        address tokenIn;
        address tokenOut;
        uint256 amountIn;
        uint256 minAmountOut;
        SwapStrategy strategy;
        bool completed;
    }

    struct RoutePlan {
        bytes32 requestId;
        address user;
        uint32 userChainId;
        address tokenIn;
        address tokenOut;
        uint256 amountIn;
        uint256 minAmountOut;
        bool useArc;
    }

    // ============================================================================
    // Events
    // ============================================================================

    event SwapRequested(
        bytes32 indexed requestId,
        address indexed user,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minAmountOut
    );

    event SwapExecuted(
        bytes32 indexed requestId,
        address indexed user,
        address tokenOut,
        uint256 amountOut,
        SwapStrategy strategy
    );

    event ArcSwapInitiated(
        bytes32 indexed requestId,
        address indexed user,
        uint32 arcChainId
    );

    event ArcSwapCompleted(
        bytes32 indexed requestId,
        address indexed user,
        address tokenOut,
        uint256 amountOut
    );

    // ============================================================================
    // Constructor
    // ============================================================================

    constructor(
        address _localPool,
        address _arcRouter,
        address _lzEndpoint,
        uint32 _chainId
    ) Ownable(msg.sender) {
        require(_localPool != address(0), "ZERO_POOL");
        require(_lzEndpoint != address(0), "ZERO_ENDPOINT");
        
        localPool = _localPool;
        arcRouter = _arcRouter;
        lzEndpoint = _lzEndpoint;
        chainId = _chainId;
    }

    // ============================================================================
    // User-Facing Functions
    // ============================================================================

    /**
     * @notice User initiates a swap (always on their chain)
     * @param tokenIn Token to swap from
     * @param tokenOut Token to swap to
     * @param amountIn Amount of tokenIn to swap
     * @param minAmountOut Minimum amount of tokenOut expected
     * @return requestId Unique identifier for this swap request
     */
    function swap(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minAmountOut
    ) external nonReentrant returns (bytes32 requestId) {
        require(tokenIn != address(0) && tokenOut != address(0), "ZERO_TOKEN");
        require(amountIn > 0, "ZERO_AMOUNT");
        require(tokenIn != tokenOut, "SAME_TOKEN");

        // Generate request ID
        requestId = keccak256(abi.encodePacked(
            block.timestamp,
            block.number,
            msg.sender,
            requestIdCounter++
        ));

        // Transfer tokens from user
        IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amountIn);

        // Store swap request
        pendingSwaps[requestId] = SwapRequest({
            user: msg.sender,
            tokenIn: tokenIn,
            tokenOut: tokenOut,
            amountIn: amountIn,
            minAmountOut: minAmountOut,
            strategy: SwapStrategy.LOCAL_ONLY, // Will be updated by backend
            completed: false
        });

        emit SwapRequested(requestId, msg.sender, tokenIn, tokenOut, amountIn, minAmountOut);

        // For now, execute locally (backend will call confirmRouteAndSend for Arc routing)
        // In production, you might want to do a quick local check first
        _executeLocalSwap(requestId);
    }

    /**
     * @notice Backend confirms routing strategy and executes
     * @dev Called by backend after analyzing LP depths
     * @param requestId Swap request ID
     * @param routePlan Routing plan (LOCAL_ONLY or VIA_ARC)
     */
    function confirmRouteAndSend(
        bytes32 requestId,
        RoutePlan calldata routePlan
    ) external onlyOwner nonReentrant {
        SwapRequest storage swapReq = pendingSwaps[requestId];
        require(swapReq.user != address(0), "INVALID_REQUEST");
        require(!swapReq.completed, "ALREADY_COMPLETED");
        require(routePlan.userChainId == chainId, "WRONG_CHAIN");

        // Update strategy
        swapReq.strategy = routePlan.useArc ? SwapStrategy.VIA_ARC : SwapStrategy.LOCAL_ONLY;

        if (routePlan.useArc) {
            _executeViaArc(requestId, routePlan);
        } else {
            _executeLocalSwap(requestId);
        }
    }

    // ============================================================================
    // Internal Execution Functions
    // ============================================================================

    /**
     * @notice Execute swap locally on this chain
     */
    function _executeLocalSwap(bytes32 requestId) internal {
        SwapRequest storage swapReq = pendingSwaps[requestId];
        require(!swapReq.completed, "ALREADY_COMPLETED");

        // Approve local pool
        IERC20(swapReq.tokenIn).approve(localPool, swapReq.amountIn);

        // Execute swap on local pool
        // Assuming localPool has a swap() function
        // This would be your LiquidityVault or ArcAMMPool
        (bool success, bytes memory data) = localPool.call(
            abi.encodeWithSignature(
                "swap(address,address,uint256,uint256,address)",
                swapReq.tokenIn,
                swapReq.tokenOut,
                swapReq.amountIn,
                swapReq.minAmountOut,
                swapReq.user
            )
        );

        require(success, "SWAP_FAILED");
        
        // Decode amountOut from return data (implementation depends on pool interface)
        uint256 amountOut = abi.decode(data, (uint256));
        require(amountOut >= swapReq.minAmountOut, "SLIPPAGE");

        swapReq.completed = true;

        emit SwapExecuted(requestId, swapReq.user, swapReq.tokenOut, amountOut, SwapStrategy.LOCAL_ONLY);
    }

    /**
     * @notice Execute swap via Arc (internal routing)
     */
    function _executeViaArc(bytes32 requestId, RoutePlan calldata routePlan) internal {
        SwapRequest storage swapReq = pendingSwaps[requestId];

        // Lock/burn tokens on this chain
        // For FLX: burn wrapped version
        // For USDC: lock or use CCTP
        IERC20(swapReq.tokenIn).safeTransfer(address(this), swapReq.amountIn);

        // Send LayerZero message to Arc
        bytes memory payload = abi.encode(routePlan);
        
        // This would use LayerZero's send() function
        // For now, we'll emit an event and let backend handle it
        // In production, integrate with LayerZero SDK
        
        emit ArcSwapInitiated(requestId, swapReq.user, ARC_CHAIN_ID);
        
        // Backend will:
        // 1. Send LZ message to Arc Router
        // 2. Arc Router executes swap
        // 3. Arc Router sends result back via LZ
        // 4. completeArcSwap() is called with result
    }

    /**
     * @notice Complete swap after Arc execution (called by LayerZero receive)
     * @dev This would be called by LayerZero's lzReceive callback
     */
    function completeArcSwap(
        bytes32 requestId,
        address tokenOut,
        uint256 amountOut
    ) external nonReentrant {
        // In production, verify this is called by LayerZero endpoint
        // require(msg.sender == lzEndpoint, "ONLY_LZ");

        SwapRequest storage swapReq = pendingSwaps[requestId];
        require(!swapReq.completed, "ALREADY_COMPLETED");
        require(swapReq.tokenOut == tokenOut, "WRONG_TOKEN");
        require(amountOut >= swapReq.minAmountOut, "SLIPPAGE");

        // Mint/credit tokens to user on this chain
        // For USDC: use CCTP mint or unlock
        // For FLX: mint wrapped version
        IERC20(tokenOut).safeTransfer(swapReq.user, amountOut);

        swapReq.completed = true;

        emit ArcSwapCompleted(requestId, swapReq.user, tokenOut, amountOut);
        emit SwapExecuted(requestId, swapReq.user, tokenOut, amountOut, SwapStrategy.VIA_ARC);
    }

    // ============================================================================
    // Admin Functions
    // ============================================================================

    function setLocalPool(address _localPool) external onlyOwner {
        require(_localPool != address(0), "ZERO_ADDRESS");
        localPool = _localPool;
    }

    function setArcRouter(address _arcRouter) external onlyOwner {
        require(_arcRouter != address(0), "ZERO_ADDRESS");
        arcRouter = _arcRouter;
    }

    function setLZEndpoint(address _lzEndpoint) external onlyOwner {
        require(_lzEndpoint != address(0), "ZERO_ADDRESS");
        lzEndpoint = _lzEndpoint;
    }

    // ============================================================================
    // View Functions
    // ============================================================================

    function getSwapRequest(bytes32 requestId) external view returns (SwapRequest memory) {
        return pendingSwaps[requestId];
    }
}

