const mongoose = require('mongoose');

const embedFieldSchema = new mongoose.Schema(
  { name: { type: String, default: '' }, value: { type: String, default: '' }, inline: { type: Boolean, default: false } },
  { _id: false }
);

const botMessageTemplateSchema = new mongoose.Schema(
  {
    guildId:          { type: String, required: true, index: true },
    messageType:      { type: String, required: true }, // e.g. 'warn_dm', 'kick_response'
    enabled:          { type: Boolean, default: true },
    content:          { type: String, default: '' },
    embedEnabled:     { type: Boolean, default: true },
    embedColor:       { type: String, default: '#6366f1' },
    embedAuthor:      { type: String, default: '' },
    embedTitle:       { type: String, default: '' },
    embedDescription: { type: String, default: '' },
    embedFooter:      { type: String, default: '' },
    embedThumbnail:   { type: Boolean, default: false },
    embedFields:      { type: [embedFieldSchema], default: [] },
    // Settings (img16)
    messageStyle:     { type: String, default: 'success', enum: ['success', 'error', 'warning', 'info', 'none'] },
    removeTitleEmoji: { type: Boolean, default: false },
    removeEmptyLines: { type: Boolean, default: false },
  },
  { timestamps: true }
);

botMessageTemplateSchema.index({ guildId: 1, messageType: 1 }, { unique: true });

module.exports = mongoose.models.BotMessageTemplate ||
  mongoose.model('BotMessageTemplate', botMessageTemplateSchema);
