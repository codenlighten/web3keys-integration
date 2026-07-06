# Web3Keys — Integration Guide for SmartLedger Apps

Web3Keys is the **identity + SSO hub and redeemable-asset wallet** for the SmartLedger ecosystem.
Your app (Rare Generation, TicketMint, SongDrop, …) integrates with it to:

1. Let users **sign in with Web3Keys** (one identity across all our apps).
2. **Issue redeemable tokens** (royalties, credits, tickets, collectibles) to a user's token address.
3. Have those tokens **show up in the user's Web3Keys wallet** with their media + a redeemable value.
4. Accept a **redemption** — verify the user really owns the token, then pay them out (Stripe) or
   admit them (ticket), and spend the token.

Base URL: `https://web3keys.com`. All verify endpoints are public + CORS-open; the **signature is the
authorization** — nothing here ever exposes a user's keys.

---

## 1. Sign in with Web3Keys

Two paths — pick per your needs. Both prove control of the user's identity key.

### a) Lightweight signature drop-in (fastest)
```html
<script src="https://web3keys.com/web3keys-login.js"></script>
<script>
  document.querySelector('#signin').onclick = () => Web3KeysLogin.start();     // from a button
  Web3KeysLogin.checkCallback().then(r => {                                     // on the redirect page
    if (r.status === 'ok') onSignedIn(r.address, r.token);   // r.address is the user's identity key addr
  });
</script>
```
Verification is automatic against `POST /api/verify-login`. No app registration required; the proof is
bound to your domain (a signature is useless on any other origin).

### b) Standards DID-JWT SSO (richer)
Redirect the user to `https://web3keys.com/authorize?client_id=<id>&redirect_uri=<uri>&nonce=<n>&state=<s>`
(your `client_id` + allowed `redirect_uri`s are pre-registered with us). You receive an `id_token`
(ES256K JWT) in the fragment; verify it against the user's published JWKS at
`https://web3keys.com/u/<handle>/jwks.json`. The user's DID is `did:web:web3keys.com:u:<handle>`.

**Why it matters for tokens:** when a user signs in, you learn their identity (address / DID) and can
map it to the **token address you mint to** — which is what makes redemption verifiable later.

---

## 2. Issue a token the wallet understands (1Sat Ordinals + MAP)

Mint a 1Sat Ordinal to the user's **token address** (BIP44 `m/44'/236'/2'/0/0` — get it from the user
at sign-up, e.g. via SSO). Put your metadata in the **MAP** (`data.map`) of the inscription. Web3Keys
reads these keys:

| MAP key | Purpose | Example |
|---|---|---|
| `app` | **Your app id** — groups the token in the wallet | `"raregeneration"` |
| `name` | Display name | `"Midnight — Q3 royalties"` |
| `value` | **Redeemable amount** (number) | `12.50` |
| `currency` | Currency for `value` (default USD) | `"USD"` |
| `kind` | Token type → drives the action label | `"royalty"` \| `"ticket"` \| `"credit"` \| `"collectible"` |
| `status` | `active` (default) or a spent state | `"active"` |
| `redeemUrl` | **https** URL the Redeem button opens | `"https://raregeneration.example/redeem"` |
| `subTypeData.collectionId` | Collection grouping | `"ep-01"` |
| *(anything else)* | Shown as attributes in the token detail | `ownership: "50%"`, `artist: "Aurora"` |

**Media:** whatever content you inscribe (image / video / audio) is rendered inline in the wallet —
image thumbnails, playable `<video>`/`<audio>` in the detail sheet.

The token then appears in the user's wallet grouped under your app, with a green **"$12.50"** badge and
a **"Redeem on <App>"** button (for `redeemUrl` + non-spent tokens).

### Announce it instantly (optional issuance notice)
On-chain indexing lags a minute or two. To give the user immediate feedback ("💵 $12.50 from Rare
Generation — arriving in your wallet"), deliver a **signed issuance VC** to their inbox:

```
POST https://web3keys.com/inbox
Authorization: Bearer <your issuer API key>

