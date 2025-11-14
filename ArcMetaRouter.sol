// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * ArcMetaRouter v0
 *
 * Single entrypoint for:
 * - Local USDC/EURC payments on Arc
 * - CCTP-based cross-chain USDC transfers
 * - Circle Gateway deposits (unified USDC balance)
 *
 * NOTE:
 * - You MUST plug in the correct addresses for:
 *   - USDC / EURC on Arc
 *   - TokenMessenger (CCTP) on Arc
 *   - GatewayWallet on Arc
 * - Function signatures for TokenMessenger may need slight adjustment
 *   based on the exact CCTP version deployed on Arc.
 */

interface IERC20 {
    function totalSupply() external view returns (uint256);
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
    function allowance(address owner, address spender) external view returns (uint256);
    function approve(address spender, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

/**
 * Minimal interface for CCTP TokenMessenger on EVM.
 * Check the exact ABI for the Arc deployment and tweak as needed.
 *
 * Docs reference (EVM): https://developers.circle.com/cctp/evm-smart-contracts
 */
interface ITokenMessenger {
    function depositForBurn(
        uint256 amount,
        uint32 destinationDomain,
        bytes32 mintRecipient,
        address burnToken
    ) external returns (uint64);

    // V2 with hook & fast features – adjust if needed
    function depositForBurnWithHook(
        uint256 amount,
        uint32 destinationDomain,
        bytes32 mintRecipient,
        address burnToken,
        bytes32 destinationCaller,
        uint256 maxFee,
        uint32 minFinalityThreshold,
        bytes calldata hookData
    ) external returns (uint64);
}

/**
 * Minimal Circle Gateway Wallet interface.
 * Docs: https://developers.circle.com/gateway/references/contract-interfaces-and-events
 */
interface IGatewayWallet {
    function deposit(address token, uint256 value) external;
    function depositFor(address token, address depositor, uint256 value) external;

    function totalBalance(address token, address depositor) external view returns (uint256);
    function availableBalance(address token, address depositor) external view returns (uint256);
}

/**
 * Simple Ownable – you can replace with OZ's Ownable if you like.
 */
abstract contract Ownable {
    address public owner;

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    constructor() {
        owner = msg.sender;
        emit OwnershipTransferred(address(0), msg.sender);
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "NOT_OWNER");
        _;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "ZERO_ADDR");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }
}

