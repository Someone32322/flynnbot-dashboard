const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { ensureAuthenticated, ensureIsOwner } = require('../middleware');

const changelogFilePath = path.join(__dirname, '../../data/changelog.json');

// GET route to display the changelog editor
router.get('/owner/changelog', ensureAuthenticated, ensureIsOwner, (req, res) => {
    fs.readFile(changelogFilePath, 'utf8', (err, data) => {
        if (err) {
            console.error('Error reading changelog file:', err);
            return res.status(500).send('Error reading changelog file.');
        }
        res.render('owner/changelog-editor', {
            user: req.user,
            changelogData: JSON.parse(data),
            success: req.flash('success'),
            error: req.flash('error')
        });
    });
});

// POST route to update the changelog
router.post('/owner/changelog', ensureAuthenticated, ensureIsOwner, (req, res) => {
    const { changelogJson } = req.body;
    try {
        // Validate if the input is valid JSON
        const parsedJson = JSON.parse(changelogJson);
        // Write the formatted JSON to the file
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
