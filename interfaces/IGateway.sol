// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * Circle Gateway Wallet Interface
 * 
 * Gateway provides unified token custody across chains.
 * Users deposit tokens on one chain and can withdraw on any supported chain.
 * All Gateway operations must involve Arc (other chains ↔ Arc only).
 */

/**
 * Gateway Wallet interface for on-chain deposits
 */
interface IGatewayWallet {
    /**
     * Deposit tokens to Gateway (msg.sender becomes depositor)
     * @param token Token address to deposit
     * @param value Amount to deposit
     */
    function deposit(address token, uint256 value) external;

    /**
     * Deposit tokens to Gateway for a specific depositor
     * @param token Token address to deposit
     * @param depositor Address that will own the Gateway balance
     * @param value Amount to deposit
     */
    function depositFor(address token, address depositor, uint256 value) external;

    /**
     * Get total balance for a depositor and token
     * @param token Token address
     * @param depositor Depositor address
     * @return Total balance in Gateway
     */
    function totalBalance(address token, address depositor) external view returns (uint256);

    /**
     * Get available balance for a depositor and token (not locked)
     * @param token Token address
     * @param depositor Depositor address
     * @return Available balance in Gateway
     */
    function availableBalance(address token, address depositor) external view returns (uint256);
}

/**
 * Gateway API interface (for backend integration)
 * Note: This is a reference interface - actual Gateway API is REST-based
 */
interface IGatewayAPI {
    /**
     * Deposit operation (handled via API)
     * Creates a deposit request that must be fulfilled on-chain
     */
    struct DepositRequest {
        string blockchain;      // Source chain
        address tokenAddress;   // Token to deposit
        uint256 amount;         // Amount to deposit
        address destinationAddress; // Depositor address
    }

    /**
     * Withdrawal operation (handled via API)
     * Mints tokens on destination chain via Gateway API
     */
    struct WithdrawalRequest {
        string blockchain;      // Destination chain
        address tokenAddress;   // Token to withdraw
        uint256 amount;         // Amount to withdraw
        address destinationAddress; // Recipient on destination
        address sourceAddress;  // Depositor address
    }
}

