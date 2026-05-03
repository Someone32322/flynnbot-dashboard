/**
 * reset-all-settings.js
 * Drops all guild configuration data from MongoDB.
 * Preserves: user/auth data (not stored here)
 * Clears: all per-guild settings, profiles, templates, etc.
 *
 * Usage: node scripts/reset-all-settings.js
 */

const path = require('node:path');
const dotenv = require('dotenv');
const mongoose = require('mongoose');

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;
if (!MONGO_URI) {
  console.error('Missing MONGO_URI in .env');
  process.exit(1);
}

const COLLECTIONS_TO_CLEAR = [
  'guildconfigs',
  'aiconfigs',
  'applicationforms',
  'applicationsubmissions',
  'botmessagetemplates',
  'customcommands',
  'economyconfigs',
  'economyprofiles',
  'embedtemplates',
  'levelconfigs',
  'levelprofiles',
  'loggingconfigs',
  'moderationcases',
  'reactionroles',
  'responseconfigs',
  'scheduledmessages',
  'themeconfigs',
];

async function main() {
  console.log('Connecting to MongoDB...');
  await mongoose.connect(MONGO_URI);
  console.log('Connected.\n');

  const db = mongoose.connection.db;

  for (const name of COLLECTIONS_TO_CLEAR) {
    try {
      const result = await db.collection(name).deleteMany({});
      console.log(`  ✓ Cleared ${name}: ${result.deletedCount} document(s) removed`);
    } catch (err) {
      console.error(`  ✗ Failed to clear ${name}: ${err.message}`);
    }
  }

  await mongoose.disconnect();
  console.log('\nAll guild settings have been reset.');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
