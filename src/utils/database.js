// filepath: c:\Users\Hextaz\Documents\splatoon-festival-bot\splatoon3-festival-bot\src\utils\database.js
const mongoose = require('mongoose');
const fs = require('fs').promises;
const path = require('path');
const { guildDataManager } = require('./guildDataManager');
const config = require('../config');

// Configure mongoose strictQuery to suppress deprecation warning
mongoose.set('strictQuery', false);

// Connexion MongoDB
let isConnected = false;

async function connectMongoDB() {
    if (isConnected) {
        return true;
    }

    try {
        const mongoUri = process.env.MONGODB_URI;
        if (!mongoUri) {
            console.warn('MONGODB_URI not found, falling back to JSON files');
            return false;
        }

        await mongoose.connect(mongoUri, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });
        
        // Configuration Mongoose
        mongoose.set('strictQuery', false);

        isConnected = true;
        console.log('✅ Connected to MongoDB Atlas');
        
        // Set up connection event listeners
        mongoose.connection.on('disconnected', () => {
            console.log('MongoDB disconnected');
            isConnected = false;
        });

        mongoose.connection.on('error', (err) => {
            console.error('MongoDB error:', err);
        });

        return true;
    } catch (error) {
        console.error('❌ MongoDB connection failed:', error);
        console.log('Falling back to JSON files');
        return false;
    }
}

// Vérifier si MongoDB est disponible
function isMongoDBAvailable() {
    return isConnected && mongoose.connection.readyState === 1;
}

// Fermer la connexion MongoDB
async function disconnectMongoDB() {
    if (isConnected) {
        await mongoose.disconnect();
        isConnected = false;
        console.log('MongoDB disconnected');
    }
}

// Legacy MongoDB client (keeping for compatibility)
const uri = process.env.MONGODB_URI;
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

// Gestionnaire de données avec support multi-serveur
const getGuildDatabase = (guildId) => {
    if (config.multiServerEnabled && guildId) {
        return {
            async load(fileName, defaultValue = null) {
                return await guildDataManager.loadGuildData(guildId, fileName, defaultValue);
            },
            async save(fileName, data) {
                return await guildDataManager.saveGuildData(guildId, fileName, data);
            },
            async delete(fileName) {
                return await guildDataManager.deleteGuildData(guildId, fileName);
            }
        };
    }
    
    // Mode compatible avec l'ancien système (fichiers globaux)
    const fs = require('fs').promises;
    const path = require('path');
    const dataPath = path.join(__dirname, '../../data');
    
    return {
        async load(fileName, defaultValue = null) {
            try {
                const filePath = path.join(dataPath, fileName);
                const data = await fs.readFile(filePath, 'utf8');
                return JSON.parse(data);
            } catch (error) {
                if (error.code === 'ENOENT') {
                    return defaultValue;
                }
                throw error;
            }
        },
        async save(fileName, data) {
            const filePath = path.join(dataPath, fileName);
            await fs.writeFile(filePath, JSON.stringify(data, null, 2));
        },
        async delete(fileName) {
            try {
                const filePath = path.join(dataPath, fileName);
                await fs.unlink(filePath);
            } catch (error) {
                if (error.code !== 'ENOENT') {
                    throw error;
                }
            }
        }
    };
};

module.exports = {
    connectDB,
    getDB,
    getGuildDatabase,
    guildDataManager,
    connectMongoDB,
    disconnectMongoDB,
    isMongoDBAvailable
};