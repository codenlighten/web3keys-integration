# Redeem-server reference (issuing-app side)

A minimal, working example of the **issuing-app half** of the Web3Keys redemption handshake — the
code that lives in *your* app (Rare Generation, TicketMint, …). Web3Keys proves the user's identity
and token ownership; you do the payout and spend the token.

```
user taps "Redeem" in Web3Keys → GET /redeem?token&address&identity&nonce&sig&app
   → POST web3keys.com/api/verify-redeem  → { valid, held }
   → if valid && held: Stripe payout → spend the token → done
```

## Run
```bash
# from the repo root (reuses the root's express)
WEB3KEYS_BASE=https://web3keys.com PORT=4000 node examples/redeem-server
```
Then point a token's `redeemUrl` (in its MAP metadata) at `http://localhost:4000/redeem`.

## What you must replace (marked `TODO(production)` in server.js)
1. **`lookupTokenValue(token)`** — read the amount/currency from *your* records (you minted the token).
2. **`payoutViaStripe(...)`** — a real Stripe transfer/payout to the user.
3. **`spendToken(...)`** — build + broadcast a tx that moves/burns the 1Sat token out of the user's
   address. This is what makes it show as "used" in Web3Keys (its `held` check then returns false).
4. **Idempotency** — swap the in-memory `paidOut` Set for a durable per-token record so a replayed
   proof can never double-pay. Spending the token on-chain is the ultimate guard.

## Notes
- `held` can be `true` / `false` / `null`. `null` means Web3Keys couldn't reach the chain indexer —
  treat it as "retry", not "not held" (this example returns 503).
- You can also verify the signature yourself with `@smartledger/bsv`'s `bsv.Message.verify(msg, identity, sig)`
  where `msg` is the exact block documented in [`docs/INTEGRATION.md`](../../INTEGRATION.md) §3 —
  but calling `/api/verify-redeem` also gives you the ownership (`held`) check for free.
