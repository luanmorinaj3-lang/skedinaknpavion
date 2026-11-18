import { ChevronRight, Globe2, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { BetPickCode, BetSlipSelection, MatchFixture } from '../types';
import { MatchCard } from './MatchCard';

interface AZDirectoryViewProps {
  fixtures: MatchFixture[];
  loading: boolean;
  error: string | null;
  available: boolean;
  selectionsMap: Map<number, BetSlipSelection>;
  onTogglePick: (fixture: MatchFixture, pick: BetPickCode, odds: number, source: 'prematch' | 'live') => void;
  onOpenDetails: (fixture: MatchFixture) => void;
}

interface CountryLeagueGroup {
  key: string;
  country: string;
  leagueId: number;
  leagueName: string;
  fixtures: MatchFixture[];
}

export function AZDirectoryView({
  fixtures,
  loading,
  error,
  available,
  selectionsMap,
  onTogglePick,
  onOpenDetails,
}: AZDirectoryViewProps) {
  const [query, setQuery] = useState('');
  const [selectedLeagueKey, setSelectedLeagueKey] = useState<string | null>(null);
  const [selectedLetter, setSelectedLetter] = useState<string>('ALL');

  const leagueGroups = useMemo(() => {
    const map = new Map<string, CountryLeagueGroup>();
    for (const f of fixtures) {
      const key = `${f.league.country}::${f.league.id}`;
      const existing = map.get(key);
      if (existing) {
        existing.fixtures.push(f);
      } else {
        map.set(key, {
          key,
          country: f.league.country || 'International',
          leagueId: f.league.id,
          leagueName: f.league.name,
          fixtures: [f],
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => {
      const cCmp = a.country.localeCompare(b.country);
      if (cCmp !== 0) return cCmp;
      return a.leagueName.localeCompare(b.leagueName);
    });
  }, [fixtures]);

  const letters = useMemo(() => {
    const set = new Set<string>();
    for (const g of leagueGroups) {
      const first = g.country.charAt(0).toUpperCase();
      if (/[A-Z]/.test(first)) set.add(first);
    }
    return ['ALL', ...Array.from(set).sort()];
  }, [leagueGroups]);

  const filteredGroups = useMemo(() => {
    const q = query.trim().toLowerCase();
    return leagueGroups.filter((g) => {
      if (selectedLetter !== 'ALL' && g.country.charAt(0).toUpperCase() !== selectedLetter) {
        return false;
      }
      if (!q) return true;
      const leagueMatch =
        g.country.toLowerCase().includes(q) || g.leagueName.toLowerCase().includes(q);
      const teamMatch = g.fixtures.some(
        (f) =>
          f.homeTeam.name.toLowerCase().includes(q) ||
          f.awayTeam.name.toLowerCase().includes(q)
      );
      return leagueMatch || teamMatch;
    });
  }, [leagueGroups, query, selectedLetter]);

  const activeGroup = useMemo(() => {
    if (!selectedLeagueKey) return null;
    return filteredGroups.find((g) => g.key === selectedLeagueKey) || null;
  }, [filteredGroups, selectedLeagueKey]);

  return (
    <div className="space-y-4">
      <div className="bg-[#111116] border border-white/10 rounded-2xl p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Globe2 className="w-5 h-5 text-red-500" />
            <h1 className="font-display text-2xl font-bold uppercase tracking-wide text-white">
              A–Z Football Directory
            </h1>
          </div>
          <span className="text-xs text-zinc-400 font-mono-tabular">
            {leagueGroups.length} Competitions
          </span>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedLeagueKey(null);
            }}
            placeholder="Search country, league, or club..."
            className="w-full min-h-[44px] bg-zinc-950 border border-white/10 rounded-xl pl-10 pr-4 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-red-500"
          />
        </div>

        {/* Alphabet Filter Bar */}
        {letters.length > 1 && (
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pt-1">
            {letters.map((letter) => (
              <button
                key={letter}
                type="button"
                onClick={() => {
                  setSelectedLetter(letter);
                  setSelectedLeagueKey(null);
                }}
                className={`min-h-[36px] min-w-[36px] px-2.5 rounded-lg text-xs font-mono-tabular font-semibold transition-colors shrink-0 ${
                  selectedLetter === letter
                    ? 'bg-red-600 text-white'
                    : 'bg-zinc-950 border border-white/10 text-zinc-400 hover:text-white'
                }`}
              >
                {letter}
              </button>
            ))}
          </div>
        )}
      </div>

      {loading && (
        <div className="space-y-2.5">
          <div className="h-14 bg-[#111116] rounded-xl animate-pulse" />
          <div className="h-14 bg-[#111116] rounded-xl animate-pulse" />
          <div className="h-14 bg-[#111116] rounded-xl animate-pulse" />
        </div>
      )}

      {!loading && (!available || error) && (
        <div className="bg-[#111116] border border-red-500/25 rounded-2xl p-6 text-center space-y-2">
          <div className="text-sm font-semibold text-white">Competitions Unavailable</div>
          <p className="text-xs text-zinc-400 max-w-md mx-auto">
            {error || 'No football fixtures are available for today in Europe/Tirane timezone.'}
          </p>
        </div>
      )}

      {!loading && available && !error && activeGroup && (
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => setSelectedLeagueKey(null)}
            className="min-h-[40px] px-3 rounded-lg bg-zinc-900 border border-white/10 text-xs font-semibold text-zinc-300 hover:text-white"
          >
            ← All Countries &amp; Leagues
          </button>

          <div className="text-sm font-bold text-white px-1">
            {activeGroup.country} · {activeGroup.leagueName} ({activeGroup.fixtures.length})
          </div>

          <div className="space-y-2.5">
            {activeGroup.fixtures.map((fixture) => (
              <MatchCard
                key={fixture.id}
                fixture={fixture}
                activeSelection={selectionsMap.get(fixture.id)}
                onTogglePick={onTogglePick}
                onOpenDetails={onOpenDetails}
              />
            ))}
          </div>
        </div>
      )}

      {!loading && available && !error && !activeGroup && (
        <>
          {filteredGroups.length === 0 ? (
            <div className="bg-[#111116] border border-white/10 rounded-2xl p-8 text-center text-sm text-zinc-400">
              No leagues or teams match your filter.
            </div>
          ) : (
            <div className="bg-[#111116] border border-white/10 rounded-2xl divide-y divide-white/10 overflow-hidden">
              {filteredGroups.map((group) => (
                <button
                  key={group.key}
                  type="button"
                  onClick={() => setSelectedLeagueKey(group.key)}
                  className="w-full min-h-[56px] px-4 py-3 flex items-center justify-between gap-3 text-left hover:bg-white/[0.03] transition-colors"
                >
                  <div className="min-w-0">
                    <div className="text-xs text-red-500 font-semibold">{group.country}</div>
                    <div className="text-sm font-medium text-white truncate">
                      {group.leagueName}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="font-mono-tabular text-xs text-zinc-400">
                      {group.fixtures.length}
                    </span>
                    <ChevronRight className="w-4 h-4 text-zinc-500" />
                  </div>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
