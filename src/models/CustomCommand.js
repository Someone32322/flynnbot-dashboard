/**
 * CustomCommand — legacy stub model.
 * The old customcommands collection is kept read-only for backward compat.
 * New commands use GuildCommand. This stub prevents require() crashes.
 */
const mongoose = require('mongoose');

const CustomCommandSchema = new mongoose.Schema({
  guildId:      { type: String, required: true, index: true },
  name:         { type: String, required: true },
  trigger:      { type: String, default: '' },
  triggerType:  { type: String, default: 'exact' },
  description:  { type: String, default: '' },
  enabled:      { type: Boolean, default: true },
  blocks:       { type: Array, default: [] },
  variables:    { type: Array, default: [] },
  slashOptions: { type: Array, default: [] },
  allowedRoles:        { type: [String], default: [] },
  allowedChannels:     { type: [String], default: [] },
  requiredPermissions: { type: [String], default: [] },
  cooldownSeconds: { type: Number, default: 0 },
  cooldownScope:   { type: String, default: 'user' },
  caseSensitive:   { type: Boolean, default: false },
  deleteUserMessage: { type: Boolean, default: false },
  ephemeralErrors:   { type: Boolean, default: true },
  discordCommandId:  { type: String, default: null },
  eventTrigger:      { type: Object, default: null },
}, { timestamps: true, collection: 'customcommands' });

module.exports = mongoose.model('CustomCommand', CustomCommandSchema);
