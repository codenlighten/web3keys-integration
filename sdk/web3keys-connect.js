"use strict";
var Web3KeysConnect = (() => {
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __commonJS = (cb, mod) => function __require() {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  };

  // src/crypto/lib.js
  var require_lib = __commonJS({
    "src/crypto/lib.js"(exports, module) {
      "use strict";
      function g() {
        return typeof window !== "undefined" ? window : globalThis;
      }
      function getBsv() {
        const bsv = g().bsv;
        if (!bsv) throw new Error("SmartLedger bundle (window.bsv) not loaded");
        return bsv;
      }
      function getArgon2() {
        const a = g().argon2;
        if (!a) throw new Error("argon2-browser (window.argon2) not loaded");
        return a;
      }
      function getCrypto() {
        const c = g().crypto;
        if (!c || !c.subtle) throw new Error("WebCrypto (crypto.subtle) unavailable");
        return c;
      }
      function subtle() {
        return getCrypto().subtle;
      }
      function randomBytes(n) {
        const b = new Uint8Array(n);
        getCrypto().getRandomValues(b);
        return b;
      }
      module.exports = { getBsv, getArgon2, getCrypto, subtle, randomBytes };
    }
  });

  // src/crypto/b64.js
  var require_b64 = __commonJS({
    "src/crypto/b64.js"(exports, module) {
      "use strict";
      function toB64(bytes) {
        const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
        let s = "";
        for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
        return btoa(s);
      }
      function fromB64(str) {
        const s = atob(str);
        const b = new Uint8Array(s.length);
        for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i);
        return b;
      }
      function toB64Url(bytes) {
        return toB64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
      }
      function fromB64Url(str) {
        let s = String(str).replace(/-/g, "+").replace(/_/g, "/");
        while (s.length % 4) s += "=";
        return fromB64(s);
      }
      module.exports = { toB64, fromB64, toB64Url, fromB64Url };
    }
  });

  // src/crypto/jwt.js
  var require_jwt = __commonJS({
    "src/crypto/jwt.js"(exports, module) {
      "use strict";
      var { getBsv, subtle } = require_lib();
      var { toB64Url, fromB64Url } = require_b64();
      var enc = (s) => new TextEncoder().encode(s);
      var dec = (b) => new TextDecoder().decode(b);
      var jsonToB64Url = (obj) => toB64Url(enc(JSON.stringify(obj)));
      var b64UrlToJson = (s) => JSON.parse(dec(fromB64Url(s)));
      var nowSec = () => Math.floor(Date.now() / 1e3);
      function sha256(input) {
        const bsv = getBsv();
        const B = bsv.deps.Buffer;
        return bsv.crypto.Hash.sha256(typeof input === "string" ? B.from(input, "utf8") : B.from(input));
      }
      function jwkFromPublicKey(pub) {
        const x = new Uint8Array(pub.point.getX().toBuffer({ size: 32 }));
        const y = new Uint8Array(pub.point.getY().toBuffer({ size: 32 }));
        return { kty: "EC", crv: "secp256k1", x: toB64Url(x), y: toB64Url(y) };
      }
      function publicKeyFromJwk(jwk) {
        const bsv = getBsv();
        const B = bsv.deps.Buffer;
        const px = bsv.crypto.BN.fromBuffer(B.from(fromB64Url(jwk.x)));
        const py = bsv.crypto.BN.fromBuffer(B.from(fromB64Url(jwk.y)));
        return bsv.PublicKey.fromPoint(new bsv.crypto.Point(px, py));
      }
      function signJwt(header, payload, privateKey) {
        const bsv = getBsv();
        const signingInput = jsonToB64Url(header) + "." + jsonToB64Url(payload);
        const sig = bsv.crypto.ECDSA.sign(sha256(signingInput), privateKey);
        const r = new Uint8Array(sig.r.toBuffer({ size: 32 }));
        const s = new Uint8Array(sig.s.toBuffer({ size: 32 }));
        const jose = new Uint8Array(64);
        jose.set(r, 0);
        jose.set(s, 32);
        return signingInput + "." + toB64Url(jose);
      }
      function decodeJwt(jwt) {
        const [h, p] = String(jwt).split(".");
        return { header: b64UrlToJson(h), payload: b64UrlToJson(p) };
      }
      function verifySecp256k1(signingInput, sigBytes, jwk) {
        const bsv = getBsv();
        const B = bsv.deps.Buffer;
        const r = bsv.crypto.BN.fromBuffer(B.from(sigBytes.slice(0, 32)));
        const ss = bsv.crypto.BN.fromBuffer(B.from(sigBytes.slice(32, 64)));
        return bsv.crypto.ECDSA.verify(sha256(signingInput), new bsv.crypto.Signature(r, ss), publicKeyFromJwk(jwk));
      }
      async function verifyP256(signingInput, sigBytes, jwk) {
        const key = await subtle().importKey("jwk", { kty: "EC", crv: "P-256", x: jwk.x, y: jwk.y }, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
        return subtle().verify({ name: "ECDSA", hash: "SHA-256" }, key, sigBytes, new TextEncoder().encode(signingInput));
      }
      async function verifyJwt(jwt, jwks) {
        try {
          const parts = String(jwt).split(".");
          if (parts.length !== 3) return { valid: false, reason: "malformed JWT" };
          const [h, p, s] = parts;
          const header = b64UrlToJson(h);
          const payload = b64UrlToJson(p);
          const keys = jwks && jwks.keys || [];
          const jwk = keys.find((k) => k.kid === header.kid) || keys[0];
          if (!jwk) return { valid: false, reason: "no matching key in JWKS", header, payload };
          const sigBytes = fromB64Url(s);
          if (sigBytes.length !== 64) return { valid: false, reason: "bad signature length", header, payload };
          const legacy = header.alg === "ES256" || jwk.crv === "P-256";
          let ok;
          try {
            ok = legacy ? await verifyP256(h + "." + p, sigBytes, jwk) : verifySecp256k1(h + "." + p, sigBytes, jwk);
          } catch (e) {
            return { valid: false, reason: e && e.message || "verify error", header, payload };
          }
          if (!ok) return { valid: false, reason: "bad signature", header, payload };
          if (payload.exp && nowSec() >= payload.exp) return { valid: false, reason: "expired", header, payload };
          return { valid: true, header, payload };
        } catch (e) {
          return { valid: false, reason: e && e.message || String(e) };
        }
      }
      function signIdToken({ privateKey, issuerDid, audience, nonce, ttlSec = 300, kid = "key-1" }) {
        const iat = nowSec();
        const header = { alg: "ES256K", typ: "JWT", kid };
        const payload = { iss: issuerDid, sub: issuerDid, aud: audience, nonce, iat, exp: iat + ttlSec };
        return signJwt(header, payload, privateKey);
      }
      async function verifyIdToken(jwt, jwks, { audience, nonce } = {}) {
        const r = await verifyJwt(jwt, jwks);
        if (!r.valid) return r;
        const p = r.payload;
        const bad = (reason) => ({ valid: false, reason, header: r.header, payload: p });
        if (!p.iss) return bad("missing issuer");
        if (audience && p.aud !== audience) return bad("audience mismatch");
        if (nonce && p.nonce !== nonce) return bad("nonce mismatch");
        return { valid: true, header: r.header, payload: p, did: p.iss };
      }
      module.exports = { signJwt, decodeJwt, verifyJwt, signIdToken, verifyIdToken, jwkFromPublicKey, publicKeyFromJwk, nowSec };
    }
  });

  // src/sdk/connect.js
  var require_connect = __commonJS({
    "src/sdk/connect.js"(exports, module) {
      var jwt = require_jwt();
      function randomHex(n) {
        const a = new Uint8Array(n);
        (typeof crypto !== "undefined" ? crypto : window.crypto).getRandomValues(a);
        return [...a].map((b) => b.toString(16).padStart(2, "0")).join("");
      }
      var trim = (u) => String(u || "").replace(/\/$/, "");
      function signIn({ baseUrl = "", clientId, redirectUri, scope = "openid", nonce, state } = {}) {
        if (!clientId || !redirectUri) throw new Error("clientId and redirectUri are required");
        nonce = nonce || randomHex(16);
        state = state || randomHex(16);
        try {
          sessionStorage.setItem("w3k_nonce", nonce);
          sessionStorage.setItem("w3k_state", state);
        } catch (_) {
        }
        const u = new URL(trim(baseUrl) + "/authorize", location.origin);
        u.searchParams.set("client_id", clientId);
        u.searchParams.set("redirect_uri", redirectUri);
        u.searchParams.set("scope", scope);
        u.searchParams.set("nonce", nonce);
        u.searchParams.set("state", state);
        location.href = u.toString();
      }
      async function verifyIdToken(idToken, { baseUrl = "", audience, nonce } = {}) {
        let payload;
        try {
          payload = jwt.decodeJwt(idToken).payload;
        } catch (_) {
          return { error: "malformed_token" };
        }
        const handle = String(payload.iss || "").split(":u:")[1];
        if (!handle) return { error: "bad_issuer" };
        let jwks;
        try {
          jwks = await fetch(trim(baseUrl) + "/u/" + handle + "/jwks.json").then((r) => r.ok ? r.json() : null);
        } catch (_) {
          jwks = null;
        }
        if (!jwks) return { error: "jwks_unresolved" };
        const v = await jwt.verifyIdToken(idToken, jwks, { audience, nonce });
        return v.valid ? { did: v.did, payload: v.payload } : { error: v.reason || "invalid_token" };
      }
      async function handleCallback({ baseUrl = "", expectedClientId } = {}) {
        const h = new URLSearchParams(String(location.hash || "").replace(/^#/, ""));
        if (h.get("error")) return { error: h.get("error") };
        const idToken = h.get("id_token");
        if (!idToken) return null;
        let expState = null, nonce = null;
        try {
          expState = sessionStorage.getItem("w3k_state");
          nonce = sessionStorage.getItem("w3k_nonce");
        } catch (_) {
        }
        if (expState && h.get("state") !== expState) return { error: "state_mismatch" };
        return verifyIdToken(idToken, { baseUrl, audience: expectedClientId, nonce });
      }
      module.exports = { signIn, handleCallback, verifyIdToken };
    }
  });
  return require_connect();
})();
//# sourceMappingURL=web3keys-connect.js.map
