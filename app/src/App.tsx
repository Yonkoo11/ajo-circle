import { useCallback, useEffect, useState } from "react";
import { formatUnits, parseUnits } from "viem";
import { ajoAbi, erc20Abi } from "./abi";
import { AJO, DECIMALS, TOKEN, chain, explorer } from "./config";
import * as w from "./wallet";

const KEYS = 20; // key index 0 is the main wallet; 1..20 are per-circle keys
const fmt = (v: bigint) => Number(formatUnits(v, DECIMALS)).toLocaleString(undefined, { maximumFractionDigits: 2 });
const short = (a: string) => a.slice(0, 6) + "…" + a.slice(-4);

type Circle = { contribution: bigint; size: number; roundSeconds: number; round: number; roundStart: number; members: `0x${string}`[] };

function useRoute() {
  const [hash, setHash] = useState(location.hash);
  useEffect(() => {
    const f = () => setHash(location.hash);
    addEventListener("hashchange", f);
    return () => removeEventListener("hashchange", f);
  }, []);
  const m = hash.match(/^#\/c\/(\d+)$/);
  return m ? BigInt(m[1]) : null;
}

export function App() {
  const [signedIn, setSignedIn] = useState(w.isSignedIn());
  const id = useRoute();
  return (
    <main>
      <header>
        <a href="#/" className="brand">Ajo</a>
        {signedIn && (
          <button className="ghost" onClick={() => { w.signOut(); setSignedIn(false); }}>Lock</button>
        )}
      </header>
      {signedIn && <Recovery />}
      {!AJO || !TOKEN ? (
        <Notice title="Not configured">Set VITE_AJO_ADDRESS and VITE_TOKEN_ADDRESS, then rebuild.</Notice>
      ) : !signedIn ? (
        <Welcome onDone={() => setSignedIn(true)} />
      ) : id !== null ? (
        <CirclePage id={id} />
      ) : (
        <Home />
      )}
      <footer>
        {chain.testnet ? "This runs on a test network with play money. No real group has used it yet." : "Your keys never leave this device."}
        {explorer && AJO && <> <a href={`${explorer}/address/${AJO}`} target="_blank" rel="noreferrer">View the contract</a></>}
      </footer>
    </main>
  );
}

function Recovery() {
  const [phrase, setPhrase] = useState("");
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  if (!open) return <button className="ghost small" onClick={() => setOpen(true)}>Back up my keys</button>;
  return (
    <section className="card">
      <h2>Your recovery phrase</h2>
      <p>One passkey makes one set of keys: your main wallet plus a separate key for each circle. These 24 words recreate all of them in MetaMask or Rabby. Anyone who sees them can spend your money, so write them down offline and never share them.</p>
      {phrase ? <code className="phrase">{phrase}</code> : <button onClick={() => { try { setPhrase(w.recoveryPhrase()); } catch (e) { setError(e instanceof Error ? e.message : "Could not read the phrase."); } }}>Show my 24 words</button>}
      {error && <p className="err">{error}</p>}
      <button className="ghost" onClick={() => { setPhrase(""); setOpen(false); }}>Hide</button>
    </section>
  );
}

function Notice({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="card"><h2>{title}</h2><p>{children}</p></section>;
}

function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true); setError("");
    try { await fn(); } catch (e) { setError(e instanceof Error ? e.message.split("\n")[0] : "Something went wrong."); }
    setBusy(false);
  };
  return { busy, error, run };
}

