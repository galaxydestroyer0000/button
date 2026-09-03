// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/ButtonExperiment.sol";

contract ButtonExperimentTest is Test {
    address starter = address(0xB0770);
    address alice = address(0xA11CE);
    address bob = address(0xB0B);
    ButtonExperiment button;

    function setUp() public {
        button = new ButtonExperiment(starter);
    }

    function _start() internal {
        vm.prank(starter);
        button.start();
    }

    function testOnlyStarterCanStart() public {
        vm.expectRevert(ButtonExperiment.OnlyStarter.selector);
        button.start();
        _start();
        assertTrue(button.started());
    }

    function testStartOnlyOnce() public {
        _start();
        vm.prank(starter);
        vm.expectRevert(ButtonExperiment.AlreadyStarted.selector);
        button.start();
    }

    function testOnePressPerWalletAndReset() public {
        _start();
        uint256 t0 = block.timestamp;
        vm.warp(t0 + 10);
        vm.prank(alice);
        button.press();
        assertEq(button.pressRemaining(alice), 50);
        assertEq(button.deadline(), block.timestamp + 60);
        vm.prank(alice);
        vm.expectRevert(ButtonExperiment.AlreadyPressed.selector);
        button.press();
    }

    function testAllSixFactionBands() public {
        _start();
        address[6] memory users = [address(11),address(12),address(13),address(14),address(15),address(16)];
        uint8[6] memory remain = [uint8(55),50,35,25,15,5];
        uint8[6] memory expected = [uint8(1),2,3,4,5,6];
        for (uint256 i; i < users.length; i++) {
            vm.warp(button.deadline() - remain[i]);
            vm.prank(users[i]);
            button.press();
            assertEq(button.pressFaction(users[i]), expected[i]);
            assertEq(button.factionCounts(expected[i]), 1);
        }
    }

    function testBoundarySeconds() public {
        uint8[11] memory remain = [uint8(52),51,42,41,32,31,22,21,12,11,1];
        uint8[11] memory expected = [uint8(1),2,2,3,3,4,4,5,5,6,6];
        for (uint256 i; i < remain.length; i++) {
            ButtonExperiment b = new ButtonExperiment(address(this));
            b.start();
            vm.warp(b.deadline() - remain[i]);
            address user = address(uint160(100 + i));
            vm.prank(user);
            b.press();
            assertEq(b.pressFaction(user), expected[i]);
        }
    }

    function testPressAfterExpiryReverts() public {
        _start();
        vm.warp(button.deadline());
        vm.prank(alice);
        vm.expectRevert(ButtonExperiment.ExperimentEnded.selector);
        button.press();
    }

    function testFinalizeOnlyAfterExpiry() public {
        _start();
        vm.expectRevert(ButtonExperiment.ExperimentStillAlive.selector);
        button.finalize();
        vm.warp(button.deadline());
        button.finalize();
        assertTrue(button.finalized());
        assertEq(button.endedAt(), button.deadline());
    }

    function testClosestCallAndCounts() public {
        _start();
        vm.warp(button.deadline() - 18);
        vm.prank(alice);
        button.press();
        vm.warp(button.deadline() - 3);
        vm.prank(bob);
        button.press();
        assertEq(button.closestCall(), 3);
        assertEq(button.totalPresses(), 2);
        assertEq(button.factionCounts(button.ORANGE()), 1);
        assertEq(button.factionCounts(button.RED()), 1);
    }

    function testNearExpiryOrderingIsDeterministic() public {
        _start();
        vm.warp(button.deadline() - 1);
        vm.prank(alice);
        button.press();
        // Alice's ordered transaction reset the shared timer; Bob now sees the new state.
        vm.prank(bob);
        button.press();
        assertEq(button.totalPresses(), 2);
        assertEq(button.pressRemaining(alice), 1);
        assertEq(button.pressRemaining(bob), 60);
    }
}
