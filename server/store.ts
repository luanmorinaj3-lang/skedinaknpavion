import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type {
  AccountStatus,
  AuthUser,
  BetPickCode,
  BetSelectionRecord,
  ClientAccountSummary,
  CreditTransaction,
  PredictionTicket,
  SeoSettings,
  TransactionType,
  UserRole,
} from '../src/types.ts';

interface StoredUser {
  id: string;
  username: string;
  passwordHash: string;
  role: UserRole;
  status: AccountStatus;
  credits: number;
  note: string;
  createdAt: string;
  updatedAt: string;
}

interface DatabaseSchema {
  users: StoredUser[];
  transactions: CreditTransaction[];
  tickets: PredictionTicket[];
  seo: SeoSettings;
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'store.json');
const SECRET_PATH = path.join(DATA_DIR, '.session_secret');

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function getSessionSecret(): string {
  if (process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 16) {
    return process.env.SESSION_SECRET;
  }
  ensureDataDir();
  if (fs.existsSync(SECRET_PATH)) {
    const existing = fs.readFileSync(SECRET_PATH, 'utf8').trim();
    if (existing.length >= 32) {
      return existing;
    }
  }
  const generated = crypto.randomBytes(48).toString('hex');
  fs.writeFileSync(SECRET_PATH, generated, { encoding: 'utf8', mode: 0o600 });
  return generated;
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, originalHash] = parts;
  const candidate = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(originalHash, 'hex');
  if (candidate.length !== expected.length) return false;
  return crypto.timingSafeEqual(candidate, expected);
}

interface SessionPayload {
  uid: string;
  role: UserRole;
  exp: number;
}

export function signSessionToken(user: { id: string; role: UserRole }): string {
  const payload: SessionPayload = {
    uid: user.id,
    role: user.role,
    exp: Date.now() + 1000 * 60 * 60 * 24 * 7, // 7 days
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto
    .createHmac('sha256', getSessionSecret())
    .update(encoded)
    .digest('base64url');
  return `${encoded}.${sig}`;
}

export function verifySessionToken(token: string | undefined | null): SessionPayload | null {
  if (!token || typeof token !== 'string') return null;
  const dotIdx = token.indexOf('.');
  if (dotIdx === -1) return null;
  const encoded = token.slice(0, dotIdx);
  const sig = token.slice(dotIdx + 1);
  if (!encoded || !sig) return null;

  const expectedSig = crypto
    .createHmac('sha256', getSessionSecret())
    .update(encoded)
    .digest('base64url');

  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as SessionPayload;
    if (!parsed.uid || !parsed.role || typeof parsed.exp !== 'number') return null;
    if (Date.now() > parsed.exp) return null;
    return parsed;
  } catch {
    return null;
  }
}

let dbCache: DatabaseSchema | null = null;
let writeQueue: Promise<void> = Promise.resolve();

function loadDb(): DatabaseSchema {
  if (dbCache) return dbCache;
  ensureDataDir();
  if (fs.existsSync(DB_PATH)) {
    try {
      const raw = fs.readFileSync(DB_PATH, 'utf8');
      const parsed = JSON.parse(raw) as Partial<DatabaseSchema>;
      dbCache = {
        users: Array.isArray(parsed.users) ? parsed.users : [],
        transactions: Array.isArray(parsed.transactions) ? parsed.transactions : [],
        tickets: Array.isArray(parsed.tickets) ? parsed.tickets : [],
        seo: {
          googleVerificationMeta: parsed.seo?.googleVerificationMeta || '',
          googleVerificationFile: parsed.seo?.googleVerificationFile || '',
          customDomain: parsed.seo?.customDomain || '',
        },
      };
    } catch {
      dbCache = {
        users: [],
        transactions: [],
        tickets: [],
        seo: { googleVerificationMeta: '', googleVerificationFile: '', customDomain: '' },
      };
    }
  } else {
    dbCache = {
      users: [],
      transactions: [],
      tickets: [],
      seo: { googleVerificationMeta: '', googleVerificationFile: '', customDomain: '' },
    };
  }

  // Ensure initial admin exists
  const hasAdmin = dbCache.users.some((u) => u.role === 'admin');
  if (!hasAdmin) {
    const adminUsername = (process.env.ADMIN_USERNAME || 'admin').trim();
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
    const now = new Date().toISOString();
    dbCache.users.push({
      id: `adm_${crypto.randomUUID()}`,
      username: adminUsername,
      passwordHash: hashPassword(adminPassword),
      role: 'admin',
      status: 'active',
      credits: 0,
      note: 'Primary Administrator',
      createdAt: now,
      updatedAt: now,
    });
    persistDbSync(dbCache);
  }

  return dbCache;
}