function Welcome({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState("");
  const { busy, error, run } = useAction();
  return (
    <section className="card hero">
      <h1>Your group's savings, held by a contract.</h1>
      <p>Join a savings circle with Face ID. A contract holds the pot, and you keep your own key.</p>
      {w.hasCredential() ? (
        <button disabled={busy} onClick={() => run(async () => { await w.signIn(); onDone(); })}>{busy ? "Waiting for Face ID…" : "Unlock with Face ID"}</button>
      ) : (
        <>
          <input placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} />
          <button disabled={busy || !name.trim()} onClick={() => run(async () => { await w.signUp(name.trim()); onDone(); })}>{busy ? "Waiting for Face ID…" : "Create with Face ID"}</button>
        </>
      )}
      {w.hasCredential() && <button className="ghost" onClick={() => { try { localStorage.removeItem("ajo.credential"); } catch { /* storage blocked */ } location.reload(); }}>Use a different passkey</button>}
      {error && <p className="err">{error}</p>}
      <div className="example">
        <p className="label">Example circle</p>
        <p className="pot">100<small>AUSD</small></p>
        <p className="muted">5 friends, 20 AUSD each, one takes the pot every week. This is an example, not a real circle.</p>
      </div>
    </section>
  );
}

function Balances({ index }: { index: number }) {
  const addr = w.addressAt(index);
  const [bal, setBal] = useState<{ mon: bigint; tok: bigint } | null>(null);
  const [failed, setFailed] = useState(false);
  const { busy, error, run } = useAction();
  const load = useCallback(async () => {
    const [mon, tok] = await Promise.all([
      w.publicClient.getBalance({ address: addr }),
      w.publicClient.readContract({ address: TOKEN!, abi: erc20Abi, functionName: "balanceOf", args: [addr] }),
    ]);
    setBal({ mon, tok });
    setFailed(false);
  }, [addr]);
  const reload = useCallback(() => { load().catch(() => setFailed(true)); }, [load]);
  useEffect(reload, [reload]);
  const testnet = !!chain.testnet;
  const lowGas = bal !== null && bal.mon < parseUnits("0.05", 18);
  const getGas = () => run(async () => {
    const r = await fetch("/api/drip", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ address: addr }) });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error ?? "Gas request failed");
    await new Promise((x) => setTimeout(x, 2500));
    await load();
  });
  const getCoins = () => run(async () => { await w.send(index, TOKEN!, erc20Abi, "mint", [addr, parseUnits("50", DECIMALS)]); await load(); });
  return (
    <div className="fund">
      <p className="label">Fund this key</p>
      <code>{addr}</code>
      <p>{bal ? `${fmt(bal.tok)} AUSD · ${Number(formatUnits(bal.mon, 18)).toFixed(3)} MON for fees` : failed ? "Couldn't load balances." : "Loading balances…"}</p>
      {failed && <button className="ghost small" onClick={reload}>Try again</button>}
      {testnet && lowGas && <button disabled={busy} onClick={getGas}>{busy ? "Sending…" : "Get test gas (MON)"}</button>}
      {testnet && bal && !lowGas && bal.tok < parseUnits("10", DECIMALS) && <button disabled={busy} onClick={getCoins}>{busy ? "Minting…" : "Get 50 test AUSD"}</button>}
      {error && <p className="err">{error}</p>}
      {explorer && <a href={`${explorer}/address/${addr}`} target="_blank" rel="noreferrer">View on explorer</a>}
    </div>
  );
}

async function nextFreeIndex(): Promise<number> {
  for (let i = 1; i <= KEYS; i++) {
    const used = await w.publicClient.readContract({ address: AJO!, abi: ajoAbi, functionName: "circlesOf", args: [w.addressAt(i)] });
    if (used.length === 0) return i;
  }
  throw new Error("All circle keys are in use.");
}

