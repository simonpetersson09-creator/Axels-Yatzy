// Verifies that a request really comes from the device that owns session_id.
// Session ids are visible to other players, so they are NOT proof of identity
// on their own; the device id is private to the phone (never readable).
//
// TEMPORARY: requests without device_id (app 1.0.0) are still accepted so old
// versions keep working. Set REQUIRE_DEVICE = true once most players updated.
export const REQUIRE_DEVICE = false;

// deno-lint-ignore no-explicit-any
export async function verifySessionOwner(supabase: any, sessionId: unknown, deviceId: unknown): Promise<{ ok: boolean; error?: string }> {
  if (typeof sessionId !== "string" || !sessionId) return { ok: false, error: "session_id required" };
  if (deviceId === undefined || deviceId === null || deviceId === "") {
    return REQUIRE_DEVICE ? { ok: false, error: "device_id required" } : { ok: true };
  }
  if (typeof deviceId !== "string" || deviceId.length < 8 || deviceId.length > 64) {
    return { ok: false, error: "invalid device_id" };
  }
  // First claim wins; returns true only when this device owns the session.
  const { data, error } = await supabase.rpc("claim_session", { p_session_id: sessionId, p_device_id: deviceId });
  if (error) return { ok: false, error: "Databasfel" };
  return data ? { ok: true } : { ok: false, error: "Fel enhet för spelaren" };
}
