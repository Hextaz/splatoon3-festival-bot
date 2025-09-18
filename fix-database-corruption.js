const { connectMongoDB } = require('./src/utils/database');
const { Team, Vote, MapProbability, Festival, PendingResult, MatchHistory, MatchCounter } = require('./src/models/mongodb');

async function fixDatabaseCorruption() {
    console.log('🧹 ===== NETTOYAGE COMPLET DE LA BASE DE DONNÉES =====');
    
    // Initialiser la connexion MongoDB
    console.log('🔗 Connexion à MongoDB...');
    await connectMongoDB();
    console.log('✅ Connecté à MongoDB');
    
    const guildId = '832335212419219506'; // Votre guild ID
    
    try {
        // 1. Supprimer tous les MapProbabilities corrompus (avec teamId/mapMode null)
        console.log('🗺️ Nettoyage des MapProbabilities corrompus...');
        const corruptedMaps = await MapProbability.deleteMany({
            guildId,
            $or: [
                { teamName: null },
                { teamName: { $exists: false } },
                { mapKey: null },
                { mapKey: { $exists: false } }
            ]
        });
        console.log(`✅ ${corruptedMaps.deletedCount} MapProbabilities corrompus supprimés`);
        
        // 2. Supprimer TOUS les MapProbabilities pour repartir à zéro
        console.log('🗺️ Suppression de tous les MapProbabilities pour reset complet...');
        const allMaps = await MapProbability.deleteMany({ guildId });
        console.log(`✅ ${allMaps.deletedCount} MapProbabilities supprimés`);
        
        // 3. Nettoyer les votes en double (garder le plus récent pour chaque utilisateur)
        console.log('🗳️ Nettoyage des votes en double...');
        const votes = await Vote.find({ guildId }).sort({ createdAt: -1 });
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
            const duplicateVotesDeleted = await Vote.deleteMany({ _id: { $in: duplicateVoteIds } });
            console.log(`✅ ${duplicateVotesDeleted.deletedCount} votes en double supprimés`);
        } else {
            console.log('✅ Aucun vote en double trouvé');
        }
        
        // 4. Supprimer les équipes sans festivalId
        console.log('👥 Nettoyage des équipes orphelines...');
        const orphanTeams = await Team.deleteMany({
            guildId,
            $or: [
                { festivalId: null },
                { festivalId: { $exists: false } }
            ]
        });
        console.log(`✅ ${orphanTeams.deletedCount} équipes orphelines supprimées`);
        
        // 5. Nettoyer les anciens festivals (garder seulement le plus récent actif)
        console.log('🎉 Nettoyage des anciens festivals...');
        const festivals = await Festival.find({ guildId }).sort({ createdAt: -1 });
        const activeFestival = festivals.find(f => f.isActive);
        
        // Supprimer tous les festivals sauf le festival actif le plus récent
        const festivalsToDelete = festivals.filter(f => f._id.toString() !== activeFestival?._id.toString());
        if (festivalsToDelete.length > 0) {
            const festivalIds = festivalsToDelete.map(f => f._id);
            const deletedFestivals = await Festival.deleteMany({ _id: { $in: festivalIds } });
            console.log(`✅ ${deletedFestivals.deletedCount} anciens festivals supprimés`);
        } else {
            console.log('✅ Aucun ancien festival à supprimer');
        }
        
        // 6. Nettoyer toutes les autres collections liées
        console.log('🧹 Nettoyage des données associées...');
        
        const pendingResults = await PendingResult.deleteMany({ guildId });
        console.log(`✅ ${pendingResults.deletedCount} résultats en attente supprimés`);
        
        const matchHistory = await MatchHistory.deleteMany({ guildId });
        console.log(`✅ ${matchHistory.deletedCount} entrées d'historique supprimées`);
        
        const matchCounters = await MatchCounter.deleteMany({ guildId });
        console.log(`✅ ${matchCounters.deletedCount} compteurs de matchs supprimés`);
        
        console.log('\n✅ ===== NETTOYAGE TERMINÉ =====');
        console.log('📊 État final:');
        
        const finalStats = {
            teams: await Team.countDocuments({ guildId }),
            votes: await Vote.countDocuments({ guildId }),
            festivals: await Festival.countDocuments({ guildId }),
            mapProbabilities: await MapProbability.countDocuments({ guildId }),
            pendingResults: await PendingResult.countDocuments({ guildId }),
            matchHistory: await MatchHistory.countDocuments({ guildId }),
            matchCounters: await MatchCounter.countDocuments({ guildId })
        };
        
        console.log('- Équipes:', finalStats.teams);
        console.log('- Votes:', finalStats.votes);
        console.log('- Festivals:', finalStats.festivals);
        console.log('- Map Probabilities:', finalStats.mapProbabilities);
        console.log('- Résultats en attente:', finalStats.pendingResults);
        console.log('- Historique des matchs:', finalStats.matchHistory);
        console.log('- Compteurs de matchs:', finalStats.matchCounters);
        
    } catch (error) {
        console.error('❌ Erreur lors du nettoyage:', error);
        throw error;
    }
}

// Exécuter si ce script est lancé directement
if (require.main === module) {
    fixDatabaseCorruption()
        .then(() => {
            console.log('🎉 Nettoyage terminé avec succès!');
            process.exit(0);
        })
        .catch(error => {
            console.error('💥 Échec du nettoyage:', error);
            process.exit(1);
        });
}

module.exports = { fixDatabaseCorruption };
