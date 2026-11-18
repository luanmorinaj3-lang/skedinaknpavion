import type {
  ApiFootballEnvelope,
  DailyPick,
  MatchDetailsPayload,
  MatchEventItem,
  MatchFixture,
  Odds1X2,
  TeamStatistics,
} from '../src/types.ts';
import type { FinishedFixtureOutcome } from './store.ts';

const API_BASE = 'https://v3.football.api-sports.io';
const TIRANE_TZ = 'Europe/Tirane';

const LIVE_STATUSES = new Set(['1H', 'HT', '2H', 'ET', 'BT', 'P', 'SUSP', 'INT', 'LIVE']);
const FINISHED_STATUSES = new Set(['FT', 'AET', 'PEN']);
const UPCOMING_STATUSES = new Set(['TBD', 'NS']);

const FEATURED_LEAGUE_IDS = new Set([
  2,   // UEFA Champions League
  3,   // UEFA Europa League
  848, // UEFA Europa Conference League
  39,  // Premier League
  140, // La Liga
  135, // Serie A
  78,  // Bundesliga
  61,  // Ligue 1
  310, // Superliga (Albania)
  94,  // Primeira Liga
  88,  // Eredivisie
  203, // Super Lig
  1,   // World Cup
  4,   // Euro Championship
  5,   // UEFA Nations League
]);

interface CacheEntry<T> {
  expiresAt: number;
  fetchedAt: string;
  data: T;
}

const cache = new Map<string, CacheEntry<unknown>>();
const inFlight = new Map<string, Promise<unknown>>();

export function getTiraneDateString(date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TIRANE_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function formatTiraneTime(dateIso: string): string {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: TIRANE_TZ,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date(dateIso));
  } catch {
    return '--:--';
  }
}

function getApiKey(): string | null {
  const key = process.env.API_FOOTBALL_KEY?.trim();
  if (!key || key === 'YOUR_API_FOOTBALL_V3_KEY') {
    return null;
  }
  return key;
}

interface RawApiFootballResponse<T> {
  errors?: Record<string, string> | string[];
  results?: number;
  paging?: { current: number; total: number };
  response?: T;
}

type FetchResult<T> =
  | { ok: true; data: T; paging?: { current: number; total: number }; cached: boolean; fetchedAt: string }
  | {
      ok: false;
      errorCode: 'MISSING_API_KEY' | 'API_ERROR' | 'RATE_LIMIT';
      message: string;
      fetchedAt: string;
    };

