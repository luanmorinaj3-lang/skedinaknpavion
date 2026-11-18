import {
  AlertTriangle,
  Clock,
  Flame,
  Home,
  List,
  Radio,
  RefreshCw,
  Shield,
  Ticket,
  User,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AdminPanelView } from './components/AdminPanelView';
import { AuthModal } from './components/AuthModal';
import { AZDirectoryView } from './components/AZDirectoryView';
import { BetSlipPanel } from './components/BetSlipPanel';
import { ClientBetsView } from './components/ClientBetsView';
import { MatchCard } from './components/MatchCard';
import { MatchDetailSheet } from './components/MatchDetailSheet';
import { TeamLogo } from './components/TeamLogo';
import {
  fetchCurrentUser,
  fetchLiveFixtures,
  fetchTodayFixtures,
  formatTiraneTimeOnly,
  logoutSession,
} from './lib/api';
import type {
  AuthUser,
  BetPickCode,
  BetSlipSelection,
  DailyPick,
  MatchFixture,
  NavTab,
} from './types';

const HERO_STADIUM_IMAGE = '/src/assets/images/stadium_night_hero_1795040564052.jpg';

function tabFromPathname(pathname: string): NavTab {
  if (pathname.startsWith('/admin')) return 'admin';
  if (pathname.startsWith('/live')) return 'live';
  if (pathname.startsWith('/a-z')) return 'az';
  if (pathname.startsWith('/my-bets')) return 'bets';
  return 'home';
}

function pathnameFromTab(tab: NavTab): string {
  switch (tab) {
    case 'live':
      return '/live';
    case 'az':
      return '/a-z';
    case 'bets':
      return '/my-bets';
    case 'admin':
      return '/admin';
    default:
      return '/';
  }
}

