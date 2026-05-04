const mongoose = require('mongoose');

const botStatusSchema = new mongoose.Schema({
  // Singleton document — one entry, always upserted
  _id: { type: String, default: 'bot' },

  status: {
    type: String,
    enum: ['online', 'degraded', 'offline'],
    default: 'offline',
  },

  // Discord gateway latency in ms
  latencyMs: { type: Number, default: null },

  // RSS memory in MB
  memoryMB: { type: Number, default: null },

  // Process uptime in seconds
  uptimeSeconds: { type: Number, default: null },

  // Discord.js shard / guild count
  guildCount: { type: Number, default: null },

  // Human-readable status line sent from the bot
  statusMessage: { type: String, default: 'Bot is initializing.' },

  // ISO timestamp of the last successful heartbeat from the bot
  lastHeartbeat: { type: Date, default: null },

  // Whether the bot self-reported high latency
  highLatency: { type: Boolean, default: false },
}, {
  timestamps: true,
  _id: false,
  versionKey: false,
});

const BotStatus = mongoose.model('BotStatus', botStatusSchema);
module.exports = { BotStatus };
