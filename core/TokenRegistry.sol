// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title TokenRegistry
 * @notice Source of truth for cross-chain token mappings and vault addresses
 * @dev Only registered tokens can be moved via Gateway or swapped via Router
 */
contract TokenRegistry {
    // ============================================================================
    // Structures
    // ============================================================================

    struct TokenInfo {
        bool registered;
        string symbol;
        string name;
        uint8 decimals;
        address vaultAddress; // LiquidityVault for this token on this chain
    }

    struct ChainInfo {
        uint32 chainId;
        bool active;
        address gatewayWallet; // Circle Gateway wallet on this chain
        string rpcUrl; // For off-chain indexing
    }

    // ============================================================================
    // State Variables
    // ============================================================================

    /// @notice Governance address with registry management rights
    address public governance;

    /// @notice Pending governance for 2-step transfer
    address public pendingGovernance;

    /// @notice Mapping: tokenId => chainId => TokenInfo
    /// @dev tokenId is a unique identifier (e.g., keccak256("FLX"))
    mapping(bytes32 => mapping(uint32 => TokenInfo)) public tokens;

    /// @notice Mapping: chainId => ChainInfo
    mapping(uint32 => ChainInfo) public chains;

    /// @notice List of all registered token IDs
    bytes32[] public tokenIds;

    /// @notice List of all registered chain IDs
    uint32[] public chainIds;

    /// @notice Mapping to track if tokenId is in array
    mapping(bytes32 => bool) private _tokenIdExists;

    /// @notice Mapping to track if chainId is in array
    mapping(uint32 => bool) private _chainIdExists;

    // ============================================================================
    // Events
    // ============================================================================

    event TokenRegistered(
        bytes32 indexed tokenId,
        uint32 indexed chainId,
        address tokenAddress,
        address vaultAddress,
        string symbol
    );

    event TokenUnregistered(
        bytes32 indexed tokenId,
        uint32 indexed chainId
    );

    event VaultUpdated(
        bytes32 indexed tokenId,
        uint32 indexed chainId,
        address oldVault,
        address newVault
    );

    event ChainRegistered(
        uint32 indexed chainId,
        address gatewayWallet
    );

    event ChainUpdated(
        uint32 indexed chainId,
        bool active,
        address gatewayWallet
    );

    event GovernanceTransferred(
        address indexed previousGovernance,
        address indexed newGovernance
    );

    // ============================================================================
    // Errors
    // ============================================================================

    error OnlyGovernance();
    error TokenNotRegistered();
    error TokenAlreadyRegistered();
    error ChainNotActive();
    error InvalidAddress();
    error InvalidChainId();

    // ============================================================================
    // Constructor
    // ============================================================================

    constructor() {
        governance = msg.sender;
    }

    // ============================================================================
    // Modifiers
    // ============================================================================

    modifier onlyGovernance() {
        if (msg.sender != governance) revert OnlyGovernance();
        _;
    }

    // ============================================================================
    // Governance Functions
    // ============================================================================

    /**
     * @notice Register a new chain
     * @param chainId Chain ID (e.g., 97 for BSC Testnet)
     * @param gatewayWallet Circle Gateway wallet address on this chain
     * @param rpcUrl RPC URL for off-chain services
     */
    function registerChain(
        uint32 chainId,
        address gatewayWallet,
        string calldata rpcUrl
    ) external onlyGovernance {
        if (chainId == 0) revert InvalidChainId();

        chains[chainId] = ChainInfo({
            chainId: chainId,
            active: true,
            gatewayWallet: gatewayWallet,
            rpcUrl: rpcUrl
        });

        if (!_chainIdExists[chainId]) {
            chainIds.push(chainId);
            _chainIdExists[chainId] = true;
        }

        emit ChainRegistered(chainId, gatewayWallet);
    }

    /**
     * @notice Update chain configuration
     * @param chainId Chain ID to update
     * @param active Whether chain is active
     * @param gatewayWallet New gateway wallet address
     */
    function updateChain(
        uint32 chainId,
        bool active,
        address gatewayWallet
    ) external onlyGovernance {
        if (chains[chainId].chainId == 0) revert InvalidChainId();
        
        chains[chainId].active = active;
        if (gatewayWallet != address(0)) {
            chains[chainId].gatewayWallet = gatewayWallet;
        }

        emit ChainUpdated(chainId, active, gatewayWallet);
    }

    /**
     * @notice Register a token on a specific chain
     * @param tokenId Unique identifier (e.g., keccak256("FLX"))
     * @param chainId Chain ID where token exists
     * @param tokenAddress ERC20 contract address on this chain
     * @param vaultAddress LiquidityVault address for this token on this chain
     * @param symbol Token symbol
     * @param name Token name
     * @param decimals Token decimals
     */
    function registerToken(
        bytes32 tokenId,
        uint32 chainId,
        address tokenAddress,
        address vaultAddress,
        string calldata symbol,
        string calldata name,
        uint8 decimals
    ) external onlyGovernance {
        if (tokenAddress == address(0)) revert InvalidAddress();
        if (!chains[chainId].active) revert ChainNotActive();
        if (tokens[tokenId][chainId].registered) revert TokenAlreadyRegistered();

        tokens[tokenId][chainId] = TokenInfo({
            registered: true,
            symbol: symbol,
            name: name,
            decimals: decimals,
            vaultAddress: vaultAddress
        });

        // Add to tokenIds array if new
        if (!_tokenIdExists[tokenId]) {
            tokenIds.push(tokenId);
            _tokenIdExists[tokenId] = true;
        }

        emit TokenRegistered(tokenId, chainId, tokenAddress, vaultAddress, symbol);
    }

    /**
     * @notice Update vault address for a registered token
     * @param tokenId Token identifier
     * @param chainId Chain ID
     * @param newVaultAddress New vault address
     */
    function updateVault(
        bytes32 tokenId,
        uint32 chainId,
        address newVaultAddress
    ) external onlyGovernance {
        if (!tokens[tokenId][chainId].registered) revert TokenNotRegistered();

        address oldVault = tokens[tokenId][chainId].vaultAddress;
        tokens[tokenId][chainId].vaultAddress = newVaultAddress;

        emit VaultUpdated(tokenId, chainId, oldVault, newVaultAddress);
    }

    /**
     * @notice Unregister a token on a specific chain
     * @param tokenId Token identifier
     * @param chainId Chain ID
     */
    function unregisterToken(
        bytes32 tokenId,
        uint32 chainId
    ) external onlyGovernance {
        if (!tokens[tokenId][chainId].registered) revert TokenNotRegistered();

        delete tokens[tokenId][chainId];
        emit TokenUnregistered(tokenId, chainId);
    }

    /**
     * @notice Transfer governance (2-step)
     * @param newGovernance New governance address
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
     * @notice Check if a token is registered on a chain
     * @param tokenId Token identifier
     * @param chainId Chain ID
     * @return bool True if registered
     */
    function isTokenRegistered(bytes32 tokenId, uint32 chainId) external view returns (bool) {
        return tokens[tokenId][chainId].registered;
    }

    /**
     * @notice Get token info on a specific chain
     * @param tokenId Token identifier
     * @param chainId Chain ID
     * @return info TokenInfo struct
     */
    function getTokenInfo(bytes32 tokenId, uint32 chainId) 
        external 
        view 
        returns (TokenInfo memory info) 
    {
        if (!tokens[tokenId][chainId].registered) revert TokenNotRegistered();
        return tokens[tokenId][chainId];
    }

    /**
     * @notice Get vault address for a token on a chain
     * @param tokenId Token identifier
     * @param chainId Chain ID
     * @return vaultAddress Vault address
     */
    function getVault(bytes32 tokenId, uint32 chainId) 
        external 
        view 
        returns (address vaultAddress) 
    {
        if (!tokens[tokenId][chainId].registered) revert TokenNotRegistered();
        return tokens[tokenId][chainId].vaultAddress;
    }

    /**
     * @notice Get Gateway wallet for a chain
     * @param chainId Chain ID
     * @return gatewayWallet Gateway wallet address
     */
    function getGatewayWallet(uint32 chainId) 
        external 
        view 
        returns (address gatewayWallet) 
    {
        if (!chains[chainId].active) revert ChainNotActive();
        return chains[chainId].gatewayWallet;
    }

    /**
     * @notice Get all chains where a token is registered
     * @param tokenId Token identifier
     * @return registeredChainIds Array of chain IDs
     */
    function getTokenChains(bytes32 tokenId) 
        external 
        view 
        returns (uint32[] memory registeredChainIds) 
    {
        uint256 count = 0;
        
        // First pass: count registered chains
        for (uint256 i = 0; i < chainIds.length; i++) {
            if (tokens[tokenId][chainIds[i]].registered) {
                count++;
            }
        }

        // Second pass: populate array
        registeredChainIds = new uint32[](count);
        uint256 index = 0;
        for (uint256 i = 0; i < chainIds.length; i++) {
            if (tokens[tokenId][chainIds[i]].registered) {
                registeredChainIds[index] = chainIds[i];
                index++;
            }
        }

        return registeredChainIds;
    }

    /**
     * @notice Get all registered tokens
     * @return Array of token IDs
     */
    function getAllTokens() external view returns (bytes32[] memory) {
        return tokenIds;
    }

    /**
     * @notice Get all registered chains
     * @return Array of chain IDs
     */
    function getAllChains() external view returns (uint32[] memory) {
        return chainIds;
    }

    /**
     * @notice Helper to create token ID from symbol
     * @param symbol Token symbol (e.g., "FLX")
     * @return tokenId bytes32 identifier
     */
    function getTokenId(string calldata symbol) external pure returns (bytes32) {
        return keccak256(abi.encodePacked(symbol));
    }
}

