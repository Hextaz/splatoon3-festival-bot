// filepath: c:\Users\Hextaz\Documents\splatoon-festival-bot\splatoon3-festival-bot\src\utils\database.js
const mongoose = require('mongoose');
const { MongoClient } = require('mongodb');

const uri = process.env.MONGODB_URI; // Connection string from .env
let db;

const connectDB = async () => {
    try {
        const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });
        await client.connect();
        db = client.db('splatoon3'); // Database name
        console.log('Database connected successfully');
    } catch (error) {
        console.error('Database connection error:', error);
    }
};

const getDB = () => {
    if (!db) {
        throw new Error('Database not initialized. Call connectDB first.');
    }
    return db;
};

module.exports = {
    connectDB,
    getDB,
};