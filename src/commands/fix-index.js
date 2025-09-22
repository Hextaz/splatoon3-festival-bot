const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const mongoose = require('mongoose');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('fix-index')
        .setDescription('Réparer les index MongoDB (Admin uniquement)')
        .setDefaultMemberPermissions(PermissionFlagsBits.ADMINISTRATOR),
    
    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });
        
        try {
            console.log('🔧 Début de la réparation des index MongoDB...');
            
            const db = mongoose.connection.db;
            const collection = db.collection('mapprobabilities');

            // 1. Lister les index actuels
            console.log('📋 Index actuels sur mapprobabilities:');
            const indexes = await collection.indexes();
            let indexList = '';
            indexes.forEach(index => {
                const indexInfo = `  - ${index.name}: ${JSON.stringify(index.key)}`;
                console.log(indexInfo);
                indexList += indexInfo + '\n';
            });

            // 2. Supprimer l'ancien index problématique s'il existe
            const problematicIndexName = 'guildId_1_festivalId_1_teamId_1_mapMode_1';
            let repairLog = `**Index actuels:**\n\`\`\`${indexList}\`\`\`\n`;
            
            try {
                await collection.dropIndex(problematicIndexName);
                const dropMsg = `✅ Ancien index "${problematicIndexName}" supprimé`;
                console.log(dropMsg);
                repairLog += dropMsg + '\n';
            } catch (error) {
                if (error.code === 27) {
                    const noIndexMsg = `ℹ️ Index "${problematicIndexName}" n'existe pas (normal)`;
                    console.log(noIndexMsg);
                    repairLog += noIndexMsg + '\n';
                } else {
                    const errorMsg = `❌ Erreur lors de la suppression de l'index: ${error.message}`;
                    console.error(errorMsg);
                    repairLog += errorMsg + '\n';
                }
            }

            // 3. Supprimer tous les documents avec teamName ou mapKey null/undefined
            console.log('🧹 Nettoyage des documents invalides...');
            const deleteResult = await collection.deleteMany({
                $or: [
                    { teamName: null },
                    { teamName: { $exists: false } },
                    { mapKey: null },
                    { mapKey: { $exists: false } },
                    { teamName: '' },
                    { mapKey: '' }
                ]
            });
            const cleanupMsg = `🗑️ ${deleteResult.deletedCount} document(s) invalide(s) supprimé(s)`;
            console.log(cleanupMsg);
            repairLog += cleanupMsg + '\n';

            // 4. Créer le bon index
            console.log('🔧 Création du nouvel index...');
            try {
                await collection.createIndex(
                    { guildId: 1, festivalId: 1, teamName: 1, mapKey: 1 },
                    { unique: true, name: 'guildId_1_festivalId_1_teamName_1_mapKey_1' }
                );
                const createMsg = '✅ Nouvel index créé avec succès';
                console.log(createMsg);
                repairLog += createMsg + '\n';
            } catch (error) {
                const createErrorMsg = `❌ Erreur lors de la création de l'index: ${error.message}`;
                console.error(createErrorMsg);
                repairLog += createErrorMsg + '\n';
            }

            // 5. Vérifier les nouveaux index
            console.log('📋 Index finaux sur mapprobabilities:');
            const finalIndexes = await collection.indexes();
            let finalIndexList = '';
            finalIndexes.forEach(index => {
                const indexInfo = `  - ${index.name}: ${JSON.stringify(index.key)}`;
                console.log(indexInfo);
                finalIndexList += indexInfo + '\n';
            });
            
            repairLog += `\n**Index finaux:**\n\`\`\`${finalIndexList}\`\`\``;
            repairLog += '\n🎉 **Réparation terminée avec succès !**';

            await interaction.editReply({
                content: repairLog.length > 2000 ? repairLog.substring(0, 1997) + '...' : repairLog
            });

            console.log('🎉 Migration des index terminée avec succès !');

        } catch (error) {
            console.error('❌ Erreur lors de la réparation:', error);
            await interaction.editReply({
                content: `❌ Erreur lors de la réparation: ${error.message}`
            });
        }
    },
};