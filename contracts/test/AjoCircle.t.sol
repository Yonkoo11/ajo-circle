// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/AjoCircle.sol";
import "./MockToken.sol";

contract AjoCircleTest is Test {
    AjoCircle ajo;
    MockToken tok;
    address a = address(0xA1);
    address b = address(0xB2);
    address c = address(0xC3);
    uint128 constant AMT = 100e6;

    function setUp() public {
        tok = new MockToken();
        ajo = new AjoCircle(IERC20(address(tok)));
        address[3] memory u = [a, b, c];
        for (uint256 i; i < 3; i++) {
            tok.mint(u[i], 1000e6);
            vm.prank(u[i]);
            tok.approve(address(ajo), type(uint256).max);
        }
    }

    function _full() internal returns (uint256 id) {
        vm.prank(a);
        id = ajo.createCircle(AMT, 3, 1 days);
        vm.prank(b);
        ajo.join(id);
        vm.prank(c);
        ajo.join(id);
    }

    function test_full_cycle_all_pay() public {
        uint256 id = _full();
        address[3] memory u = [a, b, c];
        for (uint256 r; r < 3; r++) {
            for (uint256 i; i < 3; i++) {
                vm.prank(u[i]);
                ajo.pay(id);
            }
            ajo.closeRound(id);
        }
        for (uint256 i; i < 3; i++) {
            vm.prank(u[i]);
            ajo.withdrawCollateral(id);
            assertEq(tok.balanceOf(u[i]), 1000e6, "everyone ends whole");
        }
        assertEq(tok.balanceOf(address(ajo)), 0);
    }

    function test_default_is_covered_by_collateral() public {
        uint256 id = _full();
        vm.prank(a); ajo.pay(id);
        vm.prank(b); ajo.pay(id);
        // c never pays
        vm.warp(block.timestamp + 1 days);
        ajo.closeRound(id);
        // a was recipient of a full pot (2 paid + 1 slashed)
        assertEq(tok.balanceOf(a), 1000e6 - AMT - AMT + 3 * AMT);
        assertEq(ajo.collateral(id, c), 0);
    }

    function test_circlesOf_lists_joined_ids() public {
        uint256 id = _full();
        assertEq(ajo.circlesOf(b).length, 1);
        assertEq(ajo.circlesOf(b)[0], id);
        assertEq(ajo.circlesOf(address(0xD4)).length, 0);
    }

    function test_late_payment_rejected_after_window() public {
        uint256 id = _full();
        vm.warp(block.timestamp + 1 days);
        vm.prank(a);
        vm.expectRevert(AjoCircle.Bad.selector);
        ajo.pay(id);
    }

    function test_double_pay_rejected() public {
        uint256 id = _full();
        vm.prank(a); ajo.pay(id);
        vm.prank(a);
        vm.expectRevert(AjoCircle.Bad.selector);
        ajo.pay(id);
    }

    function test_cannot_close_early() public {
        uint256 id = _full();
        vm.prank(a); ajo.pay(id);
        vm.expectRevert(AjoCircle.Bad.selector);
        ajo.closeRound(id);
    }

    function test_cannot_join_twice_or_after_start() public {
        uint256 id = _full();
        vm.prank(a);
        vm.expectRevert(AjoCircle.Bad.selector);
        ajo.join(id);
        vm.prank(address(0xD4));
        vm.expectRevert(AjoCircle.Bad.selector);
        ajo.join(id);
    }

    function test_outsider_cannot_pay() public {
        uint256 id = _full();
        vm.prank(address(0xD4));
        vm.expectRevert(AjoCircle.Bad.selector);
        ajo.pay(id);
    }

    function test_withdraw_before_end_rejected() public {
        uint256 id = _full();
        vm.prank(a);
        vm.expectRevert(AjoCircle.Bad.selector);
        ajo.withdrawCollateral(id);
    }

    function test_repeat_defaulter_runs_out_of_collateral_pot_short() public {
        uint256 id = _full();
        for (uint256 r; r < 2; r++) {
            vm.prank(a); ajo.pay(id);
            vm.prank(b); ajo.pay(id);
            vm.warp(block.timestamp + 1 days);
            ajo.closeRound(id);
        }
        // round 3: c has no collateral left, recipient c gets only what a and b paid
        vm.prank(a); ajo.pay(id);
        vm.prank(b); ajo.pay(id);
        vm.warp(block.timestamp + 1 days);
        uint256 before = tok.balanceOf(c);
        ajo.closeRound(id);
        assertEq(tok.balanceOf(c) - before, 2 * AMT);
    }

    function test_reentrant_token_blocked() public {
        ReentrantToken rt = new ReentrantToken();
        AjoCircle r = new AjoCircle(IERC20(address(rt)));
        rt.setTarget(r);
        rt.mint(a, 1000e6);
        vm.prank(a);
        rt.approve(address(r), type(uint256).max);
        vm.prank(a);
        vm.expectRevert(AjoCircle.Bad.selector);
        r.createCircle(AMT, 2, 1 days);
    }
}

contract ReentrantToken is MockToken {
    AjoCircle target;
    function setTarget(AjoCircle t) external { target = t; }
    function transferFrom(address f, address t, uint256 a) public override returns (bool) {
        target.join(0); // re-enter during the pull
        return super.transferFrom(f, t, a);
    }
}