function persistDbSync(data: DatabaseSchema): void {
  ensureDataDir();
  const tmpPath = `${DB_PATH}.tmp.${process.pid}`;
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmpPath, DB_PATH);
}

function enqueuePersist(): Promise<void> {
  const snapshot = JSON.stringify(loadDb(), null, 2);
  writeQueue = writeQueue.then(async () => {
    ensureDataDir();
    const tmpPath = `${DB_PATH}.tmp.${process.pid}`;
    await fs.promises.writeFile(tmpPath, snapshot, 'utf8');
    await fs.promises.rename(tmpPath, DB_PATH);
  });
  return writeQueue;
}

function toAuthUser(u: StoredUser): AuthUser {
  return {
    id: u.id,
    username: u.username,
    role: u.role,
    status: u.status,
    credits: u.credits,
  };
}

function toClientSummary(u: StoredUser): ClientAccountSummary {
  return {
    id: u.id,
    username: u.username,
    status: u.status,
    credits: u.credits,
    note: u.note,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
  };
}

export function authenticateUser(
  username: string,
  password: string,
  requiredRole: UserRole
): { ok: true; user: AuthUser } | { ok: false; error: string; status: number } {
  const db = loadDb();
  const normalized = username.trim().toLowerCase();
  const found = db.users.find(
    (u) => u.role === requiredRole && u.username.toLowerCase() === normalized
  );
  if (!found) {
    return { ok: false, error: 'Invalid username or password.', status: 401 };
  }
  if (!verifyPassword(password, found.passwordHash)) {
    return { ok: false, error: 'Invalid username or password.', status: 401 };
  }
  if (found.status === 'suspended') {
    return {
      ok: false,
      error: 'This account is currently suspended. Contact an administrator.',
      status: 403,
    };
  }
  return { ok: true, user: toAuthUser(found) };
}

export function getUserById(userId: string): AuthUser | null {
  const db = loadDb();
  const found = db.users.find((u) => u.id === userId);
  return found ? toAuthUser(found) : null;
}

export function listClients(): ClientAccountSummary[] {
  const db = loadDb();
  return db.users
    .filter((u) => u.role === 'client')
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map(toClientSummary);
}

export async function createClientAccount(params: {
  username: string;
  password: string;
  initialCredits: number;
  note?: string;
  actor: string;
}): Promise<{ ok: true; client: ClientAccountSummary } | { ok: false; error: string; status: number }> {
  const db = loadDb();
  const username = params.username.trim();
  if (!/^[a-zA-Z0-9_.-]{3,32}$/.test(username)) {
    return {
      ok: false,
      error: 'Username must be 3-32 characters (letters, numbers, _, ., -).',
      status: 400,
    };
  }
  if (!params.password || params.password.length < 4) {
    return { ok: false, error: 'Password must be at least 4 characters.', status: 400 };
  }
  if (!Number.isFinite(params.initialCredits) || params.initialCredits < 0) {
    return { ok: false, error: 'Initial credits must be 0 or greater.', status: 400 };
  }
  const initialCredits = Math.floor(params.initialCredits);

  const duplicate = db.users.some((u) => u.username.toLowerCase() === username.toLowerCase());
  if (duplicate) {
    return { ok: false, error: 'Username already exists.', status: 409 };
  }

  const now = new Date().toISOString();
  const user: StoredUser = {
    id: `cli_${crypto.randomUUID()}`,
    username,
    passwordHash: hashPassword(params.password),
    role: 'client',
    status: 'active',
    credits: initialCredits,
    note: (params.note || '').trim().slice(0, 140),
    createdAt: now,
    updatedAt: now,
  };
  db.users.push(user);

  if (initialCredits > 0) {
    db.transactions.unshift({
      id: `tx_${crypto.randomUUID()}`,
      clientId: user.id,
      clientUsername: user.username,
      type: 'admin_grant',
      amount: initialCredits,
      balanceBefore: 0,
      balanceAfter: initialCredits,
      reason: 'Initial virtual credits on account creation',
      actor: params.actor,
      createdAt: now,
    });
  }

  await enqueuePersist();
  return { ok: true, client: toClientSummary(user) };
}

