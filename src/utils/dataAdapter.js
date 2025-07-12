const { isMongoDBAvailable } = require('./database');
const { Festival, Team, Vote, Match, CampScore, MapProbability, GuildConfig } = require('../models/mongodb');
const fs = require('fs').promises;
const path = require('path');

/**
 * Adaptateur hybride pour la persistance des données
 * Utilise MongoDB si disponible, sinon fallback vers JSON
 */

class DataAdapter {
    constructor(guildId) {
        this.guildId = guildId;
        this.dataDir = path.join(process.cwd(), 'data');
    }

    // --- FESTIVALS ---

    async getFestival() {
        if (isMongoDBAvailable()) {
            return await Festival.findOne({ guildId: this.guildId, isActive: true });
        } else {
            return this._getJSONData('festivals.json');
        }
    }

    async saveFestival(festivalData) {
        if (isMongoDBAvailable()) {
            // Désactiver les anciens festivals
            await Festival.updateMany(
                { guildId: this.guildId, isActive: true },
                { isActive: false }
            );
            
            // Créer le nouveau festival
            const festival = new Festival({
                ...festivalData,
                guildId: this.guildId,
                isActive: true
            });
            return await festival.save();
        } else {
            return this._saveJSONData('festivals.json', festivalData);
        }
    }

    async endFestival() {
        if (isMongoDBAvailable()) {
            return await Festival.updateMany(
                { guildId: this.guildId, isActive: true },
                { isActive: false }
            );
        } else {
            return this._saveJSONData('festivals.json', null);
        }
    }

    // --- ÉQUIPES ---

    async getTeams() {
        if (isMongoDBAvailable()) {
            const festival = await this.getFestival();
            if (!festival) return {};
            
            const teams = await Team.find({ 
                guildId: this.guildId, 
                festivalId: festival._id 
            });
            
            // Convertir en format JSON pour compatibilité
            const teamsObj = {};
            teams.forEach(team => {
                teamsObj[team._id.toString()] = {
                    id: team._id.toString(),
                    name: team.name,
                    leaderId: team.leaderId,
                    members: team.members,
                    camp: team.camp,
                    isOpen: team.isOpen,
                    accessCode: team.accessCode,
                    channelId: team.channelId,
                    roleId: team.roleId,
                    isSearching: team.isSearching,
                    lastSearchTime: team.lastSearchTime,
                    searchLockUntil: team.searchLockUntil
                };
            });
            return teamsObj;
        } else {
            return this._getJSONData('teams.json') || {};
        }
    }

    async saveTeam(teamData) {
        if (isMongoDBAvailable()) {
            const festival = await this.getFestival();
            if (!festival) throw new Error('No active festival');

            if (teamData.id) {
                // Mise à jour
                return await Team.findByIdAndUpdate(teamData.id, {
                    ...teamData,
                    guildId: this.guildId,
                    festivalId: festival._id,
                    updatedAt: new Date()
                }, { new: true });
            } else {
                // Création
                const team = new Team({
                    ...teamData,
                    guildId: this.guildId,
                    festivalId: festival._id
                });
                return await team.save();
            }
        } else {
            const teams = await this.getTeams();
            const teamId = teamData.id || Date.now().toString();
            teams[teamId] = { ...teamData, id: teamId };
            await this._saveJSONData('teams.json', teams);
            return teams[teamId];
        }
    }

    async deleteTeam(teamId) {
        if (isMongoDBAvailable()) {
            return await Team.findByIdAndDelete(teamId);
        } else {
            const teams = await this.getTeams();
            delete teams[teamId];
            return this._saveJSONData('teams.json', teams);
        }
    }

    // --- VOTES ---

    async getVotes() {
        if (isMongoDBAvailable()) {
            const festival = await this.getFestival();
            if (!festival) return {};

            const votes = await Vote.find({ 
                guildId: this.guildId, 
                festivalId: festival._id 
            });

            const votesObj = {};
            votes.forEach(vote => {
                votesObj[vote.userId] = vote.camp;
            });
            return votesObj;
        } else {
            return this._getJSONData('votes.json') || {};
        }
    }

