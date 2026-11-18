import {
  Ban,
  CheckCircle2,
  Coins,
  Copy,
  ExternalLink,
  Globe,
  KeyRound,
  LogOut,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  Trash2,
  UserPlus,
  X,
} from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import {
  adjustAdminClientCredits,
  createAdminClient,
  deleteAdminClient,
  fetchAdminBets,
  fetchAdminClients,
  fetchAdminSeo,
  fetchAdminTransactions,
  formatTiraneDateTime,
  loginAdmin,
  saveAdminSeo,
  settleAllAdminBets,
  toggleAdminClientStatus,
  updateAdminClient,
} from '../lib/api';
import type {
  AuthUser,
  ClientAccountSummary,
  CreditTransaction,
  PredictionTicket,
  SeoSettings,
} from '../types';

interface AdminPanelViewProps {
  user: AuthUser | null;
  onAuthenticated: (user: AuthUser) => void;
  onLogout: () => void;
}

export function AdminPanelView({
  user,
  onAuthenticated,
  onLogout,
}: AdminPanelViewProps) {
  const [tab, setTab] = useState<'clients' | 'transactions' | 'bets' | 'seo'>('clients');
  const [clients, setClients] = useState<ClientAccountSummary[]>([]);
  const [transactions, setTransactions] = useState<CreditTransaction[]>([]);
  const [tickets, setTickets] = useState<PredictionTicket[]>([]);
  const [seoForm, setSeoForm] = useState<SeoSettings>({
    googleVerificationMeta: '',
    googleVerificationFile: '',
    customDomain: '',
  });
  const [savingSeo, setSavingSeo] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  // Admin Login form
  const [adminUser, setAdminUser] = useState('');
  const [adminPass, setAdminPass] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  // Create Client modal
  const [showCreate, setShowCreate] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newCredits, setNewCredits] = useState('1000');
  const [newNote, setNewNote] = useState('');
  const [creating, setCreating] = useState(false);

  // Adjust Credits modal
  const [creditTarget, setCreditTarget] = useState<ClientAccountSummary | null>(null);
  const [creditAction, setCreditAction] = useState<'add' | 'remove'>('add');
  const [creditAmount, setCreditAmount] = useState('500');
  const [creditReason, setCreditReason] = useState('');
  const [adjusting, setAdjusting] = useState(false);

  // Edit Credentials modal
  const [editTarget, setEditTarget] = useState<ClientAccountSummary | null>(null);
  const [editUsername, setEditUsername] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [editNote, setEditNote] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  // Delete confirmation target
  const [deleteTarget, setDeleteTarget] = useState<ClientAccountSummary | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Settlement
  const [settling, setSettling] = useState(false);

  const loadAdminData = async () => {
    if (!user || user.role !== 'admin') return;
    setLoading(true);
    setError(null);
    try {
      const [cRes, tRes, bRes, sRes] = await Promise.all([
        fetchAdminClients(),
        fetchAdminTransactions(),
        fetchAdminBets(),
        fetchAdminSeo(),
      ]);
      setClients(cRes.clients);
      setTransactions(tRes.transactions);
      setTickets(bRes.tickets);
      setSeoForm(sRes.seo);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load admin data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user && user.role === 'admin') {
      loadAdminData();
    }
  }, [user?.id, user?.role]);

  const handleAdminLogin = async (e: FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    setLoggingIn(true);
    try {
      const res = await loginAdmin(adminUser, adminPass);
      onAuthenticated(res.user);
      setAdminUser('');
      setAdminPass('');
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : 'Admin authentication failed.');
    } finally {
      setLoggingIn(false);
    }
  };

  const handleCreateClient = async (e: FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setError(null);
    setFeedback(null);
    try {
      const res = await createAdminClient({
        username: newUsername,
        password: newPassword,
        initialCredits: Math.max(0, Math.floor(Number(newCredits) || 0)),
        note: newNote,
      });
      setClients((prev) => [res.client, ...prev]);
      const txRes = await fetchAdminTransactions();
      setTransactions(txRes.transactions);
      setShowCreate(false);
      setNewUsername('');
      setNewPassword('');
      setNewCredits('1000');
      setNewNote('');
      setFeedback(`Client account "${res.client.username}" created with ${res.client.credits} virtual credits.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create client.');
    } finally {
      setCreating(false);
    }
  };

  const handleAdjustCredits = async (e: FormEvent) => {
    e.preventDefault();
    if (!creditTarget) return;
    setAdjusting(true);
    setError(null);
    setFeedback(null);
    try {
      const res = await adjustAdminClientCredits(creditTarget.id, {
        action: creditAction,
        amount: Math.floor(Number(creditAmount) || 0),
        reason: creditReason,
      });
      setClients((prev) => prev.map((c) => (c.id === res.client.id ? res.client : c)));
      setTransactions((prev) => [res.transaction, ...prev]);
      setCreditTarget(null);
      setCreditReason('');
      setFeedback(
        `${creditAction === 'add' ? 'Added' : 'Removed'} ${Math.abs(res.transaction.amount)} virtual credits for ${res.client.username}. New balance: ${res.client.credits}.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Credit adjustment failed.');
    } finally {
      setAdjusting(false);
    }
  };

  const handleToggleStatus = async (client: ClientAccountSummary) => {
    setError(null);
    setFeedback(null);
    const nextStatus = client.status === 'active' ? 'suspended' : 'active';
    try {
      const res = await toggleAdminClientStatus(client.id, nextStatus);
      setClients((prev) => prev.map((c) => (c.id === res.client.id ? res.client : c)));
      setFeedback(`Account "${res.client.username}" is now ${res.client.status}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update status.');
    }
  };

  const handleSaveEdit = async (e: FormEvent) => {
    e.preventDefault();
    if (!editTarget) return;
    setSavingEdit(true);
    setError(null);
    setFeedback(null);
    try {
      const res = await updateAdminClient(editTarget.id, {
        username: editUsername,
        password: editPassword || undefined,
        note: editNote,
      });
      setClients((prev) => prev.map((c) => (c.id === res.client.id ? res.client : c)));
      setEditTarget(null);
      setEditPassword('');
      setFeedback(`Updated credentials for "${res.client.username}".`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update client.');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setError(null);
    setFeedback(null);
    try {
      await deleteAdminClient(deleteTarget.id);
      setClients((prev) => prev.filter((c) => c.id !== deleteTarget.id));
      setFeedback(`Deleted client account "${deleteTarget.username}".`);
      setDeleteTarget(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to delete client.');
    } finally {
      setDeleting(false);
    }
  };

  const handleSettleAll = async () => {
    setSettling(true);
    setError(null);
    setFeedback(null);
    try {
      const res = await settleAllAdminBets();
      setTickets(res.tickets);
      setClients(res.clients);
      const txRes = await fetchAdminTransactions();
      setTransactions(txRes.transactions);
      setFeedback(`Settlement check complete: ${res.settledCount} slip(s) settled.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Settlement failed.');
    } finally {
      setSettling(false);
    }
  };

  if (!user || user.role !== 'admin') {
    return (
      <div className="bg-[#111116] border border-white/10 rounded-2xl p-5 sm:p-6 max-w-md mx-auto space-y-4">
        <div className="flex items-center gap-2.5">
          <ShieldAlert className="w-5 h-5 text-red-500" />
          <h2 className="font-display text-2xl font-bold uppercase tracking-wide text-white">
            Admin Panel Login
          </h2>
        </div>
        <p className="text-xs text-zinc-400">
          Authorized administrators only. Manage client accounts, set credentials, allocate entertainment-only virtual credits, and review ledger history.
        </p>

        {loginError && (
          <div className="bg-red-950/40 border border-red-500/30 rounded-xl p-3 text-xs text-red-200">
            {loginError}
          </div>
        )}

        <form onSubmit={handleAdminLogin} className="space-y-3">
          <div>
            <label htmlFor="admin-user-input" className="block text-xs text-zinc-300 mb-1.5">
              Admin Username
            </label>
            <input
              id="admin-user-input"
              type="text"
              required
              value={adminUser}
              onChange={(e) => setAdminUser(e.target.value)}
              placeholder="admin"
              className="w-full min-h-[44px] bg-zinc-950 border border-white/15 rounded-xl px-3.5 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-red-500"
            />
          </div>

          <div>
            <label htmlFor="admin-pass-input" className="block text-xs text-zinc-300 mb-1.5">
              Admin Password
            </label>
            <input
              id="admin-pass-input"
              type="password"
              required
              value={adminPass}
              onChange={(e) => setAdminPass(e.target.value)}
              placeholder="Enter admin password"
              className="w-full min-h-[44px] bg-zinc-950 border border-white/15 rounded-xl px-3.5 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-red-500"
            />
          </div>

          <button
            type="submit"
            disabled={loggingIn}
            className="w-full min-h-[46px] rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-60 text-white font-semibold text-sm transition-colors"
          >
            {loggingIn ? 'Authenticating...' : 'Sign In to Admin Panel'}
          </button>
        </form>
      </div>
    );
  }

  const filteredClients = clients.filter((c) =>
    c.username.toLowerCase().includes(search.trim().toLowerCase())
  );

  const totalCredits = clients.reduce((sum, c) => sum + c.credits, 0);
  const activeCount = clients.filter((c) => c.status === 'active').length;

  return (
    <div className="space-y-4">
      {/* Admin Header */}
      <div className="bg-[#111116] border border-white/10 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-red-500" />
            <h1 className="font-display text-2xl font-bold uppercase tracking-wide text-white">
              SKEDINAKNPAVION Admin
            </h1>
          </div>
          <div className="text-xs text-zinc-400 mt-1 flex flex-wrap items-center gap-2">
            <span>{clients.length} Clients ({activeCount} Active)</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono-tabular text-white">
              {totalCredits.toLocaleString()} Virtual Credits in circulation
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setError(null);
              setShowCreate(true);
            }}
            className="min-h-[44px] px-4 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-semibold flex items-center gap-2 transition-colors whitespace-nowrap"
          >
            <UserPlus className="w-4 h-4" />
            <span>New Client</span>
          </button>
          <button
            type="button"
            onClick={loadAdminData}
            className="min-h-[44px] px-3.5 rounded-xl bg-zinc-900 border border-white/10 hover:border-white/25 text-zinc-200 text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
          <button
            type="button"
            onClick={onLogout}
            className="min-h-[44px] px-3.5 rounded-xl bg-zinc-900 border border-white/10 hover:border-white/25 text-zinc-300 text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap"
          >
            <LogOut className="w-4 h-4" />
            <span>Sign Out</span>
          </button>
        </div>
      </div>

      {feedback && (
        <div className="bg-emerald-950/40 border border-emerald-500/30 rounded-xl px-4 py-3 text-xs text-emerald-200 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{feedback}</span>
        </div>
      )}

      {error && (
        <div className="bg-red-950/40 border border-red-500/30 rounded-xl px-4 py-3 text-xs text-red-200">
          {error}
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-white/10 overflow-x-auto no-scrollbar">
        <button
          type="button"
          onClick={() => setTab('clients')}
          className={`min-h-[44px] px-4 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap ${
            tab === 'clients'
              ? 'border-red-600 text-white'
              : 'border-transparent text-zinc-400 hover:text-white'
          }`}
        >
          Clients ({clients.length})
        </button>
        <button
          type="button"
          onClick={() => setTab('transactions')}
          className={`min-h-[44px] px-4 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap ${
            tab === 'transactions'
              ? 'border-red-600 text-white'
              : 'border-transparent text-zinc-400 hover:text-white'
          }`}
        >
          Credit Transaction History ({transactions.length})
        </button>
        <button
          type="button"
          onClick={() => setTab('bets')}
          className={`min-h-[44px] px-4 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap ${
            tab === 'bets'
              ? 'border-red-600 text-white'
              : 'border-transparent text-zinc-400 hover:text-white'
          }`}
        >
          Prediction Tickets ({tickets.length})
        </button>
        <button
          type="button"
          onClick={() => setTab('seo')}
          className={`min-h-[44px] px-4 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap ${
            tab === 'seo'
              ? 'border-red-600 text-white'
              : 'border-transparent text-zinc-400 hover:text-white'
          }`}
        >
          Google Search &amp; SEO
        </button>
      </div>

      {tab === 'clients' && (
        <div className="space-y-3">
          <div className="relative">
            <Search className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search client accounts by username..."
              className="w-full min-h-[44px] bg-[#111116] border border-white/10 rounded-xl pl-10 pr-4 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-red-500"
            />
          </div>

          {filteredClients.length === 0 ? (
            <div className="bg-[#111116] border border-white/10 rounded-2xl p-8 text-center text-sm text-zinc-400">
              No client accounts found. Click &quot;New Client&quot; to create a player account.
            </div>
          ) : (
            <div className="space-y-2.5">
              {filteredClients.map((client) => (
                <div
                  key={client.id}
                  className="bg-[#111116] border border-white/10 rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4"
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2.5">
                      <span className="text-base font-bold text-white truncate">
                        {client.username}
                      </span>
                      <span
                        className={`text-[11px] font-semibold uppercase ${
                          client.status === 'active' ? 'text-emerald-400' : 'text-red-500'
                        }`}
                      >
                        {client.status}
                      </span>
                    </div>
                    <div className="text-xs text-zinc-400">
                      Balance:{' '}
                      <strong className="font-mono-tabular text-white">
                        {client.credits.toLocaleString()} CR
                      </strong>
                      {client.note ? ` · ${client.note}` : ''}
                    </div>
                    <div className="text-[11px] text-zinc-500">
                      Created {formatTiraneDateTime(client.createdAt)}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setCreditTarget(client);
                        setCreditAction('add');
                        setCreditAmount('500');
                        setCreditReason('');
                        setError(null);
                      }}
                      className="min-h-[40px] px-3 rounded-lg bg-red-600/90 hover:bg-red-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap"
                    >
                      <Coins className="w-3.5 h-3.5" />
                      <span>+/- Credits</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setEditTarget(client);
                        setEditUsername(client.username);
                        setEditPassword('');
                        setEditNote(client.note);
                        setError(null);
                      }}
                      className="min-h-[40px] px-3 rounded-lg bg-zinc-900 border border-white/10 hover:border-white/25 text-zinc-200 text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap"
                    >
                      <KeyRound className="w-3.5 h-3.5" />
                      <span>Credentials</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleToggleStatus(client)}
                      className={`min-h-[40px] px-3 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                        client.status === 'active'
                          ? 'bg-zinc-900 border-white/10 text-amber-300 hover:border-amber-500/40'
                          : 'bg-emerald-950/40 border-emerald-500/30 text-emerald-300 hover:bg-emerald-900/40'
                      }`}
                    >
                      <Ban className="w-3.5 h-3.5" />
                      <span>{client.status === 'active' ? 'Suspend' : 'Activate'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setDeleteTarget(client)}
                      className="min-h-[40px] px-3 rounded-lg bg-zinc-900 border border-white/10 hover:border-red-500/50 text-red-400 text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Delete</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'transactions' && (
        <div className="bg-[#111116] border border-white/10 rounded-2xl divide-y divide-white/10">
          {transactions.length === 0 ? (
            <div className="p-8 text-center text-sm text-zinc-400">
              No virtual credit transactions recorded yet.
            </div>
          ) : (
            transactions.map((tx) => (
              <div
                key={tx.id}
                className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
              >
                <div className="min-w-0">
                  <div className="font-semibold text-white">
                    {tx.clientUsername}{' '}
                    <span className="font-normal text-zinc-400">· {tx.reason}</span>
                  </div>
                  <div className="text-[11px] text-zinc-500 mt-0.5">
                    {formatTiraneDateTime(tx.createdAt)} · Actor: {tx.actor} · Balance:{' '}
                    <span className="font-mono-tabular text-zinc-300">
                      {tx.balanceBefore.toLocaleString()} → {tx.balanceAfter.toLocaleString()} CR
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
            ))
          )}
        </div>
      )}

      {tab === 'bets' && (
        <div className="space-y-3">
          <div className="flex justify-end">
            <button
              type="button"
              disabled={settling}
              onClick={handleSettleAll}
              className="min-h-[44px] px-4 rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-60 text-white text-xs font-semibold flex items-center gap-2 transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${settling ? 'animate-spin' : ''}`} />
              <span>{settling ? 'Settling...' : 'Sync & Settle Finished Matches'}</span>
            </button>
          </div>

          {tickets.length === 0 ? (
            <div className="bg-[#111116] border border-white/10 rounded-2xl p-8 text-center text-sm text-zinc-400">
              No client prediction tickets placed yet.
            </div>
          ) : (
            <div className="space-y-2.5">
              {tickets.map((tk) => (
                <div
                  key={tk.id}
                  className="bg-[#111116] border border-white/10 rounded-2xl p-4 space-y-2 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <strong className="text-white">{tk.clientUsername}</strong>{' '}
                      <span className="text-zinc-500 font-mono-tabular">({tk.id})</span>
                      <span className="text-zinc-500 ml-2">
                        {formatTiraneDateTime(tk.createdAt)}
                      </span>
                    </div>
                    <span
                      className={`font-semibold uppercase ${
                        tk.status === 'won'
                          ? 'text-emerald-400'
                          : tk.status === 'lost'
                            ? 'text-red-500'
                            : 'text-amber-400'
                      }`}
                    >
                      {tk.status}
                    </span>
                  </div>
                  <div className="text-zinc-300 space-y-1">
                    {tk.selections.map((s) => (
                      <div key={`${tk.id}-${s.fixtureId}`} className="flex justify-between gap-2">
                        <span className="truncate">
                          {s.homeTeam} vs {s.awayTeam} — Pick{' '}
                          <strong className="text-red-400">{s.pick}</strong>
                          {s.finalScore ? ` (${s.finalScore})` : ''}
                        </span>
                        <span className="font-mono-tabular shrink-0">{s.odds.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                  <div className="pt-2 border-t border-white/10 flex justify-between text-zinc-400">
                    <span>
                      Stake <strong className="text-white font-mono-tabular">{tk.stake} CR</strong> @{' '}
                      <strong className="text-white font-mono-tabular">
                        {tk.totalOdds.toFixed(2)}
                      </strong>
                    </span>
                    <span className="font-mono-tabular text-white font-semibold">
                      {tk.status === 'won'
                        ? `Paid ${tk.payout} CR`
                        : `Potential ${tk.potentialReturn} CR`}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'seo' && (
        <div className="space-y-4">
          <div className="bg-[#111116] border border-white/10 rounded-2xl p-5 space-y-4">
            <div className="flex items-center gap-2.5">
              <Globe className="w-5 h-5 text-red-500" />
              <h2 className="font-display text-xl font-bold uppercase tracking-wide text-white">
                Google Search Indexing &amp; Verification
              </h2>
            </div>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Your sitemap, robots.txt, Schema.org structured data, and OpenGraph cards are live. To verify ownership and submit your site to Google Search, connect your public URL in Google Search Console below.
            </p>

            {/* Live Crawler URLs */}
            {(() => {
              const origin =
                seoForm.customDomain && seoForm.customDomain.startsWith('http')
                  ? seoForm.customDomain.replace(/\/+$/, '')
                  : typeof window !== 'undefined'
                    ? window.location.origin
                    : '';
              const urls = [
                { label: 'Public Home URL', url: `${origin}/` },
                { label: 'XML Sitemap', url: `${origin}/sitemap.xml` },
                { label: 'Robots.txt', url: `${origin}/robots.txt` },
              ];
              return (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {urls.map((item) => (
                    <div
                      key={item.label}
                      className="bg-zinc-950 border border-white/10 rounded-xl p-3 flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <div className="text-[11px] text-zinc-400">{item.label}</div>
                        <div className="text-xs font-mono-tabular text-white truncate">
                          {item.url}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard?.writeText(item.url);
                          setCopiedUrl(item.label);
                          setTimeout(() => setCopiedUrl(null), 1800);
                        }}
                        className="min-h-[36px] min-w-[36px] rounded-lg bg-zinc-900 border border-white/10 hover:border-red-500/60 flex items-center justify-center text-zinc-300 shrink-0"
                        aria-label={`Copy ${item.label}`}
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              );
            })()}

            {copiedUrl && (
              <div className="text-xs text-emerald-400">
                Copied {copiedUrl} to clipboard.
              </div>
            )}

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setSavingSeo(true);
                setError(null);
                setFeedback(null);
                try {
                  const res = await saveAdminSeo(seoForm);
                  setSeoForm(res.seo);
                  setFeedback('Google Search Console verification settings saved.');
                } catch (err) {
                  setError(err instanceof Error ? err.message : 'Unable to save SEO settings.');
                } finally {
                  setSavingSeo(false);
                }
              }}
              className="space-y-3 pt-2 border-t border-white/10"
            >
              <div>
                <label className="block text-xs text-zinc-300 mb-1">
                  Google Search Console Meta Tag or Token
                </label>
                <input
                  type="text"
                  value={seoForm.googleVerificationMeta}
                  onChange={(e) =>
                    setSeoForm((prev) => ({ ...prev, googleVerificationMeta: e.target.value }))
                  }
                  placeholder='Paste full <meta name="google-site-verification" ...> or just the token'
                  className="w-full min-h-[44px] bg-zinc-950 border border-white/15 rounded-xl px-3.5 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-red-500"
                />
              </div>

              <div>
                <label className="block text-xs text-zinc-300 mb-1">
                  Google HTML Verification Filename (optional)
                </label>
                <input
                  type="text"
                  value={seoForm.googleVerificationFile}
                  onChange={(e) =>
                    setSeoForm((prev) => ({ ...prev, googleVerificationFile: e.target.value }))
                  }
                  placeholder="e.g. google1a2b3c4d5e6f7a8b.html"
                  className="w-full min-h-[44px] bg-zinc-950 border border-white/15 rounded-xl px-3.5 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-red-500"
                />
              </div>

              <div>
                <label className="block text-xs text-zinc-300 mb-1">
                  Canonical Production Domain (optional)
                </label>
                <input
                  type="url"
                  value={seoForm.customDomain}
                  onChange={(e) =>
                    setSeoForm((prev) => ({ ...prev, customDomain: e.target.value }))
                  }
                  placeholder="https://your-public-domain.com"
                  className="w-full min-h-[44px] bg-zinc-950 border border-white/15 rounded-xl px-3.5 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-red-500"
                />
              </div>

              <div className="flex flex-wrap items-center gap-3 pt-1">
                <button
                  type="submit"
                  disabled={savingSeo}
                  className="min-h-[44px] px-5 rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-60 text-white text-xs font-semibold transition-colors"
                >
                  {savingSeo ? 'Saving...' : 'Save Google Verification'}
                </button>

                <a
                  href="https://search.google.com/search-console"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-h-[44px] px-4 rounded-xl bg-zinc-900 border border-white/15 hover:border-white/30 text-zinc-200 text-xs font-semibold inline-flex items-center gap-2 transition-colors"
                >
                  <span>Open Google Search Console</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            </form>

            <div className="bg-zinc-950 border border-white/10 rounded-xl p-4 text-xs text-zinc-300 space-y-1.5">
              <div className="font-semibold text-white">How to list on Google Search:</div>
              <p>1. Publish your app to a public URL (Replit Autoscale or custom domain).</p>
              <p>2. Add that URL in Google Search Console as a URL-prefix property, copy the HTML tag or filename above, and click Save.</p>
              <p>3. Click Verify in Google Search Console, then submit your sitemap URL (`sitemap.xml`) and request indexing.</p>
            </div>
          </div>
        </div>
      )}

      {/* Create Client Modal */}
      {showCreate && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full sm:max-w-md bg-[#111116] border border-white/15 rounded-t-2xl sm:rounded-2xl p-5 space-y-4 pb-safe">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-xl font-bold uppercase text-white">
                Create Client Account
              </h3>
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center text-zinc-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateClient} className="space-y-3">
              <div>
                <label className="block text-xs text-zinc-300 mb-1">Username</label>
                <input
                  type="text"
                  required
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  placeholder="e.g. player_tirana"
                  className="w-full min-h-[44px] bg-zinc-950 border border-white/15 rounded-xl px-3.5 text-sm text-white focus:outline-none focus:border-red-500"
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-300 mb-1">Password</label>
                <input
                  type="password"
                  required
                  minLength={4}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Minimum 4 characters"
                  className="w-full min-h-[44px] bg-zinc-950 border border-white/15 rounded-xl px-3.5 text-sm text-white focus:outline-none focus:border-red-500"
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-300 mb-1">
                  Initial Virtual Credits (Entertainment Only)
                </label>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={newCredits}
                  onChange={(e) => setNewCredits(e.target.value)}
                  className="w-full min-h-[44px] bg-zinc-950 border border-white/15 rounded-xl px-3.5 text-sm font-mono-tabular text-white focus:outline-none focus:border-red-500"
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-300 mb-1">Note (optional)</label>
                <input
                  type="text"
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  placeholder="Optional label"
                  className="w-full min-h-[44px] bg-zinc-950 border border-white/15 rounded-xl px-3.5 text-sm text-white focus:outline-none focus:border-red-500"
                />
              </div>
              <button
                type="submit"
                disabled={creating}
                className="w-full min-h-[46px] rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-60 text-white font-semibold text-sm flex items-center justify-center gap-2"
              >
                <Plus className="w-4 h-4" />
                <span>{creating ? 'Creating...' : 'Create Client Account'}</span>
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Adjust Credits Modal */}
      {creditTarget && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full sm:max-w-md bg-[#111116] border border-white/15 rounded-t-2xl sm:rounded-2xl p-5 space-y-4 pb-safe">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-xl font-bold uppercase text-white">
                Virtual Credits · {creditTarget.username}
              </h3>
              <button
                type="button"
                onClick={() => setCreditTarget(null)}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center text-zinc-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="text-xs text-zinc-400">
              Current Balance:{' '}
              <strong className="font-mono-tabular text-white">
                {creditTarget.credits.toLocaleString()} CR
              </strong>
            </div>

            <form onSubmit={handleAdjustCredits} className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setCreditAction('add')}
                  className={`min-h-[42px] rounded-xl border text-xs font-semibold ${
                    creditAction === 'add'
                      ? 'bg-emerald-600 border-emerald-500 text-white'
                      : 'bg-zinc-950 border-white/10 text-zinc-400'
                  }`}
                >
                  Add Credits (+)
                </button>
                <button
                  type="button"
                  onClick={() => setCreditAction('remove')}
                  className={`min-h-[42px] rounded-xl border text-xs font-semibold ${
                    creditAction === 'remove'
                      ? 'bg-red-600 border-red-500 text-white'
                      : 'bg-zinc-950 border-white/10 text-zinc-400'
                  }`}
                >
                  Remove Credits (-)
                </button>
              </div>

              <div>
                <label className="block text-xs text-zinc-300 mb-1">Amount</label>
                <input
                  type="number"
                  min={1}
                  step={1}
                  required
                  value={creditAmount}
                  onChange={(e) => setCreditAmount(e.target.value)}
                  className="w-full min-h-[44px] bg-zinc-950 border border-white/15 rounded-xl px-3.5 text-sm font-mono-tabular text-white focus:outline-none focus:border-red-500"
                />
              </div>

              <div>
                <label className="block text-xs text-zinc-300 mb-1">Reason / Audit Note</label>
                <input
                  type="text"
                  value={creditReason}
                  onChange={(e) => setCreditReason(e.target.value)}
                  placeholder="e.g. Weekly entertainment credit top-up"
                  className="w-full min-h-[44px] bg-zinc-950 border border-white/15 rounded-xl px-3.5 text-sm text-white focus:outline-none focus:border-red-500"
                />
              </div>

              <button
                type="submit"
                disabled={adjusting}
                className="w-full min-h-[46px] rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-60 text-white font-semibold text-sm"
              >
                {adjusting
                  ? 'Updating...'
                  : creditAction === 'add'
                    ? 'Confirm Add Credits'
                    : 'Confirm Remove Credits'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Edit Credentials Modal */}
      {editTarget && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full sm:max-w-md bg-[#111116] border border-white/15 rounded-t-2xl sm:rounded-2xl p-5 space-y-4 pb-safe">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-xl font-bold uppercase text-white">
                Edit Credentials
              </h3>
              <button
                type="button"
                onClick={() => setEditTarget(null)}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center text-zinc-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSaveEdit} className="space-y-3">
              <div>
                <label className="block text-xs text-zinc-300 mb-1">Username</label>
                <input
                  type="text"
                  required
                  value={editUsername}
                  onChange={(e) => setEditUsername(e.target.value)}
                  className="w-full min-h-[44px] bg-zinc-950 border border-white/15 rounded-xl px-3.5 text-sm text-white focus:outline-none focus:border-red-500"
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-300 mb-1">
                  New Password (leave blank to keep current)
                </label>
                <input
                  type="password"
                  value={editPassword}
                  onChange={(e) => setEditPassword(e.target.value)}
                  placeholder="Enter new password"
                  className="w-full min-h-[44px] bg-zinc-950 border border-white/15 rounded-xl px-3.5 text-sm text-white focus:outline-none focus:border-red-500"
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-300 mb-1">Note</label>
                <input
                  type="text"
                  value={editNote}
                  onChange={(e) => setEditNote(e.target.value)}
                  className="w-full min-h-[44px] bg-zinc-950 border border-white/15 rounded-xl px-3.5 text-sm text-white focus:outline-none focus:border-red-500"
                />
              </div>
              <button
                type="submit"
                disabled={savingEdit}
                className="w-full min-h-[46px] rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-60 text-white font-semibold text-sm"
              >
                {savingEdit ? 'Saving...' : 'Save Changes'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full sm:max-w-sm bg-[#111116] border border-white/15 rounded-t-2xl sm:rounded-2xl p-5 space-y-4 pb-safe">
            <h3 className="font-display text-xl font-bold uppercase text-white">
              Delete Client Account
            </h3>
            <p className="text-xs text-zinc-300 leading-relaxed">
              Are you sure you want to permanently delete{' '}
              <strong className="text-white">{deleteTarget.username}</strong> (balance:{' '}
              {deleteTarget.credits.toLocaleString()} virtual credits)? This cannot be undone.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="min-h-[44px] rounded-xl bg-zinc-900 border border-white/10 text-xs font-semibold text-zinc-200"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={handleConfirmDelete}
                className="min-h-[44px] rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-60 text-xs font-semibold text-white"
              >
                {deleting ? 'Deleting...' : 'Delete Account'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
