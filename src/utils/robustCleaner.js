// src/utils/robustCleaner.js - Nettoyage robuste anti-duplication
const { Festival, Team, Vote, Match, CampScore, MapProbability, PendingResult, MatchHistory, TeamMatchCounter } = require('../models/mongodb');

/**
 * Nettoyage complet et robuste d'un serveur Discord
 * Supprime toutes les duplications et données orphelines
 */
class RobustCleaner {
    constructor(guildId) {
        this.guildId = guildId;
    }

    /**
     * Nettoyage complet d'un serveur - À utiliser avec précaution !
     */
    async cleanupGuild() {
        console.log(`🧹 DÉBUT nettoyage robuste pour guild: ${this.guildId}`);
        
        const results = {
            festivals: 0,
            teams: 0,
            votes: 0,
            matches: 0,
            campScores: 0,
            mapProbabilities: 0,
            pendingResults: 0,
            matchHistory: 0,
            teamCounters: 0,
            duplicatesRemoved: 0
        };

        try {
            // 1. Supprimer les festivals (cascade vers les autres données)
            const festivalResult = await Festival.deleteMany({ guildId: this.guildId });
            results.festivals = festivalResult.deletedCount;
            console.log(`🗑️ ${results.festivals} festivals supprimés`);

            // 2. Supprimer toutes les équipes (même orphelines)
            const teamResult = await Team.deleteMany({ guildId: this.guildId });
            results.teams = teamResult.deletedCount;
            console.log(`🗑️ ${results.teams} équipes supprimées`);

            // 3. Supprimer tous les votes (même les doublons)
            const voteResult = await Vote.deleteMany({ guildId: this.guildId });
            results.votes = voteResult.deletedCount;
            console.log(`🗑️ ${results.votes} votes supprimés`);

            // 4. Supprimer tous les matchs
            const matchResult = await Match.deleteMany({ guildId: this.guildId });
            results.matches = matchResult.deletedCount;
            console.log(`🗑️ ${results.matches} matchs supprimés`);

            // 5. Supprimer tous les scores de camp
            const scoreResult = await CampScore.deleteMany({ guildId: this.guildId });
            results.campScores = scoreResult.deletedCount;
            console.log(`🗑️ ${results.campScores} scores de camp supprimés`);

            // 6. Supprimer toutes les probabilités de maps
            const mapResult = await MapProbability.deleteMany({ guildId: this.guildId });
            results.mapProbabilities = mapResult.deletedCount;
            console.log(`🗑️ ${results.mapProbabilities} probabilités de maps supprimées`);

            // 7. Supprimer tous les résultats en attente
            const pendingResult = await PendingResult.deleteMany({ guildId: this.guildId });
            results.pendingResults = pendingResult.deletedCount;
            console.log(`🗑️ ${results.pendingResults} résultats en attente supprimés`);

            // 8. Supprimer tout l'historique des matchs
            const historyResult = await MatchHistory.deleteMany({ guildId: this.guildId });
            results.matchHistory = historyResult.deletedCount;
            console.log(`🗑️ ${results.matchHistory} historiques de matchs supprimés`);

            // 9. Supprimer tous les compteurs d'équipes
            const counterResult = await TeamMatchCounter.deleteMany({ guildId: this.guildId });
            results.teamCounters = counterResult.deletedCount;
            console.log(`🗑️ ${results.teamCounters} compteurs d'équipes supprimés`);

            console.log(`✅ NETTOYAGE ROBUSTE TERMINÉ pour guild: ${this.guildId}`);
            return results;

        } catch (error) {
            console.error(`❌ Erreur lors du nettoyage robuste:`, error);
            throw error;
        }
    }

