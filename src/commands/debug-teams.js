const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { Team, Vote, MapProbability, Festival } = require('../models/mongodb');
const DataAdapter = require('../utils/dataAdapter');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('debug-teams')
        .setDescription('Debug: Voir et supprimer les équipes en base de données (Admin)')
        .setDefaultMemberPermissions(PermissionFlagsBits.ADMINISTRATOR)
        .addStringOption(option =>
            option.setName('action')
                .setDescription('Action à effectuer')
                .setRequired(true)
                .addChoices(
                    { name: 'Lister les équipes', value: 'list' },
                    { name: 'Supprimer toutes les équipes', value: 'clear' },
                    { name: 'Compter les équipes', value: 'count' },
                    { name: 'Diagnostic complet', value: 'diagnose' },
                    { name: 'Nettoyer les données corrompues', value: 'cleanup' }
                )),
    
    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });
        
        const action = interaction.options.getString('action');
        const guildId = interaction.guild.id;
        
        try {
            switch (action) {
                case 'list':
                    const allTeams = await Team.find({ guildId });
                    if (allTeams.length === 0) {
                        await interaction.editReply('✅ Aucune équipe trouvée en base de données');
                    } else {
                        let response = `📊 **${allTeams.length} équipes trouvées:**\n\n`;
                        allTeams.forEach((team, index) => {
                            response += `${index + 1}. **${team.name}** (Festival: \`${team.festivalId || 'null'}\`)\n`;
                            response += `   - Camp: ${team.camp || 'N/A'}\n`;
                            response += `   - Membres: ${team.members ? team.members.length : 0}\n`;
                        });
                        await interaction.editReply(response);
                    }
                    break;
                    
                case 'count':
                    const count = await Team.countDocuments({ guildId });
                    await interaction.editReply(`📊 **${count}** équipes en base de données pour ce serveur`);
                    break;
                    
                case 'clear':
                    console.log(`🔍 DEBUG: Tentative de suppression des équipes pour guildId: ${guildId}`);
                    const adapter = new DataAdapter(guildId);
                    
                    // Compter avant suppression
                    const countBefore = await Team.countDocuments({ guildId });
                    console.log(`🔍 DEBUG: ${countBefore} équipes trouvées avant suppression`);
                    
                    const result = await adapter.clearAllTeams();
                    console.log(`🔍 DEBUG: Résultat de clearAllTeams:`, result);
                    
                    // Compter après suppression
                    const countAfter = await Team.countDocuments({ guildId });
                    console.log(`🔍 DEBUG: ${countAfter} équipes restantes après suppression`);
                    
                    await interaction.editReply(`🗑️ **${result.deletedCount}** équipes supprimées de la base de données\n📊 Avant: ${countBefore} équipes\n📊 Après: ${countAfter} équipes`);
                    break;
                    
                case 'diagnose':
                    let diagnostic = `🔍 **DIAGNOSTIC COMPLET**\n\n`;
                    
                    // Compter tous les types de données
                    const teamCount = await Team.countDocuments({ guildId });
                    const voteCount = await Vote.countDocuments({ guildId });
                    const festivalCount = await Festival.countDocuments({ guildId });
                    const mapProbCount = await MapProbability.countDocuments({ guildId });
                    
                    diagnostic += `📊 **Statistiques:**\n`;
                    diagnostic += `- Équipes: ${teamCount}\n`;
                    diagnostic += `- Votes: ${voteCount}\n`;
                    diagnostic += `- Festivals: ${festivalCount}\n`;
                    diagnostic += `- Map Probabilities: ${mapProbCount}\n\n`;
                    
                    // Vérifier les festivals actifs
                    const activeFestivals = await Festival.find({ guildId, isActive: true });
                    diagnostic += `🎉 **Festivals actifs:** ${activeFestivals.length}\n`;
                    activeFestivals.forEach(f => {
                        diagnostic += `- ${f.title} (ID: ${f._id})\n`;
                    });
                    
                    // Vérifier les équipes sans festivalId
                    const teamsWithoutFestival = await Team.find({ guildId, festivalId: null });
                    diagnostic += `\n⚠️ **Équipes sans festivalId:** ${teamsWithoutFestival.length}\n`;
                    
                    // Vérifier les votes en double (même userId)
                    const allVotes = await Vote.find({ guildId });
                    const userVoteCounts = {};
                    allVotes.forEach(vote => {
                        userVoteCounts[vote.userId] = (userVoteCounts[vote.userId] || 0) + 1;
                    });
                    const duplicateVotes = Object.entries(userVoteCounts).filter(([userId, count]) => count > 1);
                    diagnostic += `\n🗳️ **Votes en double:** ${duplicateVotes.length} utilisateurs\n`;
                    duplicateVotes.forEach(([userId, count]) => {
                        diagnostic += `- User ${userId}: ${count} votes\n`;
                    });
                    
                    // Vérifier les map probabilities corrompues (avec null)
                    const corruptedMapProbs = await MapProbability.find({ 
                        guildId, 
                        $or: [
                            { teamName: null },
                            { mapKey: null }
                        ]
                    });
                    diagnostic += `\n🗺️ **Map Probabilities corrompues:** ${corruptedMapProbs.length}\n`;
                    
                    await interaction.editReply(diagnostic);
                    break;
                    
                case 'cleanup':
                    let cleanupReport = `🧹 **NETTOYAGE DES DONNÉES CORROMPUES**\n\n`;
                    
                    // 1. Supprimer les équipes sans festivalId
                    const orphanTeams = await Team.deleteMany({ guildId, festivalId: null });
                    cleanupReport += `🗑️ Équipes sans festivalId supprimées: ${orphanTeams.deletedCount}\n`;
                    
                    // 2. Supprimer les votes en double (garder le plus récent)
                    const votes = await Vote.find({ guildId }).sort({ votedAt: -1 });
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
                        cleanupReport += `🗳️ Votes en double supprimés: ${duplicateVotesDeleted.deletedCount}\n`;
                    }
                    
                    // 3. Supprimer les map probabilities corrompues
                    const corruptedMaps = await MapProbability.deleteMany({ 
                        guildId, 
                        $or: [
                            { teamName: null },
                            { mapKey: null }
                        ]
                    });
                    cleanupReport += `🗺️ Map Probabilities corrompues supprimées: ${corruptedMaps.deletedCount}\n`;
                    
                    // 4. Supprimer les festivals inactifs anciens (garder seulement le plus récent)
                    const allFestivals = await Festival.find({ guildId }).sort({ createdAt: -1 });
                    if (allFestivals.length > 1) {
                        const oldFestivalIds = allFestivals.slice(1).map(f => f._id);
                        const oldFestivals = await Festival.deleteMany({ _id: { $in: oldFestivalIds } });
                        cleanupReport += `🎉 Anciens festivals supprimés: ${oldFestivals.deletedCount}\n`;
                    }
                    
                    cleanupReport += `\n✅ **Nettoyage terminé!**`;
                    await interaction.editReply(cleanupReport);
                    break;
            }
        } catch (error) {
            console.error('Erreur debug-teams:', error);
            await interaction.editReply(`❌ Erreur: ${error.message}`);
        }
    }
};
