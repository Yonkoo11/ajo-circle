// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// Test and testnet stand-in for AUSD (6 decimals). AUSD has no code on Monad testnet.
contract MockToken {
    string public constant symbol = "AUSD";
    uint8 public constant decimals = 6;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amt) external { balanceOf[to] += amt; }
    function approve(address s, uint256 amt) external returns (bool) { allowance[msg.sender][s] = amt; return true; }
    function transfer(address to, uint256 amt) external returns (bool) { balanceOf[msg.sender] -= amt; balanceOf[to] += amt; return true; }
    function transferFrom(address f, address t, uint256 amt) public virtual returns (bool) {
        allowance[f][msg.sender] -= amt; balanceOf[f] -= amt; balanceOf[t] += amt; return true;
    }
}
