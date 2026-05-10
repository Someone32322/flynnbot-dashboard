const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const flash = require('connect-flash');

const changelogFilePath = path.join(__dirname, '../data/changelog.json');

function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.redirect('/api/auth/login');
}

function ensureIsOwner(req, res, next) {
    const OWNER_ID = process.env.OWNER_ID || '1192421681751412746';
    if (req.user && req.user.id === OWNER_ID) {
        return next();
    }
    res.status(403).send('Forbidden');
}

// GET route to display the changelog editor
router.get('/owner/changelog', ensureAuthenticated, ensureIsOwner, (req, res) => {
    fs.readFile(changelogFilePath, 'utf8', (err, data) => {
        if (err) {
            console.error('Error reading changelog file:', err);
            req.flash('error', 'Error reading changelog file.');
            return res.redirect('/owner');
        }
        try {
            res.render('owner/changelog-editor', {
                user: req.user,
                changelogData: JSON.parse(data),
                success: req.flash('success'),
                error: req.flash('error'),
                layout: 'owner' 
            });
        } catch (e) {
            console.error('Error parsing changelog JSON:', e);
            req.flash('error', 'Error parsing changelog data.');
            res.redirect('/owner');
        }
    });
});

// POST route to update the changelog
router.post('/owner/changelog', ensureAuthenticated, ensureIsOwner, (req, res) => {
    const { changelogJson } = req.body;
    try {
        const parsedJson = JSON.parse(changelogJson);
        fs.writeFile(changelogFilePath, JSON.stringify(parsedJson, null, 2), 'utf8', (err) => {
            if (err) {
                console.error('Error writing changelog file:', err);
                req.flash('error', 'Failed to update changelog.');
                return res.redirect('/owner/changelog');
            }
            req.flash('success', 'Changelog updated successfully.');
            res.redirect('/owner/changelog');
        });
    } catch (error) {
        req.flash('error', 'Invalid JSON format.');
        res.redirect('/owner/changelog');
    }
});

module.exports = router;
