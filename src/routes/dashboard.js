const express = require('express');
const router = express.Router();
const { canReviewGuildApplications } = require('../services/applicationAccess');
const { GuildConfig } = require('../models/GuildConfig');
const ModerationCase = require('../models/ModerationCase');
const { ApplicationForm } = require('../models/ApplicationForm');
const { ApplicationSubmission } = require('../models/ApplicationSubmission');
const { LevelProfile } = require('../models/LevelProfile');
const EconomyProfile = require('../models/EconomyProfile');

function requireAuth(req, res, next) {
  if (req.isAuthenticated()) return next();
  return res.redirect(`/api/auth/login?returnTo=${encodeURIComponent(req.originalUrl)}`);
}

function hasAdmin(permissions) {
  try {
    return (BigInt(permissions) & 0x8n) !== 0n;
  } catch {
    return false;
  }
}

// Server list
router.get('/', requireAuth, (req, res) => {
  const guilds = req.user.guilds || [];
  const adminGuilds = guilds.filter((g) => hasAdmin(g.permissions));
  res.render('dashboard', { guilds: adminGuilds });
});

// ── Owner admin panel ─────────────────────────────────────────
const OWNER_ID = '1192421681751412746';

router.get('/owner', requireAuth, async (req, res) => {
  if (req.user.id !== OWNER_ID) {
    return res.status(403).render('error', {
      code: 403,
      message: 'You do not have permission to access this page.',
    });
  }
  try {
    const [
      totalGuilds,
      totalCases,
      totalApplications,
      totalSubmissions,
      totalLevelProfiles,
      totalEconomyProfiles,
    ] = await Promise.all([
      GuildConfig.countDocuments().catch(() => null),
      ModerationCase.countDocuments().catch(() => null),
      ApplicationForm.countDocuments().catch(() => null),
      ApplicationSubmission.countDocuments().catch(() => null),
      LevelProfile.countDocuments().catch(() => null),
      EconomyProfile.countDocuments().catch(() => null),
    ]);

    const stats = {
      totalGuilds,
      totalCases,
      totalApplications,
      totalSubmissions,
      totalLevelProfiles,
      totalEconomyProfiles,
      uptimeSeconds: Math.floor(process.uptime()),
      memoryMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      nodeVersion: process.version,
    };

    res.render('owner', { user: req.user, stats });
  } catch (err) {
    console.error('[Dashboard] owner route', err);
    res.status(500).render('error', { code: 500, message: 'Failed to load owner panel.' });
  }
});

// ── Command builder routes (MUST come before /:guildId) ─────
const { GuildCommand } = require('../models/GuildCommand');

// ── Demo / preview server (no auth required, mock data) ──────
const DEMO_GUILD = {
  id: '000000000000000000',
  name: 'Demo Server',
  icon: null,
  permissions: '8',
};
const DEMO_USER = {
  id: '000000000000000001',
  username: 'Preview User',
  avatar: null,
  guilds: [DEMO_GUILD],
};

router.get('/demo', (req, res) => {
  res.render('server', { guild: DEMO_GUILD, user: DEMO_USER });
});

router.get('/demo/commands/builder', (req, res) => {
  res.render('command-builder', {
    guild: DEMO_GUILD,
    user: DEMO_USER,
    cmd: 'null',
    cmdId: null,
  });
});

// Legacy redirects — old workflow-editor routes → new command builder
router.get('/:guildId/workflows/editor', requireAuth, (req, res) => {
  const { guildId } = req.params;
  if (!/^\d+$/.test(guildId)) return res.redirect('/dashboard');
  res.redirect(302, `/dashboard/${guildId}/commands/builder`);
});
router.get('/:guildId/workflows/editor/:workflowId', requireAuth, (req, res) => {
  const { guildId } = req.params;
  if (!/^\d+$/.test(guildId)) return res.redirect('/dashboard');
  res.redirect(302, `/dashboard/${guildId}/commands/builder`);
});
router.get('/:guildId/custom-commands/builder', requireAuth, (req, res) => {
  const { guildId } = req.params;
  if (!/^\d+$/.test(guildId)) return res.redirect('/dashboard');
  res.redirect(302, `/dashboard/${guildId}/commands/builder`);
});
router.get('/:guildId/custom-commands/builder/:cmdId', requireAuth, (req, res) => {
  const { guildId, cmdId } = req.params;
  if (!/^\d+$/.test(guildId)) return res.redirect('/dashboard');
  res.redirect(302, `/dashboard/${guildId}/commands/builder/${cmdId}`);
});

router.get('/:guildId/commands/builder', requireAuth, async (req, res) => {
  const { guildId } = req.params;
  if (!/^\d+$/.test(guildId)) return res.redirect('/dashboard');
  const guild = (req.user.guilds || []).find((g) => g.id === guildId && hasAdmin(g.permissions));
  if (!guild) return res.redirect('/dashboard');
  res.render('command-builder', { guild, user: req.user, cmd: null, cmdId: null });
});

router.get('/:guildId/commands/builder/:cmdId', requireAuth, async (req, res) => {
  const { guildId, cmdId } = req.params;
  if (!/^\d+$/.test(guildId)) return res.redirect('/dashboard');
  const guild = (req.user.guilds || []).find((g) => g.id === guildId && hasAdmin(g.permissions));
  if (!guild) return res.redirect('/dashboard');
  let cmd = null;
  try {
    cmd = await GuildCommand.findOne({ _id: cmdId, guildId }).lean();
    if (cmd) cmd._id = cmd._id.toString();
  } catch {
    // not found — render blank builder
  }
  res.render('command-builder', {
    guild,
    user:  req.user,
    cmd:   cmd ? JSON.stringify(cmd) : 'null',
    cmdId: cmd ? String(cmdId) : null,
  });
});

