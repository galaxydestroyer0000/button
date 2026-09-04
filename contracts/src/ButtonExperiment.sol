// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title BUTTON — one wallet, one press, one shared clock.
/// @notice A 60-second social experiment for Robinhood Chain.
/// @dev BUTTON token ownership is deliberately unrelated to participation. This contract
///      has no payable functions and no upgrade path. The starter has exactly two
///      privileged actions, both narrow and both public: a one-time `start()`, and an
///      unlimited-use `resetTimer()` that may push the countdown back to a fresh 60
///      seconds — but ONLY while the experiment is alive. Neither can touch who has
///      pressed, what faction they got, or the press/closest-call record, and neither
///      can revive the experiment once it has genuinely reached zero. Permanent death
///      at zero is not overridable by anyone, including the starter.
contract ButtonExperiment {
    uint256 public constant WINDOW = 60 seconds;

    // 0 is reserved for NONE/GREY (never pressed).
    uint8 public constant PURPLE = 1;
    uint8 public constant BLUE = 2;
    uint8 public constant GREEN = 3;
    uint8 public constant YELLOW = 4;
    uint8 public constant ORANGE = 5;
    uint8 public constant RED = 6;

    address public immutable starter;

    bool public started;
    bool public finalized;
    uint256 public startedAt;
    uint256 public lastPressedAt;
    address public lastPresser;
    uint256 public endedAt;
    uint256 public totalPresses;
    uint8 public closestCall;
    address public closestCallWallet;
    uint256 public timerResetCount;

    mapping(address => bool) public hasPressed;
    mapping(address => uint8) public pressFaction;
    mapping(address => uint8) public pressRemaining;
    mapping(address => uint256) public pressNumber;
    uint256[7] public factionCounts;

    error ZeroAddress();
    error OnlyStarter();
    error AlreadyStarted();
    error NotStarted();
    error AlreadyPressed();
    error ExperimentEnded();
    error ExperimentStillAlive();
    error AlreadyFinalized();
    error InvalidTimestamp();
    error ExperimentNotAlive();

    event ExperimentStarted(uint256 indexed timestamp, uint256 deadline);
    event Pressed(address indexed presser, uint8 remaining, uint8 faction, uint256 timestamp, uint256 pressNumber);
    event ExperimentFinalized(uint256 indexed endedAt, uint256 totalPresses, uint8 closestCall);
    event TimerReset(address indexed admin, uint256 timestamp, uint256 newDeadline, uint256 resetNumber);

    constructor(address starter_) {
        if (starter_ == address(0)) revert ZeroAddress();
        starter = starter_;
    }

    /// @notice Activates the shared clock once. Can never be called again, by anyone.
    /// @dev No function in this contract can revive the experiment once it ends — not
    ///      even `resetTimer()` below, which only ever operates on a still-alive clock.
    function start() external {
        if (msg.sender != starter) revert OnlyStarter();
        if (started) revert AlreadyStarted();

        started = true;
        startedAt = block.timestamp;
        lastPressedAt = block.timestamp;
        closestCall = 60;

        emit ExperimentStarted(block.timestamp, block.timestamp + WINDOW);
    }

    /// @notice Press once. If valid, the shared clock returns to 60 seconds.
    /// @dev Reverts before any state is written if the caller is ineligible, so a failed
    ///      call can never leave partial state. `remaining` is bounded to (0, WINDOW] by
    ///      the explicit check below rather than relying solely on monotonic block
    ///      timestamps, so a truncating cast to uint8 can never silently wrap.
    function press() external {
        if (!started) revert NotStarted();
        if (hasPressed[msg.sender]) revert AlreadyPressed();

        uint256 d = deadline();
        if (block.timestamp >= d) revert ExperimentEnded();

        uint256 remainingFull = d - block.timestamp;
        if (remainingFull > WINDOW) revert InvalidTimestamp();
        uint8 remaining = uint8(remainingFull);
        uint8 faction = _factionFor(remaining);

        hasPressed[msg.sender] = true;
        pressRemaining[msg.sender] = remaining;
        pressFaction[msg.sender] = faction;
        factionCounts[faction] += 1;

        totalPresses += 1;
        pressNumber[msg.sender] = totalPresses;

        // The very first press always sets the record, even when it lands at exactly
        // WINDOW seconds remaining (closestCall's start()-time sentinel already equals
        // WINDOW, so a strict "<" would silently skip recording the wallet).
        if (totalPresses == 1 || remaining < closestCall) {
            closestCall = remaining;
            closestCallWallet = msg.sender;
        }

        lastPresser = msg.sender;
        lastPressedAt = block.timestamp;

        emit Pressed(msg.sender, remaining, faction, block.timestamp, totalPresses);
    }

    /// @notice The starter may push the deadline back to a fresh 60-second window,
    /// any number of times, at any point while the experiment is alive.
    /// @dev This is the one ongoing admin power this contract grants, deliberately
    ///      narrow: it only ever moves `lastPressedAt` forward to now, exactly like a
    ///      press's own deadline reset — it cannot touch `hasPressed`, faction
    ///      assignments, `totalPresses`, or `closestCall`, and `isAlive()` gates it on
    ///      both sides: it reverts before `start()` and it reverts once the deadline
    ///      has genuinely passed, so it can never revive a dead experiment. Every call
    ///      is a public, indexed event — there is no way to use this power silently.
    function resetTimer() external {
        if (msg.sender != starter) revert OnlyStarter();
        if (!isAlive()) revert ExperimentNotAlive();

        lastPressedAt = block.timestamp;
        timerResetCount += 1;

        emit TimerReset(msg.sender, block.timestamp, deadline(), timerResetCount);
    }

    /// @notice Seals the historical end timestamp after expiration. Anyone may call it.
    /// @dev It cannot restart, extend, or otherwise alter the outcome. The experiment is
    ///      already functionally over the instant `isAlive()` turns false — this function
    ///      only records that fact permanently for indexers/UIs; nothing depends on it
    ///      being called for the ending itself to take effect.
    function finalize() external {
        if (!started) revert NotStarted();
        if (finalized) revert AlreadyFinalized();
        if (isAlive()) revert ExperimentStillAlive();

        finalized = true;
        endedAt = deadline();
        emit ExperimentFinalized(endedAt, totalPresses, totalPresses == 0 ? 0 : closestCall);
    }

    /// @notice The current deadline. 0 before the experiment has started.
    function deadline() public view returns (uint256) {
        if (!started) return 0;
        return lastPressedAt + WINDOW;
    }

    /// @notice Seconds remaining before expiry, floored at 0.
    function timeLeft() external view returns (uint256) {
        if (!started) return 0;
        uint256 d = deadline();
        return block.timestamp < d ? d - block.timestamp : 0;
    }

    /// @notice True from `start()` up to, but not including, the deadline itself.
    /// @dev Pressing exactly at the deadline reverts — the interval is half-open
    ///      `[startedAt, deadline)`, so `finalize()` may be called from the deadline
    ///      timestamp onward.
    function isAlive() public view returns (bool) {
        return started && block.timestamp < deadline();
    }

    function _factionFor(uint8 remaining) internal pure returns (uint8) {
        // Original Reddit bands: 60–52, 51–42, 41–32, 31–22, 21–12, 11–0.
        if (remaining >= 52) return PURPLE;
        if (remaining >= 42) return BLUE;
        if (remaining >= 32) return GREEN;
        if (remaining >= 22) return YELLOW;
        if (remaining >= 12) return ORANGE;
        return RED;
    }
}
