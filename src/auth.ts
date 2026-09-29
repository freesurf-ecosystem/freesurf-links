/** Decode a base64url string to a Uint8Array */
function base64urlDecode(str: string): Uint8Array {
  const base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

/** A JWKS entry: a JsonWebKey that also carries `kid` (absent from the DOM lib type). */
type JWK = JsonWebKey & { kid?: string };

interface CachedJWKS {
  keys: JWK[];
  expiresAt: number;
}
let _jwksCache: CachedJWKS | null = null;

async function fetchJWKS(supabaseUrl: string): Promise<JWK[]> {
  if (_jwksCache && Date.now() < _jwksCache.expiresAt) {
    return _jwksCache.keys;
  }
  const res = await fetch(`${supabaseUrl}/auth/v1/.well-known/jwks.json`);
  if (!res.ok) throw new Error(`JWKS fetch failed: ${res.status}`);
  const data = (await res.json()) as { keys: JWK[] };
  _jwksCache = { keys: data.keys, expiresAt: Date.now() + 3600_000 };
  return data.keys;
}

function getAlgorithms(alg: string):
  | { name: string; namedCurve: string; hash: string }  // ECDSA
  | { name: string; hash: string }                       // RSA
  | "hmac"
  | null {
  switch (alg) {
    case "ES256": return { name: "ECDSA", namedCurve: "P-256", hash: "SHA-256" };
    case "ES384": return { name: "ECDSA", namedCurve: "P-384", hash: "SHA-384" };
    case "RS256": return { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" };
    case "RS384": return { name: "RSASSA-PKCS1-v1_5", hash: "SHA-384" };
    case "HS256": return "hmac";
    default:      return null;
  }
}

/**
 * Validate a Supabase-issued JWT.
 * Supports HS256 (legacy symmetric) and ES256/RS256 (asymmetric via JWKS).
 * Returns { sub, email } on success, null on failure.
 */
export async function validateSupabaseJWT(
  jwtSecret: string,
  authHeader: string | null,
  supabaseUrl: string
): Promise<{ sub: string; email: string } | null> {
  const secret = jwtSecret.trim();

  if (!authHeader?.startsWith("Bearer ")) {
    console.log("[auth] FAIL: no Bearer token");
    return null;
  }
  const token = authHeader.slice(7);
  const parts = token.split(".");
  if (parts.length !== 3) {
    console.log("[auth] FAIL: JWT not 3 parts");
    return null;
  }

  let header: { alg?: string; kid?: string } = {};
  try {
    header = JSON.parse(new TextDecoder().decode(base64urlDecode(parts[0])));
    console.log("[auth] JWT header:", JSON.stringify(header));
  } catch {
    console.log("[auth] FAIL: cannot decode JWT header");
    return null;
  }

  const algInfo = header.alg ? getAlgorithms(header.alg) : null;
  if (!algInfo) {
    console.log(`[auth] FAIL: unsupported/unknown algorithm: ${header.alg}`);
    return null;
  }

  try {
    const data = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
    const signature = base64urlDecode(parts[2]);

    if (algInfo === "hmac") { console.log("[auth] REJECT legacy HS256 (not accepted)"); return null; } else {
      // ES256 / RS256 — asymmetric, fetch JWKS
      const keys = await fetchJWKS(supabaseUrl);
      const jwk = header.kid
        ? keys.find((k) => k.kid === header.kid)
        : keys[0];

      if (!jwk) {
        console.log(`[auth] FAIL: no JWK for kid=${header.kid}`);
        return null;
      }

      let cryptoKey: CryptoKey;
      if ("namedCurve" in algInfo) {
        // ECDSA
        cryptoKey = await crypto.subtle.importKey(
          "jwk", jwk,
          { name: "ECDSA", namedCurve: algInfo.namedCurve as string },
          false, ["verify"]
        );
        const valid = await crypto.subtle.verify(
          { name: "ECDSA", hash: algInfo.hash },
          cryptoKey, signature, data
        );
        if (!valid) {
          console.log("[auth] FAIL: ECDSA signature mismatch");
          return null;
        }
      } else {
        // RSA
        cryptoKey = await crypto.subtle.importKey(
          "jwk", jwk,
          { name: algInfo.name, hash: algInfo.hash },
          false, ["verify"]
        );
        const valid = await crypto.subtle.verify(
          algInfo.name as Parameters<typeof crypto.subtle.verify>[0],
          cryptoKey, signature, data
        );
        if (!valid) {
          console.log("[auth] FAIL: RSA signature mismatch");
          return null;
        }
      }
    }

    const payload = JSON.parse(
      new TextDecoder().decode(base64urlDecode(parts[1]))
    ) as { sub?: string; email?: string; exp?: number };

    if (!payload.sub || !payload.email) {
      console.log("[auth] FAIL: missing sub or email. sub:", payload.sub, "email:", payload.email);
      return null;
    }
    if (payload.exp && Date.now() / 1000 > payload.exp) {
      console.log("[auth] FAIL: JWT expired. exp:", payload.exp, "now:", Math.floor(Date.now() / 1000));
      return null;
    }

    console.log("[auth] OK: validated user", payload.sub);
    return { sub: payload.sub, email: payload.email };
  } catch (err) {
    console.log("[auth] FAIL: exception:", err);
    return null;
  }
}
