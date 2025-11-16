// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title WrappedToken
 * @notice ERC20 token representing wrapped version of a token from another chain
 * @dev Only the Gateway contract can mint/burn these tokens
 */
contract WrappedToken is ERC20, Ownable {
    /// @notice Gateway contract that can mint/burn tokens
    address public gateway;

    /// @notice Original chain ID where real tokens are locked
    uint32 public immutable originChainId;

    /// @notice Original token address on origin chain
    address public immutable originToken;

    constructor(
        string memory name,
        string memory symbol,
        uint32 _originChainId,
        address _originToken
    ) ERC20(name, symbol) Ownable(msg.sender) {
        originChainId = _originChainId;
        originToken = _originToken;
    }

    function setGateway(address _gateway) external onlyOwner {
        require(_gateway != address(0), "ZERO_ADDRESS");
        gateway = _gateway;
    }

    function mint(address to, uint256 amount) external {
        require(msg.sender == gateway, "ONLY_GATEWAY");
        _mint(to, amount);
    }

    function burn(address from, uint256 amount) external {
        require(msg.sender == gateway, "ONLY_GATEWAY");
        _burn(from, amount);
    }
}

