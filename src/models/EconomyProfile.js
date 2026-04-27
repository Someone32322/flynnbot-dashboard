const mongoose = require('mongoose');

const inventoryItemSchema = new mongoose.Schema({
  itemId: { type: String, required: true },
  name: { type: String, required: true },
  emoji: { type: String, default: '📦' },
  quantity: { type: Number, default: 1 },
}, { _id: false });

const economyProfileSchema = new mongoose.Schema({
  guildId: { type: String, required: true },
  userId: { type: String, required: true },
  wallet: { type: Number, default: 0 },
  bank: { type: Number, default: 0 },
  bankCap: { type: Number, default: 5000 },
  netWorth: { type: Number, default: 0 },
  inventory: { type: [inventoryItemSchema], default: [] },
  lastDaily: { type: Date, default: null },
  lastWeekly: { type: Date, default: null },
  lastWork: { type: Date, default: null },
  lastCrime: { type: Date, default: null },
  lastBeg: { type: Date, default: null },
  lastFish: { type: Date, default: null },
  lastHunt: { type: Date, default: null },
  lastRob: { type: Date, default: null },
  streak: { type: Number, default: 0 },
  lastStreakDate: { type: Date, default: null },
  stats: {
    totalEarned: { type: Number, default: 0 },
    totalSpent: { type: Number, default: 0 },
    totalGambled: { type: Number, default: 0 },
    totalWon: { type: Number, default: 0 },
    totalLost: { type: Number, default: 0 },
  },
}, { timestamps: true });

economyProfileSchema.index({ guildId: 1, userId: 1 }, { unique: true });
economyProfileSchema.index({ guildId: 1, wallet: -1 });

module.exports = mongoose.models.EconomyProfile || mongoose.model('EconomyProfile', economyProfileSchema);
