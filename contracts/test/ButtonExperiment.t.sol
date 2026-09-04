// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/ButtonExperiment.sol";

contract ButtonExperimentTest is Test {
    address starter = address(0xB0770);
    address alice = address(0xA11CE);
    address bob = address(0xB0B);
    address carol = address(0xCA501);
    ButtonExperiment button;

    function setUp() public {
        button = new ButtonExperiment(starter);
    }

    function _start() internal {
        vm.prank(starter);
        button.start();
    }

    /// @dev Warps so exactly `remainingSeconds` are left on the current deadline, then presses.
    function _pressWithRemaining(address user, uint8 remainingSeconds) internal {
        vm.warp(button.deadline() - remainingSeconds);
        vm.prank(user);
        button.press();
    }

    // ============================================================
    // START
    // ============================================================

    function test_Start_OnlyStarterCanStart() public {
        vm.expectRevert(ButtonExperiment.OnlyStarter.selector);
        button.start();

        vm.prank(alice);
        vm.expectRevert(ButtonExperiment.OnlyStarter.selector);
        button.start();

        _start();
        assertTrue(button.started());
    }

    function test_Start_CannotStartTwice() public {
        _start();
        vm.prank(starter);
        vm.expectRevert(ButtonExperiment.AlreadyStarted.selector);
        button.start();
    }

    function test_Start_OutsiderCannotRestartAfterStart() public {
        _start();
        vm.prank(alice);
        vm.expectRevert(ButtonExperiment.OnlyStarter.selector);
        button.start();
    }

    function test_Start_SetsStateCorrectly() public {
        uint256 before = block.timestamp;
        _start();
        assertTrue(button.started());
        assertEq(button.startedAt(), before);
        assertEq(button.lastPressedAt(), before);
        assertEq(button.deadline(), before + 60);
        assertEq(button.closestCall(), 60);
        assertEq(button.closestCallWallet(), address(0));
        assertEq(button.lastPresser(), address(0));
        assertFalse(button.finalized());
        assertEq(button.totalPresses(), 0);
    }

    function test_Start_EmitsExperimentStarted() public {
        vm.expectEmit(true, true, true, true);
        emit ButtonExperiment.ExperimentStarted(block.timestamp, block.timestamp + 60);
        _start();
    }

    function test_Start_ZeroAddressStarterReverts() public {
        vm.expectRevert(ButtonExperiment.ZeroAddress.selector);
        new ButtonExperiment(address(0));
    }

    function test_Press_CannotOccurBeforeStart() public {
        vm.prank(alice);
        vm.expectRevert(ButtonExperiment.NotStarted.selector);
        button.press();
    }

    function test_Finalize_CannotOccurBeforeStart() public {
        vm.expectRevert(ButtonExperiment.NotStarted.selector);
        button.finalize();
    }

    function test_DeadlineAndAliveAreFalsyBeforeStart() public view {
        assertEq(button.deadline(), 0);
        assertFalse(button.isAlive());
        assertEq(button.timeLeft(), 0);
    }

    // ============================================================
    // PRESS
    // ============================================================

    function test_Press_FirstWalletSucceeds() public {
        _start();
        vm.warp(block.timestamp + 10);
        vm.prank(alice);
        button.press();

        assertTrue(button.hasPressed(alice));
        assertEq(button.pressRemaining(alice), 50);
        assertEq(button.pressFaction(alice), button.BLUE());
        assertEq(button.pressNumber(alice), 1);
        assertEq(button.totalPresses(), 1);
        assertEq(button.lastPresser(), alice);
        assertEq(button.deadline(), block.timestamp + 60);
    }

    function test_Press_SecondWalletSucceeds() public {
        _start();
        vm.prank(alice);
        button.press();
        vm.warp(block.timestamp + 5);
        vm.prank(bob);
        button.press();

        assertTrue(button.hasPressed(bob));
        assertEq(button.pressNumber(bob), 2);
        assertEq(button.totalPresses(), 2);
        assertEq(button.lastPresser(), bob);
    }

    function test_Press_SameWalletCannotPressTwice() public {
        _start();
        vm.prank(alice);
        button.press();
        vm.prank(alice);
        vm.expectRevert(ButtonExperiment.AlreadyPressed.selector);
        button.press();
    }

    function test_Press_SameWalletCannotPressTwiceEvenAfterTimePasses() public {
        _start();
        vm.prank(alice);
        button.press();
        vm.warp(button.deadline() - 5);
        vm.prank(alice);
        vm.expectRevert(ButtonExperiment.AlreadyPressed.selector);
        button.press();
    }

    function test_Press_ResetsDeadlineToPlus60FromPressTime() public {
        _start();
        vm.warp(button.deadline() - 5); // 5s remaining
        uint256 pressTime = block.timestamp;
        vm.prank(alice);
        button.press();
        assertEq(button.deadline(), pressTime + 60);
        assertEq(button.lastPressedAt(), pressTime);
    }

    function test_Press_DoesNotAffectOtherWalletsHasPressed() public {
        _start();
        vm.prank(alice);
        button.press();
        assertFalse(button.hasPressed(bob));
    }

    function test_Press_EmitsPressedWithCorrectFields() public {
        _start();
        vm.warp(button.deadline() - 35); // GREEN (32-41)
        vm.expectEmit(true, true, true, true);
        emit ButtonExperiment.Pressed(alice, 35, button.GREEN(), block.timestamp, 1);
        vm.prank(alice);
        button.press();
    }

    function test_Press_RevertsBeforeMutatingStateOnDoublePress() public {
        _start();
        vm.prank(alice);
        button.press();
        uint256 totalBefore = button.totalPresses();
        vm.prank(alice);
        vm.expectRevert(ButtonExperiment.AlreadyPressed.selector);
        button.press();
        assertEq(button.totalPresses(), totalBefore);
    }

    // ============================================================
    // FACTIONS — every lower and upper boundary
    // ============================================================

    function test_Faction_PurpleLowerBound_52() public {
        _start();
        _pressWithRemaining(alice, 52);
        assertEq(button.pressFaction(alice), button.PURPLE());
    }

    function test_Faction_PurpleUpperBound_60() public {
        _start();
        _pressWithRemaining(alice, 60); // press in the same second as start()
        assertEq(button.pressFaction(alice), button.PURPLE());
        assertEq(button.pressRemaining(alice), 60);
    }

    function test_Faction_BlueLowerBound_42() public {
        _start();
        _pressWithRemaining(alice, 42);
        assertEq(button.pressFaction(alice), button.BLUE());
    }

    function test_Faction_BlueUpperBound_51() public {
        _start();
        _pressWithRemaining(alice, 51);
        assertEq(button.pressFaction(alice), button.BLUE());
    }

    function test_Faction_GreenLowerBound_32() public {
        _start();
        _pressWithRemaining(alice, 32);
        assertEq(button.pressFaction(alice), button.GREEN());
    }

    function test_Faction_GreenUpperBound_41() public {
        _start();
        _pressWithRemaining(alice, 41);
        assertEq(button.pressFaction(alice), button.GREEN());
    }

    function test_Faction_YellowLowerBound_22() public {
        _start();
        _pressWithRemaining(alice, 22);
        assertEq(button.pressFaction(alice), button.YELLOW());
    }

    function test_Faction_YellowUpperBound_31() public {
        _start();
        _pressWithRemaining(alice, 31);
        assertEq(button.pressFaction(alice), button.YELLOW());
    }

    function test_Faction_OrangeLowerBound_12() public {
        _start();
        _pressWithRemaining(alice, 12);
        assertEq(button.pressFaction(alice), button.ORANGE());
    }

    function test_Faction_OrangeUpperBound_21() public {
        _start();
        _pressWithRemaining(alice, 21);
        assertEq(button.pressFaction(alice), button.ORANGE());
    }

    function test_Faction_RedUpperBound_11() public {
        _start();
        _pressWithRemaining(alice, 11);
        assertEq(button.pressFaction(alice), button.RED());
    }

    /// @dev Remaining==0 is nominally RED's lower bound, but 0 is unreachable via a
    /// successful press — pressing exactly at the deadline reverts (see END tests).
    /// 1 second remaining is the closest any wallet can ever get.
    function test_Faction_RedLowestReachable_1() public {
        _start();
        _pressWithRemaining(alice, 1);
        assertEq(button.pressFaction(alice), button.RED());
        assertEq(button.pressRemaining(alice), 1);
    }

    function test_Faction_ZeroRemainingIsUnreachable() public {
        _start();
        vm.warp(button.deadline()); // exactly 0 seconds remaining
        vm.prank(alice);
        vm.expectRevert(ButtonExperiment.ExperimentEnded.selector);
        button.press();
    }

    function test_Faction_AllSixBandsAcrossDistinctWallets() public {
        _start();
        uint8[6] memory remain = [uint8(55), 45, 35, 25, 15, 5];
        uint8[6] memory expected =
            [button.PURPLE(), button.BLUE(), button.GREEN(), button.YELLOW(), button.ORANGE(), button.RED()];
        address[6] memory users = [address(101), address(102), address(103), address(104), address(105), address(106)];
        for (uint256 i; i < users.length; i++) {
            _pressWithRemaining(users[i], remain[i]);
            assertEq(button.pressFaction(users[i]), expected[i]);
            assertEq(button.factionCounts(expected[i]), 1);
        }
    }

    // ============================================================
    // RACE CONDITIONS
    // ============================================================

    function test_Race_TwoPressesInSameBlock() public {
        _start();
        vm.warp(button.deadline() - 1); // 1s remaining
        vm.prank(alice);
        button.press(); // resets deadline to now + 60
        assertEq(button.pressRemaining(alice), 1);

        // Same block.timestamp, no vm.warp between calls: EVM sequential execution
        // means bob observes the deadline alice's transaction just reset.
        vm.prank(bob);
        button.press();
        assertEq(button.pressRemaining(bob), 60);
        assertEq(button.pressFaction(bob), button.PURPLE());
        assertEq(button.totalPresses(), 2);
    }

    function test_Race_OrderingIsAuthoritative_FirstTxWins() public {
        _start();
        vm.warp(button.deadline() - 20);
        // Alice's tx is mined first in this block: she reads the pre-press deadline.
        vm.prank(alice);
        button.press();
        assertEq(button.pressRemaining(alice), 20);
        // Bob's tx is mined second in the SAME block: he must read Alice's reset
        // deadline, not the original one — proving state is visible tx-to-tx.
        vm.prank(bob);
        button.press();
        assertEq(button.pressRemaining(bob), 60);
        assertEq(button.deadline(), block.timestamp + 60);
    }

    function test_Race_PressImmediatelyBeforeExpirySucceeds() public {
        _start();
        vm.warp(button.deadline() - 1);
        vm.prank(alice);
        button.press();
        assertEq(button.pressRemaining(alice), 1);
        assertEq(button.pressFaction(alice), button.RED());
    }

    function test_Race_PressAtExactExpiryReverts() public {
        _start();
        vm.warp(button.deadline());
        vm.prank(alice);
        vm.expectRevert(ButtonExperiment.ExperimentEnded.selector);
        button.press();
    }

    function test_Race_PressAfterExpiryReverts() public {
        _start();
        vm.warp(button.deadline() + 1);
        vm.prank(alice);
        vm.expectRevert(ButtonExperiment.ExperimentEnded.selector);
        button.press();
    }

    function test_Race_PressLongAfterExpiryReverts() public {
        _start();
        vm.warp(button.deadline() + 365 days);
        vm.prank(alice);
        vm.expectRevert(ButtonExperiment.ExperimentEnded.selector);
        button.press();
    }

    /// @dev Simulates a hostile "everyone arrives at once" scenario: 100 distinct
    /// wallets each submit press() in the exact same block (no vm.warp between any
    /// of them). EVM transaction ordering within a block is strictly sequential, so
    /// only the first wallet observes the pre-block deadline/remaining value — every
    /// subsequent wallet in the same block observes the immediately-prior wallet's
    /// reset, exactly like two users racing a real mempool. The contract must still
    /// end up with clean, fully-consistent bookkeeping: every wallet recorded exactly
    /// once, sequential press numbers with no gaps or duplicates, and a closest-call
    /// record equal to the true minimum observed.
    function test_Race_OneHundredWalletsPressInTheSameBlock() public {
        _start();
        vm.warp(button.deadline() - 45); // first wallet arrives with 45s left

        uint256 n = 100;
        uint8 trueMin = type(uint8).max;
        address trueMinWallet;

        for (uint256 i; i < n; i++) {
            address user = address(uint160(9_000 + i));
            uint256 remainingBefore = button.timeLeft();

            vm.prank(user);
            button.press();

            assertTrue(button.hasPressed(user));
            assertEq(button.pressNumber(user), i + 1);
            assertEq(button.pressRemaining(user), remainingBefore);
            if (uint8(remainingBefore) <= trueMin) {
                trueMin = uint8(remainingBefore);
                trueMinWallet = user;
            }
            // Every press after the first resets the clock to a fresh 60s window,
            // observed by the very next wallet in the same block.
        }

        assertEq(button.totalPresses(), n);
        assertEq(button.closestCall(), trueMin);
        assertEq(button.closestCallWallet(), trueMinWallet);
        assertEq(button.lastPresser(), address(uint160(9_000 + n - 1)));

        uint256 sumFactionCounts;
        for (uint8 f = 1; f <= 6; f++) {
            sumFactionCounts += button.factionCounts(f);
        }
        assertEq(sumFactionCounts, n);
    }

    /// @dev The flip side of the same scenario: once 100 wallets have each pressed
    /// once, every one of them attempting a second press — still within the same
    /// block as their first, the most hostile possible timing — must revert. The
    /// contract remains authoritative regardless of how many wallets are replaying.
    function test_Race_OneHundredWalletsSecondPressAlwaysReverts() public {
        _start();
        uint256 n = 100;
        for (uint256 i; i < n; i++) {
            address user = address(uint160(9_000 + i));
            vm.prank(user);
            button.press();
        }
        for (uint256 i; i < n; i++) {
            address user = address(uint160(9_000 + i));
            vm.prank(user);
            vm.expectRevert(ButtonExperiment.AlreadyPressed.selector);
            button.press();
        }
        assertEq(button.totalPresses(), n);
    }

    function test_Race_MultipleWalletsNearExpiry_OnlyPressersBeforeDeadlineSucceed() public {
        _start();
        vm.warp(button.deadline() - 3);
        vm.prank(alice);
        button.press(); // succeeds, resets deadline to now+60

        vm.warp(button.deadline() - 3);
        vm.prank(bob);
        button.press(); // succeeds against alice's new deadline

        vm.warp(button.deadline());
        vm.prank(carol);
        vm.expectRevert(ButtonExperiment.ExperimentEnded.selector);
        button.press(); // carol is exactly at bob's deadline: fails

        assertEq(button.totalPresses(), 2);
        assertEq(button.lastPresser(), bob);
    }

    // ============================================================
    // RESET TIMER — the starter's ongoing (not one-time) admin power
    // ============================================================

    function test_ResetTimer_OnlyStarterCanReset() public {
        _start();
        vm.expectRevert(ButtonExperiment.OnlyStarter.selector);
        button.resetTimer();

        vm.prank(alice);
        vm.expectRevert(ButtonExperiment.OnlyStarter.selector);
        button.resetTimer();
    }

    function test_ResetTimer_RevertsBeforeStart() public {
        vm.prank(starter);
        vm.expectRevert(ButtonExperiment.ExperimentNotAlive.selector);
        button.resetTimer();
    }

    function test_ResetTimer_RevertsAfterNaturalExpiry() public {
        _start();
        vm.warp(button.deadline());
        vm.prank(starter);
        vm.expectRevert(ButtonExperiment.ExperimentNotAlive.selector);
        button.resetTimer();
    }

    /// @dev The load-bearing guarantee: resetTimer() can never be used to bring a
    /// dead experiment back — not even by the starter, not even immediately after
    /// finalize(). Permanent death at zero has no exception.
    function test_ResetTimer_CannotReviveAfterFinalize() public {
        _start();
        vm.warp(button.deadline());
        button.finalize();

        vm.prank(starter);
        vm.expectRevert(ButtonExperiment.ExperimentNotAlive.selector);
        button.resetTimer();

        assertFalse(button.isAlive());
        assertTrue(button.finalized());
    }

    function test_ResetTimer_ExtendsDeadlineToFreshWindowFromNow() public {
        _start();
        vm.warp(button.deadline() - 3); // 3s remaining
        uint256 resetTime = block.timestamp;

        vm.prank(starter);
        button.resetTimer();

        assertEq(button.deadline(), resetTime + 60);
        assertEq(button.lastPressedAt(), resetTime);
        assertTrue(button.isAlive());
    }

    /// @dev The other load-bearing guarantee: resetTimer() touches nothing about who
    /// pressed, what they got, or the aggregate record — only the countdown moves.
    function test_ResetTimer_DoesNotAffectPressHistoryOrStats() public {
        _start();
        vm.prank(alice);
        button.press();
        uint256 totalBefore = button.totalPresses();
        uint8 closestBefore = button.closestCall();
        address closestWalletBefore = button.closestCallWallet();
        uint8 aliceFactionBefore = button.pressFaction(alice);
        uint8 aliceRemainingBefore = button.pressRemaining(alice);
        uint256 alicePressNumberBefore = button.pressNumber(alice);
        uint256 purpleCountBefore = button.factionCounts(button.PURPLE());

        vm.prank(starter);
        button.resetTimer();

        assertTrue(button.hasPressed(alice));
        assertEq(button.totalPresses(), totalBefore);
        assertEq(button.closestCall(), closestBefore);
        assertEq(button.closestCallWallet(), closestWalletBefore);
        assertEq(button.pressFaction(alice), aliceFactionBefore);
        assertEq(button.pressRemaining(alice), aliceRemainingBefore);
        assertEq(button.pressNumber(alice), alicePressNumberBefore);
        assertEq(button.factionCounts(button.PURPLE()), purpleCountBefore);

        // And alice — already spent — still cannot press again after a reset.
        vm.prank(alice);
        vm.expectRevert(ButtonExperiment.AlreadyPressed.selector);
        button.press();
    }

    function test_ResetTimer_CanBeCalledManyTimesConsecutively() public {
        _start();
        for (uint256 i = 1; i <= 5; i++) {
            vm.warp(block.timestamp + 10);
            vm.prank(starter);
            button.resetTimer();
            assertEq(button.timerResetCount(), i);
        }
        assertTrue(button.isAlive());
    }

    function test_ResetTimer_EmitsTimerResetEventWithCorrectFields() public {
        _start();
        vm.warp(button.deadline() - 10);
        uint256 resetTime = block.timestamp;

        vm.expectEmit(true, true, true, true);
        emit ButtonExperiment.TimerReset(starter, resetTime, resetTime + 60, 1);
        vm.prank(starter);
        button.resetTimer();
    }

    /// @dev A reset changes the baseline a subsequent press measures "remaining"
    /// against — proving the two mechanisms compose correctly rather than fighting.
    function test_ResetTimer_SubsequentPressMeasuresAgainstNewDeadline() public {
        _start();
        vm.warp(button.deadline() - 5); // 5s remaining, would be RED
        vm.prank(starter);
        button.resetTimer(); // back to a fresh 60s window

        vm.warp(button.deadline() - 55); // 55s remaining on the NEW window
        vm.prank(alice);
        button.press();

        assertEq(button.pressRemaining(alice), 55);
        assertEq(button.pressFaction(alice), button.PURPLE());
    }

    function testFuzz_ResetTimerAlwaysSetsDeadlineToResetTimePlusWindow(uint32 warpOffset) public {
        _start();
        warpOffset = uint32(bound(warpOffset, 0, 59));
        vm.warp(block.timestamp + warpOffset);
        uint256 resetTime = block.timestamp;

        vm.prank(starter);
        button.resetTimer();

        assertEq(button.deadline(), resetTime + 60);
    }

    // ============================================================
    // END
    // ============================================================

    function test_End_TimerReachesZero_IsAliveBecomesFalse() public {
        _start();
        assertTrue(button.isAlive());
        vm.warp(button.deadline() - 1);
        assertTrue(button.isAlive());
        vm.warp(button.deadline());
        assertFalse(button.isAlive());
    }

    function test_End_ExperimentPermanentlyEnded_NoPressesEverSucceedAgain() public {
        _start();
        vm.warp(button.deadline());
        for (uint256 i; i < 5; i++) {
            vm.warp(block.timestamp + 1 days);
            address user = address(uint160(200 + i));
            vm.prank(user);
            vm.expectRevert(ButtonExperiment.ExperimentEnded.selector);
            button.press();
        }
    }

    function test_End_CannotRestart_StartRevertsAfterExpiry() public {
        _start();
        vm.warp(button.deadline() + 100);
        vm.prank(starter);
        vm.expectRevert(ButtonExperiment.AlreadyStarted.selector);
        button.start();
    }

    function test_End_CannotRestartEvenAfterFinalize() public {
        _start();
        vm.warp(button.deadline());
        button.finalize();

        vm.prank(starter);
        vm.expectRevert(ButtonExperiment.AlreadyStarted.selector);
        button.start();

        vm.prank(alice);
        vm.expectRevert(ButtonExperiment.ExperimentEnded.selector);
        button.press();
    }

    function test_End_FinalizeRevertsWhileAlive() public {
        _start();
        vm.expectRevert(ButtonExperiment.ExperimentStillAlive.selector);
        button.finalize();
        vm.warp(button.deadline() - 1);
        vm.expectRevert(ButtonExperiment.ExperimentStillAlive.selector);
        button.finalize();
    }

    function test_End_FinalizeSucceedsExactlyAtDeadline() public {
        _start();
        vm.warp(button.deadline());
        button.finalize();
        assertTrue(button.finalized());
        assertEq(button.endedAt(), button.deadline());
    }

    function test_End_FinalizeCannotBeCalledTwice() public {
        _start();
        vm.warp(button.deadline());
        button.finalize();
        vm.expectRevert(ButtonExperiment.AlreadyFinalized.selector);
        button.finalize();
    }

    function test_End_FinalizeByAnyCaller() public {
        _start();
        vm.warp(button.deadline());
        vm.prank(alice); // not the starter — finalize is permissionless
        button.finalize();
        assertTrue(button.finalized());
    }

    function test_End_FinalizeDoesNotChangeOutcome() public {
        _start();
        vm.prank(alice);
        button.press();
        uint256 totalBefore = button.totalPresses();
        uint8 closestBefore = button.closestCall();
        vm.warp(button.deadline());
        button.finalize();
        assertEq(button.totalPresses(), totalBefore);
        assertEq(button.closestCall(), closestBefore);
    }

    function test_End_FinalizeWithZeroPressesReportsZeroClosestCall() public {
        _start();
        vm.warp(button.deadline());
        vm.expectEmit(true, true, true, true);
        emit ButtonExperiment.ExperimentFinalized(button.deadline(), 0, 0);
        button.finalize();
    }

    function test_End_TimeLeftFloorsAtZeroAfterExpiry() public {
        _start();
        vm.warp(button.deadline() + 1000);
        assertEq(button.timeLeft(), 0);
    }

    // ============================================================
    // STATS
    // ============================================================

    function test_Stats_TotalPressesIncrementsPerSuccessfulPress() public {
        _start();
        assertEq(button.totalPresses(), 0);
        vm.prank(alice);
        button.press();
        assertEq(button.totalPresses(), 1);
        vm.prank(bob);
        button.press();
        assertEq(button.totalPresses(), 2);
    }

    function test_Stats_ClosestCallTracksMinimumAndWallet() public {
        _start();
        _pressWithRemaining(alice, 18);
        assertEq(button.closestCall(), 18);
        assertEq(button.closestCallWallet(), alice);

        _pressWithRemaining(bob, 3);
        assertEq(button.closestCall(), 3);
        assertEq(button.closestCallWallet(), bob);

        // A later, less-close press must not overwrite the record.
        _pressWithRemaining(carol, 40);
        assertEq(button.closestCall(), 3);
        assertEq(button.closestCallWallet(), bob);
    }

    /// @dev remaining == 60 on the very first press: closestCall's start()-time
    /// sentinel is already 60, so this proves the "totalPresses == 1" branch fires
    /// and records the wallet even when a strict "<" alone would not have.
    function test_Stats_ClosestCallFirstPressAtFullWindowIsRecorded() public {
        _start();
        vm.prank(alice);
        button.press();
        assertEq(button.pressRemaining(alice), 60);
        assertEq(button.closestCall(), 60);
        assertEq(button.closestCallWallet(), alice);
    }

    function test_Stats_LatestPresserUpdatesEveryPress() public {
        _start();
        vm.prank(alice);
        button.press();
        assertEq(button.lastPresser(), alice);
        vm.prank(bob);
        button.press();
        assertEq(button.lastPresser(), bob);
    }

    function test_Stats_PressNumberIsSequentialPerWallet() public {
        _start();
        vm.prank(alice);
        button.press();
        vm.prank(bob);
        button.press();
        vm.prank(carol);
        button.press();
        assertEq(button.pressNumber(alice), 1);
        assertEq(button.pressNumber(bob), 2);
        assertEq(button.pressNumber(carol), 3);
    }

    function test_Stats_HasPressedIsPerWalletOnly() public {
        _start();
        assertFalse(button.hasPressed(alice));
        vm.prank(alice);
        button.press();
        assertTrue(button.hasPressed(alice));
        assertFalse(button.hasPressed(bob));
    }

    function test_Stats_FactionCountsAccumulateAcrossWallets() public {
        _start();
        _pressWithRemaining(alice, 5); // RED
        _pressWithRemaining(bob, 8); // RED
        _pressWithRemaining(carol, 40); // GREEN
        assertEq(button.factionCounts(button.RED()), 2);
        assertEq(button.factionCounts(button.GREEN()), 1);
        assertEq(button.factionCounts(button.PURPLE()), 0);
    }

    function test_Stats_ExperimentStartedEventFields() public {
        vm.expectEmit(true, true, true, true);
        emit ButtonExperiment.ExperimentStarted(block.timestamp, block.timestamp + 60);
        _start();
    }

    function test_Stats_PressedEventCarriesFullReconstructionData() public {
        _start();
        vm.warp(button.deadline() - 7);
        vm.expectEmit(true, true, true, true);
        emit ButtonExperiment.Pressed(alice, 7, button.RED(), block.timestamp, 1);
        vm.prank(alice);
        button.press();
    }

    function test_Stats_ExperimentFinalizedEventFields() public {
        _start();
        _pressWithRemaining(alice, 9);
        vm.warp(button.deadline());
        vm.expectEmit(true, true, true, true);
        emit ButtonExperiment.ExperimentFinalized(button.deadline(), 1, 9);
        button.finalize();
    }

    // ============================================================
    // FUZZING — timing boundaries
    // ============================================================

    function testFuzz_FactionMatchesRemainingSeconds(uint8 remainingSeconds) public {
        remainingSeconds = uint8(bound(remainingSeconds, 1, 60));
        _start();
        _pressWithRemaining(alice, remainingSeconds);

        uint8 faction = button.pressFaction(alice);
        if (remainingSeconds >= 52) assertEq(faction, button.PURPLE());
        else if (remainingSeconds >= 42) assertEq(faction, button.BLUE());
        else if (remainingSeconds >= 32) assertEq(faction, button.GREEN());
        else if (remainingSeconds >= 22) assertEq(faction, button.YELLOW());
        else if (remainingSeconds >= 12) assertEq(faction, button.ORANGE());
        else assertEq(faction, button.RED());

        assertEq(button.pressRemaining(alice), remainingSeconds);
    }

    function testFuzz_PressAlwaysResetsDeadlineToPressTimePlusWindow(uint32 warpOffset) public {
        _start();
        warpOffset = uint32(bound(warpOffset, 0, 59));
        vm.warp(block.timestamp + warpOffset);
        uint256 pressTime = block.timestamp;
        vm.prank(alice);
        button.press();
        assertEq(button.deadline(), pressTime + 60);
    }

    function testFuzz_PressAtOrAfterDeadlineAlwaysReverts(uint32 pastDeadline) public {
        _start();
        pastDeadline = uint32(bound(pastDeadline, 0, 365 days));
        vm.warp(button.deadline() + pastDeadline);
        vm.prank(alice);
        vm.expectRevert(ButtonExperiment.ExperimentEnded.selector);
        button.press();
    }

    function testFuzz_PressBeforeDeadlineAlwaysSucceedsOnce(uint32 beforeDeadline) public {
        _start();
        beforeDeadline = uint32(bound(beforeDeadline, 1, 60));
        vm.warp(button.deadline() - beforeDeadline);
        vm.prank(alice);
        button.press();
        assertTrue(button.hasPressed(alice));
    }

    function testFuzz_ClosestCallEqualsTrueMinimumAcrossPresses(uint8 r1, uint8 r2, uint8 r3) public {
        r1 = uint8(bound(r1, 1, 60));
        r2 = uint8(bound(r2, 1, 60));
        r3 = uint8(bound(r3, 1, 60));
        _start();

        _pressWithRemaining(alice, r1);
        uint8 afterFirst = button.closestCall();

        _pressWithRemaining(bob, r2);
        uint8 afterSecond = button.closestCall();
        assertLe(afterSecond, afterFirst);

        _pressWithRemaining(carol, r3);
        uint8 afterThird = button.closestCall();
        assertLe(afterThird, afterSecond);

        uint8 trueMin = r1 < r2 ? (r1 < r3 ? r1 : r3) : (r2 < r3 ? r2 : r3);
        assertEq(afterThird, trueMin);
    }

    function testFuzz_TotalPressesEqualsNumberOfDistinctPressers(uint8 pressCount) public {
        pressCount = uint8(bound(pressCount, 1, 20));
        _start();
        for (uint256 i; i < pressCount; i++) {
            address user = address(uint160(1000 + i));
            vm.prank(user);
            button.press();
        }
        assertEq(button.totalPresses(), pressCount);
    }
}
