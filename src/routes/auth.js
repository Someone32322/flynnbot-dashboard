const express = require('express');
const passport = require('passport');
const router = express.Router();

function sanitizeReturnTo(value) {
  if (typeof value !== 'string') return null;
  if (!value.startsWith('/')) return null;
  if (value.startsWith('//')) return null;
  return value;
}

// Redirect to Discord OAuth
router.get('/login', (req, res, next) => {
  const returnTo = sanitizeReturnTo(req.query.returnTo);
  if (returnTo) {
    req.session.returnTo = returnTo;
  }
  next();
}, passport.authenticate('discord'));

// Discord OAuth callback
router.get(
  '/callback',
  passport.authenticate('discord', { failureRedirect: '/?error=1' }),
  (req, res) => {
    const returnTo = sanitizeReturnTo(req.session?.returnTo);
    if (req.session?.returnTo) delete req.session.returnTo;
    res.redirect(returnTo || '/dashboard');
  }
);

// Logout
router.get('/logout', (req, res, next) => {
  req.logout((err) => {
    if (err) return next(err);
    req.session.destroy(() => {
      res.redirect('/');
    });
  });
});

module.exports = router;
