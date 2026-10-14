import { fallback, http } from "viem";
import { monad, monadTestnet } from "viem/chains";

const net = (import.meta.env.VITE_NETWORK as string | undefined) ?? "testnet";
export const chain = net === "mainnet" ? monad : monadTestnet;
export const AJO = import.meta.env.VITE_AJO_ADDRESS as `0x${string}` | undefined;
export const TOKEN = import.meta.env.VITE_TOKEN_ADDRESS as `0x${string}` | undefined;
export const explorer = chain.blockExplorers?.default.url;
/** AUSD and the mock token both use 6 decimals. */
export const DECIMALS = 6;

/** The public RPC rate-limits (429) under load, so testnet falls through to other public endpoints (each answered eth_chainId 0x279f on 2026-10-13). */
const TESTNET_RPCS = [
  "https://testnet-rpc.monad.xyz",
  "https://rpc-testnet.monadinfra.com",
  "https://rpc.ankr.com/monad_testnet",
  "https://monad-testnet.drpc.org",
  "https://monad-testnet.api.onfinality.io/public",
];
export const transport = net === "mainnet" ? http() : fallback(TESTNET_RPCS.map((u) => http(u, { retryCount: 1 })));
