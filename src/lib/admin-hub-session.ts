// Page-memory only: preserved across table/diagram navigation, never persisted.
let hubToken: string | null = null;

export function captureAdminHubToken(): string | null {
  const url = new URL(window.location.href);
  if (url.searchParams.has('hub_token')) {
    hubToken = url.searchParams.get('hub_token') ?? '';
    url.searchParams.delete('hub_token');
    window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
  }
  return hubToken;
}

export function clearAdminHubToken(): void {
  hubToken = null;
}

export function adminAuthHeaders(key: string, token: string | null): Record<string, string> {
  return token !== null ? { 'x-hub-token': token } : { 'x-admin-key': key };
}