function Home() {
  const [ids, setIds] = useState<bigint[] | null>(null);
  const [amount, setAmount] = useState("10");
  const [size, setSize] = useState("5");
  const [days, setDays] = useState("7");
  const { busy, error, run } = useAction();
  const [idx, setIdx] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      const lists = await Promise.all(Array.from({ length: KEYS }, (_, k) =>
        w.publicClient.readContract({ address: AJO!, abi: ajoAbi, functionName: "circlesOf", args: [w.addressAt(k + 1)] })));
      setIds([...new Set(lists.flat())]);
    })().catch(() => setIds([]));
    nextFreeIndex().then(setIdx).catch(() => setIdx(null));
  }, []);

  const create = () => run(async () => {
    const i = await nextFreeIndex();
    const contribution = parseUnits(amount, DECIMALS);
    const tok = TOKEN!;
    const me = w.addressAt(i);
    const [mon, coins] = await Promise.all([
      w.publicClient.getBalance({ address: me }),
      w.publicClient.readContract({ address: tok, abi: erc20Abi, functionName: "balanceOf", args: [me] }),
    ]);
    if (mon < parseUnits("0.02", 18)) throw new Error("This key needs a little MON for fees. Use “Get test gas” below first.");
    if (coins < contribution * 2n) throw new Error(`This key needs ${fmt(contribution * 2n)} AUSD (payment plus safety deposit). Use “Get 50 test AUSD” below.`);
    const have = await w.publicClient.readContract({ address: tok, abi: erc20Abi, functionName: "allowance", args: [me, AJO!] });
    if (have < contribution * 2n) await w.send(i, tok, erc20Abi, "approve", [AJO, contribution * 2n * 100n]);
    await w.send(i, AJO!, ajoAbi, "createCircle", [contribution, Number(size), Number(days) * 86400]);
    const list = await w.publicClient.readContract({ address: AJO!, abi: ajoAbi, functionName: "circlesOf", args: [me] });
    location.hash = `#/c/${list[list.length - 1]}`;
  });

  return (
    <>
      <section className="card">
        <h2>Your circles</h2>
        {ids === null ? <p className="muted">Looking for your circles…</p> : ids.length === 0 ? <p className="muted">None yet. Start one below, or open an invite link from a friend.</p> : (
          <ul>{ids.map((x) => <li key={String(x)}><a href={`#/c/${x}`}>Circle #{String(x)}</a></li>)}</ul>
        )}
      </section>
      <section className="card">
        <h2>Start a circle</h2>
        <label>Each person pays (AUSD)<input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
        <label>Members<input inputMode="numeric" value={size} onChange={(e) => setSize(e.target.value)} /></label>
        <label>Days per round<input inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value)} /></label>
        <p className="muted">You also lock one extra payment as a safety deposit. It comes back at the end unless you miss a round.</p>
        <button disabled={busy} onClick={create}>{busy ? "Creating…" : "Create circle"}</button>
        {error && <p className="err">{error}</p>}
      </section>
      {idx !== null && <section className="card"><Balances index={idx} /></section>}
    </>
  );
}

