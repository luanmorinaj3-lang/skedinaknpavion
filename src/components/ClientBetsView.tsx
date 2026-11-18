import {
  CheckCircle2,
  Clock,
  Info,
  LogOut,
  RefreshCw,
  Ticket,
  UserCheck,
  XCircle,
} from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import {
  fetchClientBets,
  fetchClientTransactions,
  formatTiraneDateTime,
  loginClient,
  settleClientBets,
} from '../lib/api';
import type { AuthUser, CreditTransaction, PredictionTicket } from '../types';

interface ClientBetsViewProps {
  user: AuthUser | null;
  refreshSignal: number;
  onAuthenticated: (user: AuthUser) => void;
  onBalanceUpdated: (credits: number) => void;
  onLogout: () => void;
}

export function ClientBetsView({
  user,
  refreshSignal,
  onAuthenticated,
  onBalanceUpdated,
  onLogout,
}: ClientBetsViewProps) {
  const [subTab, setSubTab] = useState<'tickets' | 'ledger'>('tickets');
  const [tickets, setTickets] = useState<PredictionTicket[]>([]);
  const [transactions, setTransactions] = useState<CreditTransaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [settling, setSettling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [settleNotice, setSettleNotice] = useState<string | null>(null);

  // Login form state when logged out
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  const loadClientData = async () => {
    if (!user || user.role !== 'client') return;
    setLoading(true);
    setError(null);
    try {
      const [betsRes, txRes] = await Promise.all([
        fetchClientBets(),
        fetchClientTransactions(),
      ]);
      setTickets(betsRes.tickets);
      setTransactions(txRes.transactions);
      onBalanceUpdated(betsRes.credits);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load your prediction history.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user && user.role === 'client') {
      loadClientData();
    }
  }, [user?.id, refreshSignal]);

  const handleClientLogin = async (e: FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    setLoggingIn(true);
    try {
      const res = await loginClient(username, password);
      onAuthenticated(res.user);
      setUsername('');
      setPassword('');
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : 'Invalid username or password.');
    } finally {
      setLoggingIn(false);
    }
  };

  const handleSettleCheck = async () => {
    setSettling(true);
    setSettleNotice(null);
    setError(null);
    try {
      const res = await settleClientBets();
      setTickets(res.tickets);
      onBalanceUpdated(res.credits);
      const txRes = await fetchClientTransactions();
      setTransactions(txRes.transactions);
      setSettleNotice(
        res.settledCount > 0
          ? `Settled ${res.settledCount} completed prediction slip(s).`
          : 'All finished matches are already up to date.'
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to verify match results.');
    } finally {
      setSettling(false);
    }
  };

  const entertainmentBanner = (
    <div className="bg-[#111116] border border-white/10 rounded-xl p-3.5 flex items-start gap-3 text-xs text-zinc-300">
      <Info className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
      <div className="space-y-0.5">
        <div className="font-semibold text-white">Virtual Credits — Entertainment Only</div>
        <p className="text-zinc-400">
          Virtual credits have no real money value, cannot be deposited or withdrawn, and cannot be converted to cash. Balances are managed strictly by the server.
        </p>
      </div>
    </div>
  );

  if (!user || user.role !== 'client') {
    return (
      <div className="space-y-4">
        {entertainmentBanner}

        <div className="bg-[#111116] border border-white/10 rounded-2xl p-5 sm:p-6 max-w-md mx-auto space-y-4">
          <div className="flex items-center gap-2.5">
            <UserCheck className="w-5 h-5 text-red-500" />
            <h2 className="font-display text-2xl font-bold uppercase tracking-wide text-white">
              Client Sign In
            </h2>
          </div>
          <p className="text-xs text-zinc-400">
            Log in with the client username and password assigned by your administrator to access your virtual credits, place predictions, and view match results.
          </p>

          {user?.role === 'admin' && (
            <div className="bg-zinc-950 border border-white/10 rounded-xl p-3 text-xs text-zinc-300">
              You are currently signed in as an Administrator. Sign in below with a Client account to play prediction games.
            </div>
          )}

          {loginError && (
            <div className="bg-red-950/40 border border-red-500/30 rounded-xl p-3 text-xs text-red-200">
              {loginError}
            </div>
          )}

          <form onSubmit={handleClientLogin} className="space-y-3">
            <div>
              <label htmlFor="client-login-user" className="block text-xs text-zinc-300 mb-1.5">
                Username
              </label>
              <input
                id="client-login-user"
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter client username"
                className="w-full min-h-[44px] bg-zinc-950 border border-white/15 rounded-xl px-3.5 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-red-500"
              />
            </div>

            <div>
              <label htmlFor="client-login-pass" className="block text-xs text-zinc-300 mb-1.5">
                Password
              </label>
              <input
                id="client-login-pass"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                className="w-full min-h-[44px] bg-zinc-950 border border-white/15 rounded-xl px-3.5 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-red-500"
              />
            </div>

            <button
              type="submit"
              disabled={loggingIn}
              className="w-full min-h-[46px] rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-60 text-white font-semibold text-sm transition-colors"
            >
              {loggingIn ? 'Signing in...' : 'Sign In to My Bets'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {entertainmentBanner}

      {/* Account Balance Card */}
      <div className="bg-[#111116] border border-white/10 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="text-xs text-zinc-400">
            Signed in as <strong className="text-white">{user.username}</strong>
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="font-mono-tabular text-3xl font-bold text-white">
              {user.credits.toLocaleString()}
            </span>
            <span className="text-xs font-semibold text-red-500 uppercase tracking-wider">
              Virtual Credits
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={settling}
            onClick={handleSettleCheck}
            className="min-h-[44px] px-4 rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-60 text-white text-xs font-semibold flex items-center gap-2 transition-colors whitespace-nowrap"
          >
            <RefreshCw className={`w-4 h-4 ${settling ? 'animate-spin' : ''}`} />
            <span>{settling ? 'Checking...' : 'Check Results'}</span>
          </button>
          <button
            type="button"
            onClick={onLogout}
            className="min-h-[44px] px-3.5 rounded-xl bg-zinc-900 border border-white/10 hover:border-white/25 text-zinc-300 hover:text-white text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap"
          >
            <LogOut className="w-4 h-4" />
            <span>Sign Out</span>
          </button>
        </div>
      </div>

      {settleNotice && (
        <div className="bg-zinc-900 border border-white/15 rounded-xl px-4 py-2.5 text-xs text-zinc-200">
          {settleNotice}
        </div>
      )}

      {error && (
        <div className="bg-red-950/40 border border-red-500/30 rounded-xl p-3 text-xs text-red-200">
          {error}
        </div>
      )}

      {/* Sub-navigation */}
      <div className="flex items-center gap-2 border-b border-white/10">
        <button
          type="button"
          onClick={() => setSubTab('tickets')}
          className={`min-h-[44px] px-4 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap ${
            subTab === 'tickets'
              ? 'border-red-600 text-white'
              : 'border-transparent text-zinc-400 hover:text-white'
          }`}
        >
          Prediction History ({tickets.length})
        </button>
        <button
          type="button"
          onClick={() => setSubTab('ledger')}
          className={`min-h-[44px] px-4 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap ${
            subTab === 'ledger'
              ? 'border-red-600 text-white'
              : 'border-transparent text-zinc-400 hover:text-white'
          }`}
        >
          Credit Transactions ({transactions.length})
        </button>
      </div>

      {loading ? (
        <div className="space-y-3">
          <div className="h-24 bg-[#111116] rounded-xl animate-pulse" />
          <div className="h-24 bg-[#111116] rounded-xl animate-pulse" />
        </div>
      ) : subTab === 'tickets' ? (
        tickets.length === 0 ? (
          <div className="bg-[#111116] border border-white/10 rounded-2xl p-8 text-center space-y-2">
            <Ticket className="w-7 h-7 text-zinc-600 mx-auto" />
            <div className="text-sm font-semibold text-white">No predictions placed yet</div>
            <p className="text-xs text-zinc-400">
              Select 1, X, or 2 odds on today&apos;s or LIVE matches to place your first virtual prediction slip.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {tickets.map((tk) => (
              <div
                key={tk.id}
                className="bg-[#111116] border border-white/10 rounded-2xl p-4 space-y-3"
              >
                <div className="flex items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-mono-tabular font-bold text-white">{tk.id}</span>
                    <span className="text-zinc-600" aria-hidden="true">·</span>
                    <span className="text-zinc-400">{formatTiraneDateTime(tk.createdAt)}</span>
                  </div>
                  <span
                    className={`inline-flex items-center gap-1 font-semibold uppercase text-[11px] ${
                      tk.status === 'won'
                        ? 'text-emerald-400'
                        : tk.status === 'lost'
                          ? 'text-red-500'
                          : tk.status === 'void'
                            ? 'text-zinc-400'
                            : 'text-amber-400'
                    }`}
                  >
                    {tk.status === 'won' && <CheckCircle2 className="w-3.5 h-3.5" />}
                    {tk.status === 'lost' && <XCircle className="w-3.5 h-3.5" />}
                    {tk.status === 'pending' && <Clock className="w-3.5 h-3.5" />}
                    {tk.status}
                  </span>
                </div>

                <div className="divide-y divide-white/5 border-y border-white/10">
                  {tk.selections.map((sel) => (
                    <div
                      key={`${tk.id}-${sel.fixtureId}`}
                      className="py-2 flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="min-w-0">
                        <div className="font-medium text-white truncate">
                          {sel.homeTeam} vs {sel.awayTeam}
                        </div>
                        <div className="text-[11px] text-zinc-400 truncate">
                          {sel.leagueName} · Pick:{' '}
                          <span className="text-red-400 font-semibold">{sel.pick}</span>
                          {sel.finalScore ? ` · Final ${sel.finalScore}` : ''}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="font-mono-tabular font-semibold text-white">
                          {sel.odds.toFixed(2)}
                        </div>
                        <div
                          className={`text-[10px] uppercase font-semibold ${
                            sel.result === 'won'
                              ? 'text-emerald-400'
                              : sel.result === 'lost'
                                ? 'text-red-500'
                                : 'text-zinc-500'
                          }`}
                        >
                          {sel.result}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="text-zinc-400">
                    Stake: <strong className="font-mono-tabular text-white">{tk.stake} CR</strong>
                    <span className="mx-2 text-zinc-600">·</span>
                    Odds: <strong className="font-mono-tabular text-white">{tk.totalOdds.toFixed(2)}</strong>
                  </div>
                  <div>
                    {tk.status === 'won' ? (
                      <span className="font-mono-tabular font-bold text-emerald-400">
                        Won +{tk.payout.toLocaleString()} CR
                      </span>
                    ) : tk.status === 'lost' ? (
                      <span className="font-mono-tabular font-semibold text-zinc-500">
                        Return 0 CR
                      </span>
                    ) : (
                      <span className="font-mono-tabular font-semibold text-red-400">
                        Potential {tk.potentialReturn.toLocaleString()} CR
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )
      ) : transactions.length === 0 ? (
        <div className="bg-[#111116] border border-white/10 rounded-2xl p-8 text-center text-sm text-zinc-400">
          No credit transactions recorded yet.
        </div>
      ) : (
        <div className="bg-[#111116] border border-white/10 rounded-2xl divide-y divide-white/10">
          {transactions.map((tx) => (
            <div key={tx.id} className="p-3.5 flex items-center justify-between gap-3 text-xs">
              <div className="min-w-0">
                <div className="font-medium text-white truncate">{tx.reason}</div>
                <div className="text-[11px] text-zinc-400 mt-0.5">
                  {formatTiraneDateTime(tx.createdAt)} · Balance after:{' '}
                  <span className="font-mono-tabular text-zinc-200">
                    {tx.balanceAfter.toLocaleString()} CR
                  </span>
                </div>
              </div>
              <span
                className={`font-mono-tabular font-bold shrink-0 ${
                  tx.amount >= 0 ? 'text-emerald-400' : 'text-red-400'
                }`}
              >
                {tx.amount >= 0 ? `+${tx.amount}` : tx.amount} CR
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
