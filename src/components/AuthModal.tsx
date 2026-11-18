import { Lock, ShieldAlert, UserCheck, X } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { loginAdmin, loginClient } from '../lib/api';
import type { AuthUser } from '../types';

interface AuthModalProps {
  open: boolean;
  initialMode?: 'client' | 'admin';
  onClose: () => void;
  onAuthenticated: (user: AuthUser) => void;
}

export function AuthModal({
  open,
  initialMode = 'client',
  onClose,
  onAuthenticated,
}: AuthModalProps) {
  const [mode, setMode] = useState<'client' | 'admin'>(initialMode);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res =
        mode === 'admin'
          ? await loginAdmin(username, password)
          : await loginClient(username, password);
      onAuthenticated(res.user);
      setUsername('');
      setPassword('');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Account Sign In"
    >
      <div className="w-full sm:max-w-md bg-[#111116] border border-white/15 rounded-t-2xl sm:rounded-2xl overflow-hidden shadow-2xl pb-safe">
        <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Lock className="w-4 h-4 text-red-500" />
            <h2 className="font-display text-xl font-bold tracking-wide uppercase text-white">
              Account Access
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-zinc-400 hover:text-white"
            aria-label="Close sign in dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Role Switch */}
          <div className="grid grid-cols-2 gap-1.5 p-1 bg-zinc-950 border border-white/10 rounded-xl">
            <button
              type="button"
              onClick={() => {
                setMode('client');
                setError(null);
              }}
              className={`min-h-[40px] rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                mode === 'client' ? 'bg-red-600 text-white' : 'text-zinc-400 hover:text-white'
              }`}
            >
              <UserCheck className="w-3.5 h-3.5" />
              <span>Client Login</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('admin');
                setError(null);
              }}
              className={`min-h-[40px] rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                mode === 'admin' ? 'bg-red-600 text-white' : 'text-zinc-400 hover:text-white'
              }`}
            >
              <ShieldAlert className="w-3.5 h-3.5" />
              <span>Admin Login</span>
            </button>
          </div>

          <p className="text-xs text-zinc-400 leading-relaxed">
            {mode === 'client'
              ? 'Sign in with your client username and password to view your virtual credit balance and place predictions. Accounts are created by an administrator.'
              : 'Administrator sign in to manage client accounts, virtual credit balances, and transaction history.'}
          </p>

          {error && (
            <div className="bg-red-950/40 border border-red-500/30 rounded-xl p-3 text-xs text-red-200">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label htmlFor="auth-username" className="block text-xs text-zinc-300 mb-1.5">
                Username
              </label>
              <input
                id="auth-username"
                type="text"
                autoComplete="username"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={mode === 'admin' ? 'Admin username' : 'Client username'}
                className="w-full min-h-[44px] bg-zinc-950 border border-white/15 rounded-xl px-3.5 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-red-500"
              />
            </div>

            <div>
              <label htmlFor="auth-password" className="block text-xs text-zinc-300 mb-1.5">
                Password
              </label>
              <input
                id="auth-password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                className="w-full min-h-[44px] bg-zinc-950 border border-white/15 rounded-xl px-3.5 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-red-500"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full min-h-[46px] rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-60 text-white font-semibold text-sm transition-colors"
            >
              {loading
                ? 'Signing in...'
                : mode === 'admin'
                  ? 'Sign In to Admin Panel'
                  : 'Sign In as Client'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