export default function App() {
  const [activeTab, setActiveTab] = useState<NavTab>(() => {
    if (typeof window !== 'undefined') {
      return tabFromPathname(window.location.pathname);
    }
    return 'home';
  });

  // Auth state
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<'client' | 'admin'>('client');

  // Football data state (strictly from API-Football via backend)
  const [todayFixtures, setTodayFixtures] = useState<MatchFixture[]>([]);
  const [dailyPicks, setDailyPicks] = useState<DailyPick[]>([]);
  const [todayAvailable, setTodayAvailable] = useState(true);
  const [todayError, setTodayError] = useState<string | null>(null);
  const [todayLoading, setTodayLoading] = useState(true);
  const [todayDateLabel, setTodayDateLabel] = useState<string>('');
  const [todayFetchedAt, setTodayFetchedAt] = useState<string>('');

  const [liveFixtures, setLiveFixtures] = useState<MatchFixture[]>([]);
  const [liveAvailable, setLiveAvailable] = useState(true);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [liveLoading, setLiveLoading] = useState(true);
  const [liveFetchedAt, setLiveFetchedAt] = useState<string>('');
  const [liveSecondsLeft, setLiveSecondsLeft] = useState<number>(60);

  // League filter on Home
  const [selectedLeagueFilter, setSelectedLeagueFilter] = useState<number | 'all'>('all');

  // Match Detail Sheet
  const [detailFixture, setDetailFixture] = useState<MatchFixture | null>(null);

  // Prediction Slip
  const [slipSelections, setSlipSelections] = useState<BetSlipSelection[]>([]);
  const [mobileSlipOpen, setMobileSlipOpen] = useState(false);
  const [betsRefreshSignal, setBetsRefreshSignal] = useState(0);

  const selectionsMap = useMemo(() => {
    const map = new Map<number, BetSlipSelection>();
    for (const s of slipSelections) {
      map.set(s.fixtureId, s);
    }
    return map;
  }, [slipSelections]);

  const loadToday = useCallback(async () => {
    setTodayLoading(true);
    try {
      const env = await fetchTodayFixtures();
      setTodayAvailable(env.available);
      setTodayError(env.available ? null : env.message || 'Today fixtures unavailable.');
      setTodayFixtures(env.data.fixtures);
      setDailyPicks(env.data.dailyPicks);
      setTodayDateLabel(env.dateTirane);
      setTodayFetchedAt(env.fetchedAt);
    } catch (err) {
      setTodayAvailable(false);
      setTodayError(err instanceof Error ? err.message : 'Unable to reach football API.');
    } finally {
      setTodayLoading(false);
    }
  }, []);

  const loadLive = useCallback(async (isInitial = false) => {
    if (isInitial) setLiveLoading(true);
    try {
      const env = await fetchLiveFixtures();
      setLiveAvailable(env.available);
      setLiveError(env.available ? null : env.message || 'Live scores unavailable.');
      setLiveFixtures(env.data);
      setLiveFetchedAt(env.fetchedAt);
      setLiveSecondsLeft(60);
    } catch (err) {
      setLiveAvailable(false);
      setLiveError(err instanceof Error ? err.message : 'Unable to load live matches.');
    } finally {
      setLiveLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCurrentUser()
      .then((res) => setUser(res.user))
      .catch(() => setUser(null));

    loadToday();
    loadLive(true);
  }, [loadToday, loadLive]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onPopState = () => {
      setActiveTab(tabFromPathname(window.location.pathname));
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const nextPath = pathnameFromTab(activeTab);
    if (window.location.pathname !== nextPath) {
      window.history.pushState(null, '', nextPath);
    }

    const canonicalUrl = `${window.location.origin}${nextPath}`;
    let canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.rel = 'canonical';
      document.head.appendChild(canonical);
    }
    canonical.href = canonicalUrl;

    let ogUrl = document.querySelector<HTMLMetaElement>('meta[property="og:url"]');
    if (!ogUrl) {
      ogUrl = document.createElement('meta');
      ogUrl.setAttribute('property', 'og:url');
      document.head.appendChild(ogUrl);
    }
    ogUrl.content = canonicalUrl;

    let robotsMeta = document.querySelector<HTMLMetaElement>('meta[name="robots"]');
    if (!robotsMeta) {
      robotsMeta = document.createElement('meta');
      robotsMeta.name = 'robots';
      document.head.appendChild(robotsMeta);
    }
    robotsMeta.content =
      activeTab === 'admin'
        ? 'noindex, nofollow'
        : 'index, follow, max-image-preview:large, max-snippet:-1';

    const titles: Record<NavTab, string> = {
      home: 'SKEDINAKNPAVION – Live Football Scores, 1X2 Odds & Picks',
      az: 'A–Z Football Leagues & Fixtures | SKEDINAKNPAVION',
      live: 'LIVE Football Scores & Match Minutes | SKEDINAKNPAVION',
      bets: 'My Bets & Virtual Credits | SKEDINAKNPAVION',
      admin: 'Admin Panel | SKEDINAKNPAVION',
    };
    document.title = titles[activeTab];
  }, [activeTab]);

  // 60-second automatic refresh for live scores, respecting API limits
  useEffect(() => {
    const interval = setInterval(() => {
      loadLive(false);
    }, 60_000);

    const ticker = setInterval(() => {
      setLiveSecondsLeft((prev) => (prev <= 1 ? 60 : prev - 1));
    }, 1000);

    return () => {
      clearInterval(interval);
      clearInterval(ticker);
    };
  }, [loadLive]);

  const handleTogglePick = (
    fixture: MatchFixture,
    pick: BetPickCode,
    odds: number,
    oddsSource: 'prematch' | 'live'
  ) => {
    setSlipSelections((prev) => {
      const existing = prev.find((s) => s.fixtureId === fixture.id);
      if (existing && existing.pick === pick) {
        return prev.filter((s) => s.fixtureId !== fixture.id);
      }
      const nextItem: BetSlipSelection = {
        fixtureId: fixture.id,
        homeTeam: fixture.homeTeam.name,
        awayTeam: fixture.awayTeam.name,
        leagueName: fixture.league.name,
        kickoffTimeTirane: fixture.kickoffTimeTirane,
        dateIso: fixture.dateIso,
        pick,
        odds,
        oddsSource,
      };
      if (existing) {
        return prev.map((s) => (s.fixtureId === fixture.id ? nextItem : s));
      }
      return [...prev, nextItem];
    });
  };

  const handleAuthenticated = (authed: AuthUser) => {
    setUser(authed);
    if (authed.role === 'admin') {
      setActiveTab('admin');
    }
  };

  const handleLogout = async () => {
    await logoutSession();
    setUser(null);
  };

  // Group today's fixtures by league for Home view
  const todayLeagues = useMemo(() => {
    const map = new Map<
      number,
      { id: number; name: string; country: string; logo: string | null; count: number }
    >();
    for (const f of todayFixtures) {
      const cur = map.get(f.league.id);
      if (cur) cur.count++;
      else {
        map.set(f.league.id, {
          id: f.league.id,
          name: f.league.name,
          country: f.league.country,
          logo: f.league.logo,
          count: 1,
        });
      }
    }
    return Array.from(map.values());
  }, [todayFixtures]);

  const filteredTodayFixtures = useMemo(() => {
    if (selectedLeagueFilter === 'all') return todayFixtures;
    return todayFixtures.filter((f) => f.league.id === selectedLeagueFilter);
  }, [todayFixtures, selectedLeagueFilter]);

  const renderApiUnavailableNotice = (title: string, message: string | null, onRetry: () => void) => (
    <div className="bg-[#111116] border border-red-500/25 rounded-2xl p-6 text-center space-y-3">
      <AlertTriangle className="w-7 h-7 text-red-500 mx-auto" />
      <div className="space-y-1">
        <h3 className="text-base font-bold text-white">{title}</h3>
        <p className="text-xs text-zinc-400 max-w-lg mx-auto leading-relaxed">
          {message || 'Real match data is currently unavailable from API-Football.'}
        </p>
      </div>
      <button
        type="button"
        onClick={onRetry}
        className="min-h-[44px] px-4 rounded-xl bg-zinc-900 border border-white/15 hover:border-red-500/60 text-xs font-semibold text-white inline-flex items-center gap-2 transition-colors"
      >
        <RefreshCw className="w-3.5 h-3.5" />
        <span>Retry</span>
      </button>
    </div>
  );

  const openSignIn = (mode: 'client' | 'admin' = 'client') => {
    setAuthModalMode(mode);
    setAuthModalOpen(true);
  };

  return (
    <div className="min-h-screen bg-[#08080b] text-white flex flex-col">
      {/* Strict 3-Zone Top Navigation Bar */}
      <header className="sticky top-0 z-30 h-12 md:h-14 bg-[#0b0b0f]/95 backdrop-blur-md border-b border-white/10">
        <div className="max-w-7xl mx-auto h-full px-4 flex items-center justify-between gap-8">
          {/* Zone 1: Brand Wordmark */}
          <button
            type="button"
            onClick={() => setActiveTab('home')}
            className="font-display text-xl md:text-2xl font-extrabold tracking-wide uppercase whitespace-nowrap shrink-0 text-left focus:outline-none"
          >
            <span className="text-white">SKEDINA</span>
            <span className="text-red-600">KNPAVION</span>
          </button>

          {/* Zone 2: Desktop Single-Line Navigation Links */}
          <nav
            className="hidden md:flex items-center gap-7 text-sm font-medium"
            aria-label="Primary Navigation"
          >
            {(
              [
                { id: 'home', label: 'Home' },
                { id: 'az', label: 'A-Z' },
                { id: 'live', label: `LIVE${liveFixtures.length > 0 ? ` (${liveFixtures.length})` : ''}` },
                { id: 'bets', label: 'My Bets' },
              ] as const
            ).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`h-14 border-b-2 transition-colors whitespace-nowrap shrink-0 px-1 ${
                  activeTab === item.id
                    ? 'border-red-600 text-white font-semibold'
                    : 'border-transparent text-zinc-400 hover:text-white'
                }`}
              >
                {item.label}
              </button>
            ))}
          </nav>

          {/* Zone 3: Single Primary Contextual Action */}
          <div className="flex items-center shrink-0">
            {user ? (
              <button
                type="button"
                onClick={() => setActiveTab(user.role === 'admin' ? 'admin' : 'bets')}
                className="min-h-[38px] px-3.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-semibold flex items-center gap-2 transition-colors whitespace-nowrap shrink-0"
              >
                {user.role === 'admin' ? (
                  <>
                    <Shield className="w-3.5 h-3.5" />
                    <span>Admin Panel</span>
                  </>
                ) : (
                  <>
                    <User className="w-3.5 h-3.5" />
                    <span className="font-mono-tabular">
                      {user.credits.toLocaleString()} CR
                    </span>
                  </>
                )}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => openSignIn('client')}
                className="min-h-[38px] px-4 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
              >
                Sign In
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content Shell */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-4 pt-4 pb-24 md:pb-10">
        {activeTab === 'admin' ? (
          <AdminPanelView
            user={user}
            onAuthenticated={handleAuthenticated}
            onLogout={handleLogout}
          />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            {/* Primary Match / Directory / Bets Column */}
            <div className="lg:col-span-8 space-y-5 min-w-0">
              {activeTab === 'home' && (
                <>
                  {/* Hero Stadium Spotlight & Daily Picks Header */}
                  <section className="relative rounded-2xl overflow-hidden border border-white/10 bg-[#111116]">
                    <div className="absolute inset-0 bg-gradient-to-br from-red-950/40 via-[#0d0d12] to-black" />
                    <img
                      src={HERO_STADIUM_IMAGE}
                      alt="Floodlit European football stadium pitch"
                      referrerPolicy="no-referrer"
                      className="absolute inset-0 w-full h-full object-cover opacity-55"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#08080b] via-[#08080b]/75 to-black/35" />

                    <div className="relative p-4 sm:p-6 space-y-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="space-y-1">
                          <div className="text-xs font-semibold text-red-500 uppercase tracking-wider">
                            Europe/Tirane · {todayDateLabel || 'Today'}
                          </div>
                          <h1 className="font-display text-3xl sm:text-4xl font-extrabold uppercase tracking-tight text-white text-balance">
                            Today&apos;s Football &amp; Daily Picks
                          </h1>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setActiveTab('live')}
                            className="min-h-[40px] px-3.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap"
                          >
                            <Radio className="w-3.5 h-3.5" />
                            <span>LIVE ({liveFixtures.length})</span>
                          </button>
                        </div>
                      </div>

                      {/* Daily Picks Strip (Strictly real today fixtures + real 1X2 odds) */}
                      {dailyPicks.length > 0 ? (
                        <div className="space-y-2">
                          <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-200">
                            <Flame className="w-4 h-4 text-red-500" />
                            <span>Daily Picks</span>
                          </div>
                          <div className="flex gap-2.5 overflow-x-auto no-scrollbar pb-1">
                            {dailyPicks.map((pick) => {
                              const isPicked =
                                selectionsMap.get(pick.fixture.id)?.pick === pick.recommendedPick;
                              return (
                                <div
                                  key={pick.fixture.id}
                                  className="min-w-[235px] max-w-[255px] shrink-0 bg-[#0d0d13]/95 backdrop-blur-sm border border-white/15 rounded-xl p-3 space-y-2.5"
                                >
                                  <div className="flex items-center justify-between gap-2 text-[11px] text-zinc-400">
                                    <span className="truncate">{pick.fixture.league.name}</span>
                                    <span className="font-mono-tabular text-zinc-300 shrink-0">
                                      {pick.fixture.kickoffTimeTirane}
                                    </span>
                                  </div>

                                  <button
                                    type="button"
                                    onClick={() => setDetailFixture(pick.fixture)}
                                    className="w-full text-left space-y-1 hover:text-red-400 transition-colors"
                                  >
                                    <div className="flex items-center gap-1.5 text-xs font-semibold text-white truncate">
                                      <TeamLogo
                                        src={pick.fixture.homeTeam.logo}
                                        alt={pick.fixture.homeTeam.name}
                                        size="sm"
                                      />
                                      <span className="truncate">{pick.fixture.homeTeam.name}</span>
                                    </div>
                                    <div className="flex items-center gap-1.5 text-xs font-semibold text-white truncate">
                                      <TeamLogo
                                        src={pick.fixture.awayTeam.logo}
                                        alt={pick.fixture.awayTeam.name}
                                        size="sm"
                                      />
                                      <span className="truncate">{pick.fixture.awayTeam.name}</span>
                                    </div>
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleTogglePick(
                                        pick.fixture,
                                        pick.recommendedPick,
                                        pick.oddsValue,
                                        pick.fixture.odds?.source || 'prematch'
                                      )
                                    }
                                    className={`w-full min-h-[38px] px-3 rounded-lg border text-xs font-semibold flex items-center justify-between transition-colors ${
                                      isPicked
                                        ? 'bg-red-600 border-red-500 text-white'
                                        : 'bg-[#17171f] border-white/10 text-zinc-200 hover:border-red-500/60'
                                    }`}
                                  >
                                    <span className="truncate mr-2">
                                      Pick {pick.recommendedPick}
                                    </span>
                                    <span className="font-mono-tabular font-bold">
                                      {pick.oddsValue.toFixed(2)}
                                    </span>
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ) : !todayLoading ? (
                        <div className="bg-black/60 border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-zinc-300">
                          Daily Picks appear automatically when today&apos;s real fixtures and 1X2 odds are available from API-Football.
                        </div>
                      ) : null}
                    </div>
                  </section>

                  {/* Live Preview Strip (if real live matches exist) */}
                  {liveFixtures.length > 0 && (
                    <section className="space-y-2.5">
                      <div className="flex items-center justify-between px-1">
                        <div className="flex items-center gap-2">
                          <span
                            className="w-2 h-2 rounded-full bg-red-500 animate-pulse"
                            aria-hidden="true"
                          />
                          <h2 className="font-display text-xl font-bold uppercase tracking-wide text-white">
                            Live In Play ({liveFixtures.length})
                          </h2>
                        </div>
                        <button
                          type="button"
                          onClick={() => setActiveTab('live')}
                          className="text-xs font-semibold text-red-500 hover:text-red-400"
                        >
                          View All Live →
                        </button>
                      </div>
                      <div className="space-y-2.5">
                        {liveFixtures.slice(0, 3).map((fixture) => (
                          <MatchCard
                            key={`live-preview-${fixture.id}`}
                            fixture={fixture}
                            activeSelection={selectionsMap.get(fixture.id)}
                            onTogglePick={handleTogglePick}
                            onOpenDetails={setDetailFixture}
                          />
                        ))}
                      </div>
                    </section>
                  )}

                  {/* Today's Football Matches */}
                  <section className="space-y-3">
                    <div className="flex items-center justify-between gap-2 px-1">
                      <div>
                        <h2 className="font-display text-xl font-bold uppercase tracking-wide text-white">
                          Today&apos;s Matches
                        </h2>
                        {todayFetchedAt && (
                          <p className="text-[11px] text-zinc-500">
                            Updated {formatTiraneTimeOnly(todayFetchedAt)} (Europe/Tirane)
                          </p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={loadToday}
                        className="min-h-[38px] px-3 rounded-lg bg-[#111116] border border-white/10 hover:border-white/25 text-xs text-zinc-300 flex items-center gap-1.5"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${todayLoading ? 'animate-spin' : ''}`} />
                        <span>Refresh</span>
                      </button>
                    </div>

                    {/* League Filter Strip */}
                    {todayLeagues.length > 0 && (
                      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
                        <button
                          type="button"
                          onClick={() => setSelectedLeagueFilter('all')}
                          className={`min-h-[36px] px-3 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition-colors ${
                            selectedLeagueFilter === 'all'
                              ? 'bg-red-600 text-white'
                              : 'bg-[#111116] border border-white/10 text-zinc-400 hover:text-white'
                          }`}
                        >
                          All ({todayFixtures.length})
                        </button>
                        {todayLeagues.slice(0, 15).map((lg) => (
                          <button
                            key={lg.id}
                            type="button"
                            onClick={() => setSelectedLeagueFilter(lg.id)}
                            className={`min-h-[36px] px-3 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
                              selectedLeagueFilter === lg.id
                                ? 'bg-red-600 text-white'
                                : 'bg-[#111116] border border-white/10 text-zinc-400 hover:text-white'
                            }`}
                          >
                            {lg.name} ({lg.count})
                          </button>
                        ))}
                      </div>
                    )}

                    {todayLoading && (
                      <div className="space-y-2.5">
                        <div className="h-24 bg-[#111116] rounded-xl animate-pulse" />
                        <div className="h-24 bg-[#111116] rounded-xl animate-pulse" />
                        <div className="h-24 bg-[#111116] rounded-xl animate-pulse" />
                      </div>
                    )}

                    {!todayLoading && (!todayAvailable || todayError) &&
                      renderApiUnavailableNotice(
                        "Today's Matches Unavailable",
                        todayError,
                        loadToday
                      )}

                    {!todayLoading && todayAvailable && !todayError && (
                      <div className="space-y-2.5">
                        {filteredTodayFixtures.map((fixture) => (
                          <MatchCard
                            key={fixture.id}
                            fixture={fixture}
                            activeSelection={selectionsMap.get(fixture.id)}
                            onTogglePick={handleTogglePick}
                            onOpenDetails={setDetailFixture}
                          />
                        ))}
                      </div>
                    )}
                  </section>
                </>
              )}

              {activeTab === 'az' && (
                <AZDirectoryView
                  fixtures={todayFixtures}
                  loading={todayLoading}
                  error={todayError}
                  available={todayAvailable}
                  selectionsMap={selectionsMap}
                  onTogglePick={handleTogglePick}
                  onOpenDetails={setDetailFixture}
                />
              )}

              {activeTab === 'live' && (
                <section className="space-y-4">
                  <div className="bg-[#111116] border border-white/10 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <Radio className="w-5 h-5 text-red-500" />
                        <h1 className="font-display text-2xl font-bold uppercase tracking-wide text-white">
                          LIVE Football Matches
                        </h1>
                      </div>
                      <div className="text-xs text-zinc-400 mt-1 flex items-center gap-2">
                        <Clock className="w-3.5 h-3.5 text-zinc-500" />
                        <span>
                          Auto-refresh in{' '}
                          <strong className="font-mono-tabular text-white">
                            {liveSecondsLeft}s
                          </strong>
                          {liveFetchedAt
                            ? ` · Last sync ${formatTiraneTimeOnly(liveFetchedAt)} (Europe/Tirane)`
                            : ''}
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => loadLive(true)}
                      className="min-h-[42px] px-4 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-semibold flex items-center gap-2 self-start sm:self-auto transition-colors"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${liveLoading ? 'animate-spin' : ''}`} />
                      <span>Refresh Now</span>
                    </button>
                  </div>

                  {liveLoading && (
                    <div className="space-y-2.5">
                      <div className="h-24 bg-[#111116] rounded-xl animate-pulse" />
                      <div className="h-24 bg-[#111116] rounded-xl animate-pulse" />
                    </div>
                  )}

                  {!liveLoading && (!liveAvailable || liveError) &&
                    renderApiUnavailableNotice('Live Scores Unavailable', liveError, () =>
                      loadLive(true)
                    )}

                  {!liveLoading && liveAvailable && !liveError && liveFixtures.length === 0 && (
                    <div className="bg-[#111116] border border-white/10 rounded-2xl p-8 text-center space-y-2">
                      <Radio className="w-7 h-7 text-zinc-600 mx-auto" />
                      <div className="text-sm font-semibold text-white">
                        No Live Matches in Play Right Now
                      </div>
                      <p className="text-xs text-zinc-400 max-w-md mx-auto">
                        Live matches, real-time minutes, and live odds will appear here automatically as kickoffs begin.
                      </p>
                    </div>
                  )}

                  {!liveLoading && liveAvailable && liveFixtures.length > 0 && (
                    <div className="space-y-2.5">
                      {liveFixtures.map((fixture) => (
                        <MatchCard
                          key={fixture.id}
                          fixture={fixture}
                          activeSelection={selectionsMap.get(fixture.id)}
                          onTogglePick={handleTogglePick}
                          onOpenDetails={setDetailFixture}
                        />
                      ))}
                    </div>
                  )}
                </section>
              )}

              {activeTab === 'bets' && (
                <ClientBetsView
                  user={user}
                  refreshSignal={betsRefreshSignal}
                  onAuthenticated={handleAuthenticated}
                  onBalanceUpdated={(credits) =>
                    setUser((prev) => (prev ? { ...prev, credits } : prev))
                  }
                  onLogout={handleLogout}
                />
              )}
            </div>

            {/* Right Prediction Slip Column (Desktop sticky) */}
            <div className="lg:col-span-4">
              <BetSlipPanel
                selections={slipSelections}
                user={user}
                onRemoveSelection={(fixtureId) =>
                  setSlipSelections((prev) => prev.filter((s) => s.fixtureId !== fixtureId))
                }
                onClearSlip={() => setSlipSelections([])}
                onOpenAuth={() => openSignIn('client')}
                onBalanceUpdated={(credits) =>
                  setUser((prev) => (prev ? { ...prev, credits } : prev))
                }
                onTicketPlaced={() => setBetsRefreshSignal((n) => n + 1)}
                isMobileSheetOpen={mobileSlipOpen}
                onCloseMobileSheet={() => setMobileSlipOpen(false)}
              />
            </div>
          </div>
        )}
      </main>

      {/* Quiet Footer with Virtual Credit Disclaimer & Admin Portal Access */}
      <footer className="border-t border-white/10 bg-[#09090d] pb-20 md:pb-6">
        <div className="max-w-7xl mx-auto px-4 py-5 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-zinc-500">
          <p className="text-center sm:text-left">
            SKEDINAKNPAVION · Virtual Credits are strictly for entertainment only — no real money deposits, withdrawals, or cash value.
          </p>
          <button
            type="button"
            onClick={() => setActiveTab('admin')}
            className="text-zinc-400 hover:text-red-400 font-medium transition-colors whitespace-nowrap"
          >
            Admin Portal
          </button>
        </div>
      </footer>

      {/* Mobile Floating Slip Button (only visible when slip has picks) */}
      {slipSelections.length > 0 && activeTab !== 'admin' && (
        <button
          type="button"
          onClick={() => setMobileSlipOpen(true)}
          className="lg:hidden fixed right-4 bottom-16 z-40 min-h-[44px] px-4 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold shadow-lg shadow-red-950/50 flex items-center gap-2 transition-transform active:scale-95"
        >
          <Ticket className="w-4 h-4" />
          <span>Slip ({slipSelections.length})</span>
        </button>
      )}

      {/* Mobile Bottom 4-Tab Thumb Navigation */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 h-14 bg-[#0b0b0f]/95 backdrop-blur-md border-t border-white/10 pb-safe"
        aria-label="Mobile Bottom Navigation"
      >
        <div className="grid grid-cols-4 h-full">
          {(
            [
              { id: 'home', label: 'Home', icon: Home },
              { id: 'az', label: 'A-Z', icon: List },
              { id: 'live', label: 'LIVE', icon: Radio },
              { id: 'bets', label: 'My Bets', icon: Ticket },
            ] as const
          ).map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`flex flex-col items-center justify-center gap-0.5 transition-colors ${
                  isActive ? 'text-red-500' : 'text-zinc-400 hover:text-white'
                }`}
              >
                <div className="relative">
                  <Icon className="w-5 h-5" />
                  {item.id === 'live' && liveFixtures.length > 0 && (
                    <span className="absolute -top-1 -right-2.5 text-[9px] font-mono-tabular font-bold text-red-500">
                      {liveFixtures.length}
                    </span>
                  )}
                </div>
                <span className="text-[10px] font-semibold tracking-tight">{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Match Statistics & Events Modal/Sheet */}
      <MatchDetailSheet
        fixture={detailFixture}
        activeSelection={detailFixture ? selectionsMap.get(detailFixture.id) : undefined}
        onClose={() => setDetailFixture(null)}
        onTogglePick={handleTogglePick}
      />

      {/* Sign In Modal */}
      <AuthModal
        open={authModalOpen}
        initialMode={authModalMode}
        onClose={() => setAuthModalOpen(false)}
        onAuthenticated={handleAuthenticated}
      />
    </div>
  );
}
