require('dotenv').config();
const express = require('express');
const session = require('express-session');
const { MongoStore } = require('connect-mongo');
const passport = require('passport');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

require('./lib/passport');
const { connectDb } = require('./lib/db');

const authRoutes = require('./routes/auth');
const dashboardRoutes = require('./routes/dashboard');
const apiRoutes = require('./routes/api');
const statusRoutes = require('./routes/status');
const { ApplicationForm } = require('./models/ApplicationForm');

const app = express();
const PORT = process.env.PORT || 3000;

// Trust Render/reverse-proxy HTTPS termination so cookie.secure works correctly
app.set('trust proxy', 1);

// Security headers
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'https://cdn.discordapp.com', 'data:', 'https:'],
        connectSrc: ["'self'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  })
);

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../views'));

// Static files
app.use(express.static(path.join(__dirname, '../public')));

// Body parsing
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// Rate limiters
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many requests, please try again later.',
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
});

// Sessions
const isProduction = process.env.NODE_ENV === 'production';
if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET === 'flynnbot-change-this-secret') {
  console.warn('[Dashboard] WARNING: SESSION_SECRET is not set or is using the default value. Set it in .env for security.');
}

app.use(
  session({
    secret: process.env.SESSION_SECRET || 'flynnbot-change-this-secret',
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
      mongoUrl: process.env.MONGO_URI,
      ttl: 7 * 24 * 60 * 60, // 7 days in seconds
      autoRemove: 'native',
    }),
    cookie: {
      secure: isProduction,
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
  })
);

// Passport
app.use(passport.initialize());
app.use(passport.session());

// Global view locals
app.use((req, res, next) => {
  res.locals.user = req.user || null;
  res.locals.clientId = process.env.DISCORD_CLIENT_ID;
  next();
});

// Routes
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api', apiLimiter, apiRoutes);
app.use('/dashboard', dashboardRoutes);
app.use('/status', statusRoutes);

// Home
app.get('/', (req, res) => res.render('index'));

// Legal
app.get('/privacy', (req, res) => res.render('privacy'));
app.get('/terms', (req, res) => res.render('terms'));

// Status redirect from #status anchor in footer
app.get('/status-redirect', (req, res) => res.redirect('/status'));

// Public application page (requires OAuth identity)
app.get('/apply/:guildId/:applicationId', async (req, res) => {
  try {
    const { guildId, applicationId } = req.params;
    if (!/^\d+$/.test(guildId)) {
      return res.status(400).render('error', { code: 400, message: 'Invalid guild ID.' });
    }

    if (!req.isAuthenticated()) {
      return res.redirect(`/api/auth/login?returnTo=${encodeURIComponent(req.originalUrl)}`);
    }

    const appForm = await ApplicationForm.findOne({ guildId, _id: applicationId }).lean();
    if (!appForm || !appForm.isActive) {
      return res.status(404).render('error', { code: 404, message: 'Application not found or unavailable.' });
    }

    if (appForm.abuseProtection?.autoCloseAt && new Date(appForm.abuseProtection.autoCloseAt) <= new Date()) {
      return res.status(403).render('error', { code: 403, message: 'This application is currently closed.' });
    }

    res.render('application', {
      guildId,
      applicationId,
      formName: appForm.name,
    });
  } catch (err) {
    console.error('[Dashboard] apply route', err);
    res.status(500).render('error', { code: 500, message: 'Failed to load application page.' });
  }
});

// Logging test harness (requires guildId query param)
app.get('/logging-test', (req, res) => {
  if (!req.isAuthenticated()) {
    return res.redirect('/login');
  }
  const { guildId } = req.query;
  if (!guildId || !/^\d+$/.test(guildId)) {
    return res.status(400).render('error', { code: 400, message: 'Invalid or missing guildId parameter' });
  }
  // Verify user is admin of this guild
  const guild = req.user.guilds?.find((g) => g.id === guildId);
  if (!guild || !((BigInt(guild.permissions) & 0x8n) !== 0n)) {
    return res.status(403).render('error', { code: 403, message: 'You must be an administrator of this server to access the logging test harness' });
  }
  res.render('logging-test', { guildId });
});

// 404
app.use((req, res) => {
  res.status(404).render('error', { code: 404, message: 'Page not found.' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('[Dashboard Error]', err);
  res.status(500).render('error', { code: 500, message: 'An unexpected error occurred.' });
});

process.on('unhandledRejection', (reason) => {
  console.error('[Dashboard] Unhandled rejection:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('[Dashboard] Uncaught exception:', err);
});

async function start() {
  await connectDb();
  app.listen(PORT, () => {
    console.log(`\n  Dashboard → http://localhost:${PORT}\n`);
  });
}

start().catch((err) => {
  console.error('[Dashboard] Failed to start:', err);
  process.exit(1);
});
