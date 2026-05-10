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

module.exports = router;
