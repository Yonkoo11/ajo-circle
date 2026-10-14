// Testnet only: sends a little MON so a brand-new passkey wallet can pay gas.
import { createPublicClient, createWalletClient, http, isAddress, parseEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { monadTestnet } from "viem/chains";

// Best-effort throttle: up to 6 drips per caller IP per hour (per warm instance; households and offices share an IP), and a floor so the wallet is never emptied.
const seen = new Map();
const HOUR = 3600_000;

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const to = req.body?.address;
  if (!isAddress(to ?? "")) return res.status(400).json({ error: "Bad address" });
  const ip = String(req.headers["x-forwarded-for"] ?? "").split(",")[0].trim() || "unknown";
  const recent = (seen.get(ip) ?? []).filter((t) => Date.now() - t < HOUR);
  if (recent.length >= 6) return res.status(429).json({ error: "Try again in an hour" });
  seen.set(ip, [...recent, Date.now()]); // count before any await, so parallel calls cannot all pass
  const key = process.env.DRIP_KEY;
  if (!key) return res.status(503).json({ error: "Drip not configured" });
  try {
    const pub = createPublicClient({ chain: monadTestnet, transport: http() });
    if ((await pub.getBalance({ address: to })) >= parseEther("0.05")) return res.status(200).json({ skipped: "already funded" });
    const account = privateKeyToAccount(key.startsWith("0x") ? key : `0x${key}`);
    const wallet = createWalletClient({ account, chain: monadTestnet, transport: http() });
    if ((await pub.getBalance({ address: account.address })) < parseEther("0.5")) return res.status(503).json({ error: "Drip is empty" });
    const hash = await wallet.sendTransaction({ to, value: parseEther("0.1"), gas: 21000n });
    return res.status(200).json({ hash });
  } catch (e) {
    return res.status(500).json({ error: "Drip failed" });
  }
}
