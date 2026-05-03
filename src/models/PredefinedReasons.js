const mongoose = require('mongoose');

/**
 * Per-action predefined reasons.
 * Used by the bot for slash-command autocomplete.
 * The dashboard manages this collection so moderators can set up
 * autocomplete suggestions per action (ban/kick/mute/warn).
 */
const predefinedReasonsSchema = new mongoose.Schema(
  {
    guildId: { type: String, required: true, index: true },
    action:  { type: String, required: true }, // 'warn' | 'mute' | 'kick' | 'ban'
    reasons: { type: [String], default: [] },
  },
  { timestamps: true }
);

predefinedReasonsSchema.index({ guildId: 1, action: 1 }, { unique: true });

const PredefinedReasons =
  mongoose.models.PredefinedReasons ||
  mongoose.model('PredefinedReasons', predefinedReasonsSchema);

module.exports = { PredefinedReasons };
