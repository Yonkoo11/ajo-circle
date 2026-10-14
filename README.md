<div align="center">

# Ajo

[![tests](https://github.com/yonkoo11/ajo-circle/actions/workflows/tests.yml/badge.svg)](https://github.com/yonkoo11/ajo-circle/actions/workflows/tests.yml)
![testnet](https://img.shields.io/badge/Monad%20testnet-2--member%20circle%20settled-121212)
[![live](https://img.shields.io/badge/live-ajo--circle--beta.vercel.app-3fb950)](https://ajo-circles.vercel.app)

### Join a savings circle with Face ID. No wallet, no treasurer, one passkey.

**Ajo is an ajo/esusu rotating savings circle on Monad. A contract holds the pot, members sign in with a passkey through Mera, and every circle gets its own key.**

**[ Live ↗ ](https://ajo-circles.vercel.app)** · **[ Verify it yourself ↗ ](#verify-it-yourself-in-60-seconds)**

Built for the Monad Metropolis hackathon (Track 02, Consumer Products & Payments).

</div>

---

## The problem

- **The treasurer.** In a traditional ajo one person holds everyone's cash. If they stall, spend it or disappear, every payout waits.
- **The missed round.** One member who stops paying delays the whole group, and nobody has a way to cover the gap.
- **The wallet wall.** Most people who would join a circle have never installed a crypto wallet.

## What Ajo is

Each round every member pays the same amount, and one member collects the pot, in join order, until everyone has had a turn.

**`JOIN → PAY → CLOSE ROUND → COLLECT → GET COLLATERAL BACK`**

1. **Join.** Open an invite link, sign in with a passkey. Mera turns the passkey into a wallet, and the app locks one extra contribution as collateral.
2. **Pay.** Each member pays once per round, inside the round window. The contract rejects late and double payments.
3. **Close round.** Anyone can close a round once everyone has paid or the window ends. If someone missed it, their collateral covers the gap.
4. **Collect.** The member whose turn it is receives the pot.
5. **Finish.** When the last round closes, leftover collateral is withdrawable.

One passkey makes one 24-word recovery phrase (button: "Back up my keys"). Index 0 is the main wallet and each circle uses its own key, so the same phrase opens every account in MetaMask or Rabby.

## Verify it yourself in 60 seconds

No wallet and no key needed. You need [Foundry](https://book.getfoundry.sh/). Expected results below came from runs made before they were written here.

```bash
git clone https://github.com/yonkoo11/ajo-circle && cd ajo-circle/contracts
forge install foundry-rs/forge-std --no-git
forge test                     # → 11 passed; 0 failed; 0 skipped
cast chain-id --rpc-url https://testnet-rpc.monad.xyz   # → 10143
cast call 0xd2cad31A080b0daE98d9d6427e500B50bCb92774 "getCircle(uint256)" 4 \
  --rpc-url https://testnet-rpc.monad.xyz
# → contribution 1000000 (0xf4240), size 2, roundSeconds 240, round 2 (finished), 2 members
```

The tests cover a full cycle, a defaulting member, a repeat defaulter, late payment, double payment, an outsider paying, closing early, joining twice or after start, early collateral withdrawal and a re-entrant token. The chain read shows a two-member circle that ran every round to the end. It does not prove anything about a real group, real money or mainnet.

## What's real, and what we deliberately did not claim

| Capability | Status |
|---|---|
| Circle contract | Real. 11 of 11 tests pass; deployed on Monad testnet. |
| Two-member circle, start to finish | Real. Circle 4 ran two rounds and its final balances matched the expected payouts. |
| Passkey sign-up and create circle on the live site | Real. Done in desktop Chrome with a passkey saved to Google Password Manager. |
| Gas for new wallets | Real on testnet. A faucet endpoint sends 0.1 MON per new wallet. |
| Second person joining through the invite link in the UI | Real, in scripted headless Chrome with virtual passkeys: circle 6 and circle 8 each ran join, pay and close round with two users. Not yet done by two people on two phones. |
| Returning-user sign-in on the live site | Real in the same scripted run ("Unlock with Face ID"). Not yet tried on a real phone. |
| Token | Testnet uses a mock token with an open `mint`. Mainnet AUSD exists on Monad (6 decimals) but this app has not run against it. |
| Mainnet | Not deployed. |
| Yield on the idle pot | Not built. |
| Independent security audit | None. Do not put real savings in it. |
| Real savings groups using it | None yet. |

## Project layout

```
contracts/
  src/AjoCircle.sol      # the circle: create, join, pay, close round, collateral
  test/                  # 11 tests, mock token, a re-entrant token
  script/                # deploy and two-member run scripts
app/
  src/wallet.ts          # Mera passkey sign-in, key per circle, recovery phrase, signing
  src/App.tsx            # screens: welcome, create, join, circle, recovery
  api/drip.js            # testnet gas faucet for new wallets
```

## Run it locally

```bash
cd app && npm install      # install
cp .env.example .env.local  # the deployed testnet contract addresses
npm run build              # type-check and bundle the site
npm run dev                # start it at localhost
```

Passkeys need a secure origin, so use localhost or the live site. Desktop Chrome needs the passkey saved to Google Password Manager, or sign-in fails with a clear message.

## Tech stack

- **Contract:** Solidity, Foundry · **App:** Vite, React, TypeScript, viem · **Passkeys:** `@category-labs/mera` · **Chain:** Monad testnet (10143) · **Site:** Vercel

## License

MIT, see [LICENSE](LICENSE).