    /**
     * Nettoyage intelligent qui préserve les données actives
     * Supprime seulement les duplicatas et orphelins
     */
    async cleanupDuplicatesOnly() {
        console.log(`🔧 DÉBUT suppression duplicatas pour guild: ${this.guildId}`);
        
        const results = {
            orphanTeams: 0,
            duplicateVotes: 0,
            inactiveFestivals: 0,
            orphanMatches: 0
        };

        try {
            // 1. Supprimer les équipes orphelines (sans festivalId)
            const orphanTeams = await Team.deleteMany({ 
                guildId: this.guildId, 
                festivalId: null 
            });
            results.orphanTeams = orphanTeams.deletedCount;
            console.log(`🗑️ ${results.orphanTeams} équipes orphelines supprimées`);

            // 2. Supprimer les votes en double (garder le plus récent)
            const votes = await Vote.find({ guildId: this.guildId }).sort({ votedAt: -1 });
            const seenUsers = new Set();
            const duplicateVoteIds = [];
            
            votes.forEach(vote => {
                if (seenUsers.has(vote.userId)) {
                    duplicateVoteIds.push(vote._id);
                } else {
                    seenUsers.add(vote.userId);
                }
            });
            
            if (duplicateVoteIds.length > 0) {
                const duplicateVotesResult = await Vote.deleteMany({ _id: { $in: duplicateVoteIds } });
                results.duplicateVotes = duplicateVotesResult.deletedCount;
                console.log(`🗑️ ${results.duplicateVotes} votes en double supprimés`);
            }

            // 3. Supprimer les festivals inactifs anciens (plus de 7 jours)
            const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
            const oldFestivals = await Festival.deleteMany({
                guildId: this.guildId,
                isActive: false,
                $or: [
                    { endTime: { $lt: weekAgo } },
                    { endDate: { $lt: weekAgo } }
                ]
            });
            results.inactiveFestivals = oldFestivals.deletedCount;
            console.log(`🗑️ ${results.inactiveFestivals} anciens festivals supprimés`);

            // 4. Supprimer les matchs orphelins (sans équipes existantes)
            const matches = await Match.find({ guildId: this.guildId });
            const orphanMatchIds = [];
            
            for (const match of matches) {
                const team1Exists = await Team.findById(match.team1Id);
                const team2Exists = await Team.findById(match.team2Id);
                
                if (!team1Exists || !team2Exists) {
                    orphanMatchIds.push(match._id);
                }
            }
            
            if (orphanMatchIds.length > 0) {
                const orphanMatches = await Match.deleteMany({ _id: { $in: orphanMatchIds } });
                results.orphanMatches = orphanMatches.deletedCount;
                console.log(`🗑️ ${results.orphanMatches} matchs orphelins supprimés`);
            }

            console.log(`✅ SUPPRESSION DUPLICATAS TERMINÉE pour guild: ${this.guildId}`);
            return results;

        } catch (error) {
            console.error(`❌ Erreur lors de la suppression des duplicatas:`, error);
            throw error;
        }
    }

    /**
     * Diagnostic complet des problèmes de duplication
     */
    async diagnose() {
        console.log(`🔍 DIAGNOSTIC pour guild: ${this.guildId}`);
        
        try {
            const diagnostic = {
                totalFestivals: await Festival.countDocuments({ guildId: this.guildId }),
                activeFestivals: await Festival.countDocuments({ guildId: this.guildId, isActive: true }),
                totalTeams: await Team.countDocuments({ guildId: this.guildId }),
                orphanTeams: await Team.countDocuments({ guildId: this.guildId, festivalId: null }),
                totalVotes: await Vote.countDocuments({ guildId: this.guildId }),
                totalMatches: await Match.countDocuments({ guildId: this.guildId })
            };

            // Compter les votes en double
            const votes = await Vote.find({ guildId: this.guildId });
            const userVotes = {};
            votes.forEach(vote => {
                userVotes[vote.userId] = (userVotes[vote.userId] || 0) + 1;
            });
            diagnostic.duplicateVotes = Object.values(userVotes).filter(count => count > 1).length;

            console.log(`📊 DIAGNOSTIC TERMINÉ:`, diagnostic);
            return diagnostic;

        } catch (error) {
            console.error(`❌ Erreur lors du diagnostic:`, error);
            throw error;
        }
    }
}

module.exports = RobustCleaner;