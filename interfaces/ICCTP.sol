// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * Circle Cross-Chain Transfer Protocol (CCTP) Interfaces
 * 
 * CCTP enables native USDC transfers across chains via burn-and-mint mechanism.
 * All transfers must involve Arc (other chains ↔ Arc only).
 */

/**
 * TokenMessenger interface for burning USDC on source chain
 */
interface ITokenMessenger {
    /**
     * Burn USDC and emit message for minting on destination chain
     * @param amount Amount of USDC to burn
     * @param destinationDomain CCTP domain ID of destination chain
     * @param mintRecipient 32-byte address of recipient on destination chain
     * @param burnToken Address of USDC token to burn
     * @return nonce Message nonce
     */
    function depositForBurn(
        uint256 amount,
        uint32 destinationDomain,
        bytes32 mintRecipient,
        address burnToken
    ) external returns (uint64 nonce);

    /**
     * Burn USDC with hook support (CCTP V2)
     * @param amount Amount of USDC to burn
     * @param destinationDomain CCTP domain ID of destination chain
     * @param mintRecipient 32-byte address of recipient on destination chain
     * @param burnToken Address of USDC token to burn
     * @param destinationCaller Address that will call receiveMessage on destination
     * @param maxFee Maximum fee for fast burn
     * @param minFinalityThreshold Minimum finality blocks required
     * @param hookData Additional data for destination hook
     * @return nonce Message nonce
     */
    function depositForBurnWithHook(
        uint256 amount,
        uint32 destinationDomain,
        bytes32 mintRecipient,
        address burnToken,
        bytes32 destinationCaller,
        uint256 maxFee,
        uint32 minFinalityThreshold,
        bytes calldata hookData
    ) external returns (uint64 nonce);
}

/**
 * MessageTransmitter interface for receiving and minting USDC on destination chain
 */
interface IMessageTransmitter {
    /**
     * Receive CCTP message and mint USDC on destination chain
     * @param message Serialized message from source chain
     * @param attestation Attestation signature from Circle
     */
    function receiveMessage(
        bytes memory message,
        bytes memory attestation
    ) external;

    /**
     * Get the local domain (Arc's CCTP domain ID)
     */
    function localDomain() external view returns (uint32);
}

/**
 * Events emitted by TokenMessenger
 */
interface ITokenMessengerEvents {
    event DepositForBurn(
        uint64 indexed nonce,
        address indexed burnToken,
        uint256 amount,
        address indexed depositor,
        bytes32 mintRecipient,
        uint32 destinationDomain,
        bytes32 destinationTokenMessenger
    );
}

/**
 * Events emitted by MessageTransmitter
 */
interface IMessageTransmitterEvents {
    event MessageReceived(
        bytes32 indexed messageHash,
        uint256 indexed nonce,
        bytes32 sourceDomain,
        bytes32 destinationDomain
    );
}

