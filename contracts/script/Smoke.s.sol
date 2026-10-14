// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import {AjoCircle} from "../src/AjoCircle.sol";
import {MockToken} from "../test/MockToken.sol";

/// Testnet smoke: mint, approve, open a 2-person circle as the deployer.
contract Smoke is Script {
    function run() external {
        AjoCircle ajo = AjoCircle(vm.envAddress("AJO"));
        MockToken tok = MockToken(vm.envAddress("TOKEN"));
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address me = vm.addr(pk);
        vm.startBroadcast(pk);
        tok.mint(me, 100e6);
        tok.approve(address(ajo), type(uint256).max);
        uint256 id = ajo.createCircle(1e6, 2, 60);
        vm.stopBroadcast();
        console.log("circle", id);
    }
}
