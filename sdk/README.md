# Web3Keys SDKs

Drop-in "Sign in with Web3Keys" for your app. Both are also served live from `https://web3keys.com`,
so you can `<script src>` them directly instead of vendoring — whichever you prefer.

## `web3keys-login.js` — signature drop-in (simplest)
```html
<script src="https://web3keys.com/web3keys-login.js"></script>
<script>
  Web3KeysLogin.start();                 // send the user to consent + sign
  Web3KeysLogin.checkCallback().then((r) => {   // on return
    // r.status: 'ok' | 'cancelled' | 'error' | 'no_callback'
    if (r.status === 'ok') { /* r.address, r.signature, r.state */ }
  });
</script>
```
The user signs a domain-bound challenge with their identity key. Verified at
`https://web3keys.com/api/verify-login` (or pass `{ verify: false }` and check
`bsv.Message.verify` yourself). Options: `{ authority, redirectUri, state }`.

## `web3keys-connect.js` — DID-JWT SSO (standards)
Returns a signed ES256K `id_token` (a W3C-style JWT) you verify against the user's published JWKS at
`https://web3keys.com/u/<handle>/jwks.json`. Use when you want a verifiable, portable credential and
a `did:web` subject rather than a bare signature. See
[../INTEGRATION.md §1b](../INTEGRATION.md#b-standards-did-jwt-sso-richer).

Neither SDK ever sees the user's keys or password — signing happens in the user's Web3Keys session.
