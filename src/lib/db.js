const mongoose = require('mongoose');

let connected = false;

async function connectDb() {
  if (connected) return;
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error('MONGO_URI is not set in the dashboard .env');
  await mongoose.connect(uri);
  connected = true;
  const dbName = mongoose.connection.db.databaseName;
  console.log(`[Dashboard] Connected to MongoDB | DB: ${dbName}`);
}

module.exports = { connectDb };
