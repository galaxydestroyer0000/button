// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/ButtonExperiment.sol";

contract StartButtonExperiment is Script {
    function run() external {
        uint256 key = vm.envUint("PRIVATE_KEY");
        address target = vm.envAddress("BUTTON_CONTRACT");
        vm.startBroadcast(key);
        ButtonExperiment(target).start();
        vm.stopBroadcast();
    }
}
