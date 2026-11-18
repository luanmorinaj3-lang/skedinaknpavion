import 'dotenv/config';
import express, { type NextFunction, type Request, type Response } from 'express';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {
  collectFinishedFixturesMap,
  getFixtureDetails,
  getFixtureOddsById,
  getLiveFixturesWithOdds,
  getTodayFixturesWithOdds,
  verifySelectionAgainstRealFeed,
} from './server/apiFootball.ts';
import {
  adjustClientCredits,
  authenticateUser,
  createClientAccount,
  deleteClientAccount,
  getSeoSettings,
  getUserById,
  listClients,
  listTickets,
  listTransactions,
  placePredictionTicket,
  setClientStatus,
  settleTicketsWithResults,
  signSessionToken,
  updateClientCredentials,
  updateSeoSettings,
  verifySessionToken,
} from './server/store.ts';
import type { AuthUser, BetPickCode } from './src/types.ts';

const COOKIE_NAME = 'skedina_session';

interface AuthenticatedRequest extends Request {
  authUser?: AuthUser;
}

function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!cookieHeader) return out;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (key) {
      try {
        out[key] = decodeURIComponent(val);
      } catch {
        out[key] = val;
      }
    }
  }
  return out;
}

function extractSessionToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }
  const cookies = parseCookies(req.headers.cookie);
  return cookies[COOKIE_NAME] || null;
}

