// src/utils/guildDataManager.js
// Gestionnaire de données séparées par serveur Discord (MongoDB uniquement)

const DataAdapter = require('./dataAdapter');

class GuildDataManager {
    constructor() {
        // Plus besoin de dossiers locaux, tout va dans MongoDB
    }

    // Obtenir le DataAdapter pour un serveur
    getDataAdapter(guildId) {
        if (!guildId) {
            throw new Error('Guild ID requis pour GuildDataManager');
        }
        return new DataAdapter(guildId);
    }

    // Charger des données spécifiques à un serveur
    async loadGuildData(guildId, dataType, defaultValue = null) {
        try {
            const { isMongoDBAvailable } = require('./database');
            if (!isMongoDBAvailable()) {
                throw new Error('MongoDB non disponible');
            }

            const adapter = this.getDataAdapter(guildId);
            
            // Mapper les types de données vers les méthodes DataAdapter
            switch (dataType) {
                case 'config.json':
                case 'config':
                    return await adapter.getConfig() || defaultValue;
                    
                case 'teams.json':
                case 'teams':
                    return await adapter.getTeams() || defaultValue;
                    
                case 'votes.json':
                case 'votes':
                    return await adapter.getVotes() || defaultValue;
                    
                case 'scores.json':
                case 'scores':
                    return await adapter.getScores() || defaultValue;
                    
                case 'festivals.json':
                case 'festival':
                    return await adapter.getFestival() || defaultValue;
                    
                case 'mapProbabilities.json':
                case 'mapProbabilities':
                    return await adapter.getMapProbabilities() || defaultValue;
                    
                case 'matchHistory.json':
                case 'matchHistory':
                    return await adapter.getMatchHistory() || defaultValue;
                    
                case 'matchCounters.json':
                case 'matchCounters':
                    return await adapter.getMatchCounters() || defaultValue;
                    
                default:
                    console.warn(`Type de données non supporté: ${dataType}`);
                    return defaultValue;
            }
        } catch (error) {
            console.error(`Erreur chargement données ${dataType} pour serveur ${guildId}:`, error);
            return defaultValue;
        }
    }
    // Sauvegarder des données spécifiques à un serveur
    async saveGuildData(guildId, dataType, data) {
        try {
            const { isMongoDBAvailable } = require('./database');
            if (!isMongoDBAvailable()) {
                throw new Error('MongoDB non disponible');
            }

            const adapter = this.getDataAdapter(guildId);
            
            // Mapper les types de données vers les méthodes DataAdapter
            switch (dataType) {
                case 'config.json':
                case 'config':
                    return await adapter.saveConfig(data);
                    
                case 'teams.json':
                case 'teams':
                    // Pour les équipes, on doit sauvegarder individuellement
                    if (Array.isArray(data)) {
                        for (const team of data) {
                            await adapter.saveTeam(team);
                        }
                    } else {
                        await adapter.saveTeam(data);
                    }
                    break;
                    
                case 'votes.json':
                case 'votes':
                    // Pour les votes, sauvegarder chaque vote individuellement
                    if (typeof data === 'object') {
                        for (const [userId, camp] of Object.entries(data)) {
                            await adapter.saveVote(userId, camp);
                        }
                    }
                    break;
                    
                case 'scores.json':
                case 'scores':
                    return await adapter.saveScores(data);
                    
                case 'festivals.json':
                case 'festival':
                    return await adapter.saveFestival(data);
                    
                case 'mapProbabilities.json':
                case 'mapProbabilities':
                    return await adapter.saveMapProbabilities(data);
                    
                case 'matchHistory.json':
                case 'matchHistory':
                    return await adapter.saveMatchHistory(data);
                    
                case 'matchCounters.json':
                case 'matchCounters':
                    return await adapter.saveMatchCounters(data);
                    
                default:
                    console.warn(`Type de données non supporté pour sauvegarde: ${dataType}`);
                    break;
            }
            
            console.log(`✅ Données ${dataType} sauvegardées pour serveur ${guildId}`);
        } catch (error) {
            console.error(`❌ Erreur sauvegarde données ${dataType} pour serveur ${guildId}:`, error);
            throw error;
        }
    }
    // Supprimer des données spécifiques à un serveur
    async deleteGuildData(guildId, dataType) {
        try {
            const { isMongoDBAvailable } = require('./database');
            if (!isMongoDBAvailable()) {
                throw new Error('MongoDB non disponible');
            }

            const adapter = this.getDataAdapter(guildId);
            
            // Utiliser la méthode cleanup pour tout supprimer d'un coup
            await adapter.cleanup();
            console.log(`✅ Toutes les données supprimées pour serveur ${guildId}`);
        } catch (error) {
            console.error(`❌ Erreur suppression données pour serveur ${guildId}:`, error);
            throw error;
        }
    }
    // Lister tous les serveurs avec des données
    async listGuildsWithData() {
        try {
            const { isMongoDBAvailable } = require('./database');
            if (!isMongoDBAvailable()) {
                console.warn('MongoDB non disponible - impossible de lister les serveurs');
                return [];
            }

            // Obtenir tous les guildIds depuis MongoDB
            const { Festival } = require('../models/mongodb');
            const festivals = await Festival.find({}, { guildId: 1 }).distinct('guildId');
            
            return festivals.filter(id => id && id.match(/^\d+$/)); // Filtrer les IDs valides
        } catch (error) {
            console.error('Erreur lors du listage des serveurs:', error);
            return [];
        }
    }

    // Nettoyer les données d'un serveur
    async cleanupGuildData(guildId) {
        try {
            await this.deleteGuildData(guildId, 'all');
            console.log(`🧹 Données du serveur ${guildId} supprimées de MongoDB`);
        } catch (error) {
            console.error(`❌ Erreur suppression données serveur ${guildId}:`, error);
            throw error;
        }
    }

    // Migration des données globales vers un serveur spécifique
    async migrateGlobalDataToGuild(guildId) {
        console.log(`🔄 Migration non nécessaire - toutes les données sont déjà dans MongoDB pour le serveur ${guildId}`);
        
        // Si besoin de migration depuis les anciens fichiers JSON, décommenter :
        /*
        const filesToMigrate = [
            'festivals.json',
            'teams.json',
            'votes.json',
            'scores.json',
            'pendingResults.json'
        ];

        for (const fileName of filesToMigrate) {
            try {
                // Charger depuis JSON et sauvegarder vers MongoDB
                const data = await this.loadGuildDataFromJSON(guildId, fileName);
                if (data) {
                    await this.saveGuildData(guildId, fileName, data);
                    console.log(`✅ ${fileName} migré vers MongoDB`);
                }
            } catch (error) {
                console.error(`❌ Erreur migration ${fileName}:`, error);
            }
        }
        */
    }
}

// Instance singleton
const guildDataManager = new GuildDataManager();

module.exports = {
    GuildDataManager,
    guildDataManager
};
