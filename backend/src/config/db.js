const dns = require('dns');
const mongoose = require('mongoose');
const config = require('./env');

// Configure public DNS servers for reliable SRV resolution (fixes querySrv ECONNREFUSED on Windows)
try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch (dnsErr) {
  // Ignore if custom dns setServers fails
}

let isConnected = false;

async function connectDB() {
  if (isConnected) return mongoose.connection;

  try {
    const conn = await mongoose.connect(config.mongodbUri, {
      serverSelectionTimeoutMS: 5000,
    });
    isConnected = true;
    console.log(`📦 MongoDB Connected successfully: ${conn.connection.host}`);
    return conn.connection;
  } catch (err) {
    console.warn(`⚠️ MongoDB connection warning: ${err.message}. Operating with in-memory persistence fallback.`);
    return null;
  }
}

function getIsConnected() {
  return isConnected && mongoose.connection.readyState === 1;
}

module.exports = {
  connectDB,
  getIsConnected,
};