contract ArcMetaRouter is Ownable {
    using SafeTransfer for IERC20;

    enum RouteKind {
        LOCAL,      // on-Arc transfers/escrow/etc.
        CCTP,       // CCTP bridge via TokenMessenger
        GATEWAY     // Circle Gateway Wallet deposit
    }

    // Tokens
    IERC20 public immutable USDC;
    IERC20 public immutable EURC;

    // CCTP
    ITokenMessenger public tokenMessenger;

    // Circle Gateway
    IGatewayWallet public gatewayWallet;

    // Optional fee config (in bps, i.e. 100 = 1%)
    uint16 public feeBps; // global fee applied to routed amount
    address public feeCollector;

    // ==== Events ====

    event LocalPayment(
        address indexed payer,
        address indexed recipient,
        address indexed token,
        uint256 amount,
        bytes32 paymentId
    );

    event CCTPTransferInitiated(
        address indexed payer,
        address indexed token,
        uint256 amount,
        uint32 destinationDomain,
        bytes32 mintRecipient,
        uint64 nonce,
        bytes hookData
    );

    event GatewayDeposit(
        address indexed payer,
        address indexed depositor,
        address indexed token,
        uint256 amount
    );

    event FeeUpdated(uint16 feeBps, address feeCollector);
    event TokenMessengerUpdated(address tokenMessenger);
    event GatewayWalletUpdated(address gatewayWallet);

    constructor(
        address _usdc,
        address _eurc,
        address _tokenMessenger,
        address _gatewayWallet,
        uint16 _feeBps,
        address _feeCollector
    ) {
        require(_usdc != address(0), "USDC_ZERO");
        require(_eurc != address(0), "EURC_ZERO");
        require(_feeCollector != address(0), "FEE_COLLECTOR_ZERO");

        USDC = IERC20(_usdc);
        EURC = IERC20(_eurc);
        tokenMessenger = ITokenMessenger(_tokenMessenger);
        gatewayWallet = IGatewayWallet(_gatewayWallet);
        feeBps = _feeBps;
        feeCollector = _feeCollector;

        emit FeeUpdated(_feeBps, _feeCollector);
        emit TokenMessengerUpdated(_tokenMessenger);
        emit GatewayWalletUpdated(_gatewayWallet);
    }

    // ========= Admin setters =========

    function setFeeConfig(uint16 _feeBps, address _feeCollector) external onlyOwner {
        require(_feeCollector != address(0), "FEE_COLLECTOR_ZERO");
        require(_feeBps <= 1_000, "FEE_TOO_HIGH"); // cap at 10% for safety
        feeBps = _feeBps;
        feeCollector = _feeCollector;
        emit FeeUpdated(_feeBps, _feeCollector);
    }

    function setTokenMessenger(address _tokenMessenger) external onlyOwner {
        require(_tokenMessenger != address(0), "ZERO_ADDR");
        tokenMessenger = ITokenMessenger(_tokenMessenger);
        emit TokenMessengerUpdated(_tokenMessenger);
    }

    function setGatewayWallet(address _gatewayWallet) external onlyOwner {
        require(_gatewayWallet != address(0), "ZERO_ADDR");
        gatewayWallet = IGatewayWallet(_gatewayWallet);
        emit GatewayWalletUpdated(_gatewayWallet);
    }

    // ========= Core Routing =========

    /**
     * Local transfer on Arc with optional paymentId for business logic.
     * This is the basic primitive you'll call for on-chain settlement flows.
     */
    function payLocal(
        address token,
        address recipient,
        uint256 amount,
        bytes32 paymentId
    ) external {
        require(recipient != address(0), "RECIPIENT_ZERO");
        require(amount > 0, "AMOUNT_ZERO");
        _checkSupportedToken(token);

        IERC20 erc20 = IERC20(token);

        (uint256 netAmount, uint256 fee) = _collectAndTakeFee(erc20, amount);

        if (fee > 0) {
            erc20.safeTransfer(feeCollector, fee);
        }

        erc20.safeTransfer(recipient, netAmount);

        emit LocalPayment(msg.sender, recipient, token, netAmount, paymentId);
    }

    /**
     * CCTP route: burns USDC on Arc and emits a cross-chain message
     * to mint on destination chain.
     *
     * Frontend / backend should be using Bridge Kit to discover domains,
     * do quoting, etc. – this contract just wraps the onchain interaction.
     *
     * @param destinationDomain CCTP destination domain ID (NOT EVM chainId)
     * @param mintRecipient     32-byte recipient address on destination chain
     * @param amount            amount of USDC to send (pre-fee)
     * @param useHook           true to use depositForBurnWithHook, false to use depositForBurn
     * @param destinationCaller optional destination caller (if using hook)
     * @param maxFee            max fee for fast burn (CCTP V2, if enabled)
     * @param minFinality       min finality threshold (CCTP V2)
     * @param hookData          arbitrary hook payload to deliver to destination
     */
    function routeCCTP(
        uint32 destinationDomain,
        bytes32 mintRecipient,
        uint256 amount,
        bool useHook,
        bytes32 destinationCaller,
        uint256 maxFee,
        uint32 minFinality,
        bytes calldata hookData
    ) external returns (uint64 nonce) {
        require(amount > 0, "AMOUNT_ZERO");
        require(mintRecipient != bytes32(0), "MINT_RECIPIENT_ZERO");

        IERC20 token = USDC; // for now we assume USDC only; EURC could be added if/when supported

        (uint256 netAmount, uint256 fee) = _collectAndTakeFee(token, amount);

        if (fee > 0) {
            token.safeTransfer(feeCollector, fee);
        }

        // Approve TokenMessenger to burn netAmount USDC
        token.safeApprove(address(tokenMessenger), 0); // reset
        token.safeApprove(address(tokenMessenger), netAmount);

        if (useHook) {
            nonce = tokenMessenger.depositForBurnWithHook(
                netAmount,
                destinationDomain,
                mintRecipient,
                address(token),
                destinationCaller,
                maxFee,
                minFinality,
                hookData
            );
        } else {
            nonce = tokenMessenger.depositForBurn(
                netAmount,
                destinationDomain,
                mintRecipient,
                address(token)
            );
        }

        emit CCTPTransferInitiated(
            msg.sender,
            address(token),
            netAmount,
            destinationDomain,
            mintRecipient,
            nonce,
            hookData
        );
    }

    /**
     * Gateway route: deposit USDC (or EURC if supported) into Circle Gateway Wallet.
     *
     * This establishes / tops up the user's unified balance in Gateway.
     * Your backend then uses the Gateway API to mint on destination chains.
     */
    function routeGatewayDeposit(
        address token,
        uint256 amount,
        address depositor,
        bool useDepositFor
    ) external {
        require(amount > 0, "AMOUNT_ZERO");
        _checkSupportedToken(token);
        if (depositor == address(0)) depositor = msg.sender;

        IERC20 erc20 = IERC20(token);

        (uint256 netAmount, uint256 fee) = _collectAndTakeFee(erc20, amount);

        if (fee > 0) {
            erc20.safeTransfer(feeCollector, fee);
        }

        // Approve GatewayWallet to take tokens
        erc20.safeApprove(address(gatewayWallet), 0);
        erc20.safeApprove(address(gatewayWallet), netAmount);

        if (useDepositFor) {
            gatewayWallet.depositFor(token, depositor, netAmount);
        } else {
            // depositor is ignored in this branch; msg.sender becomes depositor in Gateway
            gatewayWallet.deposit(token, netAmount);
        }

        emit GatewayDeposit(msg.sender, depositor, token, netAmount);
    }

    // ========= Views / helpers =========

    function previewFee(uint256 amount) public view returns (uint256) {
        if (feeBps == 0) return 0;
        return (amount * feeBps) / 10_000;
    }

    function _collectAndTakeFee(IERC20 token, uint256 amount)
        internal
        returns (uint256 netAmount, uint256 fee)
    {
        fee = previewFee(amount);
        netAmount = amount - fee;

        token.safeTransferFrom(msg.sender, address(this), amount);
    }

    function _checkSupportedToken(address token) internal view {
        require(
            token == address(USDC) || token == address(EURC),
            "UNSUPPORTED_TOKEN"
        );
    }
}

/**
 * Lightweight SafeTransfer library to avoid full OZ dependency.
 * If you’re already using OZ, replace with SafeERC20.
 */
library SafeTransfer {
    function safeTransfer(IERC20 token, address to, uint256 value) internal {
        bool ok = token.transfer(to, value);
        require(ok, "TRANSFER_FAILED");
    }

    function safeTransferFrom(IERC20 token, address from, address to, uint256 value) internal {
        bool ok = token.transferFrom(from, to, value);
        require(ok, "TRANSFER_FROM_FAILED");
    }

    function safeApprove(IERC20 token, address spender, uint256 value) internal {
        bool ok = token.approve(spender, value);
        require(ok, "APPROVE_FAILED");
    }
}