export async function updateClientCredentials(params: {
  clientId: string;
  username?: string;
  password?: string;
  note?: string;
}): Promise<{ ok: true; client: ClientAccountSummary } | { ok: false; error: string; status: number }> {
  const db = loadDb();
  const client = db.users.find((u) => u.id === params.clientId && u.role === 'client');
  if (!client) {
    return { ok: false, error: 'Client account not found.', status: 404 };
  }

  if (typeof params.username === 'string' && params.username.trim() !== client.username) {
    const nextUsername = params.username.trim();
    if (!/^[a-zA-Z0-9_.-]{3,32}$/.test(nextUsername)) {
      return {
        ok: false,
        error: 'Username must be 3-32 characters (letters, numbers, _, ., -).',
        status: 400,
      };
    }
    const exists = db.users.some(
      (u) => u.id !== client.id && u.username.toLowerCase() === nextUsername.toLowerCase()
    );
    if (exists) {
      return { ok: false, error: 'Username already taken.', status: 409 };
    }
    client.username = nextUsername;
    for (const tx of db.transactions) {
      if (tx.clientId === client.id) tx.clientUsername = nextUsername;
    }
    for (const tk of db.tickets) {
      if (tk.clientId === client.id) tk.clientUsername = nextUsername;
    }
  }

  if (typeof params.password === 'string' && params.password.length > 0) {
    if (params.password.length < 4) {
      return { ok: false, error: 'Password must be at least 4 characters.', status: 400 };
    }
    client.passwordHash = hashPassword(params.password);
  }

  if (typeof params.note === 'string') {
    client.note = params.note.trim().slice(0, 140);
  }

  client.updatedAt = new Date().toISOString();
  await enqueuePersist();
  return { ok: true, client: toClientSummary(client) };
}

export async function setClientStatus(
  clientId: string,
  status: AccountStatus
): Promise<{ ok: true; client: ClientAccountSummary } | { ok: false; error: string; status: number }> {
  const db = loadDb();
  const client = db.users.find((u) => u.id === clientId && u.role === 'client');
  if (!client) {
    return { ok: false, error: 'Client account not found.', status: 404 };
  }
  client.status = status;
  client.updatedAt = new Date().toISOString();
  await enqueuePersist();
  return { ok: true, client: toClientSummary(client) };
}

export async function deleteClientAccount(
  clientId: string
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const db = loadDb();
  const idx = db.users.findIndex((u) => u.id === clientId && u.role === 'client');
  if (idx === -1) {
    return { ok: false, error: 'Client account not found.', status: 404 };
  }
  db.users.splice(idx, 1);
  await enqueuePersist();
  return { ok: true };
}

export async function adjustClientCredits(params: {
  clientId: string;
  action: 'add' | 'remove';
  amount: number;
  reason: string;
  actor: string;
}): Promise<
  | { ok: true; client: ClientAccountSummary; transaction: CreditTransaction }
  | { ok: false; error: string; status: number }
> {
  const db = loadDb();
  const client = db.users.find((u) => u.id === params.clientId && u.role === 'client');
  if (!client) {
    return { ok: false, error: 'Client account not found.', status: 404 };
  }

  const amount = Math.floor(Number(params.amount));
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: 'Credit amount must be a positive whole number.', status: 400 };
  }

  const before = client.credits;
  let after = before;
  let txType: TransactionType = 'admin_grant';

  if (params.action === 'add') {
    after = before + amount;
    txType = 'admin_grant';
  } else {
    if (amount > before) {
      return {
        ok: false,
        error: `Cannot remove ${amount} credits. Client balance is ${before}.`,
        status: 400,
      };
    }
    after = before - amount;
    txType = 'admin_deduct';
  }

  const now = new Date().toISOString();
  client.credits = after;
  client.updatedAt = now;

  const transaction: CreditTransaction = {
    id: `tx_${crypto.randomUUID()}`,
    clientId: client.id,
    clientUsername: client.username,
    type: txType,
    amount: params.action === 'add' ? amount : -amount,
    balanceBefore: before,
    balanceAfter: after,
    reason: (params.reason || '').trim().slice(0, 140) ||
      (params.action === 'add' ? 'Admin virtual credit grant' : 'Admin virtual credit deduction'),
    actor: params.actor,
    createdAt: now,
  };
  db.transactions.unshift(transaction);

  await enqueuePersist();
  return { ok: true, client: toClientSummary(client), transaction };
}

