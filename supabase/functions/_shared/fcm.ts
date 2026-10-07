// Shared FCM (Firebase Cloud Messaging) sender for Android push tokens.
// Goes through the Lovable connector gateway, so the Firebase service account
// never lives in code or in plain project secrets. Returns the same shape as
// sendApns so callers can treat both platforms identically.

import type { ApnsArgs, ApnsResult } from "./apns.ts";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/firebase_messaging";

export function isFcmConfigured(): boolean {
  return !!(Deno.env.get("LOVABLE_API_KEY") && Deno.env.get("FIREBASE_MESSAGING_API_KEY"));
}

export async function sendFcm(args: ApnsArgs): Promise<ApnsResult> {
  const lovableKey = Deno.env.get("LOVABLE_API_KEY");
  const connKey = Deno.env.get("FIREBASE_MESSAGING_API_KEY");
  if (!lovableKey || !connKey) return { ok: false, reason: "fcm_secrets_missing" };

  try {
    const res = await fetch(`${GATEWAY_URL}/v1/projects/_/messages:send`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "X-Connection-Api-Key": connKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: {
          token: args.deviceToken,
          notification: { title: args.title, body: args.body },
          data: args.data, // string values only (same keys as the iOS payload)
          android: {
            priority: "HIGH",
            notification: { sound: "default" },
          },
        },
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      let reason: string | undefined;
      try {
        const j = JSON.parse(text);
        const details = (j?.error?.details ?? []) as Array<{ errorCode?: string }>;
        reason = details.find((d) => d.errorCode)?.errorCode ?? j?.error?.status ?? text;
      } catch { reason = text; }
      // Map FCM's "token no longer valid" to the APNs reason the callers already
      // use for disabling stale tokens.
      if (reason === "UNREGISTERED" || res.status === 404) reason = "Unregistered";
      else if (reason === "INVALID_ARGUMENT" && /registration token/i.test(text)) reason = "BadDeviceToken";
      console.warn("[fcm] delivery failed", res.status, reason);
      return { ok: false, status: res.status, reason };
    }
    return { ok: true, status: res.status };
  } catch (err) {
    console.warn("[fcm] error", err);
    return { ok: false, reason: (err as Error).message };
  }
}
