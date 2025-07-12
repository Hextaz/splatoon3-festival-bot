// Créer src/commands/map-stats.js
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { findTeamByMember } = require('../utils/teamManager');
const mapProbabilityManager = require('../utils/mapProbabilityManager');
const { MAPS } = require('../data/mapsAndModes');
const { safeReply } = require('../utils/responseUtils');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('map-stats')
        .setDescription('Voir les probabilités de sélection des maps pour votre équipe'),

    async execute(interaction) {
        const userTeam = findTeamByMember(interaction.user.id);
        
        if (!userTeam) {
            return await safeReply(interaction, {
                content: "Vous n'êtes membre d'aucune équipe.",
                ephemeral: true
            });
        }

        try {
            await mapProbabilityManager.loadProbabilities();
            const stats = mapProbabilityManager.getTeamProbabilityStats(userTeam.name);
            
            const embed = new EmbedBuilder()
                .setColor('#0099FF')
                .setTitle(`📊 Probabilités de maps - ${userTeam.name}`)
                .setDescription('Probabilités de sélection de chaque map pour vos prochains matchs');
            
            // Maps les plus probables
            const mostLikelyText = stats.mostLikely
                .map(item => `${MAPS[item.mapKey]}: **${(item.probability * 100).toFixed(1)}%**`)
                .join('\n');
            
            // Maps les moins probables  
            const leastLikelyText = stats.leastLikely
                .map(item => `${MAPS[item.mapKey]}: **${(item.probability * 100).toFixed(1)}%**`)
                .join('\n');
            
            embed.addFields(
                { name: '🔥 Maps les plus probables', value: mostLikelyText, inline: true },
                { name: '❄️ Maps les moins probables', value: leastLikelyText, inline: true },
                { name: '📝 Note', value: 'Les probabilités évoluent après chaque BO3 joué.' }
            );
            
            await safeReply(interaction, { embeds: [embed], ephemeral: true });
            
        } catch (error) {
            console.error('Erreur lors de la récupération des stats de maps:', error);
            await safeReply(interaction, {
                content: 'Erreur lors de la récupération des statistiques de maps.',
                ephemeral: true
            });
        }
    }
};