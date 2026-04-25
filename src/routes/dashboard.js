const express = require('express');
const router = express.Router();
const { canReviewGuildApplications } = require('../services/applicationAccess');

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

// Server detail
router.get('/:guildId', requireAuth, (req, res) => {
  const { guildId } = req.params;
  // Basic validation: Discord snowflakes are numeric strings
  if (!/^\d+$/.test(guildId)) return res.redirect('/dashboard');

  const guilds = req.user.guilds || [];
  const guild = guilds.find((g) => g.id === guildId && hasAdmin(g.permissions));
  if (!guild) return res.redirect('/dashboard');

  res.render('server', { guild });
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
