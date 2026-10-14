import {
  createPasskeyWithPrfOutput,
  getPasskeyPrfOutput,
  createSecp256k1SigningSession,
} from "@category-labs/mera";
import { toViemAccount } from "@category-labs/mera/viem";
import { HDKey } from "@scure/bip32";
import { entropyToMnemonic, mnemonicToSeedSync } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { createPublicClient, createWalletClient, toHex, type Abi } from "viem";
import { privateKeyToAddress } from "viem/accounts";
import { chain, transport } from "./config";

const CRED = "ajo.credential";
let prf: Uint8Array | undefined;

export const publicClient = createPublicClient({ chain, transport });

export class PasskeyError extends Error {}

function explain(e: unknown): PasskeyError {
  const msg = e instanceof Error ? `${e.name} ${e.message}` : String(e);
  if (msg.includes("PRF_UNAVAILABLE"))
    return new PasskeyError(
      "This passkey can't unlock a wallet. On desktop Chrome, save the passkey to Google Password Manager; on Mac or iPhone use iCloud Keychain.",
    );
  if (msg.includes("NotAllowed") || msg.includes("cancel"))
    return new PasskeyError("Face ID was cancelled. Try again when you're ready.");
  return new PasskeyError("Couldn't use your passkey. " + (e instanceof Error ? e.message : ""));
}

export function hasCredential(): boolean {
  try {
    return localStorage.getItem(CRED) !== null;
  } catch {
    return false;
  }
}

export function isSignedIn(): boolean {
  return prf !== undefined;
}

export async function signUp(name: string): Promise<void> {
  try {
    const created = await createPasskeyWithPrfOutput({
      rp: { id: location.hostname, name: "Ajo" },
      user: { name, displayName: name },
    });
    localStorage.setItem(CRED, JSON.stringify({ credentialId: created.credentialId, transports: created.transports }));
    prf = created.prfOutput;
  } catch (e) {
    throw explain(e);
  }
}

export async function signIn(): Promise<void> {
  try {
    const stored = localStorage.getItem(CRED);
    const known = stored ? JSON.parse(stored) : undefined;
    const out = await getPasskeyPrfOutput({ rpId: location.hostname, credential: known });
    localStorage.setItem(CRED, JSON.stringify(known?.credentialId === out.credentialId ? known : { credentialId: out.credentialId }));
    prf = out.prfOutput;
  } catch (e) {
    throw explain(e);
  }
}

export function signOut(): void {
  prf = undefined;
}

/** Same BIP-44 path Mera documents, so an exported mnemonic gives the same addresses in MetaMask or Rabby. */
function keyAt(index: number): Uint8Array {
  if (!prf) throw new PasskeyError("Sign in first.");
  const node = HDKey.fromMasterSeed(mnemonicToSeedSync(entropyToMnemonic(prf, wordlist))).derive(`m/44'/60'/0'/0/${index}`);
  if (node.privateKey === null) throw new PasskeyError("Key derivation failed.");
  return node.privateKey;
}

export function addressAt(index: number): `0x${string}` {
  return privateKeyToAddress(toHex(keyAt(index)));
}

export function recoveryPhrase(): string {
  if (!prf) throw new PasskeyError("Sign in first.");
  return entropyToMnemonic(prf, wordlist);
}

/** One signing session per transaction: the key is zeroed as soon as the transaction is sent. */
export async function send(index: number, to: `0x${string}`, abi: Abi, functionName: string, args: unknown[]): Promise<`0x${string}`> {
  const session = createSecp256k1SigningSession({ privateKey: keyAt(index) });
  try {
    const account = toViemAccount(session);
    const estimate = await publicClient.estimateContractGas({ address: to, abi, functionName, args, account: account.address } as never);
    const client = createWalletClient({ account, chain, transport });
    // Monad charges the declared gas limit, so declare it explicitly (estimate plus 20%).
    const hash = await client.writeContract({ address: to, abi, functionName, args, gas: (estimate * 120n) / 100n } as never);
    await publicClient.waitForTransactionReceipt({ hash });
    return hash;
  } finally {
    session.end();
  }
}