{ "recipientDid": "did:web:web3keys.com:u:<handle>", "vc": "<signed VC-JWT>" }
```
Mint the VC with `type: "RedeemableIssuance"` and `credentialSubject: { value, currency, app }`
(use the Issuer SDK's `mintVc`). Web3Keys verifies the signature against your registered JWKS before
storing — it never relays unsigned claims. The notice shows on the user's Identity tab until the real
token lands in their collection.

---

## 3. Accept a redemption

When the user taps **Redeem**, Web3Keys signs a proof with their identity key and opens your
`redeemUrl` with these query params:

```
<redeemUrl>?token=<origin>&address=<tokenAddr>&identity=<identityAddr>&nonce=<hex>&sig=<sig>&app=<app>
```

The signed message (so you can also verify locally with `bsv.Message.verify`) is exactly:
```
Web3Keys redeem v1
App: <app>
Token: <token>
Address: <address>
Nonce: <nonce>
```

### Verify it (recommended: let Web3Keys check ownership too)
```
POST https://web3keys.com/api/verify-redeem
Content-Type: application/json

{ "app": "...", "token": "...", "address": "...", "identity": "...", "nonce": "...", "signature": "..." }
```
Response:
```json
{ "valid": true, "held": true, "identity": "1...", "token": "abc_0", "address": "1..." }
```
- `valid` — the proof is a real signature by `identity`.
- `held` — the token is **currently unspent at `address`** (i.e. not already redeemed). `null` if the
  chain couldn't be reached — treat that as "retry", not "not held".

> **Reference implementation:** a working issuing-app `/redeem` handler (verify → payout → spend,
> idempotent) is in [`examples/redeem-server`](examples/redeem-server) — copy it as a starting point.

### Then, on your side (out of Web3Keys' scope)
1. If `valid && held`: run your **payout** (Stripe transfer / credit / grant admission).
2. **Spend the token** — build a tx that moves/burns the 1Sat token out of the user's address. That's
   what flips it to "used" in the wallet: Web3Keys shows redemption state by whether the token is
   still held, since a 1Sat token's minted `status` can't change after mint.

**Idempotency:** guard your payout on the token `origin` (+ `nonce`) so a re-submitted proof can't
double-pay. Spending the token on-chain is the durable guard.

**Give the user a receipt (recommended).** After a successful payout, deliver a signed
`RedemptionReceipt` VC to their inbox (same call as §2's issuance notice, `credentialSubject:
{ value, currency, app, token }`). Web3Keys shows it under **Recent redemptions** in their wallet —
a persistent, verifiable record that the money was paid.

---

## 4. Paymail (optional)

Every user has a receivable paymail `<username-or-handle>@web3keys.com`. Resolve it like any bsvalias
host: `GET https://web3keys.com/.well-known/bsvalias` → capabilities (pki / paymentDestination /
`2a40af698840` p2p-payment-destination / public-profile). Useful if you want to pay a user in BSV
directly instead of Stripe.

---

## Quick reference
| Endpoint | Method | Purpose |
|---|---|---|
| `/authorize` | GET | Consent page (DID id_token, or `response_type=signature`) |
| `/api/verify-login` | POST | Verify a signature login → session token |
| `/api/check-session` / `/api/revoke-session` | POST | Session lifecycle |
| `/api/verify-attest` | POST | Verify a signature over an arbitrary payload |
| `/api/verify-redeem` | POST | Verify a redeem proof + token-held check |
| `/u/<handle>/did.json` · `/jwks.json` | GET | DID document + keys |
| `/.well-known/bsvalias` | GET | Paymail capabilities |
| `/collection/<address>` | GET | (session) a user's normalized token holdings |

Questions or a `client_id`/registration: contact the SmartLedger team.
