// Shared APNs sender used by invite/turn/forfeit notify functions.

export interface ApnsArgs {
  deviceToken: string;
  title: string;
  body: string;
  data: Record<string, string>;
  category?: string;
}

export async function sendApns(args: ApnsArgs): Promise<boolean> {
  const keyId = Deno.env.get("APNS_KEY_ID");
  const teamId = Deno.env.get("APNS_TEAM_ID");
  const bundleId = Deno.env.get("APNS_BUNDLE_ID");
  const authKey = Deno.env.get("APNS_AUTH_KEY");
  const env = Deno.env.get("APNS_ENV") ?? "production";
  if (!keyId || !teamId || !bundleId || !authKey) return false;

  try {
    const jwt = await buildApnsJwt({ keyId, teamId, authKey });
    const host = env === "sandbox" ? "api.sandbox.push.apple.com" : "api.push.apple.com";
    const url = `https://${host}/3/device/${args.deviceToken}`;
    const payload: Record<string, unknown> = {
      aps: {
        alert: { title: args.title, body: args.body },
        sound: "default",
        "mutable-content": 1,
        ...(args.category ? { category: args.category } : {}),
      },
      ...args.data,
    };
    const res = await fetch(url, {
      method: "POST",
      headers: {
        authorization: `bearer ${jwt}`,
        "apns-topic": bundleId,
        "apns-push-type": "alert",
        "apns-priority": "10",
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      console.warn("[apns] delivery failed", res.status, await res.text());
      return false;
    }
    return true;
  } catch (err) {
    console.warn("[apns] error", err);
    return false;
  }
}

async function buildApnsJwt(a: { keyId: string; teamId: string; authKey: string }): Promise<string> {
  const header = { alg: "ES256", kid: a.keyId };
  const payload = { iss: a.teamId, iat: Math.floor(Date.now() / 1000) };
  const enc = (o: object) =>
    btoa(JSON.stringify(o)).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
  const signingInput = `${enc(header)}.${enc(payload)}`;
  let raw = a.authKey.replace(/\\n/g, "\n").trim();
  if (!raw.includes("-----BEGIN")) {
    try {
      const maybe = atob(raw.replace(/[^A-Za-z0-9+/=]/g, ""));
      if (maybe.includes("-----BEGIN")) raw = maybe;
    } catch { /* noop */ }
  }
  const pem = raw.replace(/-----[^-]+-----/g, "").replace(/[^A-Za-z0-9+/=]/g, "");
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("pkcs8", der, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(signingInput));
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
  return `${signingInput}.${sigB64}`;
}

export async function pushToSession(
  supabase: { from: (t: string) => { select: (s: string) => { eq: (c: string, v: unknown) => { eq: (c: string, v: unknown) => { order: (c: string, o: { ascending: boolean }) => { limit: (n: number) => { maybeSingle: () => Promise<{ data: { token: string; device_id: string; platform: string } | null }> } } } } } } },
  sessionId: string,
  args: Omit<ApnsArgs, "deviceToken">,
): Promise<{ delivered: boolean; deviceId: string | null }> {
  const { data: token } = await supabase
    .from("push_tokens")
    .select("device_id, token, platform")
    .eq("session_id", sessionId)
    .eq("enabled", true)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!token?.token) return { delivered: false, deviceId: token?.device_id ?? null };
  const delivered = await sendApns({ ...args, deviceToken: token.token });
  return { delivered, deviceId: token.device_id };
}