async function fetchApiFootball<T>(
  cacheKey: string,
  endpointPath: string,
  ttlMs: number
): Promise<FetchResult<T>> {
  const apiKey = getApiKey();
  const nowIso = new Date().toISOString();

  if (!apiKey) {
    return {
      ok: false,
      errorCode: 'MISSING_API_KEY',
      message:
        'API_FOOTBALL_KEY is not configured on the server. Add your API-Football v3 key to environment variables to load real matches, live scores, and odds.',
      fetchedAt: nowIso,
    };
  }

  const existing = cache.get(cacheKey) as CacheEntry<T & { __paging?: { current: number; total: number } }> | undefined;
  if (existing && Date.now() < existing.expiresAt) {
    return {
      ok: true,
      data: existing.data,
      paging: existing.data?.__paging,
      cached: true,
      fetchedAt: existing.fetchedAt,
    };
  }

  if (inFlight.has(cacheKey)) {
    return inFlight.get(cacheKey) as Promise<FetchResult<T>>;
  }

  const promise = (async (): Promise<FetchResult<T>> => {
    try {
      const res = await fetch(`${API_BASE}${endpointPath}`, {
        method: 'GET',
        headers: {
          'x-apisports-key': apiKey,
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(12000),
      });

      if (res.status === 429) {
        return {
          ok: false,
          errorCode: 'RATE_LIMIT',
          message: 'API-Football rate limit reached. Live updates will resume automatically.',
          fetchedAt: nowIso,
        };
      }

      if (!res.ok) {
        return {
          ok: false,
          errorCode: 'API_ERROR',
          message: `API-Football returned HTTP ${res.status}.`,
          fetchedAt: nowIso,
        };
      }

      const json = (await res.json()) as RawApiFootballResponse<T>;
      const errObj = json.errors;
      const hasErrors = Array.isArray(errObj)
        ? errObj.length > 0
        : errObj && Object.keys(errObj).length > 0;

      if (hasErrors) {
        const msg = Array.isArray(errObj)
          ? errObj.join('; ')
          : Object.values(errObj || {}).join('; ');
        const isRate = msg.toLowerCase().includes('rate') || msg.toLowerCase().includes('limit') || msg.toLowerCase().includes('requests');
        return {
          ok: false,
          errorCode: isRate ? 'RATE_LIMIT' : 'API_ERROR',
          message: msg || 'API-Football returned an error response.',
          fetchedAt: nowIso,
        };
      }

      const responseData = (json.response ?? []) as T;
      if (json.paging && typeof responseData === 'object' && responseData !== null) {
        Object.defineProperty(responseData, '__paging', {
          value: json.paging,
          enumerable: false,
        });
      }

      cache.set(cacheKey, {
        expiresAt: Date.now() + ttlMs,
        fetchedAt: nowIso,
        data: responseData,
      });

      return {
        ok: true,
        data: responseData,
        paging: json.paging,
        cached: false,
        fetchedAt: nowIso,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Network error connecting to API-Football.';
      return {
        ok: false,
        errorCode: 'API_ERROR',
        message,
        fetchedAt: nowIso,
      };
    } finally {
      inFlight.delete(cacheKey);
    }
  })();

  inFlight.set(cacheKey, promise);
  return promise;
}

interface RawFixtureItem {
  fixture: {
    id: number;
    referee: string | null;
    date: string;
    timestamp: number;
    venue?: { name: string | null; city: string | null };
    status: { long: string; short: string; elapsed: number | null };
  };
  league: {
    id: number;
    name: string;
    country: string;
    logo: string | null;
    flag: string | null;
    round: string | null;
  };
  teams: {
    home: { id: number; name: string; logo: string | null; winner: boolean | null };
    away: { id: number; name: string; logo: string | null; winner: boolean | null };
  };
  goals: { home: number | null; away: number | null };
  score?: {
    halftime?: { home: number | null; away: number | null };
  };
}

function mapRawFixture(raw: RawFixtureItem, odds: Odds1X2 | null = null): MatchFixture {
  const short = raw.fixture.status.short || 'NS';
  return {
    id: raw.fixture.id,
    dateIso: raw.fixture.date,
    kickoffTimeTirane: formatTiraneTime(raw.fixture.date),
    timestamp: raw.fixture.timestamp,
    statusShort: short,
    statusLong: raw.fixture.status.long || 'Not Started',
    elapsed: raw.fixture.status.elapsed,
    isLive: LIVE_STATUSES.has(short),
    isFinished: FINISHED_STATUSES.has(short),
    isUpcoming: UPCOMING_STATUSES.has(short),
    venue: raw.fixture.venue?.name || null,
    referee: raw.fixture.referee || null,
    league: {
      id: raw.league.id,
      name: raw.league.name,
      country: raw.league.country,
      logo: raw.league.logo || null,
      flag: raw.league.flag || null,
      round: raw.league.round || null,
    },
    homeTeam: {
      id: raw.teams.home.id,
      name: raw.teams.home.name,
      logo: raw.teams.home.logo || null,
      winner: raw.teams.home.winner,
    },
    awayTeam: {
      id: raw.teams.away.id,
      name: raw.teams.away.name,
      logo: raw.teams.away.logo || null,
      winner: raw.teams.away.winner,
    },
    goals: {
      home: raw.goals.home,
      away: raw.goals.away,
    },
    halftimeScore: {
      home: raw.score?.halftime?.home ?? null,
      away: raw.score?.halftime?.away ?? null,
    },
    odds,
  };
}

interface RawPrematchOddsItem {
  fixture: { id: number };
  bookmakers?: Array<{
    id: number;
    name: string;
    bets?: Array<{
      id: number;
      name: string;
      values?: Array<{ value: string; odd: string }>;
    }>;
  }>;
}

function parsePrematch1X2(item: RawPrematchOddsItem, fetchedAt: string): Odds1X2 | null {
  if (!item.bookmakers || item.bookmakers.length === 0) return null;
  const preferredOrder = ['Bet365', 'Pinnacle', '1xBet', 'Bwin', 'Unibet', 'William Hill'];
  const sortedBookmakers = [...item.bookmakers].sort((a, b) => {
    const idxA = preferredOrder.indexOf(a.name);
    const idxB = preferredOrder.indexOf(b.name);
    const rankA = idxA === -1 ? 999 : idxA;
    const rankB = idxB === -1 ? 999 : idxB;
    return rankA - rankB;
  });

  for (const bm of sortedBookmakers) {
    const matchWinnerBet = bm.bets?.find(
      (b) => b.id === 1 || b.name.toLowerCase() === 'match winner'
    );
    if (!matchWinnerBet?.values) continue;

    let home: number | null = null;
    let draw: number | null = null;
    let away: number | null = null;

    for (const v of matchWinnerBet.values) {
      const num = Number.parseFloat(v.odd);
      if (!Number.isFinite(num) || num <= 1) continue;
      const val = v.value.toLowerCase();
      if (val === 'home' || val === '1') home = num;
      else if (val === 'draw' || val === 'x') draw = num;
      else if (val === 'away' || val === '2') away = num;
    }

    if (home !== null || draw !== null || away !== null) {
      return {
        home,
        draw,
        away,
        bookmaker: bm.name,
        source: 'prematch',
        updatedAt: fetchedAt,
      };
    }
  }
  return null;
}

interface RawLiveOddsItem {
  fixture: { id: number };
  odds?: Array<{
    id: number;
    name: string;
    values?: Array<{
      value: string;
      odd: string;
      suspended?: boolean;
      main?: boolean;
    }>;
  }>;
}

function parseLive1X2(item: RawLiveOddsItem, fetchedAt: string): Odds1X2 | null {
  if (!item.odds || item.odds.length === 0) return null;
  const market = item.odds.find(
    (o) =>
      o.id === 59 ||
      o.id === 1 ||
      o.name.toLowerCase().includes('fulltime result') ||
      o.name.toLowerCase() === 'match winner'
  );
  if (!market?.values) return null;

  let home: number | null = null;
  let draw: number | null = null;
  let away: number | null = null;

  for (const v of market.values) {
    if (v.suspended) continue;
    const num = Number.parseFloat(v.odd);
    if (!Number.isFinite(num) || num <= 1) continue;
    const val = v.value.toLowerCase();
    if (val === 'home' || val === '1') home = num;
    else if (val === 'draw' || val === 'x') draw = num;
    else if (val === 'away' || val === '2') away = num;
  }

  if (home === null && draw === null && away === null) return null;
  return {
    home,
    draw,
    away,
    bookmaker: 'Live Feed',
    source: 'live',
    updatedAt: fetchedAt,
  };
}

async function fetchPrematchOddsMapForDate(dateStr: string): Promise<Map<number, Odds1X2>> {
  const oddsMap = new Map<number, Odds1X2>();
  const firstPage = await fetchApiFootball<RawPrematchOddsItem[]>(
    `prematch_odds_${dateStr}_p1`,
    `/odds?date=${dateStr}&bet=1&timezone=${encodeURIComponent(TIRANE_TZ)}&page=1`,
    300_000 // 5 minutes cache
  );

  if (!firstPage.ok) {
    return oddsMap;
  }

  for (const item of firstPage.data) {
    const parsed = parsePrematch1X2(item, firstPage.fetchedAt);
    if (parsed) oddsMap.set(item.fixture.id, parsed);
  }

  const totalPages = Math.min(firstPage.paging?.total || 1, 4);
  if (totalPages > 1) {
    const pageRequests: Array<Promise<FetchResult<RawPrematchOddsItem[]>>> = [];
    for (let p = 2; p <= totalPages; p++) {
      pageRequests.push(
        fetchApiFootball<RawPrematchOddsItem[]>(
          `prematch_odds_${dateStr}_p${p}`,
          `/odds?date=${dateStr}&bet=1&timezone=${encodeURIComponent(TIRANE_TZ)}&page=${p}`,
          300_000
        )
      );
    }
    const pages = await Promise.all(pageRequests);
    for (const page of pages) {
      if (!page.ok) continue;
      for (const item of page.data) {
        const parsed = parsePrematch1X2(item, page.fetchedAt);
        if (parsed) oddsMap.set(item.fixture.id, parsed);
      }
    }
  }

  return oddsMap;
}

async function fetchLiveOddsMap(): Promise<Map<number, Odds1X2>> {
  const oddsMap = new Map<number, Odds1X2>();
  const res = await fetchApiFootball<RawLiveOddsItem[]>(
    'live_odds_all',
    '/odds/live',
    50_000
  );
  if (!res.ok) return oddsMap;
  for (const item of res.data) {
    const parsed = parseLive1X2(item, res.fetchedAt);
    if (parsed) oddsMap.set(item.fixture.id, parsed);
  }
  return oddsMap;
}

export function buildDailyPicks(fixtures: MatchFixture[]): DailyPick[] {
  const eligible = fixtures.filter(
    (f) =>
      !f.isFinished &&
      f.odds !== null &&
      f.odds.home !== null &&
      f.odds.draw !== null &&
      f.odds.away !== null
  );

  const prioritized = [...eligible].sort((a, b) => {
    const aFeatured = FEATURED_LEAGUE_IDS.has(a.league.id) ? 0 : 1;
    const bFeatured = FEATURED_LEAGUE_IDS.has(b.league.id) ? 0 : 1;
    if (aFeatured !== bFeatured) return aFeatured - bFeatured;
    return a.timestamp - b.timestamp;
  });

  return prioritized.slice(0, 6).map((fixture) => {
    const h = fixture.odds!.home!;
    const d = fixture.odds!.draw!;
    const a = fixture.odds!.away!;
    let recommendedPick: '1' | 'X' | '2' = '1';
    let oddsValue = h;
    let recommendedLabel = `${fixture.homeTeam.name} Win`;

    if (a < h && a <= d) {
      recommendedPick = '2';
      oddsValue = a;
      recommendedLabel = `${fixture.awayTeam.name} Win`;
    } else if (d < h && d < a) {
      recommendedPick = 'X';
      oddsValue = d;
      recommendedLabel = 'Draw';
    }

    return {
      fixture,
      recommendedPick,
      recommendedLabel,
      oddsValue,
      bookmaker: fixture.odds?.bookmaker || 'Official Feed',
    };
  });
}

export async function getTodayFixturesWithOdds(): Promise<
  ApiFootballEnvelope<{ fixtures: MatchFixture[]; dailyPicks: DailyPick[] }>
> {
  const dateTirane = getTiraneDateString();
  const [fixturesRes, prematchOddsMap, liveOddsMap] = await Promise.all([
    fetchApiFootball<RawFixtureItem[]>(
      `fixtures_today_${dateTirane}`,
      `/fixtures?date=${dateTirane}&timezone=${encodeURIComponent(TIRANE_TZ)}`,
      120_000
    ),
    fetchPrematchOddsMapForDate(dateTirane),
    fetchLiveOddsMap(),
  ]);

  if (!fixturesRes.ok) {
    return {
      available: false,
      errorCode: fixturesRes.errorCode,
      message: fixturesRes.message,
      fetchedAt: fixturesRes.fetchedAt,
      timezone: TIRANE_TZ,
      dateTirane,
      cached: false,
      data: { fixtures: [], dailyPicks: [] },
    };
  }

  const fixtures = fixturesRes.data
    .map((raw) => {
      const id = raw.fixture.id;
      const isLive = LIVE_STATUSES.has(raw.fixture.status.short);
      const odds = isLive
        ? liveOddsMap.get(id) ?? prematchOddsMap.get(id) ?? null
        : prematchOddsMap.get(id) ?? null;
      return mapRawFixture(raw, odds);
    })
    .sort((a, b) => {
      const aFeat = FEATURED_LEAGUE_IDS.has(a.league.id) ? 0 : 1;
      const bFeat = FEATURED_LEAGUE_IDS.has(b.league.id) ? 0 : 1;
      if (aFeat !== bFeat) return aFeat - bFeat;
      return a.timestamp - b.timestamp;
    });

  const dailyPicks = buildDailyPicks(fixtures);

  return {
    available: fixtures.length > 0,
    errorCode: fixtures.length === 0 ? 'NO_DATA' : undefined,
    message: fixtures.length === 0 ? `No football fixtures scheduled for ${dateTirane} (${TIRANE_TZ}).` : undefined,
    fetchedAt: fixturesRes.fetchedAt,
    timezone: TIRANE_TZ,
    dateTirane,
    cached: fixturesRes.cached,
    data: { fixtures, dailyPicks },
  };
}

export async function getLiveFixturesWithOdds(): Promise<ApiFootballEnvelope<MatchFixture[]>> {
  const dateTirane = getTiraneDateString();
  const [liveRes, liveOddsMap] = await Promise.all([
    fetchApiFootball<RawFixtureItem[]>(
      'fixtures_live_all',
      `/fixtures?live=all&timezone=${encodeURIComponent(TIRANE_TZ)}`,
      55_000
    ),
    fetchLiveOddsMap(),
  ]);

  if (!liveRes.ok) {
    return {
      available: false,
      errorCode: liveRes.errorCode,
      message: liveRes.message,
      fetchedAt: liveRes.fetchedAt,
      timezone: TIRANE_TZ,
      dateTirane,
      cached: false,
      data: [],
    };
  }

  const fixtures = liveRes.data
    .map((raw) => mapRawFixture(raw, liveOddsMap.get(raw.fixture.id) ?? null))
    .sort((a, b) => {
      const aFeat = FEATURED_LEAGUE_IDS.has(a.league.id) ? 0 : 1;
      const bFeat = FEATURED_LEAGUE_IDS.has(b.league.id) ? 0 : 1;
      if (aFeat !== bFeat) return aFeat - bFeat;
      return (b.elapsed ?? 0) - (a.elapsed ?? 0);
    });

  return {
    available: true,
    fetchedAt: liveRes.fetchedAt,
    timezone: TIRANE_TZ,
    dateTirane,
    cached: liveRes.cached,
    data: fixtures,
  };
}

export async function getFixtureOddsById(
  fixtureId: number
): Promise<{ prematchOdds: Odds1X2 | null; liveOdds: Odds1X2 | null; available: boolean; message?: string }> {
  const [preRes, liveRes] = await Promise.all([
    fetchApiFootball<RawPrematchOddsItem[]>(
      `fixture_pre_odds_${fixtureId}`,
      `/odds?fixture=${fixtureId}`,
      300_000
    ),
    fetchApiFootball<RawLiveOddsItem[]>(
      `fixture_live_odds_${fixtureId}`,
      `/odds/live?fixture=${fixtureId}`,
      45_000
    ),
  ]);

  if (!preRes.ok && !liveRes.ok) {
    return {
      available: false,
      message: preRes.message || liveRes.message,
      prematchOdds: null,
      liveOdds: null,
    };
  }

  const prematchOdds =
    preRes.ok && preRes.data.length > 0 ? parsePrematch1X2(preRes.data[0], preRes.fetchedAt) : null;
  const liveOdds =
    liveRes.ok && liveRes.data.length > 0 ? parseLive1X2(liveRes.data[0], liveRes.fetchedAt) : null;

  return {
    available: true,
    prematchOdds,
    liveOdds,
  };
}

export async function getFixtureDetails(fixtureId: number): Promise<MatchDetailsPayload> {
  const [statsRes, eventsRes, oddsBundle] = await Promise.all([
    fetchApiFootball<TeamStatistics[]>(
      `fixture_stats_${fixtureId}`,
      `/fixtures/statistics?fixture=${fixtureId}`,
      60_000
    ),
    fetchApiFootball<
      Array<{
        time: { elapsed: number; extra: number | null };
        team: { id: number; name: string };
        player: { name: string | null };
        assist: { name: string | null };
        type: string;
        detail: string;
      }>
    >(
      `fixture_events_${fixtureId}`,
      `/fixtures/events?fixture=${fixtureId}`,
      60_000
    ),
    getFixtureOddsById(fixtureId),
  ]);

  if (!statsRes.ok && !eventsRes.ok && !oddsBundle.available) {
    return {
      available: false,
      message: !statsRes.ok ? statsRes.message : 'Match details are currently unavailable.',
      statistics: [],
      events: [],
      prematchOdds: null,
      liveOdds: null,
    };
  }

  const events: MatchEventItem[] = eventsRes.ok
    ? eventsRes.data.map((ev) => ({
        timeElapsed: ev.time.elapsed,
        timeExtra: ev.time.extra,
        teamId: ev.team.id,
        teamName: ev.team.name,
        playerName: ev.player?.name || null,
        assistName: ev.assist?.name || null,
        type: ev.type,
        detail: ev.detail,
      }))
    : [];

  return {
    available: true,
    statistics: statsRes.ok ? statsRes.data : [],
    events,
    prematchOdds: oddsBundle.prematchOdds,
    liveOdds: oddsBundle.liveOdds,
  };
}

export async function verifySelectionAgainstRealFeed(
  fixtureId: number,
  pick: '1' | 'X' | '2'
): Promise<
  | {
      ok: true;
      fixture: MatchFixture;
      odds: number;
      oddsSource: 'prematch' | 'live';
    }
  | { ok: false; error: string }
> {
  // Check cached today or live fixtures first
  const [todayEnv, liveEnv] = await Promise.all([
    getTodayFixturesWithOdds(),
    getLiveFixturesWithOdds(),
  ]);

  let match =
    liveEnv.data.find((f) => f.id === fixtureId) ||
    todayEnv.data.fixtures.find((f) => f.id === fixtureId);

  if (!match) {
    const singleRes = await fetchApiFootball<RawFixtureItem[]>(
      `fixture_single_${fixtureId}`,
      `/fixtures?id=${fixtureId}&timezone=${encodeURIComponent(TIRANE_TZ)}`,
      60_000
    );
    if (!singleRes.ok) {
      return { ok: false, error: singleRes.message };
    }
    if (singleRes.data.length === 0) {
      return { ok: false, error: `Fixture #${fixtureId} not found.` };
    }
    match = mapRawFixture(singleRes.data[0], null);
  }

  if (match.isFinished) {
    return { ok: false, error: `${match.homeTeam.name} vs ${match.awayTeam.name} has already finished.` };
  }

  let effectiveOdds = match.odds;
  if (!effectiveOdds) {
    const fetchedOdds = await getFixtureOddsById(fixtureId);
    effectiveOdds = match.isLive
      ? fetchedOdds.liveOdds ?? fetchedOdds.prematchOdds
      : fetchedOdds.prematchOdds;
  }

  if (!effectiveOdds) {
    return { ok: false, error: `Real 1X2 odds are unavailable for ${match.homeTeam.name} vs ${match.awayTeam.name}.` };
  }

  const pickOdds =
    pick === '1' ? effectiveOdds.home : pick === 'X' ? effectiveOdds.draw : effectiveOdds.away;

  if (!pickOdds || !Number.isFinite(pickOdds) || pickOdds <= 1) {
    return { ok: false, error: `Selected market (${pick}) odds are currently suspended or unavailable.` };
  }

  return {
    ok: true,
    fixture: match,
    odds: pickOdds,
    oddsSource: effectiveOdds.source,
  };
}

export async function collectFinishedFixturesMap(
  fixtureIds: number[]
): Promise<Map<number, FinishedFixtureOutcome>> {
  const result = new Map<number, FinishedFixtureOutcome>();
  if (fixtureIds.length === 0) return result;

  // Check today's fixtures cache first
  const todayEnv = await getTodayFixturesWithOdds();
  const missingIds: number[] = [];

  for (const id of fixtureIds) {
    const found = todayEnv.data.fixtures.find((f) => f.id === id);
    if (found && (found.isFinished || ['CANC', 'ABD', 'AWD', 'WO', 'PST'].includes(found.statusShort))) {
      result.set(id, {
        fixtureId: id,
        statusShort: found.statusShort,
        homeGoals: found.goals.home ?? 0,
        awayGoals: found.goals.away ?? 0,
      });
    } else if (!found) {
      missingIds.push(id);
    }
  }

  // Batch fetch missing IDs (API-Football supports ids=id1-id2-... up to 20 per call)
  for (let i = 0; i < missingIds.length; i += 20) {
    const chunk = missingIds.slice(i, i + 20);
    const idsParam = chunk.join('-');
    const res = await fetchApiFootball<RawFixtureItem[]>(
      `fixtures_batch_${idsParam}`,
      `/fixtures?ids=${idsParam}&timezone=${encodeURIComponent(TIRANE_TZ)}`,
      60_000
    );
    if (!res.ok) continue;
    for (const raw of res.data) {
      const short = raw.fixture.status.short;
      if (FINISHED_STATUSES.has(short) || ['CANC', 'ABD', 'AWD', 'WO', 'PST'].includes(short)) {
        result.set(raw.fixture.id, {
          fixtureId: raw.fixture.id,
          statusShort: short,
          homeGoals: raw.goals.home ?? 0,
          awayGoals: raw.goals.away ?? 0,
        });
      }
    }
  }

  return result;
}
