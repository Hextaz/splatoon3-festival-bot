const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { PendingResult, MatchHistory, TeamMatchCounter, MapProbability } = require('../models/mongodb');
const DataAdapter = require('../utils/dataAdapter');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('debug-migration')
        .setDescription('Debug: Voir et tester les données migrées (Admin)')
        .setDefaultMemberPermissions(PermissionFlagsBits.ADMINISTRATOR)
        .addStringOption(option =>
            option.setName('type')
                .setDescription('Type de données à débugger')
                .setRequired(true)
                .addChoices(
                    { name: 'Résultats en attente', value: 'pending' },
                    { name: 'Historique des matchs', value: 'history' },
                    { name: 'Compteurs de matchs', value: 'counters' },
                    { name: 'Probabilités de cartes', value: 'maps' },
                    { name: 'Tout supprimer', value: 'clear-all' }
                ))
        .addStringOption(option =>
            option.setName('action')
                .setDescription('Action à effectuer')
                .setRequired(true)
                .addChoices(
                    { name: 'Lister', value: 'list' },
                    { name: 'Compter', value: 'count' },
                    { name: 'Supprimer', value: 'clear' }
                )),
    
    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });
        
        const type = interaction.options.getString('type');
        const action = interaction.options.getString('action');
        const guildId = interaction.guild.id;
        
        try {
            const adapter = new DataAdapter(guildId);
            
            switch (type) {
                case 'pending':
                    await handlePendingResults(interaction, action, guildId, adapter);
                    break;
                case 'history':
                    await handleMatchHistory(interaction, action, guildId, adapter);
                    break;
                case 'counters':
                    await handleMatchCounters(interaction, action, guildId, adapter);
                    break;
                case 'maps':
                    await handleMapProbabilities(interaction, action, guildId, adapter);
                    break;
                case 'clear-all':
                    if (action === 'clear') {
                        await handleClearAll(interaction, guildId, adapter);
                    } else {
                        await interaction.editReply('❌ Action "clear" uniquement pour clear-all');
                    }
                    break;
            }
        } catch (error) {
            console.error('Erreur debug-migration:', error);
            await interaction.editReply(`❌ Erreur: ${error.message}`);
        }
    }
};

async function handlePendingResults(interaction, action, guildId, adapter) {
    switch (action) {
        case 'list':
            const results = await PendingResult.find({ guildId });
            if (results.length === 0) {
                await interaction.editReply('✅ Aucun résultat en attente en base');
            } else {
                let response = `📊 **${results.length} résultats en attente:**\n\n`;
                results.forEach((result, index) => {
                    response += `${index + 1}. **${result.declaringTeam}** vs **${result.opponentTeam}** (${result.status})\n`;
                });
                await interaction.editReply(response);
            }
            break;
        case 'count':
            const count = await PendingResult.countDocuments({ guildId });
            await interaction.editReply(`📊 **${count}** résultats en attente`);
            break;
        case 'clear':
            const result = await adapter.clearAllPendingResults();
            await interaction.editReply(`🗑️ **${result.deletedCount}** résultats supprimés`);
            break;
    }
}

async function handleMatchHistory(interaction, action, guildId, adapter) {
    switch (action) {
        case 'list':
            const matches = await MatchHistory.find({ guildId }).sort({ matchNumber: -1 }).limit(10);
            if (matches.length === 0) {
                await interaction.editReply('✅ Aucun match en historique');
            } else {
                let response = `📊 **${matches.length} derniers matchs:**\n\n`;
                matches.forEach((match, index) => {
                    response += `${index + 1}. **${match.team1.name}** vs **${match.team2.name}** (Winner: ${match.winner || 'N/A'})\n`;
                });
                await interaction.editReply(response);
            }
            break;
        case 'count':
            const count = await MatchHistory.countDocuments({ guildId });
            await interaction.editReply(`📊 **${count}** matchs en historique`);
            break;
        case 'clear':
            const result = await adapter.clearAllMatchHistory();
            await interaction.editReply(`🗑️ **${result.deletedCount}** entrées d'historique supprimées`);
            break;
    }
}

async function handleMatchCounters(interaction, action, guildId, adapter) {
    switch (action) {
        case 'list':
            const counters = await TeamMatchCounter.find({ guildId });
            if (counters.length === 0) {
                await interaction.editReply('✅ Aucun compteur de match');
            } else {
                let response = `📊 **${counters.length} compteurs:**\n\n`;
                counters.forEach((counter, index) => {
                    response += `${index + 1}. **${counter.teamName}**: ${counter.matchCount} matchs\n`;
                });
                await interaction.editReply(response);
            }
            break;
        case 'count':
            const count = await TeamMatchCounter.countDocuments({ guildId });
            await interaction.editReply(`📊 **${count}** compteurs de matchs`);
            break;
        case 'clear':
            const result = await adapter.clearAllMatchCounters();
            await interaction.editReply(`🗑️ **${result.deletedCount}** compteurs supprimés`);
            break;
    }
}

async function handleMapProbabilities(interaction, action, guildId, adapter) {
    switch (action) {
        case 'list':
            const probs = await MapProbability.find({ guildId }).limit(20);
            if (probs.length === 0) {
                await interaction.editReply('✅ Aucune probabilité de carte');
            } else {
                let response = `📊 **${probs.length} premières probabilités:**\n\n`;
                probs.forEach((prob, index) => {
                    response += `${index + 1}. **${prob.teamName}** - ${prob.mapKey}: ${prob.probability}\n`;
                });
                await interaction.editReply(response);
            }
            break;
        case 'count':
            const count = await MapProbability.countDocuments({ guildId });
            await interaction.editReply(`📊 **${count}** probabilités de cartes`);
            break;
        case 'clear':
            const result = await adapter.clearAllMapProbabilities();
            await interaction.editReply(`🗑️ **${result.deletedCount}** probabilités supprimées`);
            break;
    }
}

async function handleClearAll(interaction, guildId, adapter) {
    let totalDeleted = 0;
    let report = '🗑️ **SUPPRESSION COMPLÈTE:**\n\n';
    
    try {
        const pendingResult = await adapter.clearAllPendingResults();
        totalDeleted += pendingResult.deletedCount;
        report += `• Résultats en attente: ${pendingResult.deletedCount}\n`;
        
        const historyResult = await adapter.clearAllMatchHistory();
        totalDeleted += historyResult.deletedCount;
        report += `• Historique: ${historyResult.deletedCount}\n`;
        
        const countersResult = await adapter.clearAllMatchCounters();
        totalDeleted += countersResult.deletedCount;
        report += `• Compteurs: ${countersResult.deletedCount}\n`;
        
        const mapsResult = await adapter.clearAllMapProbabilities();
        totalDeleted += mapsResult.deletedCount;
        report += `• Probabilités: ${mapsResult.deletedCount}\n`;
        
        report += `\n**TOTAL: ${totalDeleted} entrées supprimées** ✅`;
        await interaction.editReply(report);
    } catch (error) {
        await interaction.editReply(`❌ Erreur lors de la suppression: ${error.message}`);
    }
}
