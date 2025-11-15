// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ArcAMMPool} from "./ArcAMMPool.sol";

/// @title ArcAMMFactory
/// @notice Factory for creating Arc AMM pool contracts for token pairs.
/// @dev Creates ArcAMMPool instances with configurable swap fees and protocol fee settings.
contract ArcAMMFactory {
    /// @notice Address that receives protocol fees from pools.
    address public feeTo;

    /// @notice Address that can change feeTo and feeToSetter.
    address public feeToSetter;

    /// @notice Default swap fee in basis points (e.g. 30 = 0.30%)
    uint24 public defaultSwapFeeBps;

    /// @notice Default protocol fee share in basis points (e.g. 1667 = 16.67% of swap fee)
    uint24 public defaultProtocolFeeShareBps;

    /// @notice tokenA => tokenB => pool address mapping.
    mapping(address => mapping(address => address)) public getPair;

    /// @notice List of all created pool addresses.
    address[] public allPairs;

    /// @notice Emitted when a new pool is created.
    event PairCreated(
        address indexed token0,
        address indexed token1,
        address pair,
        uint256 index
    );

    /// @notice Emitted when the fee recipient is updated.
    event FeeToUpdated(address indexed newFeeTo);

    /// @notice Emitted when the feeToSetter is updated.
    event FeeToSetterUpdated(address indexed newFeeToSetter);

    /// @notice Emitted when default fee parameters are updated.
    event DefaultFeesUpdated(uint24 swapFeeBps, uint24 protocolFeeShareBps);

    /// @param _feeToSetter The initial address with permission to update fee settings.
    /// @param _defaultSwapFeeBps Default swap fee for new pools (in basis points)
    /// @param _defaultProtocolFeeShareBps Default protocol fee share for new pools
    constructor(
        address _feeToSetter,
        uint24 _defaultSwapFeeBps,
        uint24 _defaultProtocolFeeShareBps
    ) {
        require(_feeToSetter != address(0), "ArcAMMFactory: ZERO_ADDRESS");
        require(_defaultSwapFeeBps < 10_000, "ArcAMMFactory: FEE_TOO_HIGH");
        require(_defaultProtocolFeeShareBps <= 10_000, "ArcAMMFactory: PROTOCOL_SHARE_TOO_HIGH");
        
        feeToSetter = _feeToSetter;
        defaultSwapFeeBps = _defaultSwapFeeBps;
        defaultProtocolFeeShareBps = _defaultProtocolFeeShareBps;
    }

    // ========= VIEW FUNCTIONS =========

    /// @notice Returns the number of pools created by this factory.
    function allPairsLength() external view returns (uint256) {
        return allPairs.length;
    }

    /// @notice Convenience getter to comply with IArcAMMFactory used by ArcMetaRouter.
    /// @dev Returns the pool address for a token pair, or address(0) if none exists.
    function getPool(address tokenA, address tokenB) external view returns (address) {
        return getPair[tokenA][tokenB];
    }

    // ========= CORE LOGIC =========

    /// @notice Create a new AMM pool for two tokens with default fee settings.
    /// @param tokenA The first token address.
    /// @param tokenB The second token address.
    /// @return pair The address of the newly created pool.
    function createPair(
        address tokenA,
        address tokenB
    ) external returns (address pair) {
        return createPairWithFees(
            tokenA,
            tokenB,
            defaultSwapFeeBps,
            defaultProtocolFeeShareBps
        );
    }

    /// @notice Create a new AMM pool for two tokens with custom fee settings.
    /// @param tokenA The first token address.
    /// @param tokenB The second token address.
    /// @param swapFeeBps Custom swap fee in basis points.
    /// @param protocolFeeShareBps Custom protocol fee share in basis points.
    /// @return pair The address of the newly created pool.
    function createPairWithFees(
        address tokenA,
        address tokenB,
        uint24 swapFeeBps,
        uint24 protocolFeeShareBps
    ) public returns (address pair) {
        require(tokenA != tokenB, "ArcAMMFactory: IDENTICAL_ADDRESSES");
        require(
            tokenA != address(0) && tokenB != address(0),
            "ArcAMMFactory: ZERO_ADDRESS"
        );

        (address token0, address token1) = _sortTokens(tokenA, tokenB);
        require(
            getPair[token0][token1] == address(0),
            "ArcAMMFactory: PAIR_EXISTS"
        );

        // Deploy ArcAMMPool
        ArcAMMPool pool = new ArcAMMPool(
            token0,
            token1,
            swapFeeBps,
            feeTo, // protocol fee recipient
            protocolFeeShareBps
        );

        pair = address(pool);

        getPair[token0][token1] = pair;
        getPair[token1][token0] = pair; // convenience lookup

        allPairs.push(pair);
        emit PairCreated(token0, token1, pair, allPairs.length - 1);
    }

    // ========= FEE MANAGEMENT =========

    /// @notice Set the fee recipient address.
    /// @param _feeTo The new fee recipient.
    function setFeeTo(address _feeTo) external {
        require(msg.sender == feeToSetter, "ArcAMMFactory: FORBIDDEN");
        feeTo = _feeTo;
        emit FeeToUpdated(_feeTo);
    }

    /// @notice Set the feeToSetter address.
    /// @param _feeToSetter The new feeToSetter.
    function setFeeToSetter(address _feeToSetter) external {
        require(msg.sender == feeToSetter, "ArcAMMFactory: FORBIDDEN");
        require(_feeToSetter != address(0), "ArcAMMFactory: ZERO_ADDRESS");
        feeToSetter = _feeToSetter;
        emit FeeToSetterUpdated(_feeToSetter);
    }

    /// @notice Update default fee parameters for new pools.
    /// @param _defaultSwapFeeBps New default swap fee in basis points.
    /// @param _defaultProtocolFeeShareBps New default protocol fee share.
    function setDefaultFees(
        uint24 _defaultSwapFeeBps,
        uint24 _defaultProtocolFeeShareBps
    ) external {
        require(msg.sender == feeToSetter, "ArcAMMFactory: FORBIDDEN");
        require(_defaultSwapFeeBps < 10_000, "ArcAMMFactory: FEE_TOO_HIGH");
        require(_defaultProtocolFeeShareBps <= 10_000, "ArcAMMFactory: PROTOCOL_SHARE_TOO_HIGH");
        
        defaultSwapFeeBps = _defaultSwapFeeBps;
        defaultProtocolFeeShareBps = _defaultProtocolFeeShareBps;
        emit DefaultFeesUpdated(_defaultSwapFeeBps, _defaultProtocolFeeShareBps);
    }

    // ========= INTERNAL HELPERS =========

    /// @dev Returns sorted token addresses (token0 < token1).
    function _sortTokens(
        address tokenA,
        address tokenB
    ) internal pure returns (address token0, address token1) {
        require(tokenA != tokenB, "ArcAMMFactory: IDENTICAL_ADDRESSES");
        (token0, token1) = tokenA < tokenB
            ? (tokenA, tokenB)
            : (tokenB, tokenA);
    }
}
