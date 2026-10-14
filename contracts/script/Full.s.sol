// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import {AjoCircle} from "../src/AjoCircle.sol";
import {MockToken} from "../test/MockToken.sol";

/// Testnet end-to-end: two members, two rounds. PHASE=1 sets up and pays round 1; PHASE=2 closes it and pays round 2; PHASE=3 closes and withdraws.
contract Full is Script {
    function run() external {
        AjoCircle ajo = AjoCircle(vm.envAddress("AJO"));
        MockToken tok = MockToken(vm.envAddress("TOKEN"));
        uint256 pkA = vm.envUint("DEPLOYER_PRIVATE_KEY");
        uint256 pkB = uint256(keccak256("ajo-e2e-second-member"));
        address a = vm.addr(pkA);
        address b = vm.addr(pkB);
        uint256 phase = vm.envUint("PHASE");
        uint256 id;
        if (phase == 1) {
            vm.startBroadcast(pkA);
            payable(b).transfer(0.1 ether);
            tok.mint(a, 100e6);
            tok.approve(address(ajo), type(uint256).max);
            id = ajo.createCircle(1e6, 2, 240);
            vm.stopBroadcast();
            vm.startBroadcast(pkB);
            tok.mint(b, 100e6);
            tok.approve(address(ajo), type(uint256).max);
            ajo.join(id);
            vm.stopBroadcast();
            console.log("circle", id);
        } else {
            id = vm.envUint("ID");
        }
        if (phase == 1 || phase == 2) {
            if (phase == 2) {
                vm.startBroadcast(pkA);
                ajo.closeRound(id);
                vm.stopBroadcast();
            }
            vm.startBroadcast(pkA);
            ajo.pay(id);
            vm.stopBroadcast();
            vm.startBroadcast(pkB);
            ajo.pay(id);
            vm.stopBroadcast();
        } else {
            vm.startBroadcast(pkA);
            ajo.closeRound(id);
            ajo.withdrawCollateral(id);
            vm.stopBroadcast();
            vm.startBroadcast(pkB);
            ajo.withdrawCollateral(id);
            vm.stopBroadcast();
        }
        console.log("A", tok.balanceOf(a));
        console.log("B", tok.balanceOf(b));
    }
}
