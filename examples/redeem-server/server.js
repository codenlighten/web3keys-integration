'use strict';

// Reference: the ISSUING-APP side of the Web3Keys redemption handshake.
//
//   user taps "Redeem" in Web3Keys  →  lands HERE with a signed proof
//        →  we verify it with Web3Keys  →  pay the user (Stripe)  →  spend the token
//
// This is the half that lives in YOUR app (Rare Generation, TicketMint, …). Web3Keys does the
// identity + ownership proof; you do the payout + token-spend. Everything marked TODO(production)
// is a stub you replace with your real Stripe + wallet code. Run: `node examples/redeem-server`.

const express = require('express');

const WEB3KEYS_BASE = (process.env.WEB3KEYS_BASE || 'https://web3keys.com').replace(/\/$/, '');
const paidOut = new Set(); // idempotency guard — use a durable store (DB row per token) in production.

// Ask Web3Keys to verify the proof AND confirm the token is still held (unspent) at the address.
async function verifyRedeem({ app, token, address, identity, nonce, sig }) {
  const r = await fetch(WEB3KEYS_BASE + '/api/verify-redeem', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app, token, address, identity, nonce, signature: sig }),
  });
  return r.json(); // { valid, held, identity, token, address }
}

// What is this token worth? YOU minted it, so look it up in your own records by its origin.
function lookupTokenValue(token) {
  // TODO(production): SELECT amount, currency FROM issued_tokens WHERE origin = token
  return { amount: 12.50, currency: 'USD' };
}

// TODO(production): a real Stripe transfer/payout to the user's connected account or balance.
async function payoutViaStripe({ identity, token, amount, currency }) {
  console.log(`[payout] ${amount} ${currency} → user ${identity} (token ${token})`);
  return { ok: true, ref: 'mock_payout_' + token };
}

// TODO(production): build + broadcast a tx that spends the 1Sat token OUT of `address` (via your
// minting wallet or a sponsored broadcast). This is what flips it to "used" in the user's wallet —
// the token leaves their address, so Web3Keys' `held` check returns false next time.
async function spendToken({ token, address }) {
  console.log(`[spend] token ${token} redeemed — would broadcast a spend from ${address}`);
  return { ok: true };
}

function page(title, heading, msg) {
  return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">`
    + `<title>${title}</title><body style="font-family:system-ui;max-width:34rem;margin:12vh auto;padding:0 1.5rem;text-align:center">`
    + `<h1 style="font-size:1.6rem">${heading}</h1><p style="color:#555;font-size:1.05rem">${msg}</p></body>`;
}

const app = express();

// The redeem landing — Web3Keys redirects the user here with the signed proof.
app.get('/redeem', async (req, res) => {
  const { app: appId, token, address, identity, nonce, sig } = req.query;
  if (!token || !identity || !sig || !address || !nonce) {
    return res.status(400).send(page('Invalid', 'Invalid request', 'Missing redemption parameters.'));
  }

  // 1. Verify with Web3Keys — really this user, and do they still hold the token?
  let v;
  try { v = await verifyRedeem({ app: appId, token, address, identity, nonce, sig }); }
  catch (_) { return res.status(502).send(page('Retry', 'Please try again', "We couldn't reach Web3Keys.")); }
  if (!v.valid) return res.status(403).send(page('Rejected', 'Redemption rejected', 'That proof is not valid.'));
  if (v.held === false) return res.status(409).send(page('Used', 'Already redeemed', 'This token has already been used.'));
  if (v.held !== true) return res.status(503).send(page('Retry', 'Please try again', "We couldn't confirm ownership yet.")); // held===null: indexer down

  // 2. Idempotency — never pay twice for the same token.
  if (paidOut.has(token)) return res.send(page('Paid', 'Already paid', "You've already been paid for this token."));

  // 3. Pay out, then spend the token so it leaves the wallet.
  const { amount, currency } = lookupTokenValue(token);
  await payoutViaStripe({ identity, token, amount, currency });
  await spendToken({ token, address });
  paidOut.add(token);

  res.send(page('Paid!', 'Payout sent 🎉', `We've sent ${amount} ${currency} to your account.`));
});

module.exports = { app, verifyRedeem, _paidOut: paidOut };
if (require.main === module) {
  const port = process.env.PORT || 4000;
  app.listen(port, () => console.log(`[redeem-example] http://localhost:${port} → verifying against ${WEB3KEYS_BASE}`));
}
