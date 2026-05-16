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

// ── Command builder pages (MUST come before /:guildId) ───────
const CustomCommand = require('../models/CustomCommand');
const Workflow = require('../models/Workflow');

// ── Workflow editor pages (MUST come before /:guildId) ────────

// New workflow
router.get('/:guildId/workflows/editor', requireAuth, async (req, res) => {
  const { guildId } = req.params;
  if (!/^\d+$/.test(guildId)) return res.redirect('/dashboard');
  const guild = (req.user.guilds || []).find((g) => g.id === guildId && hasAdmin(g.permissions));
  if (!guild) return res.redirect('/dashboard');
  res.render('workflow-editor', { guild, user: req.user, workflow: null });
});

// Edit existing workflow
router.get('/:guildId/workflows/editor/:workflowId', requireAuth, async (req, res) => {
  const { guildId, workflowId } = req.params;
  if (!/^\d+$/.test(guildId)) return res.redirect('/dashboard');
  const guild = (req.user.guilds || []).find((g) => g.id === guildId && hasAdmin(g.permissions));
  if (!guild) return res.redirect('/dashboard');
  let workflow = null;
  try {
    workflow = await Workflow.findOne({ _id: workflowId, guildId }).lean();
  } catch {
    // invalid id — render blank editor
  }
  res.render('workflow-editor', { guild, user: req.user, workflow });
});

// (Removed duplicate empty route definition)
router.get('/:guildId/custom-commands/builder', requireAuth, async (req, res) => {
  const { guildId } = req.params;
  if (!/^\d+$/.test(guildId)) return res.redirect('/dashboard');
  const guilds = req.user.guilds || [];
  const guild = guilds.find((g) => g.id === guildId && hasAdmin(g.permissions));
  if (!guild) return res.redirect('/dashboard');
  res.render('command-builder', { guild, user: req.user, cmd: null });
});

router.get('/:guildId/custom-commands/builder/:cmdId', requireAuth, async (req, res) => {
  const { guildId, cmdId } = req.params;
  if (!/^\d+$/.test(guildId)) return res.redirect('/dashboard');
  const guilds = req.user.guilds || [];
  const guild = guilds.find((g) => g.id === guildId && hasAdmin(g.permissions));
  if (!guild) return res.redirect('/dashboard');
  let cmd = null;
  try {
    cmd = await CustomCommand.findOne({ _id: cmdId, guildId }).lean();
  } catch {
    // invalid id or not found — render blank builder
  }
  res.render('command-builder', { guild, user: req.user, cmd });
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

module.exports = router;
