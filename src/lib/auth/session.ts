export interface SessionPayload {
  userId: string;
  organizationId: string;
  role: "ADMIN" | "AUXILIAR";
  email: string;
  name: string;
  exp: number;
}

export const SESSION_COOKIE_NAME = "conciliasat_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 días

function getJwtSecret(): string {
  return (
    process.env.SESSION_SECRET?.trim() ||
    "conciliasat-dev-secret-change-in-production-2026"
  );
}

function base64UrlEncode(input: Uint8Array | string): string {
  const bytes =
    typeof input === "string" ? new TextEncoder().encode(input) : input;
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(str: string): Uint8Array {
  const padded = str.replace(/-/g, "+").replace(/_/g, "/");
  const padLen = (4 - (padded.length % 4)) % 4;
  const binary = atob(padded + "=".repeat(padLen));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function getHmacKey(usage: "sign" | "verify"): Promise<CryptoKey> {
  const secretBytes = new TextEncoder().encode(getJwtSecret());
  return crypto.subtle.importKey(
    "raw",
    secretBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    [usage]
  );
}

export async function signSessionToken(
  payload: Omit<SessionPayload, "exp">
): Promise<string> {
  const header = base64UrlEncode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const fullPayload: SessionPayload = {
    ...payload,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  };
  const body = base64UrlEncode(JSON.stringify(fullPayload));
  const signingInput = `${header}.${body}`;

  const key = await getHmacKey("sign");
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(signingInput)
  );
  return `${signingInput}.${base64UrlEncode(new Uint8Array(signature))}`;
}

export async function verifySessionToken(
  token: string | undefined | null
): Promise<SessionPayload | null> {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  try {
    const [headerB64, bodyB64, sigB64] = parts;
    const key = await getHmacKey("verify");
    const sigBytes = base64UrlDecode(sigB64);
    const sigBuffer = new ArrayBuffer(sigBytes.byteLength);
    new Uint8Array(sigBuffer).set(sigBytes);
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      sigBuffer,
      new TextEncoder().encode(`${headerB64}.${bodyB64}`)
    );
    if (!valid) return null;

    const jsonStr = new TextDecoder().decode(base64UrlDecode(bodyB64));
    const parsed = JSON.parse(jsonStr) as SessionPayload;
    if (!parsed.exp || parsed.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    if (!parsed.userId || !parsed.organizationId || !parsed.role) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}
