// Sign in with Web3Keys — lightweight drop-in for third-party sites.
//
//   <script src="https://web3keys.com/web3keys-login.js"></script>
//   <script>
//     // From a "Sign in" button:
//     Web3KeysLogin.start()
//
//     // On the redirect page:
//     Web3KeysLogin.checkCallback().then(function (r) {
//       if (r.status === 'ok') console.log('Signed in as', r.address, 'token', r.token)
//       else if (r.status === 'cancelled') { /* user declined */ }
//       else if (r.status !== 'no_callback') console.error(r)
//     })
//   </script>
//
// The user signs a domain-bound challenge with their Web3Keys identity key; verification happens at
// the authority's /api/verify-login (or pass { verify:false } and check bsv.Message.verify yourself).
// Nothing here ever sees the user's keys or password.

(function (global) {
  var AUTHORITY = 'https://web3keys.com';
  var NONCE_KEY = 'w3k-login-nonce';

  function randNonce() {
    var b = new Uint8Array(16); crypto.getRandomValues(b);
    var s = ''; for (var i = 0; i < b.length; i++) s += b[i].toString(16).padStart(2, '0');
    return s;
  }
  function cfg(opts) { if (opts && opts.authority) AUTHORITY = String(opts.authority).replace(/\/$/, ''); }

  function start(opts) {
    opts = opts || {};
    if (opts.authority) cfg(opts);
    var nonce = randNonce();
    try { sessionStorage.setItem(NONCE_KEY, nonce); } catch (_) {}
    var domain = location.host;
    var redirectUri = opts.redirectUri || (location.href.split('#')[0]);
    var url = AUTHORITY + '/authorize?response_type=signature'
      + '&domain=' + encodeURIComponent(domain)
      + '&nonce=' + encodeURIComponent(nonce)
      + '&redirect_uri=' + encodeURIComponent(redirectUri)
      + '&state=' + encodeURIComponent(opts.state || '');
    location.href = url;
  }

  function parseFragment() {
    var h = (location.hash || '').replace(/^#/, '');
    var out = {}; h.split('&').forEach(function (kv) { if (!kv) return; var p = kv.split('='); out[decodeURIComponent(p[0])] = decodeURIComponent(p[1] || ''); });
    return out;
  }
  function clearFragment() { try { history.replaceState(null, '', location.pathname + location.search); } catch (_) {} }

  function checkCallback(opts) {
    opts = opts || {}; if (opts.authority) cfg(opts);
    var f = parseFragment();
    if (f.error) { clearFragment(); return Promise.resolve({ status: f.error === 'access_denied' ? 'cancelled' : 'error', error: f.error, state: f.state }); }
    if (!f.address || !f.signature) return Promise.resolve({ status: 'no_callback' });
    var nonce; try { nonce = sessionStorage.getItem(NONCE_KEY); } catch (_) {}
    var result = { status: 'ok', address: f.address, signature: f.signature, state: f.state, challenge: nonce, domain: location.host };
    clearFragment();
    if (opts.verify === false) return Promise.resolve(result);
    return fetch(AUTHORITY + '/api/verify-login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address: f.address, signature: f.signature, challenge: nonce, domain: location.host })
    }).then(function (r) { return r.json(); }).then(function (d) {
      if (d && d.valid) { result.token = d.token; result.exp = d.exp; return result; }
      return { status: 'error', reason: (d && d.reason) || 'verification failed' };
    }).catch(function (e) { return { status: 'error', reason: e.message }; });
  }

  global.Web3KeysLogin = { start: start, checkCallback: checkCallback, configure: cfg };
})(typeof window !== 'undefined' ? window : this);