// Server detail
router.get('/:guildId', requireAuth, (req, res) => {
  const { guildId } = req.params;
  // Basic validation: Discord snowflakes are numeric strings
  if (!/^\d+$/.test(guildId)) return res.redirect('/dashboard');

  const guilds = req.user.guilds || [];
  const guild = guilds.find((g) => g.id === guildId && hasAdmin(g.permissions));
  if (!guild) return res.redirect('/dashboard');

  res.render('server', { guild, user: req.user });
});

// Application reviews page (admins or allocated reviewer roles)
router.get('/:guildId/applications/review', requireAuth, async (req, res) => {
  try {
    const { guildId } = req.params;
    if (!/^\d+$/.test(guildId)) return res.redirect('/dashboard');

    const guilds = req.user.guilds || [];
    const guild = guilds.find((g) => g.id === guildId);
    if (!guild) return res.redirect('/dashboard');

    const access = await canReviewGuildApplications({ guildId, user: req.user });
    if (!access.allowed) {
      return res.status(403).render('error', {
        code: 403,
        message: 'You need Administrator or a configured reviewer role to access application reviews.',
      });
    }

    res.render('applications-review', { guild, isGuildAdmin: access.isAdmin === true });
  } catch (err) {
    console.error('[Dashboard] applications review route', err);
    res.status(500).render('error', {
      code: 500,
      message: 'Failed to load application reviews page.',
    });
  }
});

// Application editor — new
router.get('/:guildId/applications/new', requireAuth, async (req, res) => {
  try {
    const { guildId } = req.params;
    if (!/^\d+$/.test(guildId)) return res.redirect('/dashboard');
    const guilds = req.user.guilds || [];
    const guild = guilds.find((g) => g.id === guildId && hasAdmin(g.permissions));
    if (!guild) return res.redirect('/dashboard');
    res.render('application-editor', { guild, user: req.user, appId: null, appData: 'null' });
  } catch (err) {
    console.error('[Dashboard] application new route', err);
    res.status(500).render('error', { code: 500, message: 'Failed to load application editor.' });
  }
});

// Application editor — edit existing
router.get('/:guildId/applications/edit/:appId', requireAuth, async (req, res) => {
  try {
    const { guildId, appId } = req.params;
    if (!/^\d+$/.test(guildId)) return res.redirect('/dashboard');
    const guilds = req.user.guilds || [];
    const guild = guilds.find((g) => g.id === guildId && hasAdmin(g.permissions));
    if (!guild) return res.redirect('/dashboard');
    let appData = null;
    try {
      const form = await ApplicationForm.findOne({ _id: appId, guildId }).lean();
      if (form) {
        appData = { ...form, _id: form._id.toString() };
      }
    } catch { /* not found */ }
    res.render('application-editor', {
      guild,
      user: req.user,
      appId: appData ? appData._id : null,
      appData: appData ? JSON.stringify(appData) : 'null',
    });
  } catch (err) {
    console.error('[Dashboard] application edit route', err);
    res.status(500).render('error', { code: 500, message: 'Failed to load application editor.' });
  }
});

// Demo application editor
router.get('/demo/applications/new', (req, res) => {
  res.render('application-editor', { guild: DEMO_GUILD, user: DEMO_USER, appId: null, appData: 'null' });
});
router.get('/demo/applications/edit/:appId', (req, res) => {
  res.render('application-editor', { guild: DEMO_GUILD, user: DEMO_USER, appId: null, appData: 'null' });
});

// Message editor — new
router.get('/:guildId/messages/new', requireAuth, async (req, res) => {
  const { guildId } = req.params;
  if (!/^\d+$/.test(guildId)) return res.redirect('/dashboard');
  const guild = (req.user.guilds || []).find((g) => g.id === guildId && hasAdmin(g.permissions));
  if (!guild) return res.redirect('/dashboard');
  res.render('message-editor', { guild, user: req.user, msgId: null, msgData: 'null' });
});

// Message editor — edit existing
router.get('/:guildId/messages/edit/:msgId', requireAuth, async (req, res) => {
  const { guildId, msgId } = req.params;
  if (!/^\d+$/.test(guildId)) return res.redirect('/dashboard');
  const guild = (req.user.guilds || []).find((g) => g.id === guildId && hasAdmin(g.permissions));
  if (!guild) return res.redirect('/dashboard');
  let msgData = null;
  try {
    const BotMessageTemplate = require('../models/BotMessageTemplate');
    const msg = await BotMessageTemplate.findOne({ _id: msgId, guildId }).lean();
    if (msg) msgData = { ...msg, _id: msg._id.toString() };
  } catch { /* not found */ }
  res.render('message-editor', {
    guild,
    user: req.user,
    msgId: msgData ? msgData._id : null,
    msgData: msgData ? JSON.stringify(msgData) : 'null',
  });
});

// Demo message editor
router.get('/demo/messages/new', (req, res) => {
  res.render('message-editor', { guild: DEMO_GUILD, user: DEMO_USER, msgId: null, msgData: 'null' });
});
router.get('/demo/messages/edit/:msgId', (req, res) => {
  res.render('message-editor', { guild: DEMO_GUILD, user: DEMO_USER, msgId: null, msgData: 'null' });
});

module.exports = router;
