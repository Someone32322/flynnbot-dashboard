const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    // Stored as UTC midnight (YYYY-MM-DDT00:00:00.000Z) — one doc per calendar day
    date:   { type: Date, required: true, unique: true },
    status: {
      type: String,
      enum: ['online', 'degraded', 'offline', 'maintenance'],
      default: 'online',
    },
    note:   { type: String, default: '' },
    setBy:  { type: String, default: '' }, // Discord user ID of the owner who set it
  },
  { timestamps: true }
);

module.exports = mongoose.model('StatusDailySnapshot', schema);
