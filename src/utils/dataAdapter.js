const { isMongoDBAvailable } = require('./database');
const { Festival, Team, Vote, Match, CampScore, MapProbability, PendingResult, MatchHistory, TeamMatchCounter, GuildConfig } = require('../models/mongodb');
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
            // Supprimer complètement tous les anciens festivals pour un reset complet
            await Festival.deleteMany({ guildId: this.guildId });
            console.log('Anciens festivals supprimés pour reset complet');
            
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

    async deleteFestival(guildId) {
        if (isMongoDBAvailable()) {
            return await Festival.deleteMany({ guildId: guildId });
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

            // UPSERT basé sur le nom d'équipe (unique dans un festival)
            return await Team.findOneAndUpdate(
                { 
                    guildId: this.guildId,
                    festivalId: festival._id,
                    name: teamData.name
                },
                {
                    ...teamData,
                    guildId: this.guildId,
                    festivalId: festival._id,
                    updatedAt: new Date()
                },
                { 
                    upsert: true,  // Créer si n'existe pas
                    new: true      // Retourner le document mis à jour
                }
            );
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

    async clearAllTeams() {
        if (isMongoDBAvailable()) {
            console.log(`🔍 clearAllTeams: Début suppression pour guildId: ${this.guildId}`);
            
            // D'abord, compter les équipes existantes
            const countBefore = await Team.countDocuments({ guildId: this.guildId });
            console.log(`🔍 clearAllTeams: ${countBefore} équipes trouvées pour guildId ${this.guildId}`);
            
            // Lister les équipes pour debug
            if (countBefore > 0) {
                const teams = await Team.find({ guildId: this.guildId });
                console.log(`🔍 clearAllTeams: Équipes à supprimer:`);
                teams.forEach((team, index) => {
                    console.log(`  ${index + 1}. ${team.name} (ID: ${team._id}, Festival: ${team.festivalId})`);
                });
            }
            
            // Supprimer TOUTES les équipes du serveur, peu importe le festival
            const result = await Team.deleteMany({ guildId: this.guildId });
            console.log(`🗑️ clearAllTeams: ${result.deletedCount} équipes supprimées de MongoDB pour le serveur ${this.guildId} (tous festivals confondus)`);
            
            // Vérifier après suppression
            const countAfter = await Team.countDocuments({ guildId: this.guildId });
            console.log(`🔍 clearAllTeams: ${countAfter} équipes restantes après suppression`);
            
            return result;
        } else {
            await this._saveJSONData('teams.json', {});
            console.log('🗑️ Toutes les équipes supprimées du fichier JSON');
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

    async clearAllVotes() {
        if (isMongoDBAvailable()) {
            const result = await Vote.deleteMany({ guildId: this.guildId });
            console.log(`🗑️ ${result.deletedCount} votes supprimés de MongoDB pour le serveur ${this.guildId}`);
            return result;
        } else {
            await this._saveJSONData('votes.json', {});
            console.log('🗑️ Tous les votes supprimés du fichier JSON');
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

    async clearAllMatches() {
        if (isMongoDBAvailable()) {
            const result = await Match.deleteMany({ guildId: this.guildId });
            console.log(`🗑️ ${result.deletedCount} matchs supprimés de MongoDB pour le serveur ${this.guildId}`);
            return result;
        } else {
            await this._saveJSONData('matchHistory.json', []);
            console.log('🗑️ Tous les matchs supprimés du fichier JSON');
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

    async clearAllScores() {
        if (isMongoDBAvailable()) {
            const result = await CampScore.deleteMany({ guildId: this.guildId });
            console.log(`🗑️ ${result.deletedCount} scores supprimés de MongoDB pour le serveur ${this.guildId}`);
            return result;
        } else {
            await this._saveJSONData('scores.json', {});
            console.log('🗑️ Tous les scores supprimés du fichier JSON');
        }
    }

    // --- MATCH HISTORY ---

    async loadMatchHistory(guildId) {
        if (isMongoDBAvailable()) {
            const festival = await this.getFestival();
            if (!festival) return [];

            const matches = await MatchHistory.find({ 
                guildId: guildId || this.guildId, 
                festivalId: festival._id 
            }).sort({ matchNumber: 1 });

            // Convertir en format JSON attendu
            return matches.map(match => ({
                timestamp: match.timestamp.getTime(),
                team1: match.team1,
                team2: match.team2,
                winner: match.winner,
                multiplier: match.multiplier,
                pointsAwarded: match.pointsAwarded,
                bo3Maps: match.bo3Maps
            }));
        } else {
            return this._getJSONData(`guilds/${guildId}/matchHistory.json`);
        }
    }

    async saveMatchHistory(guildId, historyData) {
        if (isMongoDBAvailable()) {
            const festival = await this.getFestival();
            if (!festival) throw new Error('No active festival');

            // Supprimer l'ancien historique
            await MatchHistory.deleteMany({ 
                guildId: guildId || this.guildId, 
                festivalId: festival._id 
            });

            // Sauvegarder le nouvel historique
            const historyDocs = historyData.map((match, index) => ({
                guildId: guildId || this.guildId,
                festivalId: festival._id,
                matchNumber: index + 1,
                timestamp: new Date(match.timestamp),
                team1: match.team1,
                team2: match.team2,
                winner: match.winner,
                multiplier: match.multiplier || 1,
                pointsAwarded: match.pointsAwarded || 1,
                bo3Maps: match.bo3Maps || []
            }));

            if (historyDocs.length > 0) {
                await MatchHistory.insertMany(historyDocs);
            }
            return historyData;
        } else {
            return this._saveJSONData(`guilds/${guildId}/matchHistory.json`, historyData);
        }
    }

    async clearAllMatchHistory() {
        if (isMongoDBAvailable()) {
            const result = await MatchHistory.deleteMany({ guildId: this.guildId });
            console.log(`🗑️ ${result.deletedCount} entrées d'historique supprimées de MongoDB pour le serveur ${this.guildId}`);
            return result;
        } else {
            await this._saveJSONData(`guilds/${this.guildId}/matchHistory.json`, []);
            console.log('🗑️ Historique des matchs supprimé du fichier JSON');
        }
    }

    async loadMatchCounters(guildId) {
        if (isMongoDBAvailable()) {
            const festival = await this.getFestival();
            if (!festival) return {};

            const counters = await TeamMatchCounter.find({ 
                guildId: guildId || this.guildId, 
                festivalId: festival._id 
            });

            // Convertir en format JSON attendu
            const countersObj = {};
            counters.forEach(counter => {
                countersObj[counter.teamName] = {
                    matchCount: counter.matchCount,
                    waitTime: counter.waitTime,
                    lastMatchTime: counter.lastMatchTime ? counter.lastMatchTime.getTime() : null
                };
            });
            return countersObj;
        } else {
            return this._getJSONData(`guilds/${guildId}/matchCounters.json`);
        }
    }

    async saveMatchCounters(guildId, countersData) {
        if (isMongoDBAvailable()) {
            const festival = await this.getFestival();
            if (!festival) throw new Error('No active festival');

            // Supprimer les anciens compteurs
            await TeamMatchCounter.deleteMany({ 
                guildId: guildId || this.guildId, 
                festivalId: festival._id 
            });

            // Sauvegarder les nouveaux
            const counterDocs = Object.entries(countersData).map(([teamName, data]) => ({
                guildId: guildId || this.guildId,
                festivalId: festival._id,
                teamName,
                matchCount: data.matchCount || 0,
                waitTime: data.waitTime || 0,
                lastMatchTime: data.lastMatchTime ? new Date(data.lastMatchTime) : null
            }));

            if (counterDocs.length > 0) {
                await TeamMatchCounter.insertMany(counterDocs);
            }
            return countersData;
        } else {
            return this._saveJSONData(`guilds/${guildId}/matchCounters.json`, countersData);
        }
    }

    async clearAllMatchCounters() {
        if (isMongoDBAvailable()) {
            const result = await TeamMatchCounter.deleteMany({ guildId: this.guildId });
            console.log(`🗑️ ${result.deletedCount} compteurs de matchs supprimés de MongoDB pour le serveur ${this.guildId}`);
            return result;
        } else {
            await this._saveJSONData(`guilds/${this.guildId}/matchCounters.json`, {});
            console.log('🗑️ Compteurs de matchs supprimés du fichier JSON');
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
                if (!teamName || teamName === 'null' || !teamProbs) {
                    console.warn(`⚠️ MapProbability: teamName ou teamProbs invalide`, { teamName, teamProbs });
                    return;
                }
                Object.entries(teamProbs).forEach(([mapKey, probability]) => {
                    if (!mapKey || mapKey === 'null' || probability === null || probability === undefined) {
                        console.warn(`⚠️ MapProbability: mapKey ou probability invalide`, { teamName, mapKey, probability });
                        return;
                    }
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

    async clearAllMapProbabilities() {
        if (isMongoDBAvailable()) {
            const result = await MapProbability.deleteMany({ guildId: this.guildId });
            console.log(`🗑️ ${result.deletedCount} probabilités de cartes supprimées de MongoDB pour le serveur ${this.guildId}`);
            return result;
        } else {
            await this._saveJSONData(`guilds/${this.guildId}/mapProbabilities.json`, {});
            console.log('🗑️ Toutes les probabilités de cartes supprimées du fichier JSON');
        }
    }

    // --- PENDING RESULTS ---

    async loadPendingResults(guildId) {
        if (isMongoDBAvailable()) {
            const festival = await this.getFestival();
            if (!festival) return {};

            const pendingResults = await PendingResult.find({ 
                guildId: guildId || this.guildId, 
                festivalId: festival._id,
                status: 'pending'
            });

            // Convertir en format JSON attendu
            const resultsObj = {};
            pendingResults.forEach(result => {
                resultsObj[result.matchId] = {
                    declaringTeam: result.declaringTeam,
                    opponentTeam: result.opponentTeam,
                    declaringTeamResult: result.declaringTeamResult,
                    opponentTeamResult: result.opponentTeamResult,
                    timestamp: result.timestamp.getTime()
                };
            });
            return resultsObj;
        } else {
            return this._getJSONData(`guilds/${guildId}/pendingResults.json`);
        }
    }

    async savePendingResults(guildId, resultsData) {
        if (isMongoDBAvailable()) {
            const festival = await this.getFestival();
            if (!festival) {
                console.error('❌ savePendingResults: Aucun festival actif trouvé pour guildId:', guildId || this.guildId);
                throw new Error('No active festival');
            }

            console.log(`🔍 savePendingResults: Festival trouvé: ${festival.title} (ID: ${festival._id})`);

            // Supprimer les anciens résultats en attente
            await PendingResult.deleteMany({ 
                guildId: guildId || this.guildId, 
                festivalId: festival._id 
            });

            // Sauvegarder les nouveaux
            const resultDocs = Object.entries(resultsData).map(([matchId, data]) => ({
                guildId: guildId || this.guildId,
                festivalId: festival._id,
                matchId,
                declaringTeam: data.declaringTeam,
                opponentTeam: data.opponentTeam,
                declaringTeamResult: data.declaringTeamResult,
                opponentTeamResult: data.opponentTeamResult,
                timestamp: new Date(data.timestamp),
                expiresAt: new Date(Date.now() + (10 * 60 * 1000)) // Expire dans 10 minutes
            }));

            if (resultDocs.length > 0) {
                await PendingResult.insertMany(resultDocs);
            }
            return resultsData;
        } else {
            return this._saveJSONData(`guilds/${guildId}/pendingResults.json`, resultsData);
        }
    }

    async clearAllPendingResults() {
        if (isMongoDBAvailable()) {
            const result = await PendingResult.deleteMany({ guildId: this.guildId });
            console.log(`🗑️ ${result.deletedCount} résultats en attente supprimés de MongoDB pour le serveur ${this.guildId}`);
            return result;
        } else {
            await this._saveJSONData(`guilds/${this.guildId}/pendingResults.json`, {});
            console.log('🗑️ Tous les résultats en attente supprimés du fichier JSON');
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
                    announcementChannelId: config.announceChannelId || undefined,
                    announcementRoleId: config.adminRoleId || undefined,
                    settings: config.settings || undefined
                };
                
                // Nettoyer les undefined
                Object.keys(result).forEach(key => {
                    if (result[key] === undefined) {
                        delete result[key];
                    }
                });
                
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
            const festival = await this.getFestival();
            if (!festival) return {};

            const mapProbs = await MapProbability.find({ 
                guildId: this.guildId, 
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
            return data;
        } else {
            return this._getJSONData(`guilds/${this.guildId}/mapProbabilities.json`);
        }
    }
    
    async saveMapProbabilities(probData) {
        if (isMongoDBAvailable()) {
            const festival = await this.getFestival();
            if (!festival) throw new Error('No active festival');
            
            console.log(`🔍 saveMapProbabilities: Festival trouvé: ${festival.title} (ID: ${festival._id})`);
            
            // Utiliser des opérations upsert pour éviter les erreurs de clés dupliquées
            const operations = [];
            Object.entries(probData).forEach(([teamName, teamProbs]) => {
                if (!teamName || teamName === 'null' || teamName === 'undefined' || !teamProbs) {
                    console.warn(`⚠️ MapProbability: teamName ou teamProbs invalide`, { teamName, teamProbs });
                    return;
                }
                Object.entries(teamProbs).forEach(([mapKey, probability]) => {
                    if (!mapKey || mapKey === 'null' || mapKey === 'undefined' || probability === null || probability === undefined) {
                        console.warn(`⚠️ MapProbability: mapKey ou probability invalide`, { teamName, mapKey, probability });
                        return;
                    }
                    
                    // Utiliser updateOne avec upsert pour éviter les doublons
                    operations.push({
                        updateOne: {
                            filter: {
                                guildId: this.guildId,
                                festivalId: festival._id,
                                teamName: teamName,
                                mapKey: mapKey
                            },
                            update: {
                                $set: {
                                    guildId: this.guildId,
                                    festivalId: festival._id,
                                    teamName: teamName,
                                    mapKey: mapKey,
                                    probability: Number(probability),
                                    lastUpdated: new Date()
                                }
                            },
                            upsert: true
                        }
                    });
                });
            });
            
            if (operations.length > 0) {
                console.log(`📝 Sauvegarde de ${operations.length} probabilités via bulkWrite`);
                const result = await MapProbability.bulkWrite(operations);
                console.log(`✅ BulkWrite terminé: ${result.upsertedCount} créés, ${result.modifiedCount} modifiés`);
            }
            return probData;
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
                await PendingResult.deleteMany({ guildId: this.guildId, festivalId: festival._id });
                await MatchHistory.deleteMany({ guildId: this.guildId, festivalId: festival._id });
                await TeamMatchCounter.deleteMany({ guildId: this.guildId, festivalId: festival._id });
                await Festival.findByIdAndDelete(festival._id);
            }
            
            // Supprimer aussi la configuration du serveur
            await GuildConfig.deleteMany({ guildId: this.guildId });
            console.log('✅ Configuration du serveur supprimée');
        } else {
            // Nettoyage JSON
            const files = ['festivals.json', 'teams.json', 'votes.json', 'matchHistory.json', 'scores.json', 'config.json'];
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
