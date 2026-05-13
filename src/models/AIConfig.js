const mongoose = require('mongoose');

const aiConfigSchema = new mongoose.Schema({
  guildId: { type: String, required: true, unique: true },
  enabled: { type: Boolean, default: false },
  allowedChannels: { type: [String], default: [] },
  systemPrompt: {
    type: String,
    default: 'You are a helpful Discord bot assistant. Be concise, friendly, and accurate.',
    maxlength: 2000,
  },
  model: {
    type: String,
    default: 'llama-3.3-70b-versatile',
  },
  temperature: { type: Number, default: 0.7, min: 0, max: 2 },
  maxTokens: { type: Number, default: 512, min: 50, max: 4096 },
  requireMention: { type: Boolean, default: false },
  rememberContext: { type: Boolean, default: true },
  apiKey: { type: String, default: '', maxlength: 200 },
}, { timestamps: true });

module.exports = mongoose.models.AIConfig || mongoose.model('AIConfig', aiConfigSchema);
