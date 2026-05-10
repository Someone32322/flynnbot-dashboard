const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  userId:  { type: String, required: true, unique: true },
  addedAt: { type: Date, default: Date.now },
  addedBy: { type: String, default: null },
  reason:  { type: String, default: null },
});

module.exports = mongoose.model('Blacklist', schema);