function setSessionCookie(req: Request, res: Response, token: string): void {
  const isSecure =
    req.secure ||
    req.headers['x-forwarded-proto'] === 'https' ||
    process.env.NODE_ENV === 'production';

  const parts = [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    `Max-Age=${60 * 60 * 24 * 7}`,
    isSecure ? 'SameSite=None' : 'SameSite=Lax',
  ];
  if (isSecure) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

function clearSessionCookie(req: Request, res: Response): void {
  const isSecure =
    req.secure ||
    req.headers['x-forwarded-proto'] === 'https' ||
    process.env.NODE_ENV === 'production';

  const parts = [
    `${COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    'Max-Age=0',
    isSecure ? 'SameSite=None' : 'SameSite=Lax',
  ];
  if (isSecure) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

function requireAuth(requiredRole?: 'admin' | 'client') {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    const token = extractSessionToken(req);
    const payload = verifySessionToken(token);
    if (!payload) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    const user = getUserById(payload.uid);
    if (!user) {
      res.status(401).json({ error: 'Session no longer valid.' });
      return;
    }
    if (user.status !== 'active') {
      res.status(403).json({ error: 'Account is suspended.' });
      return;
    }
    if (requiredRole && user.role !== requiredRole) {
      res.status(403).json({ error: 'Forbidden for this account role.' });
      return;
    }
    req.authUser = user;
    next();
  };
}

async function runSettlementPass(): Promise<{ settledCount: number }> {
  const pendingTickets = listTickets().filter((t) => t.status === 'pending');
  if (pendingTickets.length === 0) return { settledCount: 0 };

  const fixtureIds = new Set<number>();
  for (const ticket of pendingTickets) {
    for (const sel of ticket.selections) {
      if (sel.result === 'pending') {
        fixtureIds.add(sel.fixtureId);
      }
    }
  }
  if (fixtureIds.size === 0) return { settledCount: 0 };

  const finishedMap = await collectFinishedFixturesMap(Array.from(fixtureIds));
  if (finishedMap.size === 0) return { settledCount: 0 };

  return settleTicketsWithResults(finishedMap);
}

async function startServer(): Promise<void> {
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '1mb' }));

  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    next();
  });

  // Health check for Replit Autoscale
  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      service: 'SKEDINAKNPAVION',
      timezone: 'Europe/Tirane',
      apiFootballConfigured: Boolean(
        process.env.API_FOOTBALL_KEY?.trim() &&
          process.env.API_FOOTBALL_KEY.trim() !== 'YOUR_API_FOOTBALL_V3_KEY'
      ),
    });
  });

  // Google Search SEO: robots.txt, sitemap.xml & Search Console verification
  const resolvePublicBaseUrl = (req: Request): string => {
    const seo = getSeoSettings();
    if (seo.customDomain && seo.customDomain.startsWith('http')) {
      return seo.customDomain.replace(/\/+$/, '');
    }
    const configured = process.env.APP_URL?.trim();
    if (configured && configured.startsWith('http') && configured !== 'MY_APP_URL') {
      return configured.replace(/\/+$/, '');
    }
    const proto = (req.headers['x-forwarded-proto'] as string)?.split(',')[0]?.trim() || req.protocol;
    const host = req.get('host') || 'localhost:3000';
    return `${proto}://${host}`;
  };

  app.get('/robots.txt', (req, res) => {
    const baseUrl = resolvePublicBaseUrl(req);
    res.type('text/plain').send(
      [
        'User-agent: *',
        'Allow: /',
        'Disallow: /api/',
        'Disallow: /admin',
        `Sitemap: ${baseUrl}/sitemap.xml`,
      ].join('\n')
    );
  });

  app.get('/sitemap.xml', (req, res) => {
    const baseUrl = resolvePublicBaseUrl(req);
    const today = new Date().toISOString().split('T')[0];
    res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${baseUrl}/</loc>
    <lastmod>${today}</lastmod>
    <changefreq>hourly</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>${baseUrl}/live</loc>
    <lastmod>${today}</lastmod>
    <changefreq>always</changefreq>
    <priority>0.9</priority>
  </url>
  <url>
    <loc>${baseUrl}/a-z</loc>
    <lastmod>${today}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
  </url>
</urlset>`);
  });

  app.get(/^\/(google[a-zA-Z0-9]+\.html)$/, (req, res, next) => {
    const requestedFile = req.params[0];
    const seo = getSeoSettings();
    if (seo.googleVerificationFile && seo.googleVerificationFile === requestedFile) {
      res.type('text/html').send(`google-site-verification: ${requestedFile}`);
      return;
    }
    next();
  });

  // Football Data Endpoints (server-side API-Football v3 proxy + caching)
  app.get('/api/football/today', async (_req, res) => {
    const envelope = await getTodayFixturesWithOdds();
    res.json(envelope);
  });

  app.get('/api/football/live', async (_req, res) => {
    const envelope = await getLiveFixturesWithOdds();
    res.json(envelope);
  });

  app.get('/api/football/odds/:fixtureId', async (req, res) => {
    const fixtureId = Number.parseInt(req.params.fixtureId, 10);
    if (!Number.isFinite(fixtureId) || fixtureId <= 0) {
      res.status(400).json({ error: 'Invalid fixture ID.' });
      return;
    }
    const odds = await getFixtureOddsById(fixtureId);
    res.json(odds);
  });

  app.get('/api/football/statistics/:fixtureId', async (req, res) => {
    const fixtureId = Number.parseInt(req.params.fixtureId, 10);
    if (!Number.isFinite(fixtureId) || fixtureId <= 0) {
      res.status(400).json({ error: 'Invalid fixture ID.' });
      return;
    }
    const details = await getFixtureDetails(fixtureId);
    res.json(details);
  });

  // Auth Endpoints
  app.post('/api/auth/client/login', (req, res) => {
    const { username, password } = req.body ?? {};
    if (typeof username !== 'string' || typeof password !== 'string') {
      res.status(400).json({ error: 'Username and password are required.' });
      return;
    }
    const result = authenticateUser(username, password, 'client');
    if (!result.ok) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    const token = signSessionToken(result.user);
    setSessionCookie(req, res, token);
    res.json({ user: result.user, token });
  });

  app.post('/api/auth/admin/login', (req, res) => {
    const { username, password } = req.body ?? {};
    if (typeof username !== 'string' || typeof password !== 'string') {
      res.status(400).json({ error: 'Username and password are required.' });
      return;
    }
    const result = authenticateUser(username, password, 'admin');
    if (!result.ok) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    const token = signSessionToken(result.user);
    setSessionCookie(req, res, token);
    res.json({ user: result.user, token });
  });

  app.post('/api/auth/logout', (req, res) => {
    clearSessionCookie(req, res);
    res.json({ ok: true });
  });

  app.get('/api/auth/me', (req, res) => {
    const token = extractSessionToken(req);
    const payload = verifySessionToken(token);
    if (!payload) {
      res.json({ user: null });
      return;
    }
    const user = getUserById(payload.uid);
    if (!user || user.status !== 'active') {
      res.json({ user: null });
      return;
    }
    res.json({ user });
  });

  // Client Endpoints
  app.get('/api/client/bets', requireAuth('client'), async (req: AuthenticatedRequest, res) => {
    await runSettlementPass().catch(() => undefined);
    const updatedUser = getUserById(req.authUser!.id);
    const tickets = listTickets(req.authUser!.id);
    res.json({
      credits: updatedUser?.credits ?? req.authUser!.credits,
      tickets,
    });
  });

  app.get(
    '/api/client/transactions',
    requireAuth('client'),
    (req: AuthenticatedRequest, res) => {
      const transactions = listTransactions(req.authUser!.id);
      res.json({ transactions });
    }
  );

  app.post('/api/client/bets', requireAuth('client'), async (req: AuthenticatedRequest, res) => {
    const body = req.body ?? {};
    const stake = Number(body.stake);
    const rawSelections = Array.isArray(body.selections) ? body.selections : [];

    if (rawSelections.length === 0) {
      res.status(400).json({ error: 'Select at least one match outcome before placing a prediction.' });
      return;
    }

    // Deduplicate fixture IDs in one slip
    const seenFixtures = new Set<number>();
    const validatedSelections: Array<{
      fixtureId: number;
      homeTeam: string;
      awayTeam: string;
      leagueName: string;
      kickoffTimeTirane: string;
      dateIso: string;
      pick: BetPickCode;
      odds: number;
      oddsSource: 'prematch' | 'live';
    }> = [];

    for (const item of rawSelections) {
      const fixtureId = Number(item?.fixtureId);
      const pick = item?.pick;
      if (!Number.isFinite(fixtureId) || !['1', 'X', '2'].includes(pick)) {
        res.status(400).json({ error: 'Invalid selection in prediction slip.' });
        return;
      }
      if (seenFixtures.has(fixtureId)) {
        res.status(400).json({ error: 'Only one prediction per match is allowed on a single slip.' });
        return;
      }
      seenFixtures.add(fixtureId);

      const check = await verifySelectionAgainstRealFeed(fixtureId, pick as BetPickCode);
      if (!check.ok) {
        res.status(400).json({ error: check.error });
        return;
      }

      validatedSelections.push({
        fixtureId: check.fixture.id,
        homeTeam: check.fixture.homeTeam.name,
        awayTeam: check.fixture.awayTeam.name,
        leagueName: check.fixture.league.name,
        kickoffTimeTirane: check.fixture.kickoffTimeTirane,
        dateIso: check.fixture.dateIso,
        pick: pick as BetPickCode,
        odds: check.odds,
        oddsSource: check.oddsSource,
      });
    }

    const result = await placePredictionTicket({
      clientId: req.authUser!.id,
      stake,
      validatedSelections,
    });

    if (!result.ok) {
      res.status(result.status).json({ error: result.error });
      return;
    }

    res.status(201).json({
      ticket: result.ticket,
      credits: result.balance,
    });
  });

  app.post(
    '/api/client/bets/settle',
    requireAuth('client'),
    async (req: AuthenticatedRequest, res) => {
      const { settledCount } = await runSettlementPass();
      const updatedUser = getUserById(req.authUser!.id);
      const tickets = listTickets(req.authUser!.id);
      res.json({
        settledCount,
        credits: updatedUser?.credits ?? req.authUser!.credits,
        tickets,
      });
    }
  );

  // Admin Endpoints
  app.get('/api/admin/clients', requireAuth('admin'), (_req, res) => {
    res.json({ clients: listClients() });
  });

  app.post('/api/admin/clients', requireAuth('admin'), async (req: AuthenticatedRequest, res) => {
    const { username, password, initialCredits, note } = req.body ?? {};
    if (typeof username !== 'string' || typeof password !== 'string') {
      res.status(400).json({ error: 'Username and password are required.' });
      return;
    }
    const result = await createClientAccount({
      username,
      password,
      initialCredits: Number(initialCredits ?? 0),
      note: typeof note === 'string' ? note : '',
      actor: req.authUser!.username,
    });
    if (!result.ok) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    res.status(201).json({ client: result.client });
  });

  app.patch('/api/admin/clients/:id', requireAuth('admin'), async (req, res) => {
    const { username, password, note } = req.body ?? {};
    const result = await updateClientCredentials({
      clientId: req.params.id,
      username: typeof username === 'string' ? username : undefined,
      password: typeof password === 'string' ? password : undefined,
      note: typeof note === 'string' ? note : undefined,
    });
    if (!result.ok) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    res.json({ client: result.client });
  });

  app.patch('/api/admin/clients/:id/status', requireAuth('admin'), async (req, res) => {
    const status = req.body?.status;
    if (status !== 'active' && status !== 'suspended') {
      res.status(400).json({ error: 'Status must be "active" or "suspended".' });
      return;
    }
    const result = await setClientStatus(req.params.id, status);
    if (!result.ok) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    res.json({ client: result.client });
  });

  app.delete('/api/admin/clients/:id', requireAuth('admin'), async (req, res) => {
    const result = await deleteClientAccount(req.params.id);
    if (!result.ok) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    res.json({ ok: true });
  });

  app.post(
    '/api/admin/clients/:id/credits',
    requireAuth('admin'),
    async (req: AuthenticatedRequest, res) => {
      const { action, amount, reason } = req.body ?? {};
      if (action !== 'add' && action !== 'remove') {
        res.status(400).json({ error: 'Action must be "add" or "remove".' });
        return;
      }
      const result = await adjustClientCredits({
        clientId: req.params.id,
        action,
        amount: Number(amount),
        reason: typeof reason === 'string' ? reason : '',
        actor: req.authUser!.username,
      });
      if (!result.ok) {
        res.status(result.status).json({ error: result.error });
        return;
      }
      res.json({ client: result.client, transaction: result.transaction });
    }
  );

  app.get('/api/admin/transactions', requireAuth('admin'), (req, res) => {
    const clientId = typeof req.query.clientId === 'string' ? req.query.clientId : undefined;
    res.json({ transactions: listTransactions(clientId) });
  });

  app.get('/api/admin/bets', requireAuth('admin'), (req, res) => {
    const clientId = typeof req.query.clientId === 'string' ? req.query.clientId : undefined;
    res.json({ tickets: listTickets(clientId) });
  });

  app.post('/api/admin/bets/settle', requireAuth('admin'), async (_req, res) => {
    const { settledCount } = await runSettlementPass();
    res.json({
      settledCount,
      tickets: listTickets(),
      clients: listClients(),
    });
  });

  app.get('/api/admin/seo', requireAuth('admin'), (_req, res) => {
    res.json({ seo: getSeoSettings() });
  });

  app.put('/api/admin/seo', requireAuth('admin'), async (req, res) => {
    const { googleVerificationMeta, googleVerificationFile, customDomain } = req.body ?? {};
    const seo = await updateSeoSettings({
      googleVerificationMeta:
        typeof googleVerificationMeta === 'string' ? googleVerificationMeta : undefined,
      googleVerificationFile:
        typeof googleVerificationFile === 'string' ? googleVerificationFile : undefined,
      customDomain: typeof customDomain === 'string' ? customDomain : undefined,
    });
    res.json({ seo });
  });

  const httpServer = http.createServer(app);

  const injectSeoHeadTags = (html: string, req: Request): string => {
    const baseUrl = resolvePublicBaseUrl(req);
    const seo = getSeoSettings();
    const headInjections = [
      `<link rel="canonical" href="${baseUrl}${req.path === '/' ? '/' : req.path}" />`,
      `<meta property="og:url" content="${baseUrl}${req.path === '/' ? '/' : req.path}" />`,
    ];
    if (seo.googleVerificationMeta) {
      headInjections.push(
        `<meta name="google-site-verification" content="${seo.googleVerificationMeta.replace(/"/g, '&quot;')}" />`
      );
    }
    return html.replace('</head>', `  ${headInjections.join('\n  ')}\n  </head>`);
  };

  // Frontend serving (Vite dev middleware in development, dist/ static in production)
  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR === 'true' ? false : { server: httpServer },
      },
      appType: 'spa',
    });
    if (process.env.DISABLE_HMR === 'true') {
      app.get('/@vite/client', async (_req, res, next) => {
        try {
          const result = await vite.transformRequest('/@vite/client');
          if (!result) {
            next();
            return;
          }
          const patched = result.code.replace(
            'transport.connect(createHMRHandler(handleMessage));',
            '/* HMR disabled: WebSocket connection skipped */'
          );
          res.type('application/javascript').send(patched);
        } catch {
          next();
        }
      });
    }
    app.get(['/', '/live', '/a-z', '/my-bets', '/admin'], async (req, res, next) => {
      try {
        const rawHtml = fs.readFileSync(path.resolve(process.cwd(), 'index.html'), 'utf8');
        const transformed = await vite.transformIndexHtml(req.originalUrl, rawHtml);
        res.status(200).type('text/html').send(injectSeoHeadTags(transformed, req));
      } catch (err) {
        next(err);
      }
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir, { index: false }));
    app.get('*', (req, res) => {
      const indexFile = path.join(distDir, 'index.html');
      if (!fs.existsSync(indexFile)) {
        res.status(404).send('Production build not found. Run npm run build.');
        return;
      }
      const html = fs.readFileSync(indexFile, 'utf8');
      res.type('text/html').send(injectSeoHeadTags(html, req));
    });
  }

  const port = Number(process.env.PORT) || 3000;
  httpServer.listen(port, '0.0.0.0', () => {
    console.log(`SKEDINAKNPAVION server listening on http://0.0.0.0:${port}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
