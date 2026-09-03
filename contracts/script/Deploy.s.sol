// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/ButtonExperiment.sol";

contract DeployButtonExperiment is Script {
    function run() external returns (ButtonExperiment deployed) {
        uint256 key = vm.envUint("PRIVATE_KEY");
        address starter = vm.addr(key);
        vm.startBroadcast(key);
        deployed = new ButtonExperiment(starter);
        vm.stopBroadcast();
    }
}
