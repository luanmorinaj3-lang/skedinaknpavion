import { CheckCircle2, Info, Lock, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { submitPredictionSlip } from '../lib/api';
import type { AuthUser, BetSlipSelection } from '../types';

interface BetSlipPanelProps {
  selections: BetSlipSelection[];
  user: AuthUser | null;
  onRemoveSelection: (fixtureId: number) => void;
  onClearSlip: () => void;
  onOpenAuth: () => void;
  onBalanceUpdated: (newBalance: number) => void;
  onTicketPlaced: () => void;
  isMobileSheetOpen: boolean;
  onCloseMobileSheet: () => void;
}

const STAKE_PRESETS = [10, 50, 100, 250, 500];

export function BetSlipPanel({
  selections,
  user,
  onRemoveSelection,
  onClearSlip,
  onOpenAuth,
  onBalanceUpdated,
  onTicketPlaced,
  isMobileSheetOpen,
  onCloseMobileSheet,
}: BetSlipPanelProps) {
  const [stakeInput, setStakeInput] = useState<string>('50');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const stakeNum = Math.max(0, Math.floor(Number(stakeInput) || 0));
  const totalOdds =
    selections.length > 0
      ? Math.round(selections.reduce((acc, s) => acc * s.odds, 1) * 100) / 100
      : 0;
  const potentialReturn = Math.round(stakeNum * totalOdds);

  const handleSubmit = async () => {
    setError(null);
    setSuccessMsg(null);

    if (!user || user.role !== 'client') {
      onOpenAuth();
      return;
    }
    if (selections.length === 0) {
      setError('Select at least one match outcome.');
      return;
    }
    if (stakeNum <= 0) {
      setError('Enter a valid virtual credit stake.');
      return;
    }
    if (stakeNum > user.credits) {
      setError(`Insufficient virtual credits. Your balance is ${user.credits}.`);
      return;
    }

    setSubmitting(true);
    try {
      const res = await submitPredictionSlip({
        stake: stakeNum,
        selections: selections.map((s) => ({
          fixtureId: s.fixtureId,
          pick: s.pick,
        })),
      });
      onBalanceUpdated(res.credits);
      onClearSlip();
      onTicketPlaced();
      setSuccessMsg(`Prediction slip ${res.ticket.id} placed for ${res.ticket.stake} credits.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to place prediction slip.');
    } finally {
      setSubmitting(false);
    }
  };

  const renderSlipBody = () => (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="font-display text-lg font-bold tracking-wide text-white uppercase">
            Prediction Slip
          </span>
          <span className="font-mono-tabular text-xs font-bold text-red-500">
            ({selections.length})
          </span>
        </div>
        <div className="flex items-center gap-2">
          {selections.length > 0 && (
            <button
              type="button"
              onClick={() => {
                onClearSlip();
                setError(null);
              }}
              className="min-h-[36px] px-2 text-xs text-zinc-400 hover:text-red-400 transition-colors"
            >
              Clear
            </button>
          )}
          <button
            type="button"
            onClick={onCloseMobileSheet}
            className="lg:hidden min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-zinc-400 hover:text-white"
            aria-label="Close prediction slip"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Entertainment Notice */}
      <div className="px-4 py-2 bg-zinc-950 border-b border-white/10 flex items-center gap-2 text-[11px] text-zinc-400">
        <Info className="w-3.5 h-3.5 text-red-500 shrink-0" />
        <span>Virtual Credits only · Entertainment only · No real money value</span>
      </div>

      {/* Selections List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
        {successMsg && (
          <div className="bg-emerald-950/40 border border-emerald-500/30 rounded-xl p-3 flex items-start gap-2.5 text-xs text-emerald-200">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <span>{successMsg}</span>
          </div>
        )}

        {error && (
          <div className="bg-red-950/40 border border-red-500/30 rounded-xl p-3 text-xs text-red-200">
            {error}
          </div>
        )}

        {selections.length === 0 ? (
          <div className="py-10 text-center space-y-2">
            <p className="text-sm font-medium text-zinc-300">Your slip is empty</p>
            <p className="text-xs text-zinc-500 max-w-[240px] mx-auto">
              Tap any 1, X, or 2 odd on today&apos;s or live football matches to build a prediction slip.
            </p>
          </div>
        ) : (
          selections.map((sel) => (
            <div
              key={sel.fixtureId}
              className="bg-[#16161d] border border-white/10 rounded-xl p-3 space-y-1.5"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-white truncate">
                    {sel.homeTeam} vs {sel.awayTeam}
                  </div>
                  <div className="text-[11px] text-zinc-400 truncate">
                    {sel.leagueName} · {sel.kickoffTimeTirane}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onRemoveSelection(sel.fixtureId)}
                  className="min-h-[32px] min-w-[32px] flex items-center justify-center rounded text-zinc-500 hover:text-red-400 hover:bg-white/5"
                  aria-label={`Remove ${sel.homeTeam} vs ${sel.awayTeam}`}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="flex items-center justify-between text-xs pt-1 border-t border-white/5">
                <span className="text-zinc-300">
                  Pick:{' '}
                  <strong className="text-red-400 font-mono-tabular">
                    {sel.pick === '1'
                      ? `${sel.homeTeam} (1)`
                      : sel.pick === '2'
                        ? `${sel.awayTeam} (2)`
                        : 'Draw (X)'}
                  </strong>
                </span>
                <span className="font-mono-tabular font-bold text-white">
                  {sel.odds.toFixed(2)}
                </span>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Footer / Stake & Place Prediction */}
      {selections.length > 0 && (
        <div className="p-4 border-t border-white/10 bg-[#0d0d12] space-y-3">
          {user && user.role === 'client' && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-zinc-400">Available Virtual Credits</span>
              <span className="font-mono-tabular font-bold text-white">
                {user.credits.toLocaleString()} CR
              </span>
            </div>
          )}

          <div>
            <label htmlFor="slip-stake-input" className="block text-[11px] text-zinc-400 mb-1.5">
              Virtual Credit Stake
            </label>
            <div className="flex items-center gap-2">
              <input
                id="slip-stake-input"
                type="number"
                min={1}
                step={1}
                value={stakeInput}
                onChange={(e) => setStakeInput(e.target.value)}
                className="w-full min-h-[44px] bg-zinc-950 border border-white/15 rounded-lg px-3 text-sm font-mono-tabular text-white focus:outline-none focus:border-red-500"
              />
            </div>
            <div className="grid grid-cols-5 gap-1.5 mt-2">
              {STAKE_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setStakeInput(String(preset))}
                  className="min-h-[34px] rounded-md bg-zinc-900 border border-white/10 text-xs font-mono-tabular text-zinc-300 hover:border-red-500/60 hover:text-white transition-colors"
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1 text-xs pt-1 border-t border-white/10">
            <div className="flex items-center justify-between text-zinc-400">
              <span>Total Odds</span>
              <span className="font-mono-tabular font-semibold text-white">
                {totalOdds.toFixed(2)}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-zinc-300 font-medium">Potential Return</span>
              <span className="font-mono-tabular font-bold text-red-400">
                {potentialReturn.toLocaleString()} CR
              </span>
            </div>
          </div>

          {!user || user.role !== 'client' ? (
            <button
              type="button"
              onClick={onOpenAuth}
              className="w-full min-h-[46px] rounded-xl bg-red-600 hover:bg-red-500 text-white font-semibold text-sm flex items-center justify-center gap-2 transition-colors"
            >
              <Lock className="w-4 h-4" />
              <span>Client Sign In to Play</span>
            </button>
          ) : (
            <button
              type="button"
              disabled={submitting}
              onClick={handleSubmit}
              className="w-full min-h-[46px] rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-60 text-white font-semibold text-sm transition-colors"
            >
              {submitting ? 'Placing Prediction...' : 'Place Virtual Prediction'}
            </button>
          )}
        </div>
      )}
    </div>
  );

  return (
    <>
      {/* Desktop Sticky Sidebar */}
      <aside className="hidden lg:block sticky top-16 bg-[#111116] border border-white/10 rounded-2xl overflow-hidden max-h-[calc(100vh-5rem)]">
        {renderSlipBody()}
      </aside>

      {/* Mobile Bottom Sheet */}
      {isMobileSheetOpen && (
        <div
          className="lg:hidden fixed inset-0 z-50 flex items-end bg-black/80 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label="Prediction Slip"
        >
          <div className="w-full max-h-[88vh] bg-[#111116] border-t border-white/15 rounded-t-2xl overflow-hidden flex flex-col pb-safe">
            {renderSlipBody()}
          </div>
        </div>
      )}
    </>
  );
}
