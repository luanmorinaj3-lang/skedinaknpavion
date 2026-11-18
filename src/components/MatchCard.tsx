import { BarChart2 } from 'lucide-react';
import type { BetPickCode, BetSlipSelection, MatchFixture } from '../types';
import { TeamLogo } from './TeamLogo';

interface MatchCardProps {
  fixture: MatchFixture;
  activeSelection?: BetSlipSelection;
  onTogglePick: (fixture: MatchFixture, pick: BetPickCode, odds: number, source: 'prematch' | 'live') => void;
  onOpenDetails: (fixture: MatchFixture) => void;
}

export function MatchCard({
  fixture,
  activeSelection,
  onTogglePick,
  onOpenDetails,
}: MatchCardProps) {
  const odds = fixture.odds;
  const canBet = !fixture.isFinished && odds !== null;

  const renderOddButton = (pick: BetPickCode, value: number | null) => {
    const isSelected = activeSelection?.pick === pick;
    const isDisabled = !canBet || value === null;

    return (
      <button
        type="button"
        disabled={isDisabled}
        onClick={() => {
          if (!isDisabled && value !== null && odds) {
            onTogglePick(fixture, pick, value, odds.source);
          }
        }}
        className={`min-h-[44px] flex flex-col items-center justify-center rounded-lg border text-center transition-all duration-150 px-1.5 py-1 ${
          isDisabled
            ? 'bg-zinc-950/60 border-white/5 text-zinc-600 cursor-not-allowed'
            : isSelected
              ? 'bg-red-600 border-red-500 text-white shadow-sm'
              : 'bg-[#17171d] border-white/10 text-white hover:border-red-500/60 hover:bg-[#1f1f27] active:scale-[0.98]'
        }`}
        aria-label={`Pick ${pick} for ${fixture.homeTeam.name} vs ${fixture.awayTeam.name}${
          value !== null ? ` at odds ${value.toFixed(2)}` : ' unavailable'
        }`}
      >
        <span
          className={`text-[10px] font-medium leading-none mb-1 ${
            isSelected ? 'text-red-100' : 'text-zinc-400'
          }`}
        >
          {pick}
        </span>
        <span className="font-mono-tabular text-xs font-semibold leading-none">
          {value !== null ? value.toFixed(2) : '--'}
        </span>
      </button>
    );
  };

  const statusText = fixture.isLive
    ? fixture.elapsed !== null
      ? `${fixture.elapsed}'`
      : fixture.statusShort
    : fixture.isFinished
      ? fixture.statusShort
      : fixture.kickoffTimeTirane;

  return (
    <div className="bg-[#111116] border border-white/10 rounded-xl p-3 hover:border-white/20 transition-colors">
      {/* Top Meta Row */}
      <div className="flex items-center justify-between gap-2 mb-2.5 text-xs">
        <div className="flex items-center gap-2 min-w-0">
          {fixture.isLive ? (
            <span className="inline-flex items-center gap-1.5 text-red-500 font-semibold font-mono-tabular shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" aria-hidden="true" />
              LIVE {statusText}
            </span>
          ) : fixture.isFinished ? (
            <span className="text-zinc-400 font-mono-tabular font-medium shrink-0">
              {statusText}
            </span>
          ) : (
            <span className="text-zinc-300 font-mono-tabular font-medium shrink-0">
              {statusText}
            </span>
          )}
          <span className="text-zinc-600" aria-hidden="true">·</span>
          <span className="text-zinc-400 truncate">
            {fixture.league.country} · {fixture.league.name}
          </span>
        </div>

        <button
          type="button"
          onClick={() => onOpenDetails(fixture)}
          className="min-h-[32px] px-2 flex items-center gap-1 text-[11px] font-medium text-zinc-400 hover:text-white rounded-md hover:bg-white/5 transition-colors shrink-0 whitespace-nowrap"
          aria-label={`View statistics for ${fixture.homeTeam.name} vs ${fixture.awayTeam.name}`}
        >
          <BarChart2 className="w-3.5 h-3.5 text-red-500" />
          <span>Stats</span>
        </button>
      </div>

      {/* Main Content: Teams/Score + 1X2 Odds */}
      <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
        {/* Teams & Score (clickable to open Match Stats) */}
        <button
          type="button"
          onClick={() => onOpenDetails(fixture)}
          className="sm:col-span-7 text-left space-y-2 group focus:outline-none"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <TeamLogo src={fixture.homeTeam.logo} alt={fixture.homeTeam.name} size="sm" />
              <span
                className={`text-sm truncate group-hover:text-red-400 transition-colors ${
                  fixture.homeTeam.winner ? 'font-bold text-white' : 'font-medium text-zinc-100'
                }`}
              >
                {fixture.homeTeam.name}
              </span>
            </div>
            <span
              className={`font-mono-tabular text-sm font-bold shrink-0 w-6 text-right ${
                fixture.isLive ? 'text-red-500' : 'text-white'
              }`}
            >
              {fixture.goals.home !== null ? fixture.goals.home : '-'}
            </span>
          </div>

          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <TeamLogo src={fixture.awayTeam.logo} alt={fixture.awayTeam.name} size="sm" />
              <span
                className={`text-sm truncate group-hover:text-red-400 transition-colors ${
                  fixture.awayTeam.winner ? 'font-bold text-white' : 'font-medium text-zinc-100'
                }`}
              >
                {fixture.awayTeam.name}
              </span>
            </div>
            <span
              className={`font-mono-tabular text-sm font-bold shrink-0 w-6 text-right ${
                fixture.isLive ? 'text-red-500' : 'text-white'
              }`}
            >
              {fixture.goals.away !== null ? fixture.goals.away : '-'}
            </span>
          </div>
        </button>

        {/* 1X2 Odds Grid */}
        <div className="sm:col-span-5">
          <div className="grid grid-cols-3 gap-1.5">
            {renderOddButton('1', odds?.home ?? null)}
            {renderOddButton('X', odds?.draw ?? null)}
            {renderOddButton('2', odds?.away ?? null)}
          </div>
          {odds && (
            <div className="mt-1 flex items-center justify-between text-[10px] text-zinc-500 px-0.5">
              <span>{odds.source === 'live' ? 'Live Odds' : 'Pre-Match 1X2'}</span>
              {odds.bookmaker && <span className="truncate max-w-[110px]">{odds.bookmaker}</span>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
