// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";

/// Sends 2 MON from the deployer to DRIP_ADDR (the testnet gas drip wallet).
contract Fund is Script {
    function run() external {
        vm.startBroadcast(vm.envUint("DEPLOYER_PRIVATE_KEY"));
        (bool ok,) = payable(vm.envAddress("DRIP_ADDR")).call{value: 2 ether}("");
        require(ok);
        vm.stopBroadcast();
    }
}
