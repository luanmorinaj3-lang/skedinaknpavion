import type {
  ApiFootballEnvelope,
  AuthUser,
  BetPickCode,
  ClientAccountSummary,
  CreditTransaction,
  DailyPick,
  MatchDetailsPayload,
  MatchFixture,
  PredictionTicket,
  SeoSettings,
} from '../types';

const TOKEN_STORAGE_KEY = 'skedina_auth_token';

export function getStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setStoredToken(token: string | null): void {
  try {
    if (token) {
      localStorage.setItem(TOKEN_STORAGE_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
    }
  } catch {
    // ignore storage errors
  }
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getStoredToken();
  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const res = await fetch(path, {
    ...options,
    headers,
    credentials: 'include',
  });

  const text = await res.text();
  let json: Record<string, unknown> = {};
  if (text) {
    try {
      json = JSON.parse(text) as Record<string, unknown>;
    } catch {
      throw new Error(`Unexpected response from server (${res.status}).`);
    }
  }

  if (!res.ok) {
    const errMsg =
      typeof json.error === 'string'
        ? json.error
        : `Request failed with status ${res.status}.`;
    throw new Error(errMsg);
  }

  return json as unknown as T;
}

export function formatTiraneDateTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Tirane',
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function formatTiraneTimeOnly(iso: string): string {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Tirane',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date(iso));
  } catch {
    return '--:--';
  }
}

// Football endpoints
export function fetchTodayFixtures(): Promise<
  ApiFootballEnvelope<{ fixtures: MatchFixture[]; dailyPicks: DailyPick[] }>
> {
  return apiRequest('/api/football/today');
}

export function fetchLiveFixtures(): Promise<ApiFootballEnvelope<MatchFixture[]>> {
  return apiRequest('/api/football/live');
}

export function fetchMatchDetails(fixtureId: number): Promise<MatchDetailsPayload> {
  return apiRequest(`/api/football/statistics/${fixtureId}`);
}

// Auth endpoints
export async function loginClient(
  username: string,
  password: string
): Promise<{ user: AuthUser; token: string }> {
  const data = await apiRequest<{ user: AuthUser; token: string }>('/api/auth/client/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
  setStoredToken(data.token);
  return data;
}

export async function loginAdmin(
  username: string,
  password: string
): Promise<{ user: AuthUser; token: string }> {
  const data = await apiRequest<{ user: AuthUser; token: string }>('/api/auth/admin/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
  setStoredToken(data.token);
  return data;
}

export async function logoutSession(): Promise<void> {
  await apiRequest('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
  setStoredToken(null);
}

export function fetchCurrentUser(): Promise<{ user: AuthUser | null }> {
  return apiRequest('/api/auth/me');
}

// Client endpoints
export function fetchClientBets(): Promise<{ credits: number; tickets: PredictionTicket[] }> {
  return apiRequest('/api/client/bets');
}

export function fetchClientTransactions(): Promise<{ transactions: CreditTransaction[] }> {
  return apiRequest('/api/client/transactions');
}

export function submitPredictionSlip(params: {
  stake: number;
  selections: Array<{ fixtureId: number; pick: BetPickCode }>;
}): Promise<{ ticket: PredictionTicket; credits: number }> {
  return apiRequest('/api/client/bets', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export function settleClientBets(): Promise<{
  settledCount: number;
  credits: number;
  tickets: PredictionTicket[];
}> {
  return apiRequest('/api/client/bets/settle', { method: 'POST' });
}

// Admin endpoints
export function fetchAdminClients(): Promise<{ clients: ClientAccountSummary[] }> {
  return apiRequest('/api/admin/clients');
}

export function createAdminClient(params: {
  username: string;
  password: string;
  initialCredits: number;
  note?: string;
}): Promise<{ client: ClientAccountSummary }> {
  return apiRequest('/api/admin/clients', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export function updateAdminClient(
  clientId: string,
  params: { username?: string; password?: string; note?: string }
): Promise<{ client: ClientAccountSummary }> {
  return apiRequest(`/api/admin/clients/${clientId}`, {
    method: 'PATCH',
    body: JSON.stringify(params),
  });
}

export function toggleAdminClientStatus(
  clientId: string,
  status: 'active' | 'suspended'
): Promise<{ client: ClientAccountSummary }> {
  return apiRequest(`/api/admin/clients/${clientId}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

export function deleteAdminClient(clientId: string): Promise<{ ok: boolean }> {
  return apiRequest(`/api/admin/clients/${clientId}`, {
    method: 'DELETE',
  });
}

export function adjustAdminClientCredits(
  clientId: string,
  params: { action: 'add' | 'remove'; amount: number; reason: string }
): Promise<{ client: ClientAccountSummary; transaction: CreditTransaction }> {
  return apiRequest(`/api/admin/clients/${clientId}/credits`, {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export function fetchAdminTransactions(
  clientId?: string
): Promise<{ transactions: CreditTransaction[] }> {
  const qs = clientId ? `?clientId=${encodeURIComponent(clientId)}` : '';
  return apiRequest(`/api/admin/transactions${qs}`);
}

export function fetchAdminBets(): Promise<{ tickets: PredictionTicket[] }> {
  return apiRequest('/api/admin/bets');
}

export function settleAllAdminBets(): Promise<{
  settledCount: number;
  tickets: PredictionTicket[];
  clients: ClientAccountSummary[];
}> {
  return apiRequest('/api/admin/bets/settle', { method: 'POST' });
}

export function fetchAdminSeo(): Promise<{ seo: SeoSettings }> {
  return apiRequest('/api/admin/seo');
}

export function saveAdminSeo(seo: Partial<SeoSettings>): Promise<{ seo: SeoSettings }> {
  return apiRequest('/api/admin/seo', {
    method: 'PUT',
    body: JSON.stringify(seo),
  });
}
