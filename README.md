# Web3Keys — Integration Kit

**Add Web3Keys to your app: one identity for your users, plus redeemable tokens (royalties,
credits, tickets) that show up in their wallet and pay out through you.**

[Web3Keys](https://web3keys.com) is the identity + SSO hub and redeemable-asset wallet for the
SmartLedger ecosystem. Your users get a single non-custodial identity across every app; you get a
clean way to sign them in, issue them value, and pay it out. This repo is everything you need to
integrate — SDKs, a full API contract, and a runnable reference server. No keys or secrets are ever
exposed: a user's Web3Keys signature *is* the authorization.

- 📖 **[INTEGRATION.md](./INTEGRATION.md)** — the complete contract (endpoints, token metadata, proofs)
- 🧩 **[sdk/](./sdk)** — drop-in "Sign in with Web3Keys" SDKs
- 🛠 **[examples/redeem-server/](./examples/redeem-server)** — a working issuing-app redeem handler

---

## 1. Sign in with Web3Keys (2 minutes)

```html
<script src="https://web3keys.com/web3keys-login.js"></script>
<button id="signin">Sign in with Web3Keys</button>
<script>
  document.querySelector('#signin').onclick = () => Web3KeysLogin.start();
  Web3KeysLogin.checkCallback().then((r) => {              // on the page they return to
    if (r.status === 'ok') console.log('signed in as', r.address); // their identity address
  });
</script>
```
The user signs a domain-bound challenge with their identity key; it's verified at
`/api/verify-login`. Prefer standards DID-JWT SSO? See [`sdk/web3keys-connect.js`](./sdk) and
[INTEGRATION.md §1](./INTEGRATION.md#1-sign-in-with-web3keys).

## 2. Issue a redeemable token

Mint a 1Sat Ordinal to the user's token address with your metadata in the MAP `data.map`:

```json
{ "app": "raregeneration", "name": "Midnight — Q3 royalties",
  "value": 12.50, "currency": "USD", "kind": "royalty", "status": "active",
  "redeemUrl": "https://your-app.com/redeem" }
```

It appears in their wallet grouped under your app, with a **"$12.50"** badge and a **Redeem** button.
Whatever media you inscribe (image/video/audio) renders inline. Optionally deliver a signed issuance
VC so "💵 $12.50 arriving" shows instantly, before the token indexes
([INTEGRATION.md §2](./INTEGRATION.md#2-issue-a-token-the-wallet-understands-1sat-ordinals--map)).

## 3. Accept a redemption

When the user taps Redeem, Web3Keys signs a proof and sends them to your `redeemUrl`. Verify it,
then pay out and spend the token:

```js
const v = await fetch('https://web3keys.com/api/verify-redeem', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ app, token, address, identity, nonce, signature }),
}).then((r) => r.json());
if (v.valid && v.held) { await payout(); await spendToken(); }   // your Stripe + wallet code
```
Copy [`examples/redeem-server/`](./examples/redeem-server) as your starting point — it handles every
branch (tampered, already-used, indexer-down, replay).

---

## Endpoint reference
| Endpoint | Method | Purpose |
|---|---|---|
| `/api/verify-login` | POST | Verify a signature login |
| `/api/verify-redeem` | POST | Verify a redeem proof + token-held check |
| `/inbox` | POST | Deliver a signed VC / issuance notice (issuer API key) |
| `/authorize` | GET | Consent page (DID id_token or signature) |
| `/u/<handle>/did.json` · `/jwks.json` | GET | DID document + keys |
| `/.well-known/bsvalias` | GET | Paymail capabilities |

Full details in **[INTEGRATION.md](./INTEGRATION.md)**. For a `client_id` or issuer API key, contact
the SmartLedger team.

## License
MIT — see [LICENSE](./LICENSE).
