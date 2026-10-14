// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import {AjoCircle, IERC20} from "../src/AjoCircle.sol";
import {MockToken} from "../test/MockToken.sol";

/// Testnet: deploys a mock 6-decimal token and the circle contract. Mainnet uses real AUSD (set TOKEN).
contract Deploy is Script {
    function run() external {
        vm.startBroadcast(vm.envUint("DEPLOYER_PRIVATE_KEY"));
        address token = vm.envOr("TOKEN", address(0));
        if (token == address(0)) token = address(new MockToken());
        AjoCircle ajo = new AjoCircle(IERC20(token));
        vm.stopBroadcast();
        console.log("TOKEN", token);
        console.log("AJO", address(ajo));
    }
}
