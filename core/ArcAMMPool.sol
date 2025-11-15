// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title ArcAMMPool
/// @notice Constant-product AMM pool for two ERC20 tokens.
/// @dev LP tokens are this contract's ERC20; deploy via ArcAMMFactory.
contract ArcAMMPool is ERC20, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice Address of the AMM factory that deployed this pool
    address public immutable factory;

    /// @notice First token in the pair (sorted by address)
    address public immutable token0;

    /// @notice Second token in the pair (sorted by address)
    address public immutable token1;

    /// @notice Current reserves (amounts of token0 and token1)
    uint112 private reserve0;
    uint112 private reserve1;

    /// @notice Swap fee in basis points (e.g. 30 = 0.30%)
    uint24 public immutable swapFeeBps;

    /// @notice Optional protocol fee recipient (0x0 disables protocol fee)
    address public immutable protocolFeeRecipient;

    /// @notice Protocol fee share of swapFee in basis points (e.g. 1667 of 10000 = 16.67% of swap fee)
    uint24 public immutable protocolFeeShareBps;

    uint256 private constant MINIMUM_LIQUIDITY = 10**3;
    uint256 private constant BPS = 10_000;

    // -----------------------------------------------------------------------
    // Events
    // -----------------------------------------------------------------------

    event Mint(address indexed sender, uint256 amount0, uint256 amount1, uint256 liquidity);
    event Burn(address indexed sender, uint256 amount0, uint256 amount1, address indexed to);
    event Swap(
        address indexed sender,
        uint256 amount0In,
        uint256 amount1In,
        uint256 amount0Out,
        uint256 amount1Out,
        address indexed to
    );
    event Sync(uint112 reserve0, uint112 reserve1);

    // -----------------------------------------------------------------------
    // Constructor
    // -----------------------------------------------------------------------

    /// @param _tokenA First token (unsorted)
    /// @param _tokenB Second token (unsorted)
    /// @param _swapFeeBps Total swap fee in BPS (1e4 = 100%)
    /// @param _protocolFeeRecipient Address receiving protocol fees (can be address(0))
    /// @param _protocolFeeShareBps Share of swapFee that goes to protocol in BPS (of BPS)
    constructor(
        address _tokenA,
        address _tokenB,
        uint24 _swapFeeBps,
        address _protocolFeeRecipient,
        uint24 _protocolFeeShareBps
    ) ERC20("Arc AMM LP", "ARC-LP") {
        require(_tokenA != _tokenB, "IDENTICAL_ADDRESSES");
        require(_tokenA != address(0) && _tokenB != address(0), "ZERO_ADDRESS");
        require(_swapFeeBps < BPS, "FEE_TOO_HIGH");
        require(_protocolFeeShareBps <= BPS, "PROTOCOL_SHARE_TOO_HIGH");

        factory = msg.sender;

        (address _token0, address _token1) = _tokenA < _tokenB
            ? (_tokenA, _tokenB)
            : (_tokenB, _tokenA);

        token0 = _token0;
        token1 = _token1;
        swapFeeBps = _swapFeeBps;
        protocolFeeRecipient = _protocolFeeRecipient;
        protocolFeeShareBps = _protocolFeeShareBps;
    }

    // -----------------------------------------------------------------------
    // Modifiers
    // -----------------------------------------------------------------------

    modifier onlyFactory() {
        require(msg.sender == factory, "ONLY_FACTORY");
        _;
    }

    // -----------------------------------------------------------------------
    // Pool views
    // -----------------------------------------------------------------------

    /// @notice Returns the current reserves of token0 and token1
    function getReserves() external view returns (uint112 _reserve0, uint112 _reserve1) {
        _reserve0 = reserve0;
        _reserve1 = reserve1;
    }

    /// @notice Returns the sorted tokens (token0, token1) for convenience
    function getTokens() external view returns (address, address) {
        return (token0, token1);
    }

    // -----------------------------------------------------------------------
    // Internal helpers
    // -----------------------------------------------------------------------

    function _updateReserves(uint256 balance0, uint256 balance1) private {
        require(balance0 <= type(uint112).max && balance1 <= type(uint112).max, "OVERFLOW");
        reserve0 = uint112(balance0);
        reserve1 = uint112(balance1);
        emit Sync(reserve0, reserve1);
    }

    function _mintProtocolFee(uint256 liquidity) private {
        if (protocolFeeRecipient == address(0) || protocolFeeShareBps == 0) return;
        if (liquidity == 0) return;

        uint256 protocolLiquidity = (liquidity * protocolFeeShareBps) / BPS;
        if (protocolLiquidity > 0) {
            _mint(protocolFeeRecipient, protocolLiquidity);
        }
    }

    // -----------------------------------------------------------------------
    // Liquidity management
    // -----------------------------------------------------------------------

    /// @notice Add liquidity to the pool
    /// @param amount0Desired Desired amount of token0 to deposit
    /// @param amount1Desired Desired amount of token1 to deposit
    /// @param amount0Min Minimum amount of token0 that must be used (slippage protection)
    /// @param amount1Min Minimum amount of token1 that must be used (slippage protection)
    /// @param to Recipient of LP tokens
    /// @return liquidity Amount of LP tokens minted
    /// @return amount0 Actual amount of token0 deposited
    /// @return amount1 Actual amount of token1 deposited
    function addLiquidity(
        uint256 amount0Desired,
        uint256 amount1Desired,
        uint256 amount0Min,
        uint256 amount1Min,
        address to
    )
        external
        nonReentrant
        returns (uint256 liquidity, uint256 amount0, uint256 amount1)
    {
        require(to != address(0), "ZERO_TO");
        require(amount0Desired > 0 && amount1Desired > 0, "INSUFFICIENT_INPUT");

        (uint112 _reserve0, uint112 _reserve1) = (reserve0, reserve1);
        IERC20 _token0 = IERC20(token0);
        IERC20 _token1 = IERC20(token1);

        if (_reserve0 == 0 && _reserve1 == 0) {
            // First liquidity sets the initial price; take desired amounts as-is
            amount0 = amount0Desired;
            amount1 = amount1Desired;
        } else {
            // Enforce ratio to keep price consistent with current reserves
            uint256 amount1Optimal = (amount0Desired * _reserve1) / _reserve0;
            if (amount1Optimal <= amount1Desired) {
                require(amount1Optimal >= amount1Min, "INSUFFICIENT_AMOUNT1");
                amount0 = amount0Desired;
                amount1 = amount1Optimal;
            } else {
                uint256 amount0Optimal = (amount1Desired * _reserve0) / _reserve1;
                require(amount0Optimal >= amount0Min, "INSUFFICIENT_AMOUNT0");
                amount0 = amount0Optimal;
                amount1 = amount1Desired;
            }
        }

        // Pull tokens in
        _token0.safeTransferFrom(msg.sender, address(this), amount0);
        _token1.safeTransferFrom(msg.sender, address(this), amount1);

        // Compute liquidity to mint
        uint256 _totalSupply = totalSupply();
        if (_totalSupply == 0) {
            liquidity = _sqrt(amount0 * amount1) - MINIMUM_LIQUIDITY;
            // lock minimum liquidity forever (use address(1) instead of address(0) for OZ 5.x)
            _mint(address(1), MINIMUM_LIQUIDITY);
        } else {
            liquidity = _min(
                (amount0 * _totalSupply) / _reserve0,
                (amount1 * _totalSupply) / _reserve1
            );
        }

        require(liquidity > 0, "INSUFFICIENT_LIQUIDITY_MINTED");

        // Mint protocol fee (if configured) and LP shares
        _mintProtocolFee(liquidity);
        _mint(to, liquidity);

        // Update reserves to new balances
        uint256 balance0 = _token0.balanceOf(address(this));
        uint256 balance1 = _token1.balanceOf(address(this));
        _updateReserves(balance0, balance1);

        emit Mint(msg.sender, amount0, amount1, liquidity);
    }

    /// @notice Remove liquidity from the pool
    /// @param liquidity Amount of LP tokens to burn
    /// @param amount0Min Minimum amount of token0 expected
    /// @param amount1Min Minimum amount of token1 expected
    /// @param to Recipient of tokens
    /// @return amount0 Amount of token0 withdrawn
    /// @return amount1 Amount of token1 withdrawn
    function removeLiquidity(
        uint256 liquidity,
        uint256 amount0Min,
        uint256 amount1Min,
        address to
    ) external nonReentrant returns (uint256 amount0, uint256 amount1) {
        require(to != address(0), "ZERO_TO");
        require(liquidity > 0, "ZERO_LIQUIDITY");

        (uint112 _reserve0, uint112 _reserve1) = (reserve0, reserve1);
        IERC20 _token0 = IERC20(token0);
        IERC20 _token1 = IERC20(token1);

        uint256 _totalSupply = totalSupply();

        // burn LP
        _burn(msg.sender, liquidity);

        amount0 = (liquidity * _reserve0) / _totalSupply;
        amount1 = (liquidity * _reserve1) / _totalSupply;
        require(amount0 >= amount0Min, "INSUFFICIENT_AMOUNT0");
        require(amount1 >= amount1Min, "INSUFFICIENT_AMOUNT1");

        // send tokens
        _token0.safeTransfer(to, amount0);
        _token1.safeTransfer(to, amount1);

        // update reserves
        uint256 balance0 = _token0.balanceOf(address(this));
        uint256 balance1 = _token1.balanceOf(address(this));
        _updateReserves(balance0, balance1);

        emit Burn(msg.sender, amount0, amount1, to);
    }

    // -----------------------------------------------------------------------
    // Swapping
    // -----------------------------------------------------------------------

    /**
     * @notice Swap an exact amountIn of tokenIn for tokenOut.
     * @dev This overload is used by ArcMetaRouter. It assumes `amountIn` of tokenIn
     *      has already been transferred into this pool (e.g. by the router).
     *      The function computes the constant-product output amount with fees
     *      and sends tokenOut to `to`.
     */
    function swap(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        address to
    ) external nonReentrant returns (uint256 amountOut) {
        require(to != address(0), "ZERO_TO");
        require(amountIn > 0, "INSUFFICIENT_INPUT");

        bool zeroForOne;
        if (tokenIn == token0 && tokenOut == token1) {
            zeroForOne = true;
        } else if (tokenIn == token1 && tokenOut == token0) {
            zeroForOne = false;
        } else {
            revert("INVALID_PAIR");
        }

        (uint112 _reserve0, uint112 _reserve1) = (reserve0, reserve1);
        require(_reserve0 > 0 && _reserve1 > 0, "NO_LIQUIDITY");

        IERC20 inToken = zeroForOne ? IERC20(token0) : IERC20(token1);
        IERC20 outToken = zeroForOne ? IERC20(token1) : IERC20(token0);

        uint256 reserveIn = zeroForOne ? _reserve0 : _reserve1;
        uint256 reserveOut = zeroForOne ? _reserve1 : _reserve0;

        // Optional sanity check: this pool should have at least reserveIn + amountIn of tokenIn
        uint256 balanceIn = inToken.balanceOf(address(this));
        require(balanceIn >= reserveIn + amountIn, "INPUT_NOT_RECEIVED");

        // Apply fee on the input amount
        uint256 amountInAfterFee = (amountIn * (BPS - swapFeeBps)) / BPS;

        // Constant product formula: dy = (dx' * y) / (x + dx'), where dx' is after-fee
        amountOut = (amountInAfterFee * reserveOut) / (reserveIn + amountInAfterFee);
        require(amountOut > 0 && amountOut < reserveOut, "INSUFFICIENT_OUTPUT");

        // Transfer out tokenOut to recipient
        outToken.safeTransfer(to, amountOut);

        // Update reserves based on current balances
        uint256 balance0 = IERC20(token0).balanceOf(address(this));
        uint256 balance1 = IERC20(token1).balanceOf(address(this));
        _updateReserves(balance0, balance1);

        // Emit Swap event with directional in/out
        uint256 amount0In = zeroForOne ? amountIn : 0;
        uint256 amount1In = zeroForOne ? 0 : amountIn;
        uint256 amount0Out = zeroForOne ? 0 : amountOut;
        uint256 amount1Out = zeroForOne ? amountOut : 0;

        emit Swap(msg.sender, amount0In, amount1In, amount0Out, amount1Out, to);
    }

    /// @notice Swap between token0 and token1
    /// @param amount0Out Amount of token0 to send out (can be 0)
    /// @param amount1Out Amount of token1 to send out (can be 0)
    /// @param to Recipient of output tokens
    function swap(
        uint256 amount0Out,
        uint256 amount1Out,
        address to
    ) external nonReentrant {
        require(amount0Out > 0 || amount1Out > 0, "INSUFFICIENT_OUTPUT");
        require(to != address(0), "ZERO_TO");

        (uint112 _reserve0, uint112 _reserve1) = (reserve0, reserve1);
        require(amount0Out < _reserve0 && amount1Out < _reserve1, "INSUFFICIENT_LIQUIDITY");

        IERC20 _token0 = IERC20(token0);
        IERC20 _token1 = IERC20(token1);

        // optimistic transfer out
        if (amount0Out > 0) _token0.safeTransfer(to, amount0Out);
        if (amount1Out > 0) _token1.safeTransfer(to, amount1Out);

        // compute balances after transfer out & user sending in
        uint256 balance0 = _token0.balanceOf(address(this));
        uint256 balance1 = _token1.balanceOf(address(this));

        uint256 amount0In = balance0 > (_reserve0 - amount0Out)
            ? balance0 - (_reserve0 - amount0Out)
            : 0;
        uint256 amount1In = balance1 > (_reserve1 - amount1Out)
            ? balance1 - (_reserve1 - amount1Out)
            : 0;

        require(amount0In > 0 || amount1In > 0, "INSUFFICIENT_INPUT");

        // apply fee to input side(s)
        {
            uint256 _swapFeeBps = swapFeeBps;
            uint256 amount0InAfterFee = amount0In > 0
                ? (amount0In * (BPS - _swapFeeBps)) / BPS
                : 0;
            uint256 amount1InAfterFee = amount1In > 0
                ? (amount1In * (BPS - _swapFeeBps)) / BPS
                : 0;

            // constant product check: (reserve0 + inAfterFee0 - out0) * (reserve1 + inAfterFee1 - out1) >= reserve0 * reserve1
            uint256 balance0Adjusted = _reserve0 + amount0InAfterFee - amount0Out;
            uint256 balance1Adjusted = _reserve1 + amount1InAfterFee - amount1Out;
            require(
                balance0Adjusted * balance1Adjusted >= uint256(_reserve0) * uint256(_reserve1),
                "K"
            );
        }

        // update reserves
        _updateReserves(balance0, balance1);

        emit Swap(msg.sender, amount0In, amount1In, amount0Out, amount1Out, to);
    }

    // -----------------------------------------------------------------------
    // Factory hooks (optional, extend later)
    // -----------------------------------------------------------------------

    /// @notice Hook for factory to skim accidentally sent tokens
    function skim(address to) external onlyFactory nonReentrant {
        IERC20 _token0 = IERC20(token0);
        IERC20 _token1 = IERC20(token1);

        uint256 balance0 = _token0.balanceOf(address(this));
        uint256 balance1 = _token1.balanceOf(address(this));

        if (balance0 > reserve0) {
            _token0.safeTransfer(to, balance0 - reserve0);
        }
        if (balance1 > reserve1) {
            _token1.safeTransfer(to, balance1 - reserve1);
        }
    }

    /// @notice Force reserves sync in case of fee-on-transfer tokens, etc.
    function sync() external nonReentrant {
        IERC20 _token0 = IERC20(token0);
        IERC20 _token1 = IERC20(token1);
        _updateReserves(_token0.balanceOf(address(this)), _token1.balanceOf(address(this)));
    }

    // -----------------------------------------------------------------------
    // Math utils
    // -----------------------------------------------------------------------

    function _min(uint256 x, uint256 y) private pure returns (uint256) {
        return x < y ? x : y;
    }

    function _sqrt(uint256 y) private pure returns (uint256 z) {
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
        // else z = 0
    }
}