// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../../src/ButtonExperiment.sol";

/// @notice Bounded, no-revert action surface for Foundry's invariant fuzzer to drive.
/// @dev Every handler function guards its own preconditions and no-ops instead of
///      reverting, so a fuzzing campaign explores real state transitions instead of
///      wasting runs on expected reverts. Ghost state here lets the invariant test
///      contract assert properties the contract's own storage doesn't directly expose,
///      such as "a wallet's successful-press count never exceeds one".
contract ButtonExperimentHandler is Test {
    ButtonExperiment public immutable button;
    address public immutable starter;

    uint256 public constant ACTOR_COUNT = 12;

    mapping(address => uint256) public ghostSuccessfulPresses;
    uint256 public ghostTotalSuccessfulPresses;
    bool public ghostEverStarted;
    bool public ghostEverEnded;
    uint256 public ghostSuccessfulResets;

    constructor(ButtonExperiment button_, address starter_) {
        button = button_;
        starter = starter_;
    }

    /// @notice Deterministically maps a fuzzer-supplied seed to one of a fixed set of
    ///         actor addresses, so the fuzzer can repeatedly select the same wallets
    ///         (a small, bounded set) instead of an unbounded universe of addresses.
    function actor(uint256 seed) public pure returns (address) {
        return address(uint160(uint256(keccak256(abi.encode("actor", seed % ACTOR_COUNT)))));
    }

    function handler_start() external {
        if (button.started()) return;
        vm.prank(starter);
        button.start();
        ghostEverStarted = true;
    }

    function handler_press(uint256 actorSeed) external {
        if (!button.started()) return;
        if (!button.isAlive()) return;

        address a = actor(actorSeed);
        if (button.hasPressed(a)) return;

        vm.prank(a);
        button.press();

        ghostSuccessfulPresses[a] += 1;
        ghostTotalSuccessfulPresses += 1;
    }

    /// @notice Deliberately callable at ANY point, including after the experiment has
    ///         already ended — the fuzzer trying this exact sequence is what makes
    ///         `invariant_EndedExperimentNeverReactivates` a real test of resetTimer()'s
    ///         "never revives a dead experiment" guarantee, not just of press()'s.
    function handler_resetTimer() external {
        if (!button.started()) return;

        vm.prank(starter);
        try button.resetTimer() {
            ghostSuccessfulResets += 1;
        } catch {
            // Expected once !isAlive() — resetTimer() must revert, not revive.
        }
    }

    function handler_finalize() external {
        if (!button.started()) return;
        if (button.finalized()) return;
        if (button.isAlive()) return;

        button.finalize();
        ghostEverEnded = true;
    }

    /// @notice Advances time by a bounded amount so the fuzzer can explore expiry,
    ///         not just instantaneous action sequences.
    function handler_warp(uint256 secondsForward) external {
        uint256 delta = bound(secondsForward, 0, 180);
        vm.warp(block.timestamp + delta);
        if (button.started() && !button.isAlive()) {
            ghostEverEnded = true;
        }
    }
}
