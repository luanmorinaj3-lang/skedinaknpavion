import { AlertCircle, BarChart3, Clock, ListOrdered, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { fetchMatchDetails } from '../lib/api';
import type {
  BetPickCode,
  BetSlipSelection,
  MatchDetailsPayload,
  MatchFixture,
  Odds1X2,
} from '../types';
import { TeamLogo } from './TeamLogo';

interface MatchDetailSheetProps {
  fixture: MatchFixture | null;
  activeSelection?: BetSlipSelection;
  onClose: () => void;
  onTogglePick: (fixture: MatchFixture, pick: BetPickCode, odds: number, source: 'prematch' | 'live') => void;
}

export function MatchDetailSheet({
  fixture,
  activeSelection,
  onClose,
  onTogglePick,
}: MatchDetailSheetProps) {
  const [tab, setTab] = useState<'stats' | 'events' | 'odds'>('stats');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [details, setDetails] = useState<MatchDetailsPayload | null>(null);

  useEffect(() => {
    if (!fixture) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setDetails(null);
    setTab('stats');

    fetchMatchDetails(fixture.id)
      .then((res) => {
        if (cancelled) return;
        setDetails(res);
        if (!res.available && res.message) {
          setError(res.message);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Unable to load match statistics.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [fixture?.id]);

  if (!fixture) return null;

  const homeStats = details?.statistics?.[0]?.statistics ?? [];
  const awayStats = details?.statistics?.[1]?.statistics ?? [];

  const parseStatNum = (val: string | number | null | undefined): number => {
    if (typeof val === 'number') return val;
    if (typeof val === 'string') {
      const cleaned = val.replace('%', '').trim();
      const parsed = Number.parseFloat(cleaned);
      return Number.isFinite(parsed) ? parsed : 0;
    }
    return 0;
  };

  const renderOddsRow = (label: string, odds: Odds1X2 | null) => {
    if (!odds) {
      return (
        <div className="bg-zinc-950 border border-white/10 rounded-xl p-4 text-sm text-zinc-400">
          <div className="font-medium text-zinc-200 mb-1">{label}</div>
          <p className="text-xs text-zinc-500">Odds are not available from API-Football for this market.</p>
        </div>
      );
    }

    const picks: Array<{ code: BetPickCode; val: number | null; title: string }> = [
      { code: '1', val: odds.home, title: fixture.homeTeam.name },
      { code: 'X', val: odds.draw, title: 'Draw' },
      { code: '2', val: odds.away, title: fixture.awayTeam.name },
    ];

    return (
      <div className="bg-zinc-950 border border-white/10 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-white">{label}</span>
          {odds.bookmaker && <span className="text-zinc-400">{odds.bookmaker}</span>}
        </div>
        <div className="grid grid-cols-3 gap-2">
          {picks.map((p) => {
            const isSelected = activeSelection?.pick === p.code && activeSelection?.oddsSource === odds.source;
            const disabled = fixture.isFinished || p.val === null;
            return (
              <button
                key={p.code}
                type="button"
                disabled={disabled}
                onClick={() => {
                  if (!disabled && p.val !== null) {
                    onTogglePick(fixture, p.code, p.val, odds.source);
                  }
                }}
                className={`min-h-[52px] rounded-lg border p-2 flex flex-col items-center justify-center transition-colors ${
                  disabled
                    ? 'bg-zinc-900/50 border-white/5 text-zinc-600 cursor-not-allowed'
                    : isSelected
                      ? 'bg-red-600 border-red-500 text-white'
                      : 'bg-[#17171d] border-white/10 text-white hover:border-red-500/60'
                }`}
              >
                <span className="text-[11px] text-zinc-300 truncate max-w-full">{p.code}</span>
                <span className="font-mono-tabular text-sm font-bold">
                  {p.val !== null ? p.val.toFixed(2) : '--'}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={`${fixture.homeTeam.name} vs ${fixture.awayTeam.name} match center`}
    >
      <div className="w-full sm:max-w-2xl max-h-[90vh] bg-[#0e0e13] border border-white/15 rounded-t-2xl sm:rounded-2xl flex flex-col overflow-hidden shadow-2xl">
        {/* Mobile grab bar */}
        <div className="sm:hidden flex justify-center pt-2.5 pb-1">
          <span className="w-10 h-1 rounded-full bg-zinc-700" aria-hidden="true" />
        </div>

        {/* Header */}
        <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs text-zinc-400 truncate">
              {fixture.league.country} · {fixture.league.name}
            </div>
            <div className="text-[11px] text-zinc-500 mt-0.5">
              {fixture.venue ? `${fixture.venue} · ` : ''}
              Europe/Tirane {fixture.kickoffTimeTirane}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
            aria-label="Close match details"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scoreboard */}
        <div className="px-4 py-4 bg-[#131319] border-b border-white/10">
          <div className="grid grid-cols-3 items-center gap-2 text-center">
            <div className="flex flex-col items-center gap-2 min-w-0">
              <TeamLogo src={fixture.homeTeam.logo} alt={fixture.homeTeam.name} size="lg" />
              <span className="text-xs sm:text-sm font-semibold text-white line-clamp-2">
                {fixture.homeTeam.name}
              </span>
            </div>

            <div className="flex flex-col items-center justify-center">
              {fixture.isLive ? (
                <span className="text-xs font-semibold text-red-500 font-mono-tabular mb-1">
                  LIVE {fixture.elapsed !== null ? `${fixture.elapsed}'` : fixture.statusShort}
                </span>
              ) : (
                <span className="text-xs text-zinc-400 font-mono-tabular mb-1">
                  {fixture.isFinished ? fixture.statusLong : fixture.kickoffTimeTirane}
                </span>
              )}
              <div className="font-mono-tabular text-3xl sm:text-4xl font-bold tracking-tight text-white">
                {fixture.goals.home !== null ? fixture.goals.home : '-'}
                <span className="text-zinc-600 mx-1.5">:</span>
                {fixture.goals.away !== null ? fixture.goals.away : '-'}
              </div>
              {fixture.halftimeScore.home !== null && (
                <span className="text-[11px] text-zinc-500 font-mono-tabular mt-1">
                  HT {fixture.halftimeScore.home}:{fixture.halftimeScore.away}
                </span>
              )}
            </div>

            <div className="flex flex-col items-center gap-2 min-w-0">
              <TeamLogo src={fixture.awayTeam.logo} alt={fixture.awayTeam.name} size="lg" />
              <span className="text-xs sm:text-sm font-semibold text-white line-clamp-2">
                {fixture.awayTeam.name}
              </span>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="px-4 pt-3 border-b border-white/10 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setTab('stats')}
            className={`min-h-[44px] px-3 flex items-center gap-1.5 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap ${
              tab === 'stats'
                ? 'border-red-600 text-white'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            <span>Statistics</span>
          </button>
          <button
            type="button"
            onClick={() => setTab('events')}
            className={`min-h-[44px] px-3 flex items-center gap-1.5 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap ${
              tab === 'events'
                ? 'border-red-600 text-white'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <ListOrdered className="w-4 h-4" />
            <span>Events</span>
          </button>
          <button
            type="button"
            onClick={() => setTab('odds')}
            className={`min-h-[44px] px-3 flex items-center gap-1.5 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap ${
              tab === 'odds'
                ? 'border-red-600 text-white'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Clock className="w-4 h-4" />
            <span>1X2 Odds</span>
          </button>
        </div>

        {/* Body */}
        <div className="p-4 overflow-y-auto flex-1 space-y-3 pb-safe">
          {loading && (
            <div className="space-y-3 py-6">
              <div className="h-4 bg-zinc-800 rounded animate-pulse w-2/3 mx-auto" />
              <div className="h-8 bg-zinc-900 rounded animate-pulse" />
              <div className="h-8 bg-zinc-900 rounded animate-pulse" />
              <div className="h-8 bg-zinc-900 rounded animate-pulse" />
            </div>
          )}

          {!loading && error && (
            <div className="bg-red-950/30 border border-red-500/30 rounded-xl p-4 flex items-start gap-3 text-sm text-red-200">
              <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold">Match data unavailable</div>
                <p className="text-xs text-red-200/80 mt-1">{error}</p>
              </div>
            </div>
          )}

          {!loading && !error && tab === 'stats' && (
            <>
              {homeStats.length === 0 || awayStats.length === 0 ? (
                <div className="bg-zinc-950 border border-white/10 rounded-xl p-6 text-center text-sm text-zinc-400">
                  Match statistics are not available yet for this fixture. Live and post-match stats appear once kickoff begins.
                </div>
              ) : (
                <div className="space-y-3">
                  {homeStats.map((stat, idx) => {
                    const awayVal = awayStats[idx]?.value ?? 0;
                    const hNum = parseStatNum(stat.value);
                    const aNum = parseStatNum(awayVal);
                    const total = hNum + aNum;
                    const hPct = total > 0 ? Math.round((hNum / total) * 100) : 50;
                    const aPct = 100 - hPct;

                    return (
                      <div key={stat.type} className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-mono-tabular font-semibold text-white">
                            {stat.value ?? '0'}
                          </span>
                          <span className="text-zinc-400 font-medium">{stat.type}</span>
                          <span className="font-mono-tabular font-semibold text-white">
                            {awayVal ?? '0'}
                          </span>
                        </div>
                        <div className="h-1.5 w-full bg-zinc-900 rounded-full overflow-hidden flex">
                          <div
                            className="bg-red-600 h-full transition-all"
                            style={{ width: `${hPct}%` }}
                          />
                          <div
                            className="bg-zinc-500 h-full transition-all"
                            style={{ width: `${aPct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {!loading && !error && tab === 'events' && (
            <>
              {!details?.events || details.events.length === 0 ? (
                <div className="bg-zinc-950 border border-white/10 rounded-xl p-6 text-center text-sm text-zinc-400">
                  No match events recorded yet.
                </div>
              ) : (
                <div className="divide-y divide-white/10 bg-zinc-950 border border-white/10 rounded-xl">
                  {details.events.map((ev, idx) => (
                    <div
                      key={`${ev.timeElapsed}-${idx}`}
                      className="px-3.5 py-2.5 flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="font-mono-tabular font-bold text-red-500 w-9 shrink-0">
                          {ev.timeElapsed}&apos;{ev.timeExtra ? `+${ev.timeExtra}` : ''}
                        </span>
                        <div className="min-w-0">
                          <div className="font-semibold text-white truncate">
                            {ev.playerName || ev.detail}
                          </div>
                          <div className="text-zinc-400 truncate">
                            {ev.teamName} · {ev.type} ({ev.detail})
                            {ev.assistName ? ` · Assist: ${ev.assistName}` : ''}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {!loading && !error && tab === 'odds' && (
            <div className="space-y-3">
              {renderOddsRow('Live 1X2 Odds', details?.liveOdds ?? null)}
              {renderOddsRow('Pre-Match 1X2 Odds', details?.prematchOdds ?? fixture.odds ?? null)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
