const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

// Ensure correct path depending on execution directly or via src
const dataPath = path.join(__dirname, '../data/changelog.json');

router.get('/', (req, res) => {
    try {
        let changelogData = { changelog: [] };
        
        if (fs.existsSync(dataPath)) {
            const rawData = fs.readFileSync(dataPath, 'utf8');
            changelogData = JSON.parse(rawData);
        }
        
        res.render('changelog', {
            user: req.user,
            changelog: changelogData.changelog
        });
    } catch (error) {
        console.error('Error reading changelog:', error);
        res.render('changelog', {
            user: req.user,
            changelog: [],
            error: 'Failed to load changelog data.'
        });
    }
});

// Individual entry: /changelog/:id
router.get('/:id', (req, res) => {
    try {
        let changelogData = { changelog: [] };

        if (fs.existsSync(dataPath)) {
            changelogData = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
        }

        const entry = changelogData.changelog.find(e => e.id === req.params.id);
        if (!entry) {
            return res.status(404).render('error', { code: 404, message: 'Changelog entry not found.' });
        }

        // Find adjacent entries for prev/next navigation
        const list = changelogData.changelog;
        const idx = list.indexOf(entry);
        const newer = idx > 0 ? list[idx - 1] : null;
        const older = idx < list.length - 1 ? list[idx + 1] : null;

        res.render('changelog-entry', {
            user: req.user,
            entry,
            newer,
            older
        });
    } catch (error) {
        console.error('Error reading changelog entry:', error);
        res.status(500).render('error', { code: 500, message: 'Failed to load changelog entry.' });
    }
});

module.exports = router;