    async saveVote(userId, camp) {
        if (isMongoDBAvailable()) {
            const festival = await this.getFestival();
            if (!festival) throw new Error('No active festival');

            return await Vote.findOneAndUpdate(
                { guildId: this.guildId, festivalId: festival._id, userId },
                { camp, votedAt: new Date() },
                { upsert: true, new: true }
            );
        } else {
            const votes = await this.getVotes();
            votes[userId] = camp;
            return this._saveJSONData('votes.json', votes);
        }
    }

    // --- MATCHS ---

    async getMatches() {
        if (isMongoDBAvailable()) {
            const festival = await this.getFestival();
            if (!festival) return [];

            return await Match.find({ 
                guildId: this.guildId, 
                festivalId: festival._id 
            }).populate('team1Id team2Id');
        } else {
            return this._getJSONData('matchHistory.json') || [];
        }
    }

    async saveMatch(matchData) {
        if (isMongoDBAvailable()) {
            const festival = await this.getFestival();
            if (!festival) throw new Error('No active festival');

            if (matchData._id) {
                return await Match.findByIdAndUpdate(matchData._id, {
                    ...matchData,
                    guildId: this.guildId,
                    festivalId: festival._id
                }, { new: true });
            } else {
                const match = new Match({
                    ...matchData,
                    guildId: this.guildId,
                    festivalId: festival._id
                });
                return await match.save();
            }
        } else {
            const matches = await this.getMatches();
            const matchId = matchData.id || Date.now().toString();
            matchData.id = matchId;
            matches.push(matchData);
            return this._saveJSONData('matchHistory.json', matches);
        }
    }

    // --- SCORES ---

    async getScores() {
        if (isMongoDBAvailable()) {
            const festival = await this.getFestival();
            if (!festival) return {};

            const scores = await CampScore.find({ 
                guildId: this.guildId, 
                festivalId: festival._id 
            });
            
            // Convertir en format attendu
            const scoresObj = {};
            scores.forEach(score => {
                scoresObj[score.camp] = score.points;
            });
            return scoresObj;
        } else {
            return this._getJSONData('scores.json') || {};
        }
    }

    async saveScores(scoresData) {
        if (isMongoDBAvailable()) {
            const festival = await this.getFestival();
            if (!festival) throw new Error('No active festival');

            // Supprimer les anciens scores
            await CampScore.deleteMany({ 
                guildId: this.guildId, 
                festivalId: festival._id 
            });

            // Sauvegarder les nouveaux scores
            const scoresDocs = Object.entries(scoresData).map(([camp, points]) => ({
                guildId: this.guildId,
                festivalId: festival._id,
                camp,
                points
            }));

            if (scoresDocs.length > 0) {
                await CampScore.insertMany(scoresDocs);
            }
            return scoresData;
        } else {
            return this._saveJSONData('scores.json', scoresData);
        }
    }

    // --- MATCH HISTORY ---

    async loadMatchHistory(guildId) {
        if (isMongoDBAvailable()) {
            // Pour MongoDB, on peut stocker l'historique des matchs dans un document séparé
            // ou dans une collection dédiée. Pour l'instant, on utilise le fallback JSON
            return this._getJSONData(`guilds/${guildId}/matchHistory.json`);
        } else {
            return this._getJSONData(`guilds/${guildId}/matchHistory.json`);
        }
    }

    async saveMatchHistory(guildId, historyData) {
        if (isMongoDBAvailable()) {
            // Pour l'instant, on utilise le fallback JSON
            return this._saveJSONData(`guilds/${guildId}/matchHistory.json`, historyData);
        } else {
            return this._saveJSONData(`guilds/${guildId}/matchHistory.json`, historyData);
        }
    }

    async loadMatchCounters(guildId) {
        if (isMongoDBAvailable()) {
            return this._getJSONData(`guilds/${guildId}/matchCounters.json`);
        } else {
            return this._getJSONData(`guilds/${guildId}/matchCounters.json`);
        }
    }

    async saveMatchCounters(guildId, countersData) {
        if (isMongoDBAvailable()) {
            return this._saveJSONData(`guilds/${guildId}/matchCounters.json`, countersData);
        } else {
            return this._saveJSONData(`guilds/${guildId}/matchCounters.json`, countersData);
        }
    }

    // --- MAP PROBABILITIES ---

