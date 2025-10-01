// fix-duplicate-teams.js - Script pour nettoyer les doublons d'équipes
require('dotenv').config();
const { connectMongoDB } = require('./src/utils/database');
const { Team } = require('./src/models/mongodb');

async function fixDuplicateTeams() {
    console.log('🔧 NETTOYAGE DES DOUBLONS D\'ÉQUIPES');
    console.log('===================================');

    try {
        // Se connecter à MongoDB
        await connectMongoDB();
        console.log('✅ Connecté à MongoDB');

        // Trouver tous les doublons
        const duplicates = await Team.aggregate([
            {
                $group: {
                    _id: {
                        guildId: '$guildId',
                        festivalId: '$festivalId',
                        name: '$name'
                    },
                    count: { $sum: 1 },
                    docs: { $push: '$_id' }
                }
            },
            {
                $match: {
                    count: { $gt: 1 }
                }
            }
        ]);

        console.log(`🔍 ${duplicates.length} groupes de doublons trouvés`);

        let totalRemoved = 0;

        for (const duplicate of duplicates) {
            const { guildId, festivalId, name } = duplicate._id;
            const docIds = duplicate.docs;
            
            console.log(`\n📋 Équipe "${name}" (Guild: ${guildId}): ${duplicate.count} doublons`);
            
            // Garder le premier (plus ancien) et supprimer les autres
            const toKeep = docIds[0];
            const toRemove = docIds.slice(1);
            
            console.log(`   ✅ Garder: ${toKeep}`);
            console.log(`   🗑️ Supprimer: ${toRemove.join(', ')}`);
            
            // Supprimer les doublons
            const result = await Team.deleteMany({ _id: { $in: toRemove } });
            totalRemoved += result.deletedCount;
            console.log(`   ✅ ${result.deletedCount} doublons supprimés`);
        }

        console.log(`\n✅ Nettoyage terminé: ${totalRemoved} doublons supprimés`);
        
        // Vérifier qu'il n'y a plus de doublons
        const remainingDuplicates = await Team.aggregate([
            {
                $group: {
                    _id: {
                        guildId: '$guildId',
                        festivalId: '$festivalId',
                        name: '$name'
                    },
                    count: { $sum: 1 }
                }
            },
            {
                $match: {
                    count: { $gt: 1 }
                }
            }
        ]);

        if (remainingDuplicates.length === 0) {
            console.log('✅ Aucun doublon restant - Nettoyage réussi !');
        } else {
            console.warn(`⚠️ ${remainingDuplicates.length} doublons encore présents`);
        }

        // Créer l'index unique pour empêcher de futurs doublons
        try {
            await Team.collection.createIndex(
                { guildId: 1, festivalId: 1, name: 1 }, 
                { unique: true }
            );
            console.log('✅ Index unique créé avec succès');
        } catch (error) {
            if (error.code === 11000) {
                console.log('ℹ️ Index unique déjà existant');
            } else {
                console.error('❌ Erreur lors de la création de l\'index:', error.message);
            }
        }

    } catch (error) {
        console.error('❌ Erreur lors du nettoyage:', error);
    }

    process.exit(0);
}

// Fonction pour analyser sans supprimer
async function analyzeDuplicates() {
    console.log('🔍 ANALYSE DES DOUBLONS D\'ÉQUIPES (SANS SUPPRESSION)');
    console.log('====================================================');

    try {
        await connectMongoDB();
        console.log('✅ Connecté à MongoDB');

        // Compter le total d'équipes
        const totalTeams = await Team.countDocuments();
        console.log(`📊 Total d'équipes: ${totalTeams}`);

        // Analyser les doublons par guild
        const duplicatesByGuild = await Team.aggregate([
            {
                $group: {
                    _id: {
                        guildId: '$guildId',
                        festivalId: '$festivalId',
                        name: '$name'
                    },
                    count: { $sum: 1 },
                    teams: { $push: { _id: '$_id', createdAt: '$createdAt', members: '$members' } }
                }
            },
            {
                $match: {
                    count: { $gt: 1 }
                }
            },
            {
                $group: {
                    _id: '$_id.guildId',
                    duplicates: { $push: '$$ROOT' },
                    totalDuplicates: { $sum: '$count' }
                }
            }
        ]);

        console.log(`\n📋 Analyse par serveur Discord:`);
        for (const guild of duplicatesByGuild) {
            console.log(`\nServeur ${guild._id}:`);
            console.log(`  📊 ${guild.duplicates.length} équipes avec doublons`);
            console.log(`  🔢 Total d'entrées dupliquées: ${guild.totalDuplicates}`);
            
            for (const duplicate of guild.duplicates) {
                const { name, festivalId } = duplicate._id;
                console.log(`    - "${name}" (Festival: ${festivalId}): ${duplicate.count} copies`);
            }
        }

        // Estimer l'espace récupérable
        const totalDuplicatedEntries = duplicatesByGuild.reduce((sum, guild) => sum + guild.totalDuplicates, 0);
        const uniqueTeams = duplicatesByGuild.reduce((sum, guild) => sum + guild.duplicates.length, 0);
        const entriestoRemove = totalDuplicatedEntries - uniqueTeams;

        console.log(`\n💾 Estimation de nettoyage:`);
        console.log(`   📊 Entrées à supprimer: ${entriestoRemove}`);
        console.log(`   📊 Entrées à conserver: ${totalTeams - entriestoRemove}`);
        console.log(`   💾 Espace récupéré: ~${Math.round((entriestoRemove / totalTeams) * 100)}%`);

    } catch (error) {
        console.error('❌ Erreur lors de l\'analyse:', error);
    }

    process.exit(0);
}

// Choisir le mode selon l'argument
const mode = process.argv[2];

if (mode === '--analyze' || mode === '-a') {
    analyzeDuplicates();
} else if (mode === '--fix' || mode === '-f') {
    fixDuplicateTeams();
} else {
    console.log('Usage:');
    console.log('  node fix-duplicate-teams.js --analyze   # Analyser sans supprimer');
    console.log('  node fix-duplicate-teams.js --fix       # Nettoyer les doublons');
    process.exit(1);
}