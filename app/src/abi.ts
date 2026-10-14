import { parseAbi } from "viem";

export const ajoAbi = parseAbi([
  "function createCircle(uint128 contribution, uint32 size, uint32 roundSeconds) returns (uint256)",
  "function join(uint256 id)",
  "function pay(uint256 id)",
  "function closeRound(uint256 id)",
  "function withdrawCollateral(uint256 id)",
  "function circlesOf(address who) view returns (uint256[])",
  "function getCircle(uint256 id) view returns (uint128 contribution, uint32 size, uint32 roundSeconds, uint32 round, uint64 roundStart, address[] members)",
  "function paid(uint256 id, uint256 round, address member) view returns (bool)",
  "function paidCount(uint256 id) view returns (uint32)",
  "function collateral(uint256 id, address member) view returns (uint256)",
  "function nextId() view returns (uint256)",
]);

export const erc20Abi = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function mint(address to, uint256 amount)",
]);
