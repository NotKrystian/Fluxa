// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title LiquidityVault
 * @notice Multi-chain liquidity vault that allows token developers to deposit liquidity
 *         while maintaining withdrawal rights. Governance controls strategy only.
 * @dev Vault mints shares representing proportional ownership. Developers can withdraw
 *      anytime by burning shares. Governance cannot prevent withdrawals or take funds.
 */
contract LiquidityVault is ERC20, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ============================================================================
    // State Variables
    // ============================================================================

    /// @notice The token being paired with USDC (e.g., the project token)
    address public immutable projectToken;

    /// @notice USDC token address
    address public immutable usdc;

    /// @notice Governance address with strategy control rights
    address public governance;

    /// @notice Pending governance for 2-step transfer
    address public pendingGovernance;

    /// @notice Factory that deployed this vault
    address public immutable factory;

    /// @notice Current strategy contract (if any)
    address public strategy;

    /// @notice Total project token deposited
    uint256 public totalProjectToken;

    /// @notice Total USDC deposited
    uint256 public totalUSDC;

    /// @notice Emergency pause flag (only stops new deposits, not withdrawals)
    bool public depositsPaused;

    /// @notice Minimum deposit amount to prevent dust
    uint256 public constant MIN_DEPOSIT = 1000; // 1000 wei minimum

    /// @notice Swap fee in basis points (e.g. 30 = 0.30%)
    uint24 public immutable swapFeeBps;

    /// @notice Protocol fee recipient (0x0 disables protocol fee)
    address public immutable protocolFeeRecipient;

    /// @notice Protocol fee share of swapFee in basis points
    uint24 public immutable protocolFeeShareBps;

    uint256 private constant BPS = 10_000;

    // ============================================================================
    // Events
    // ============================================================================

    event Deposited(
        address indexed depositor,
        uint256 projectTokenAmount,
        uint256 usdcAmount,
        uint256 sharesMinted
    );

    event Withdrawn(
        address indexed withdrawer,
        uint256 sharesBurned,
        uint256 projectTokenAmount,
        uint256 usdcAmount
    );

    event StrategyUpdated(address indexed oldStrategy, address indexed newStrategy);
    event GovernanceTransferred(address indexed previousGovernance, address indexed newGovernance);
    event DepositsPausedUpdated(bool paused);
    event LiquidityRebalanced(uint256 projectTokenMoved, uint256 usdcMoved);
    event Swap(
        address indexed sender,
        uint256 amount0In,
        uint256 amount1In,
        uint256 amount0Out,
        uint256 amount1Out,
        address indexed to
    );

    // ============================================================================
    // Errors
    // ============================================================================

    error OnlyGovernance();
    error OnlyFactory();
    error DepositsPaused();
    error InsufficientAmount();
    error InvalidAddress();
    error InvalidRatio();
    error InsufficientShares();
    error InsufficientLiquidity();
    error InsufficientOutput();
    error InvalidToken();

    // ============================================================================
    // Constructor
    // ============================================================================

    constructor(
        address _projectToken,
        address _usdc,
        address _governance,
        string memory _name,
        string memory _symbol,
        uint24 _swapFeeBps,
        address _protocolFeeRecipient,
        uint24 _protocolFeeShareBps
    ) ERC20(_name, _symbol) {
        if (_projectToken == address(0) || _usdc == address(0) || _governance == address(0)) {
            revert InvalidAddress();
        }
        require(_swapFeeBps < BPS, "FEE_TOO_HIGH");
        require(_protocolFeeShareBps <= BPS, "PROTOCOL_SHARE_TOO_HIGH");

        projectToken = _projectToken;
        usdc = _usdc;
        governance = _governance;
        factory = msg.sender;
        swapFeeBps = _swapFeeBps;
        protocolFeeRecipient = _protocolFeeRecipient;
        protocolFeeShareBps = _protocolFeeShareBps;
    }

    // ============================================================================
    // Modifiers
    // ============================================================================

    modifier onlyGovernance() {
        if (msg.sender != governance) revert OnlyGovernance();
        _;
    }

    modifier onlyFactory() {
        if (msg.sender != factory) revert OnlyFactory();
        _;
    }

    // ============================================================================
    // User Functions - CANNOT BE BLOCKED BY GOVERNANCE
    // ============================================================================

    /**
     * @notice Deposit liquidity and receive vault shares
     * @param projectTokenAmount Amount of project token to deposit
     * @param usdcAmount Amount of USDC to deposit
     * @param minShares Minimum shares to mint (slippage protection)
     * @return shares Amount of shares minted
     */
    function deposit(
        uint256 projectTokenAmount,
        uint256 usdcAmount,
        uint256 minShares
    ) external nonReentrant returns (uint256 shares) {
        if (depositsPaused) revert DepositsPaused();
        if (projectTokenAmount < MIN_DEPOSIT || usdcAmount < MIN_DEPOSIT) {
            revert InsufficientAmount();
        }

        // Calculate shares to mint
        uint256 _totalSupply = totalSupply();
        
        if (_totalSupply == 0) {
            // First deposit: shares = sqrt(projectToken * usdc)
            shares = _sqrt(projectTokenAmount * usdcAmount);
            if (shares == 0) revert InsufficientAmount();
        } else {
            // Subsequent deposits: maintain proportional ratio
            // shares = min(amount0 * supply / reserve0, amount1 * supply / reserve1)
            uint256 shares0 = (projectTokenAmount * _totalSupply) / totalProjectToken;
            uint256 shares1 = (usdcAmount * _totalSupply) / totalUSDC;
            shares = shares0 < shares1 ? shares0 : shares1;
        }

        if (shares < minShares) revert InsufficientShares();

        // Pull tokens from depositor
        IERC20(projectToken).safeTransferFrom(msg.sender, address(this), projectTokenAmount);
        IERC20(usdc).safeTransferFrom(msg.sender, address(this), usdcAmount);

        // Update totals
        totalProjectToken += projectTokenAmount;
        totalUSDC += usdcAmount;

        // Mint shares to depositor
        _mint(msg.sender, shares);

        emit Deposited(msg.sender, projectTokenAmount, usdcAmount, shares);

        return shares;
    }

    /**
     * @notice Withdraw liquidity by burning vault shares
     * @dev CANNOT BE BLOCKED BY GOVERNANCE - Users always have withdrawal rights
     * @param shares Amount of shares to burn
     * @param minProjectToken Minimum project token to receive (slippage protection)
     * @param minUsdc Minimum USDC to receive (slippage protection)
     * @return projectTokenAmount Amount of project token withdrawn
     * @return usdcAmount Amount of USDC withdrawn
     */
    function withdraw(
        uint256 shares,
        uint256 minProjectToken,
        uint256 minUsdc
    ) external nonReentrant returns (uint256 projectTokenAmount, uint256 usdcAmount) {
        if (shares == 0) revert InsufficientAmount();
        if (balanceOf(msg.sender) < shares) revert InsufficientShares();

        uint256 _totalSupply = totalSupply();

        // Calculate proportional amounts
        projectTokenAmount = (shares * totalProjectToken) / _totalSupply;
        usdcAmount = (shares * totalUSDC) / _totalSupply;

        if (projectTokenAmount < minProjectToken || usdcAmount < minUsdc) {
            revert InsufficientAmount();
        }

        // Update totals BEFORE transfers (CEI pattern)
        totalProjectToken -= projectTokenAmount;
        totalUSDC -= usdcAmount;

        // Burn shares
        _burn(msg.sender, shares);

        // Transfer tokens to withdrawer
        IERC20(projectToken).safeTransfer(msg.sender, projectTokenAmount);
        IERC20(usdc).safeTransfer(msg.sender, usdcAmount);

        emit Withdrawn(msg.sender, shares, projectTokenAmount, usdcAmount);

        return (projectTokenAmount, usdcAmount);
    }

    // ============================================================================
    // AMM Swap Functions - Vault functions as the liquidity pool
    // ============================================================================

    /**
     * @notice Swap tokens using constant product formula
     * @param tokenIn Address of input token
     * @param amountIn Amount of input token
     * @param amountOutMin Minimum amount of output token (slippage protection)
     * @param to Address to receive output tokens
     * @return amountOut Amount of output tokens received
     */
    function swap(
        address tokenIn,
        uint256 amountIn,
        uint256 amountOutMin,
        address to
    ) external nonReentrant returns (uint256 amountOut) {
        if (tokenIn != projectToken && tokenIn != usdc) revert InvalidToken();
        if (to == address(0)) revert InvalidAddress();
        if (amountIn == 0) revert InsufficientAmount();

        address tokenOut = tokenIn == projectToken ? usdc : projectToken;
        
        // Get current reserves
        uint256 reserveIn = tokenIn == projectToken ? totalProjectToken : totalUSDC;
        uint256 reserveOut = tokenIn == projectToken ? totalUSDC : totalProjectToken;

        if (reserveIn == 0 || reserveOut == 0) revert InsufficientLiquidity();

        // Apply swap fee
        uint256 amountInAfterFee = (amountIn * (BPS - swapFeeBps)) / BPS;
        
        // Calculate protocol fee
        uint256 protocolFee = 0;
        if (protocolFeeRecipient != address(0) && protocolFeeShareBps > 0) {
            uint256 totalFee = amountIn - amountInAfterFee;
            protocolFee = (totalFee * protocolFeeShareBps) / BPS;
        }

        // Constant product formula: (amountIn * reserveOut) / (reserveIn + amountIn)
        uint256 numerator = amountInAfterFee * reserveOut;
        uint256 denominator = reserveIn + amountInAfterFee;
        amountOut = numerator / denominator;

        if (amountOut < amountOutMin) revert InsufficientOutput();
        if (amountOut == 0) revert InsufficientOutput();

        // Transfer input token from user
        IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amountIn);

        // Transfer protocol fee if applicable
        if (protocolFee > 0) {
            IERC20(tokenIn).safeTransfer(protocolFeeRecipient, protocolFee);
        }

        // Update reserves
        if (tokenIn == projectToken) {
            totalProjectToken += amountInAfterFee;
            totalUSDC -= amountOut;
            if (totalUSDC < amountOut) revert InsufficientLiquidity();
        } else {
            totalUSDC += amountInAfterFee;
            totalProjectToken -= amountOut;
            if (totalProjectToken < amountOut) revert InsufficientLiquidity();
        }

        // Transfer output token to user
        IERC20(tokenOut).safeTransfer(to, amountOut);

        // Emit swap event
        if (tokenIn == projectToken) {
            emit Swap(msg.sender, amountIn, 0, 0, amountOut, to);
        } else {
            emit Swap(msg.sender, 0, amountIn, amountOut, 0, to);
        }

        return amountOut;
    }

    /**
     * @notice Get token addresses (for compatibility with pool interface)
     * @return token0 First token (projectToken)
     * @return token1 Second token (usdc)
     */
    function getTokens() external view returns (address token0, address token1) {
        return (projectToken, usdc);
    }

    // ============================================================================
    // Governance Functions - STRATEGY CONTROL ONLY
    // ============================================================================

    /**
     * @notice Set strategy contract that can manage liquidity
     * @dev Governance can update strategy but cannot prevent user withdrawals
     * @param newStrategy Address of new strategy contract
     */
    function setStrategy(address newStrategy) external onlyGovernance {
        address oldStrategy = strategy;
        strategy = newStrategy;
        emit StrategyUpdated(oldStrategy, newStrategy);
    }

    /**
     * @notice Approve tokens to strategy for liquidity management
     * @dev Only governance can call, but this doesn't affect user withdrawal rights
     * @param token Token to approve
     * @param amount Amount to approve
     */
    function approveStrategy(address token, uint256 amount) external onlyGovernance {
        if (strategy == address(0)) revert InvalidAddress();
        if (token != projectToken && token != usdc) revert InvalidAddress();
        
        // Use forceApprove for OpenZeppelin 5.x
        IERC20(token).safeIncreaseAllowance(strategy, amount);
    }

    /**
     * @notice Rebalance liquidity across chains or DEXes via strategy
     * @dev Governance manages allocation but cannot take user funds
     * @param data Encoded strategy call data
     */
    function rebalance(bytes calldata data) external onlyGovernance returns (bytes memory) {
        if (strategy == address(0)) revert InvalidAddress();
        
        // Record balances before
        uint256 projectTokenBefore = IERC20(projectToken).balanceOf(address(this));
        uint256 usdcBefore = IERC20(usdc).balanceOf(address(this));

        // Execute strategy
        (bool success, bytes memory returnData) = strategy.call(data);
        require(success, "Strategy call failed");

        // Record balances after
        uint256 projectTokenAfter = IERC20(projectToken).balanceOf(address(this));
        uint256 usdcAfter = IERC20(usdc).balanceOf(address(this));

        // Update totals if rebalancing changed amounts
        // (This can happen if strategy earned fees or moved liquidity)
        totalProjectToken = projectTokenAfter;
        totalUSDC = usdcAfter;

        emit LiquidityRebalanced(
            projectTokenAfter > projectTokenBefore ? projectTokenAfter - projectTokenBefore : 0,
            usdcAfter > usdcBefore ? usdcAfter - usdcBefore : 0
        );

        return returnData;
    }

    /**
     * @notice Pause new deposits (emergency only)
     * @dev Does NOT affect withdrawals - users can always withdraw
     * @param paused True to pause deposits, false to unpause
     */
    function setDepositsPaused(bool paused) external onlyGovernance {
        depositsPaused = paused;
        emit DepositsPausedUpdated(paused);
    }

    /**
     * @notice Transfer governance to new address (2-step process)
     * @param newGovernance Address of new governance
     */
    function transferGovernance(address newGovernance) external onlyGovernance {
        if (newGovernance == address(0)) revert InvalidAddress();
        pendingGovernance = newGovernance;
    }

    /**
     * @notice Accept governance transfer
     */
    function acceptGovernance() external {
        if (msg.sender != pendingGovernance) revert OnlyGovernance();
        address oldGovernance = governance;
        governance = pendingGovernance;
        pendingGovernance = address(0);
        emit GovernanceTransferred(oldGovernance, governance);
    }

    // ============================================================================
    // View Functions
    // ============================================================================

    /**
     * @notice Get the amount of tokens a user would receive for burning shares
     * @param shares Amount of shares
     * @return projectTokenAmount Amount of project token
     * @return usdcAmount Amount of USDC
     */
    function previewWithdraw(uint256 shares) 
        external 
        view 
        returns (uint256 projectTokenAmount, uint256 usdcAmount) 
    {
        if (shares == 0 || totalSupply() == 0) return (0, 0);
        
        uint256 _totalSupply = totalSupply();
        projectTokenAmount = (shares * totalProjectToken) / _totalSupply;
        usdcAmount = (shares * totalUSDC) / _totalSupply;
    }

    /**
     * @notice Get current reserves
     * @return projectTokenReserve Amount of project token in vault
     * @return usdcReserve Amount of USDC in vault
     */
    function getReserves() external view returns (uint256 projectTokenReserve, uint256 usdcReserve) {
        return (totalProjectToken, totalUSDC);
    }

    /**
     * @notice Calculate value of shares in terms of reserves
     * @param shares Amount of shares
     * @return value0 Value in terms of project token
     * @return value1 Value in terms of USDC
     */
    function shareValue(uint256 shares) external view returns (uint256 value0, uint256 value1) {
        uint256 _totalSupply = totalSupply();
        if (_totalSupply == 0) return (0, 0);
        
        value0 = (shares * totalProjectToken) / _totalSupply;
        value1 = (shares * totalUSDC) / _totalSupply;
    }

    // ============================================================================
    // Internal Functions
    // ============================================================================

    /**
     * @notice Square root function for initial share calculation
     * @param y Input value
     * @return z Square root of y
     */
    function _sqrt(uint256 y) internal pure returns (uint256 z) {
        if (y > 3) {
            z = y;
            uint256 x = y / 2 + 1;
            while (x < z) {
                z = x;
                x = (y / x + x) / 2;
            }
        } else if (y != 0) {
            z = 1;
        }
    }
}

