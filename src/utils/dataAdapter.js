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

            const scoresObj = {};
            scores.forEach(score => {
                scoresObj[score.camp] = {
                    totalPoints: score.totalPoints,
                    matchesWon: score.matchesWon,
                    matchesLost: score.matchesLost,
                    teamsCount: score.teamsCount,
                    votesCount: score.votesCount
                };
            });
            return scoresObj;
        } else {
            return this._getJSONData('scores.json') || {};
        }
    }

    async updateScore(camp, scoreData) {
        if (isMongoDBAvailable()) {
            const festival = await this.getFestival();
            if (!festival) throw new Error('No active festival');

            return await CampScore.findOneAndUpdate(
                { guildId: this.guildId, festivalId: festival._id, camp },
                { ...scoreData, lastUpdated: new Date() },
                { upsert: true, new: true }
            );
        } else {
            const scores = await this.getScores();
            scores[camp] = { ...scores[camp], ...scoreData };
            return this._saveJSONData('scores.json', scores);
        }
    }

    // --- CONFIGURATION ---

    async getGuildConfig() {
        if (isMongoDBAvailable()) {
            return await GuildConfig.findOne({ guildId: this.guildId });
        } else {
            return this._getJSONData('config.json') || {};
        }
    }

    async saveGuildConfig(configData) {
        if (isMongoDBAvailable()) {
            return await GuildConfig.findOneAndUpdate(
                { guildId: this.guildId },
                { ...configData, updatedAt: new Date() },
                { upsert: true, new: true }
            );
        } else {
            return this._saveJSONData('config.json', configData);
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
            await fs.mkdir(this.dataDir, { recursive: true });
            const filePath = path.join(this.dataDir, filename);
            await fs.writeFile(filePath, JSON.stringify(data, null, 2));
            return data;
        } catch (error) {
            console.error(`Error saving ${filename}:`, error);
            throw error;
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
