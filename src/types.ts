export type NavTab = 'home' | 'az' | 'live' | 'bets' | 'admin';

export interface Odds1X2 {
  home: number | null;
  draw: number | null;
  away: number | null;
  bookmaker: string | null;
  source: 'prematch' | 'live';
  updatedAt: string;
}

export interface MatchFixture {
  id: number;
  dateIso: string;
  kickoffTimeTirane: string;
  timestamp: number;
  statusShort: string;
  statusLong: string;
  elapsed: number | null;
  isLive: boolean;
  isFinished: boolean;
  isUpcoming: boolean;
  venue: string | null;
  referee: string | null;
  league: {
    id: number;
    name: string;
    country: string;
    logo: string | null;
    flag: string | null;
    round: string | null;
  };
  homeTeam: {
    id: number;
    name: string;
    logo: string | null;
    winner: boolean | null;
  };
  awayTeam: {
    id: number;
    name: string;
    logo: string | null;
    winner: boolean | null;
  };
  goals: {
    home: number | null;
    away: number | null;
  };
  halftimeScore: {
    home: number | null;
    away: number | null;
  };
  odds: Odds1X2 | null;
}

export interface DailyPick {
  fixture: MatchFixture;
  recommendedPick: '1' | 'X' | '2';
  recommendedLabel: string;
  oddsValue: number;
  bookmaker: string;
}

export interface ApiFootballEnvelope<T> {
  available: boolean;
  errorCode?: 'MISSING_API_KEY' | 'API_ERROR' | 'RATE_LIMIT' | 'NO_DATA';
  message?: string;
  fetchedAt: string;
  timezone: 'Europe/Tirane';
  dateTirane: string;
  cached: boolean;
  data: T;
}

export interface TeamStatValue {
  type: string;
  value: string | number | null;
}

export interface TeamStatistics {
  team: {
    id: number;
    name: string;
    logo: string | null;
  };
  statistics: TeamStatValue[];
}

export interface MatchEventItem {
  timeElapsed: number;
  timeExtra: number | null;
  teamId: number;
  teamName: string;
  playerName: string | null;
  assistName: string | null;
  type: string;
  detail: string;
}

export interface MatchDetailsPayload {
  available: boolean;
  message?: string;
  statistics: TeamStatistics[];
  events: MatchEventItem[];
  prematchOdds: Odds1X2 | null;
  liveOdds: Odds1X2 | null;
}

export type UserRole = 'admin' | 'client';
export type AccountStatus = 'active' | 'suspended';

export interface AuthUser {
  id: string;
  username: string;
  role: UserRole;
  status: AccountStatus;
  credits: number;
}

export interface ClientAccountSummary {
  id: string;
  username: string;
  status: AccountStatus;
  credits: number;
  note: string;
  createdAt: string;
  updatedAt: string;
}

export type TransactionType =
  | 'admin_grant'
  | 'admin_deduct'
  | 'bet_stake'
  | 'bet_payout'
  | 'bet_refund';

export interface CreditTransaction {
  id: string;
  clientId: string;
  clientUsername: string;
  type: TransactionType;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  reason: string;
  actor: string;
  createdAt: string;
}

export type BetPickCode = '1' | 'X' | '2';

export interface BetSlipSelection {
  fixtureId: number;
  homeTeam: string;
  awayTeam: string;
  leagueName: string;
  kickoffTimeTirane: string;
  dateIso: string;
  pick: BetPickCode;
  odds: number;
  oddsSource: 'prematch' | 'live';
}

export interface BetSelectionRecord extends BetSlipSelection {
  result: 'pending' | 'won' | 'lost' | 'void';
  finalScore?: string;
}

export interface PredictionTicket {
  id: string;
  clientId: string;
  clientUsername: string;
  selections: BetSelectionRecord[];
  stake: number;
  totalOdds: number;
  potentialReturn: number;
  payout: number;
  status: 'pending' | 'won' | 'lost' | 'void';
  createdAt: string;
  settledAt?: string;
}

export interface SeoSettings {
  googleVerificationMeta: string;
  googleVerificationFile: string;
  customDomain: string;
}