    async loadMapProbabilities(guildId) {
        if (isMongoDBAvailable()) {
            const festival = await Festival.findOne({ guildId, isActive: true });
            if (!festival) return null;
            
            const mapProbs = await MapProbability.find({ 
                guildId, 
                festivalId: festival._id 
            });
            
            // Convertir en format attendu
            const data = {};
            mapProbs.forEach(prob => {
                if (!data[prob.teamName]) {
                    data[prob.teamName] = {};
                }
                data[prob.teamName][prob.mapKey] = prob.probability;
            });
            return Object.keys(data).length > 0 ? data : null;
        } else {
            return this._getJSONData(`guilds/${guildId}/mapProbabilities.json`);
        }
    }

    async saveMapProbabilities(guildId, probData) {
        if (isMongoDBAvailable()) {
            const festival = await Festival.findOne({ guildId, isActive: true });
            if (!festival) return;
            
            // Supprimer les anciennes probabilités
            await MapProbability.deleteMany({ 
                guildId, 
                festivalId: festival._id 
            });
            
            // Sauvegarder les nouvelles
            const probDocs = [];
            Object.entries(probData).forEach(([teamName, teamProbs]) => {
                Object.entries(teamProbs).forEach(([mapKey, probability]) => {
                    probDocs.push({
                        guildId,
                        festivalId: festival._id,
                        teamName,
                        mapKey,
                        probability
                    });
                });
            });
            
            if (probDocs.length > 0) {
                await MapProbability.insertMany(probDocs);
            }
        } else {
            return this._saveJSONData(`guilds/${guildId}/mapProbabilities.json`, probData);
        }
    }

    // --- PENDING RESULTS ---

    async loadPendingResults(guildId) {
        if (isMongoDBAvailable()) {
            return this._getJSONData(`guilds/${guildId}/pendingResults.json`);
        } else {
            return this._getJSONData(`guilds/${guildId}/pendingResults.json`);
        }
    }

    async savePendingResults(guildId, resultsData) {
        if (isMongoDBAvailable()) {
            return this._saveJSONData(`guilds/${guildId}/pendingResults.json`, resultsData);
        } else {
            return this._saveJSONData(`guilds/${guildId}/pendingResults.json`, resultsData);
        }
    }

    // --- CONFIG ---

    async loadConfig(guildId) {
        if (isMongoDBAvailable()) {
            const config = await GuildConfig.findOne({ guildId });
            if (config) {
                return {
                    announcementChannelId: config.announcementChannelId,
                    announcementRoleId: config.announcementRoleId
                };
            }
            return null;
        } else {
            return this._getJSONData(`guilds/${guildId}/config.json`);
        }
    }

    async saveConfig(guildId, configData) {
        if (isMongoDBAvailable()) {
            return await GuildConfig.findOneAndUpdate(
                { guildId },
                {
                    guildId,
                    announcementChannelId: configData.announcementChannelId,
                    announcementRoleId: configData.announcementRoleId,
                    updatedAt: new Date()
                },
                { upsert: true, new: true }
            );
        } else {
            return this._saveJSONData(`guilds/${guildId}/config.json`, configData);
        }
    }

    // --- MÉTHODES PRIVÉES POUR JSON ---

