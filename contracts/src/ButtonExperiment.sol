// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title BUTTON — one wallet, one press, one shared clock.
/// @notice An irreversible 60-second social experiment for Robinhood Chain.
/// @dev BUTTON token ownership is deliberately unrelated to participation.
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
    uint256 public endedAt;
    uint256 public totalPresses;
    uint8 public closestCall;

    mapping(address => bool) public hasPressed;
    mapping(address => uint8) public pressFaction;
    mapping(address => uint8) public pressRemaining;
    uint256[7] public factionCounts;

    error OnlyStarter();
    error AlreadyStarted();
    error NotStarted();
    error AlreadyPressed();
    error ExperimentEnded();
    error ExperimentStillAlive();
    error AlreadyFinalized();

    event ExperimentStarted(uint256 indexed timestamp, uint256 deadline);
    event Pressed(
        address indexed presser,
        uint8 remaining,
        uint8 faction,
        uint256 timestamp,
        uint256 pressNumber
    );
    event ExperimentFinalized(uint256 indexed endedAt, uint256 totalPresses, uint8 closestCall);

    constructor(address starter_) {
        require(starter_ != address(0), "starter=0");
        starter = starter_;
    }

    /// @notice Activates the shared clock once. This is the starter's only privileged action.
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
    function press() external {
        if (!started) revert NotStarted();
        if (hasPressed[msg.sender]) revert AlreadyPressed();

        uint256 d = deadline();
        if (block.timestamp >= d) revert ExperimentEnded();

        uint8 remaining = uint8(d - block.timestamp);
        uint8 faction = _factionFor(remaining);

        hasPressed[msg.sender] = true;
        pressRemaining[msg.sender] = remaining;
        pressFaction[msg.sender] = faction;
        factionCounts[faction] += 1;
        totalPresses += 1;

        if (remaining < closestCall) closestCall = remaining;
        lastPressedAt = block.timestamp;

        emit Pressed(msg.sender, remaining, faction, block.timestamp, totalPresses);
    }

    /// @notice Seals the historical end timestamp after expiration. Anyone may call it.
    /// @dev It cannot restart, extend, or otherwise alter the outcome.
    function finalize() external {
        if (!started) revert NotStarted();
        if (finalized) revert AlreadyFinalized();
        if (isAlive()) revert ExperimentStillAlive();

        finalized = true;
        endedAt = deadline();
        emit ExperimentFinalized(endedAt, totalPresses, totalPresses == 0 ? 0 : closestCall);
    }

    function deadline() public view returns (uint256) {
        if (!started) return 0;
        return lastPressedAt + WINDOW;
    }

    function timeLeft() external view returns (uint256) {
        if (!started) return 0;
        uint256 d = deadline();
        return block.timestamp < d ? d - block.timestamp : 0;
    }

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