export function listTransactions(clientId?: string): CreditTransaction[] {
  const db = loadDb();
  if (clientId) {
    return db.transactions.filter((t) => t.clientId === clientId);
  }
  return db.transactions;
}

export function listTickets(clientId?: string): PredictionTicket[] {
  const db = loadDb();
  if (clientId) {
    return db.tickets.filter((t) => t.clientId === clientId);
  }
  return db.tickets;
}

export async function placePredictionTicket(params: {
  clientId: string;
  stake: number;
  validatedSelections: Array<{
    fixtureId: number;
    homeTeam: string;
    awayTeam: string;
    leagueName: string;
    kickoffTimeTirane: string;
    dateIso: string;
    pick: BetPickCode;
    odds: number;
    oddsSource: 'prematch' | 'live';
  }>;
}): Promise<
  | { ok: true; ticket: PredictionTicket; balance: number }
  | { ok: false; error: string; status: number }
> {
  const db = loadDb();
  const client = db.users.find((u) => u.id === params.clientId && u.role === 'client');
  if (!client) {
    return { ok: false, error: 'Client account not found.', status: 404 };
  }
  if (client.status !== 'active') {
    return { ok: false, error: 'Suspended accounts cannot place predictions.', status: 403 };
  }

  const stake = Math.floor(Number(params.stake));
  if (!Number.isFinite(stake) || stake <= 0) {
    return { ok: false, error: 'Stake must be at least 1 virtual credit.', status: 400 };
  }
  if (stake > client.credits) {
    return {
      ok: false,
      error: `Insufficient virtual credits. Available balance: ${client.credits}.`,
      status: 400,
    };
  }
  if (params.validatedSelections.length === 0 || params.validatedSelections.length > 12) {
    return {
      ok: false,
      error: 'A prediction slip must include between 1 and 12 matches.',
      status: 400,
    };
  }

  const totalOddsRaw = params.validatedSelections.reduce((acc, s) => acc * s.odds, 1);
  const totalOdds = Math.round(totalOddsRaw * 100) / 100;
  const potentialReturn = Math.round(stake * totalOdds);

  const now = new Date().toISOString();
  const before = client.credits;
  const after = before - stake;
  client.credits = after;
  client.updatedAt = now;

  const selections: BetSelectionRecord[] = params.validatedSelections.map((s) => ({
    ...s,
    result: 'pending',
  }));

  const ticket: PredictionTicket = {
    id: `skd_${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
    clientId: client.id,
    clientUsername: client.username,
    selections,
    stake,
    totalOdds,
    potentialReturn,
    payout: 0,
    status: 'pending',
    createdAt: now,
  };

  db.tickets.unshift(ticket);
  db.transactions.unshift({
    id: `tx_${crypto.randomUUID()}`,
    clientId: client.id,
    clientUsername: client.username,
    type: 'bet_stake',
    amount: -stake,
    balanceBefore: before,
    balanceAfter: after,
    reason: `Prediction slip ${ticket.id} (${selections.length} pick${selections.length > 1 ? 's' : ''} @ ${totalOdds.toFixed(2)})`,
    actor: client.username,
    createdAt: now,
  });

  await enqueuePersist();
  return { ok: true, ticket, balance: after };
}

export interface FinishedFixtureOutcome {
  fixtureId: number;
  statusShort: string;
  homeGoals: number;
  awayGoals: number;
}

export async function settleTicketsWithResults(
  finishedMap: Map<number, FinishedFixtureOutcome>
): Promise<{ settledCount: number }> {
  const db = loadDb();
  let settledCount = 0;
  let dirty = false;
  const now = new Date().toISOString();

  for (const ticket of db.tickets) {
    if (ticket.status !== 'pending') continue;

    let anyLost = false;
    let allResolved = true;
    let activeOddsProduct = 1;

    for (const sel of ticket.selections) {
      if (sel.result === 'lost') {
        anyLost = true;
        continue;
      }
      if (sel.result === 'won') {
        activeOddsProduct *= sel.odds;
        continue;
      }
      if (sel.result === 'void') {
        continue;
      }

      const outcome = finishedMap.get(sel.fixtureId);
      if (!outcome) {
        allResolved = false;
        continue;
      }

      if (['CANC', 'ABD', 'AWD', 'WO', 'PST'].includes(outcome.statusShort)) {
        sel.result = 'void';
        sel.finalScore = outcome.statusShort;
        dirty = true;
        continue;
      }

      if (!['FT', 'AET', 'PEN'].includes(outcome.statusShort)) {
        allResolved = false;
        continue;
      }

      sel.finalScore = `${outcome.homeGoals}-${outcome.awayGoals}`;
      const actualResult: BetPickCode =
        outcome.homeGoals > outcome.awayGoals
          ? '1'
          : outcome.homeGoals < outcome.awayGoals
            ? '2'
            : 'X';

      if (sel.pick === actualResult) {
        sel.result = 'won';
        activeOddsProduct *= sel.odds;
      } else {
        sel.result = 'lost';
        anyLost = true;
      }
      dirty = true;
    }

    if (anyLost) {
      ticket.status = 'lost';
      ticket.payout = 0;
      ticket.settledAt = now;
      settledCount++;
      dirty = true;
    } else if (allResolved) {
      const allVoid = ticket.selections.every((s) => s.result === 'void');
      const client = db.users.find((u) => u.id === ticket.clientId);
      if (allVoid) {
        ticket.status = 'void';
        ticket.payout = ticket.stake;
        ticket.settledAt = now;
        if (client) {
          const before = client.credits;
          client.credits = before + ticket.stake;
          client.updatedAt = now;
          db.transactions.unshift({
            id: `tx_${crypto.randomUUID()}`,
            clientId: client.id,
            clientUsername: client.username,
            type: 'bet_refund',
            amount: ticket.stake,
            balanceBefore: before,
            balanceAfter: client.credits,
            reason: `Refund for voided slip ${ticket.id}`,
            actor: 'system',
            createdAt: now,
          });
        }
      } else {
        const finalPayout = Math.round(ticket.stake * activeOddsProduct);
        ticket.status = 'won';
        ticket.payout = finalPayout;
        ticket.settledAt = now;
        if (client) {
          const before = client.credits;
          client.credits = before + finalPayout;
          client.updatedAt = now;
          db.transactions.unshift({
            id: `tx_${crypto.randomUUID()}`,
            clientId: client.id,
            clientUsername: client.username,
            type: 'bet_payout',
            amount: finalPayout,
            balanceBefore: before,
            balanceAfter: client.credits,
            reason: `Winning prediction slip ${ticket.id}`,
            actor: 'system',
            createdAt: now,
          });
        }
      }
      settledCount++;
      dirty = true;
    }
  }

  if (dirty) {
    await enqueuePersist();
  }
  return { settledCount };
}

export function getSeoSettings(): SeoSettings {
  const db = loadDb();
  return {
    googleVerificationMeta:
      db.seo.googleVerificationMeta || process.env.GOOGLE_SITE_VERIFICATION?.trim() || '',
    googleVerificationFile: db.seo.googleVerificationFile || '',
    customDomain: db.seo.customDomain || '',
  };
}

export async function updateSeoSettings(input: Partial<SeoSettings>): Promise<SeoSettings> {
  const db = loadDb();
  if (typeof input.googleVerificationMeta === 'string') {
    let val = input.googleVerificationMeta.trim();
    const contentMatch = val.match(/content=["']([^"']+)["']/i);
    if (contentMatch?.[1]) {
      val = contentMatch[1].trim();
    }
    db.seo.googleVerificationMeta = val.slice(0, 200);
  }
  if (typeof input.googleVerificationFile === 'string') {
    const fileVal = input.googleVerificationFile.trim().replace(/^\/+/, '');
    if (fileVal === '' || /^google[a-zA-Z0-9]+\.html$/.test(fileVal)) {
      db.seo.googleVerificationFile = fileVal;
    }
  }
  if (typeof input.customDomain === 'string') {
    const domain = input.customDomain.trim().replace(/\/+$/, '');
    db.seo.customDomain = domain.slice(0, 200);
  }
  await enqueuePersist();
  return getSeoSettings();
}
