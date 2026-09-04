// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/ButtonExperiment.sol";
import "./handlers/ButtonExperimentHandler.sol";

/// @notice Stateful fuzz (invariant) tests proving the experiment's core guarantees
///         hold under any sequence of start/press/warp/finalize actions the fuzzer
///         can construct via the bounded, no-revert handler.
contract ButtonExperimentInvariantTest is Test {
    address starter = address(0xB0770);
    ButtonExperiment button;
    ButtonExperimentHandler handler;

    uint256 private _lastTotalPresses;

    function setUp() public {
        button = new ButtonExperiment(starter);
        handler = new ButtonExperimentHandler(button, starter);

        targetContract(address(handler));

        bytes4[] memory selectors = new bytes4[](5);
        selectors[0] = ButtonExperimentHandler.handler_start.selector;
        selectors[1] = ButtonExperimentHandler.handler_press.selector;
        selectors[2] = ButtonExperimentHandler.handler_finalize.selector;
        selectors[3] = ButtonExperimentHandler.handler_warp.selector;
        selectors[4] = ButtonExperimentHandler.handler_resetTimer.selector;
        targetSelector(FuzzSelector({addr: address(handler), selectors: selectors}));
    }

    /// @notice totalPresses must never go down, call to call, across any sequence of
    ///         actions the fuzzer constructs.
    function invariant_TotalPressesNeverDecreases() public {
        uint256 current = button.totalPresses();
        assertGe(current, _lastTotalPresses);
        _lastTotalPresses = current;
    }

    /// @notice totalPresses must always equal the handler's independently-tracked
    ///         count of successful presses — it can be inflated by nothing else.
    function invariant_TotalPressesMatchesSuccessfulPressGhost() public view {
        assertEq(button.totalPresses(), handler.ghostTotalSuccessfulPresses());
    }

    /// @notice No wallet can ever have pressed successfully more than once, and the
    ///         contract's own hasPressed bookkeeping must agree with the ghost record.
    function invariant_NoWalletPressesTwice() public view {
        for (uint256 i; i < handler.ACTOR_COUNT(); i++) {
            address a = handler.actor(i);
            assertLe(handler.ghostSuccessfulPresses(a), 1);
            if (handler.ghostSuccessfulPresses(a) == 1) {
                assertTrue(button.hasPressed(a));
            }
        }
    }

    /// @notice Once true, `started` can never become false again — there is no code
    ///         path in the contract that clears it.
    function invariant_StartedNeverReturnsToFalse() public view {
        if (handler.ghostEverStarted()) {
            assertTrue(button.started());
        }
    }

    /// @notice Once the deadline has passed, the experiment can never become alive
    ///         again — no action can extend, pause, or restart it. The handler calls
    ///         resetTimer() unconditionally (including after death), so this is a real
    ///         test of resetTimer()'s "never revives" guarantee, not just press()'s.
    function invariant_EndedExperimentNeverReactivates() public view {
        if (handler.ghostEverEnded()) {
            assertFalse(button.isAlive());
        }
    }

    /// @notice The contract's own reset counter must always equal the number of
    ///         resetTimer() calls that actually succeeded — nothing else can move it.
    function invariant_TimerResetCountMatchesSuccessfulResetGhost() public view {
        assertEq(button.timerResetCount(), handler.ghostSuccessfulResets());
    }

    /// @notice Resets never touch the press record — total presses must always equal
    ///         the ghost's independently-tracked count regardless of how many resets
    ///         happened alongside them (already implied by
    ///         invariant_TotalPressesMatchesSuccessfulPressGhost, restated here against
    ///         reset activity specifically since that's the property resetTimer() must
    ///         not violate).
    function invariant_ResetsNeverInflatePresses() public view {
        assertEq(button.totalPresses(), handler.ghostTotalSuccessfulPresses());
    }
}
