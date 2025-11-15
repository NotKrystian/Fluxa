// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {LiquidityVault} from "./LiquidityVault.sol";

/**
 * @title VaultFactory
 * @notice Factory for deploying LiquidityVault contracts across multiple chains
 * @dev Maintains registry of all vaults and provides deterministic addressing
 */
contract VaultFactory {
    // ============================================================================
    // State Variables
    // ============================================================================

    /// @notice Governance address with deployment rights
    address public governance;

    /// @notice Pending governance for 2-step transfer
    address public pendingGovernance;

    /// @notice USDC token address on this chain
    address public immutable usdc;

    /// @notice Mapping of projectToken => vault address
    mapping(address => address) public getVault;

    /// @notice Array of all vaults
    address[] public allVaults;

    /// @notice Fee recipient for protocol fees
    address public feeRecipient;

    /// @notice Protocol fee in basis points (e.g., 10 = 0.1%)
    uint256 public protocolFeeBps;

    /// @notice Swap fee in basis points for vaults (e.g., 30 = 0.30%)
    uint24 public swapFeeBps;

    // ============================================================================
    // Events
    // ============================================================================

    event VaultCreated(
        address indexed projectToken,
        address indexed vault,
        uint256 index
    );

    event GovernanceTransferred(
        address indexed previousGovernance,
        address indexed newGovernance
    );

    event FeeRecipientUpdated(address indexed newFeeRecipient);
    event ProtocolFeeUpdated(uint256 newFeeBps);

    // ============================================================================
    // Errors
    // ============================================================================

    error OnlyGovernance();
    error VaultExists();
    error InvalidAddress();
    error FeeTooHigh();

    // ============================================================================
    // Constructor
    // ============================================================================

    constructor(address _usdc, address _feeRecipient, uint24 _swapFeeBps) {
        if (_usdc == address(0) || _feeRecipient == address(0)) {
            revert InvalidAddress();
        }

        governance = msg.sender;
        usdc = _usdc;
        feeRecipient = _feeRecipient;
        protocolFeeBps = 10; // 0.1% default
        swapFeeBps = _swapFeeBps; // Default 30 (0.30%)
    }

    // ============================================================================
    // Modifiers
    // ============================================================================

    modifier onlyGovernance() {
        if (msg.sender != governance) revert OnlyGovernance();
        _;
    }

    // ============================================================================
    // Core Functions
    // ============================================================================

    /**
     * @notice Create a new liquidity vault for a project token
     * @param projectToken Address of the project token
     * @param name Name for the vault shares token
     * @param symbol Symbol for the vault shares token
     * @return vault Address of the newly created vault
     */
    function createVault(
        address projectToken,
        string memory name,
        string memory symbol
    ) external returns (address vault) {
        if (projectToken == address(0) || projectToken == usdc) {
            revert InvalidAddress();
        }

        if (getVault[projectToken] != address(0)) {
            revert VaultExists();
        }

        // Deploy new vault (vault functions as both vault and AMM pool)
        vault = address(new LiquidityVault(
            projectToken,
            usdc,
            governance,
            name,
            symbol,
            swapFeeBps,
            feeRecipient,
            uint24(protocolFeeBps)
        ));

        // Register vault
        getVault[projectToken] = vault;
        allVaults.push(vault);

        emit VaultCreated(projectToken, vault, allVaults.length - 1);

        return vault;
    }

    /**
     * @notice Get total number of vaults
     * @return count Number of vaults created
     */
    function allVaultsLength() external view returns (uint256) {
        return allVaults.length;
    }

    /**
     * @notice Get vault info by index
     * @param index Index in allVaults array
     * @return vault Address of vault
     * @return projectToken Address of project token
     */
    function getVaultByIndex(uint256 index) external view returns (address vault, address projectToken) {
        vault = allVaults[index];
        projectToken = LiquidityVault(vault).projectToken();
    }

    // ============================================================================
    // Governance Functions
    // ============================================================================

    /**
     * @notice Set fee recipient address
     * @param newFeeRecipient New fee recipient
     */
    function setFeeRecipient(address newFeeRecipient) external onlyGovernance {
        if (newFeeRecipient == address(0)) revert InvalidAddress();
        feeRecipient = newFeeRecipient;
        emit FeeRecipientUpdated(newFeeRecipient);
    }

    /**
     * @notice Set protocol fee
     * @param newFeeBps New fee in basis points
     */
    function setProtocolFee(uint256 newFeeBps) external onlyGovernance {
        if (newFeeBps > 1000) revert FeeTooHigh(); // Max 10%
        protocolFeeBps = newFeeBps;
        emit ProtocolFeeUpdated(newFeeBps);
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
}

