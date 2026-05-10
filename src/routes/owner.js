const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

const OWNER_ID = '1192421681751412746';
const changelogFilePath = path.join(__dirname, '../data/changelog.json');

function requireAuth(req, res, next) {
  if (req.isAuthenticated()) return next();
  res.redirect(`/api/auth/login?returnTo=${encodeURIComponent(req.originalUrl)}`);
}

function requireOwner(req, res, next) {
  if (req.user && req.user.id === OWNER_ID) return next();
  res.status(403).render('error', { code: 403, message: 'You do not have permission to access this page.' });
}

function renderEditor(req, res) {
  let changelogData = { changelog: [] };
  try {
    if (fs.existsSync(changelogFilePath)) {
      changelogData = JSON.parse(fs.readFileSync(changelogFilePath, 'utf8'));
    }
  } catch (e) {
    console.error('Error reading changelog:', e);
  }
  res.render('owner/changelog-editor', {
    user: req.user,
    changelogJson: JSON.stringify(changelogData, null, 2),
    saved: req.query.saved === '1',
    parseError: req.query.error === 'invalid_json'
  });
}

function saveChangelog(req, res, redirectBase) {
  const { changelogJson } = req.body;
  try {
    const parsed = JSON.parse(changelogJson);
    fs.mkdirSync(path.dirname(changelogFilePath), { recursive: true });
    fs.writeFileSync(changelogFilePath, JSON.stringify(parsed, null, 2), 'utf8');
    res.redirect(redirectBase + '?saved=1');
  } catch (e) {
    console.error('Invalid changelog JSON:', e.message);
    res.redirect(redirectBase + '?error=invalid_json');
  }
}

// Primary URL: /changelogeditor
router.get('/changelogeditor', requireAuth, requireOwner, (req, res) => renderEditor(req, res));
router.post('/changelogeditor', requireAuth, requireOwner, (req, res) => saveChangelog(req, res, '/changelogeditor'));

// Legacy alias: /owner/changelog
router.get('/owner/changelog', requireAuth, requireOwner, (req, res) => renderEditor(req, res));
router.post('/owner/changelog', requireAuth, requireOwner, (req, res) => saveChangelog(req, res, '/owner/changelog'));

module.exports = router;

