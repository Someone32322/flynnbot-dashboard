const mongoose = require('mongoose');

const rewardSchema = new mongoose.Schema(
  { level: { type: Number, required: true }, roleId: { type: String, required: true } },
  { _id: false }
);

const formulaSchema = new mongoose.Schema(
  { a: { type: Number, default: 5 }, b: { type: Number, default: 50 }, c: { type: Number, default: 100 } },
  { _id: false }
);

const levelConfigSchema = new mongoose.Schema(
  {
    guildId:           { type: String, required: true, unique: true },
    enabled:           { type: Boolean, default: true },
    xpRate:            { type: Number, default: 15 },
    xpCooldown:        { type: Number, default: 60 },
    xpChannels:        { type: [String], default: [] },
    rewards:           { type: [rewardSchema], default: [] },
    levelUpMessage:    { type: String, default: 'Congrats {user}! You reached level {level} in {server}.' },
    levelUpChannelId:  { type: String, default: null },
    roleStack:         { type: Boolean, default: true },
    formula:           { type: formulaSchema, default: () => ({}) },
  },
  { timestamps: true }
);

const LevelConfig = mongoose.models.LevelConfig || mongoose.model('LevelConfig', levelConfigSchema);

module.exports = { LevelConfig };
