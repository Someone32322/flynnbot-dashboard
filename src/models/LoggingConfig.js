const mongoose = require('mongoose');

const loggingConfigSchema = new mongoose.Schema(
  {
    guildId: { type: String, required: true, unique: true, index: true },
    channels: { type: Object, default: {} },
    // Settings
    useWebhooks: { type: Boolean, default: false },
    ignoreEmbeds: { type: Boolean, default: false },
    ignoreVoice: { type: Boolean, default: false },
    logDeletedPolls: { type: Boolean, default: true },
    logDeletedSticky: { type: Boolean, default: true },
    logDeletedForwarded: { type: Boolean, default: true },
    logUnrecognized: { type: Boolean, default: false },
  },
  { timestamps: true }
);

const LoggingConfig =
  mongoose.models.LoggingConfig || mongoose.model('LoggingConfig', loggingConfigSchema);

module.exports = { LoggingConfig };
