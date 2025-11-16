// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title ArcExecutionHub
 * @notice Internal execution hub on Arc for better swap prices
 * 
 * This contract runs on Arc and executes swaps for users on other chains.
 * Users never interact with this directly - it's purely internal routing.
 * 
 * Flow:
 * 1. Receives swap request from external chain via LayerZero
 * 2. Executes swap using Arc's deep liquidity pools
 * 3. Sends result back to origin chain via LayerZero
 * 4. Origin chain credits user (user never sees Arc)
 */
contract ArcExecutionHub is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ============================================================================
    // State Variables
    // ============================================================================

    /// @notice Arc AMM Pool for executing swaps
    address public arcPool;

    /// @notice LayerZero Endpoint
    address public lzEndpoint;

    /// @notice Mapping: origin chain ID => router address on that chain
    mapping(uint32 => address) public remoteRouters;

    /// @notice Pending executions (requestId => Execution)
    mapping(bytes32 => Execution) public pendingExecutions;

    // ============================================================================
    // Structs
    // ============================================================================

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

    struct Execution {
        uint32 originChainId;
        address originRouter;
        address user;
        address tokenOut;
        uint256 minAmountOut;
        bool completed;
    }

    // ============================================================================
    // Events
    // ============================================================================

    event SwapReceived(
        bytes32 indexed requestId,
        uint32 indexed originChainId,
        address indexed user,
        address tokenIn,
        address tokenOut,
        uint256 amountIn
    );

    event SwapExecuted(
        bytes32 indexed requestId,
        address tokenOut,
        uint256 amountOut
    );

    event ResultSent(
        bytes32 indexed requestId,
        uint32 indexed destinationChainId,
        address indexed user,
        uint256 amountOut
    );

    // ============================================================================
    // Constructor
    // ============================================================================

    constructor(
        address _arcPool,
        address _lzEndpoint
    ) Ownable(msg.sender) {
        require(_arcPool != address(0), "ZERO_POOL");
        require(_lzEndpoint != address(0), "ZERO_ENDPOINT");
        
        arcPool = _arcPool;
        lzEndpoint = _lzEndpoint;
    }

    // ============================================================================
    // LayerZero Receive (Internal Routing)
    // ============================================================================

    /**
     * @notice Receive swap request from external chain via LayerZero
     * @dev This would be called by LayerZero's lzReceive callback
     * @param _srcChainId Origin chain ID
     * @param _srcAddress Origin router address
     * @param _nonce LayerZero nonce
     * @param _payload Encoded RoutePlan
     */
    function lzReceive(
        uint16 _srcChainId,
        bytes calldata _srcAddress,
        uint64 _nonce,
        bytes calldata _payload
    ) external {
        // In production, verify this is called by LayerZero endpoint
        // require(msg.sender == lzEndpoint, "ONLY_LZ");
        
        // Verify sender is a known router
        address srcRouter = _bytesToAddress(_srcAddress);
        require(remoteRouters[uint32(_srcChainId)] == srcRouter, "UNKNOWN_ROUTER");

        // Decode RoutePlan
        RoutePlan memory plan = abi.decode(_payload, (RoutePlan));

        // Store execution
        pendingExecutions[plan.requestId] = Execution({
            originChainId: plan.userChainId,
            originRouter: srcRouter,
            user: plan.user,
            tokenOut: plan.tokenOut,
            minAmountOut: plan.minAmountOut,
            completed: false
        });

        emit SwapReceived(
            plan.requestId,
            plan.userChainId,
            plan.user,
            plan.tokenIn,
            plan.tokenOut,
            plan.amountIn
        );

        // Execute swap on Arc
        _executeSwap(plan);
    }

    /**
     * @notice Execute swap on Arc using deep liquidity pools
     */
    function _executeSwap(RoutePlan memory plan) internal {
        // At this point, tokens should already be on Arc:
        // - If tokenIn is USDC: received via CCTP
        // - If tokenIn is FLX: received via Gateway wrapping
        
        // Execute swap on Arc pool
        IERC20 tokenIn = IERC20(plan.tokenIn);
        IERC20 tokenOut = IERC20(plan.tokenOut);

        // Approve pool
        tokenIn.approve(arcPool, plan.amountIn);

        // Execute swap
        (bool success, bytes memory data) = arcPool.call(
            abi.encodeWithSignature(
                "swap(address,address,uint256,uint256,address)",
                plan.tokenIn,
                plan.tokenOut,
                plan.amountIn,
                plan.minAmountOut,
                address(this) // Receive result here
            )
        );

        require(success, "SWAP_FAILED");
        
        uint256 amountOut = abi.decode(data, (uint256));
        require(amountOut >= plan.minAmountOut, "SLIPPAGE");

        Execution storage exec = pendingExecutions[plan.requestId];
        exec.completed = true;

        emit SwapExecuted(plan.requestId, plan.tokenOut, amountOut);

        // Send result back to origin chain
        _sendResultBack(plan.requestId, plan.userChainId, plan.user, plan.tokenOut, amountOut);
    }

    /**
     * @notice Send swap result back to origin chain via LayerZero
     */
    function _sendResultBack(
        bytes32 requestId,
        uint32 destinationChainId,
        address user,
        address tokenOut,
        uint256 amountOut
    ) internal {
        // Encode result message
        bytes memory payload = abi.encode(
            requestId,
            tokenOut,
            amountOut
        );

        // Send via LayerZero
        // In production, use LayerZero SDK:
        // lzEndpoint.send(
        //     destinationChainId,
        //     abi.encodePacked(remoteRouters[destinationChainId]),
        //     payload,
        //     payable(address(this)),
        //     address(0),
        //     bytes("")
        // );

        emit ResultSent(requestId, destinationChainId, user, amountOut);
    }

    // ============================================================================
    // Admin Functions
    // ============================================================================

    function setRemoteRouter(uint32 chainId, address router) external onlyOwner {
        require(router != address(0), "ZERO_ADDRESS");
        remoteRouters[chainId] = router;
    }

    function setArcPool(address _arcPool) external onlyOwner {
        require(_arcPool != address(0), "ZERO_ADDRESS");
        arcPool = _arcPool;
    }

    // ============================================================================
    // Helper Functions
    // ============================================================================

    function _bytesToAddress(bytes calldata _bytes) internal pure returns (address) {
        require(_bytes.length >= 20, "INVALID_ADDRESS");
        address addr;
        assembly {
            addr := calldataload(_bytes.offset)
        }
        return addr;
    }
}

