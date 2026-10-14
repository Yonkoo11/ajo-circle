// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20 {
    function transfer(address to, uint256 amt) external returns (bool);
    function transferFrom(address from, address to, uint256 amt) external returns (bool);
}

/// Savings circle (ajo/esusu). N members each pay `contribution` per round; the member whose turn it is
/// (join order) takes the pot. Each member locks one extra contribution as collateral at join; a missed
/// payment is taken from it when the round closes. Nobody, including the creator, can move the pot.
contract AjoCircle {
    struct Circle {
        uint128 contribution;
        uint32 size;
        uint32 roundSeconds;
        uint32 round;       // current round index, == size when finished
        uint64 roundStart;  // 0 until the circle is full
        address[] members;
    }

    IERC20 public immutable token;
    uint256 public nextId;
    mapping(uint256 => Circle) private circles;
    mapping(uint256 => mapping(address => bool)) public isMember;
    mapping(uint256 => mapping(address => uint256)) public collateral;
    mapping(uint256 => mapping(uint256 => mapping(address => bool))) public paid; // id => round => member
    mapping(uint256 => uint32) public paidCount; // payments in the current round

    mapping(address => uint256[]) private joined; // circle ids per member address, so a client reads them without log scans

    uint256 private locked = 1;

    event Created(uint256 indexed id, address indexed creator, uint128 contribution, uint32 size, uint32 roundSeconds);
    event Joined(uint256 indexed id, address indexed member, uint32 memberCount);
    event Started(uint256 indexed id, uint64 roundStart);
    event Paid(uint256 indexed id, uint32 round, address indexed member);
    event Slashed(uint256 indexed id, uint32 round, address indexed member, uint256 amount);
    event RoundClosed(uint256 indexed id, uint32 round, address indexed recipient, uint256 pot);
    event CollateralWithdrawn(uint256 indexed id, address indexed member, uint256 amount);

    error Bad();

    modifier nonReentrant() {
        if (locked != 1) revert Bad();
        locked = 2;
        _;
        locked = 1;
    }

    constructor(IERC20 _token) {
        token = _token;
    }

    function createCircle(uint128 contribution, uint32 size, uint32 roundSeconds) external nonReentrant returns (uint256 id) {
        if (contribution == 0 || size < 2 || size > 50 || roundSeconds < 60) revert Bad();
        id = nextId++;
        Circle storage c = circles[id];
        c.contribution = contribution;
        c.size = size;
        c.roundSeconds = roundSeconds;
        emit Created(id, msg.sender, contribution, size, roundSeconds);
        _join(id, msg.sender);
    }

    function join(uint256 id) external nonReentrant {
        _join(id, msg.sender);
    }

    function _join(uint256 id, address who) private {
        Circle storage c = circles[id];
        if (c.size == 0 || c.roundStart != 0 || isMember[id][who]) revert Bad();
        isMember[id][who] = true;
        c.members.push(who);
        joined[who].push(id);
        collateral[id][who] = c.contribution;
        _pull(who, c.contribution);
        emit Joined(id, who, uint32(c.members.length));
        if (c.members.length == c.size) {
            c.roundStart = uint64(block.timestamp);
            emit Started(id, c.roundStart);
        }
    }

    function pay(uint256 id) external nonReentrant {
        Circle storage c = circles[id];
        if (c.roundStart == 0 || c.round >= c.size || !isMember[id][msg.sender]) revert Bad();
        if (block.timestamp >= c.roundStart + c.roundSeconds) revert Bad(); // window over, close it
        if (paid[id][c.round][msg.sender]) revert Bad();
        paid[id][c.round][msg.sender] = true;
        paidCount[id]++;
        _pull(msg.sender, c.contribution);
        emit Paid(id, c.round, msg.sender);
    }

    /// Anyone can close once every member paid or the window ended.
    function closeRound(uint256 id) external nonReentrant {
        Circle storage c = circles[id];
        if (c.roundStart == 0 || c.round >= c.size) revert Bad();
        if (paidCount[id] != c.size && block.timestamp < c.roundStart + c.roundSeconds) revert Bad();

        uint32 r = c.round;
        uint256 pot = uint256(paidCount[id]) * c.contribution;
        for (uint256 i; i < c.members.length; i++) {
            address m = c.members[i];
            if (paid[id][r][m]) continue;
            uint256 take = collateral[id][m] < c.contribution ? collateral[id][m] : c.contribution;
            collateral[id][m] -= take;
            pot += take;
            emit Slashed(id, r, m, take);
        }
        address recipient = c.members[r];
        c.round = r + 1;
        c.roundStart = uint64(block.timestamp);
        paidCount[id] = 0;
        if (pot > 0) _push(recipient, pot);
        emit RoundClosed(id, r, recipient, pot);
    }

    /// After the last round, each member takes back whatever collateral was not slashed.
    function withdrawCollateral(uint256 id) external nonReentrant {
        Circle storage c = circles[id];
        if (c.size == 0 || c.round < c.size) revert Bad();
        uint256 amt = collateral[id][msg.sender];
        if (amt == 0) revert Bad();
        collateral[id][msg.sender] = 0;
        _push(msg.sender, amt);
        emit CollateralWithdrawn(id, msg.sender, amt);
    }

    function circlesOf(address who) external view returns (uint256[] memory) {
        return joined[who];
    }

    function getCircle(uint256 id)
        external
        view
        returns (uint128 contribution, uint32 size, uint32 roundSeconds, uint32 round, uint64 roundStart, address[] memory members)
    {
        Circle storage c = circles[id];
        return (c.contribution, c.size, c.roundSeconds, c.round, c.roundStart, c.members);
    }

    function _pull(address from, uint256 amt) private {
        if (!token.transferFrom(from, address(this), amt)) revert Bad();
    }

    function _push(address to, uint256 amt) private {
        if (!token.transfer(to, amt)) revert Bad();
    }
}