function CirclePage({ id }: { id: bigint }) {
  const [c, setC] = useState<Circle | null>(null);
  const [paid, setPaid] = useState<Record<string, boolean>>({});
  const [ver, setVer] = useState(0);
  const [mine, setMine] = useState<number | null>(null);
  const [freeIdx, setFreeIdx] = useState<number | null>(null);
  const [err, setErr] = useState("");
  const [now, setNow] = useState(Math.floor(Date.now() / 1000));
  const { busy, error, run } = useAction();

  const load = useCallback(async () => {
    const r = await w.publicClient.readContract({ address: AJO!, abi: ajoAbi, functionName: "getCircle", args: [id] });
    const circle: Circle = { contribution: r[0], size: r[1], roundSeconds: r[2], round: r[3], roundStart: Number(r[4]), members: [...r[5]] };
    setC(circle);
    const p: Record<string, boolean> = {};
    await Promise.all(circle.members.map(async (m) => {
      p[m] = await w.publicClient.readContract({ address: AJO!, abi: ajoAbi, functionName: "paid", args: [id, BigInt(circle.round), m] });
    }));
    setPaid(p);
    let found: number | null = null;
    for (let i = 0; i <= KEYS && found === null; i++) if (circle.members.includes(w.addressAt(i))) found = i;
    setMine(found);
    if (found === null) setFreeIdx(await nextFreeIndex());
  }, [id]);

  useEffect(() => { load().catch(() => setErr("Check the link, or ask whoever invited you to send it again.")); }, [load]);
  useEffect(() => { const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000); return () => clearInterval(t); }, []);
  // Other members pay and join from their own phones: re-read every 10s so this screen does not go stale.
  useEffect(() => {
    const t = setInterval(() => { if (!document.hidden) load().catch(() => {}); }, 10000);
    return () => clearInterval(t);
  }, [load]);

  if (err) return <Notice title="Circle not found">{err}</Notice>;
  if (!c) return <Notice title="Loading">Reading the circle…</Notice>;

  const started = c.roundStart > 0;
  const done = started && c.round >= c.size;
  const left = Math.max(0, c.roundStart + c.roundSeconds - now);
  const link = `${location.origin}${location.pathname}#/c/${id}`;
  const act = (index: number, fn: string, pre?: () => Promise<void>) => run(async () => {
    if (pre) await pre();
    await w.send(index, AJO!, ajoAbi, fn, [id]);
    await load();
    setVer((v) => v + 1);
  });
  const approve = (index: number, amt: bigint) => async () => {
    const me = w.addressAt(index);
    const have = await w.publicClient.readContract({ address: TOKEN!, abi: erc20Abi, functionName: "allowance", args: [me, AJO!] });
    if (have < amt) await w.send(index, TOKEN!, erc20Abi, "approve", [AJO, amt * 100n]);
  };
  const everyonePaid = c.members.every((m) => paid[m]);

  return (
    <>
      <section className="card">
        <h2>Circle #{String(id)}</h2>
        <p className="pot">{fmt(c.contribution * BigInt(c.size))}<small>AUSD in the pot</small></p>
        <p className="muted">{fmt(c.contribution)} AUSD each, every {Math.round(c.roundSeconds / 86400 * 10) / 10} days</p>
        <p>{c.members.length} of {c.size} joined · {done ? "Finished" : started ? `Round ${c.round + 1} of ${c.size}` : "Waiting for members"}</p>
        {started && !done && <p className="muted">Next payout goes to <b>{short(c.members[c.round])}</b> · {left > 0 ? `${Math.floor(left / 3600)}h ${Math.floor((left % 3600) / 60)}m left` : "window closed"}</p>}
        <ul className="members">
          {c.members.map((m, i) => (
            <li key={m}><span>{short(m)}{mine !== null && m === w.addressAt(mine) ? " (you)" : ""}{started && i === c.round && !done ? " · gets the pot" : ""}</span>{started && !done && <span className={paid[m] ? "ok" : "muted"}>{paid[m] ? "paid" : "not yet"}</span>}</li>
          ))}
        </ul>
      </section>
      <section className="card">
        {mine === null && !started && freeIdx !== null && (
          <>
            <p>Joining locks {fmt(c.contribution)} AUSD as a safety deposit, held by the contract. You get it back at the end unless you miss a round.</p>
            <button disabled={busy} onClick={() => act(freeIdx, "join", approve(freeIdx, c.contribution))}>{busy ? "Joining…" : "Join this circle"}</button>
          </>
        )}
        {mine !== null && started && !done && !paid[w.addressAt(mine)] && left > 0 && (
          <button disabled={busy} onClick={() => act(mine, "pay", approve(mine, c.contribution))}>{busy ? "Paying…" : `Pay ${fmt(c.contribution)} AUSD`}</button>
        )}
        {started && !done && (everyonePaid || left === 0) && (
          <button className="ghost" disabled={busy} onClick={() => act(mine ?? 0, "closeRound")}>Close round and send the pot</button>
        )}
        {mine !== null && done && <button disabled={busy} onClick={() => act(mine, "withdrawCollateral")}>Take back your safety deposit</button>}
        {error && <p className="err">{error}</p>}
        <p className="label">Invite link</p>
        <code>{link}</code>
        <button className="ghost" onClick={() => navigator.clipboard?.writeText(link)}>Copy link</button>
      </section>
      {(mine ?? freeIdx) !== null && <section className="card"><Balances key={ver} index={(mine ?? freeIdx)!} /></section>}
    </>
  );
}