    async _getJSONData(filename) {
        try {
            const filePath = path.join(this.dataDir, filename);
            const data = await fs.readFile(filePath, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            if (error.code === 'ENOENT') {
                return null;
            }
            throw error;
        }
    }

    async _saveJSONData(filename, data) {
        try {
            const filePath = path.join(this.dataDir, filename);
            const dir = path.dirname(filePath);
            await fs.mkdir(dir, { recursive: true });
            await fs.writeFile(filePath, JSON.stringify(data, null, 2));
            return data;
        } catch (error) {
            console.error(`Error saving ${filename}:`, error);
            throw error;
        }
    }

    // --- MATCH HISTORY (instance methods) ---
    
    async getMatchHistory() {
        if (isMongoDBAvailable()) {
            // Pour MongoDB, on peut stocker l'historique dans une collection dédiée
            // Pour l'instant, utilisons le fallback JSON
            return this._getJSONData(`guilds/${this.guildId}/matchHistory.json`);
        } else {
            return this._getJSONData(`guilds/${this.guildId}/matchHistory.json`);
        }
    }
    
    async saveMatchHistory(historyData) {
        if (isMongoDBAvailable()) {
            return this._saveJSONData(`guilds/${this.guildId}/matchHistory.json`, historyData);
        } else {
            return this._saveJSONData(`guilds/${this.guildId}/matchHistory.json`, historyData);
        }
    }
    
    async getMatchCounters() {
        if (isMongoDBAvailable()) {
            return this._getJSONData(`guilds/${this.guildId}/matchCounters.json`);
        } else {
            return this._getJSONData(`guilds/${this.guildId}/matchCounters.json`);
        }
    }
    
    async saveMatchCounters(countersData) {
        if (isMongoDBAvailable()) {
            return this._saveJSONData(`guilds/${this.guildId}/matchCounters.json`, countersData);
        } else {
            return this._saveJSONData(`guilds/${this.guildId}/matchCounters.json`, countersData);
        }
    }

    // --- CONFIG (instance methods) ---
    
    async getConfig() {
        if (isMongoDBAvailable()) {
            console.log(`🔍 DataAdapter.getConfig: Recherche config pour guildId ${this.guildId}`);
            const config = await GuildConfig.findOne({ guildId: this.guildId });
            console.log('🔍 DataAdapter.getConfig: Config trouvée:', config ? JSON.stringify(config, null, 2) : 'null');
            
            if (config) {
                const result = {
                    announcementChannelId: config.announceChannelId,
                    announcementRoleId: config.adminRoleId
                };
                console.log('🔍 DataAdapter.getConfig: Retour:', JSON.stringify(result, null, 2));
                return result;
            }
            console.log('🔍 DataAdapter.getConfig: Aucune config trouvée, retour null');
            return null;
        } else {
            return this._getJSONData(`guilds/${this.guildId}/config.json`);
        }
    }

    async saveConfig(configData) {
        if (isMongoDBAvailable()) {
            console.log(`🔍 DataAdapter.saveConfig: Sauvegarde pour guildId ${this.guildId}`);
            console.log('🔍 DataAdapter.saveConfig: Données à sauvegarder:', JSON.stringify(configData, null, 2));
            
            const result = await GuildConfig.findOneAndUpdate(
                { guildId: this.guildId },
                {
                    guildId: this.guildId,
                    announceChannelId: configData.announcementChannelId,
                    adminRoleId: configData.announcementRoleId,
                    updatedAt: new Date()
                },
                { upsert: true, new: true }
            );
            
            console.log('🔍 DataAdapter.saveConfig: Résultat sauvegarde:', result ? JSON.stringify(result, null, 2) : 'null');
            return result;
        } else {
            return this._saveJSONData(`guilds/${this.guildId}/config.json`, configData);
        }
    }

    // --- MAP PROBABILITIES (instance methods) ---
    
    async getMapProbabilities() {
        if (isMongoDBAvailable()) {
            // Pour l'instant, utilisons le fallback JSON même avec MongoDB
            return this._getJSONData(`guilds/${this.guildId}/mapProbabilities.json`);
        } else {
            return this._getJSONData(`guilds/${this.guildId}/mapProbabilities.json`);
        }
    }
    
    async saveMapProbabilities(probData) {
        if (isMongoDBAvailable()) {
            return this._saveJSONData(`guilds/${this.guildId}/mapProbabilities.json`, probData);
        } else {
            return this._saveJSONData(`guilds/${this.guildId}/mapProbabilities.json`, probData);
        }
    }

    // --- NETTOYAGE ---

    async cleanup() {
        if (isMongoDBAvailable()) {
            const festival = await this.getFestival();
            if (festival) {
                // Supprimer toutes les données liées au festival
                await Team.deleteMany({ guildId: this.guildId, festivalId: festival._id });
                await Vote.deleteMany({ guildId: this.guildId, festivalId: festival._id });
                await Match.deleteMany({ guildId: this.guildId, festivalId: festival._id });
                await CampScore.deleteMany({ guildId: this.guildId, festivalId: festival._id });
                await MapProbability.deleteMany({ guildId: this.guildId, festivalId: festival._id });
                await Festival.findByIdAndDelete(festival._id);
            }
        } else {
            // Nettoyage JSON
            const files = ['festivals.json', 'teams.json', 'votes.json', 'matchHistory.json', 'scores.json'];
            for (const file of files) {
                try {
                    const filePath = path.join(this.dataDir, file);
                    await fs.unlink(filePath);
                } catch (error) {
                    // Fichier n'existe pas, pas grave
                }
            }
        }
    }
}

module.exports = DataAdapter;
