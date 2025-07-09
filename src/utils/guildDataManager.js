// src/utils/guildDataManager.js
// Gestionnaire de données séparées par serveur Discord

const fs = require('fs').promises;
const path = require('path');

class GuildDataManager {
    constructor() {
        this.dataPath = path.join(__dirname, '../../data');
        this.ensureDataDir();
    }

    async ensureDataDir() {
        try {
            await fs.mkdir(this.dataPath, { recursive: true });
        } catch (error) {
            if (error.code !== 'EEXIST') {
                throw error;
            }
        }
    }

    // Créer le chemin du fichier spécifique à un serveur
    getGuildFilePath(guildId, fileName) {
        const guildDir = path.join(this.dataPath, 'guilds', guildId);
        return path.join(guildDir, fileName);
    }

    // Créer le dossier pour un serveur spécifique
    async ensureGuildDir(guildId) {
        const guildDir = path.join(this.dataPath, 'guilds', guildId);
        try {
            await fs.mkdir(guildDir, { recursive: true });
        } catch (error) {
            if (error.code !== 'EEXIST') {
                throw error;
            }
        }
    }

    // Charger des données spécifiques à un serveur
    async loadGuildData(guildId, fileName, defaultValue = null) {
        try {
            const filePath = this.getGuildFilePath(guildId, fileName);
            const data = await fs.readFile(filePath, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            if (error.code === 'ENOENT') {
                return defaultValue;
            }
            throw error;
        }
    }

    // Sauvegarder des données spécifiques à un serveur
    async saveGuildData(guildId, fileName, data) {
        await this.ensureGuildDir(guildId);
        const filePath = this.getGuildFilePath(guildId, fileName);
        await fs.writeFile(filePath, JSON.stringify(data, null, 2));
    }

    // Supprimer des données spécifiques à un serveur
    async deleteGuildData(guildId, fileName) {
        try {
            const filePath = this.getGuildFilePath(guildId, fileName);
            await fs.unlink(filePath);
        } catch (error) {
            if (error.code !== 'ENOENT') {
                throw error;
            }
        }
    }

    // Lister tous les serveurs avec des données
    async listGuildsWithData() {
        try {
            const guildsDir = path.join(this.dataPath, 'guilds');
            const guildIds = await fs.readdir(guildsDir);
            return guildIds.filter(id => id.match(/^\d+$/)); // Filtrer les IDs valides
        } catch (error) {
            if (error.code === 'ENOENT') {
                return [];
            }
            throw error;
        }
    }

    // Nettoyer les données d'un serveur
    async cleanupGuildData(guildId) {
        try {
            const guildDir = path.join(this.dataPath, 'guilds', guildId);
            await fs.rmdir(guildDir, { recursive: true });
            console.log(`🧹 Données du serveur ${guildId} supprimées`);
        } catch (error) {
            if (error.code !== 'ENOENT') {
                console.error(`❌ Erreur suppression données serveur ${guildId}:`, error);
            }
        }
    }

    // Migrer les anciennes données globales vers un serveur spécifique
    async migrateGlobalDataToGuild(guildId) {
        const filesToMigrate = [
            'festivals.json',
            'teams.json',
            'scores.json',
            'votes.json',
            'config.json',
            'matchHistory.json',
            'matchCounters.json',
            'pendingResults.json'
        ];

        console.log(`🔄 Migration des données globales vers le serveur ${guildId}...`);

        for (const fileName of filesToMigrate) {
            try {
                const globalPath = path.join(this.dataPath, fileName);
                const data = await fs.readFile(globalPath, 'utf8');
                
                // Sauvegarder dans le dossier du serveur
                await this.saveGuildData(guildId, fileName, JSON.parse(data));
                
                // Renommer le fichier global pour éviter les conflits
                const backupPath = path.join(this.dataPath, `${fileName}.backup`);
                await fs.rename(globalPath, backupPath);
                
                console.log(`✅ ${fileName} migré et sauvegardé`);
            } catch (error) {
                if (error.code !== 'ENOENT') {
                    console.error(`❌ Erreur migration ${fileName}:`, error);
                }
            }
        }

        console.log('✅ Migration terminée');
    }
}

// Instance singleton
const guildDataManager = new GuildDataManager();

module.exports = {
    GuildDataManager,
    guildDataManager
};
