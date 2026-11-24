/** WebCrypto verifies HMAC in constant time; no cookies or issued sessions. */
export async function verifyHubToken(
  token: string | null,
  secret: string | undefined,
  now?: number,
): Promise<boolean> {
  if (!token || !secret) return false;
  const match = /^(\d{1,16})\.([a-fA-F0-9]{64})$/.exec(token);
  if (!match) return false;
  const exp = Number(match[1]);
  if (!Number.isSafeInteger(exp) || exp <= (now ?? Date.now())) return false;
  const signature = Uint8Array.from(match[2].match(/../g) ?? [], (byte) => parseInt(byte, 16));
  try {
    const key = await crypto.subtle.importKey(
      'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify'],
    );
    const valid = await crypto.subtle.verify(
      'HMAC', key, signature, new TextEncoder().encode(`mrb-hub:${match[1]}`),
    );
    return valid && exp > (now ?? Date.now());
  } catch {
    return false;
  }
}