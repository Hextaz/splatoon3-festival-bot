// src/commands/debug-team-scores.js
const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { getAllTeams } = require('../utils/teamManager');
const { calculateOpponentScore } = require('../utils/matchSearch');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('debug-team-scores')
        .setDescription('DEBUG: Afficher les scores de pondération d\'une équipe vs toutes les autres (Admin)')
        .addStringOption(option =>
            option.setName('team')
                .setDescription('Nom de l\'équipe à analyser')
                .setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ADMINISTRATOR),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });
        
        const teamName = interaction.options.getString('team');
        
        try {
            // Utiliser le nouveau système MongoDB
            const allTeams = await getAllTeams();
            
            const team = allTeams.find(t => t.name.toLowerCase().includes(teamName.toLowerCase()));
            if (!team) {
                return await interaction.editReply(`Équipe "${teamName}" introuvable.`);
            }
        // Calculer les scores pour tous les adversaires potentiels
        const scores = allTeams
            .filter(t => t.name !== team.name && !t.isVirtual)
            .map(opponent => ({
                name: opponent.name,
                camp: opponent.camp,
                score: calculateOpponentScore(team.name, opponent)
            }))
            .sort((a, b) => b.score - a.score);
        
        if (scores.length === 0) {
            return await interaction.editReply('Aucune équipe adversaire trouvée.');
        }
        
        // Catégoriser les équipes par score
        const excellent = scores.filter(s => s.score >= 130);
        const good = scores.filter(s => s.score >= 80 && s.score < 130);
        const ok = scores.filter(s => s.score >= 50 && s.score < 80);
        const poor = scores.filter(s => s.score < 50);
        
        const embed = new EmbedBuilder()
            .setColor('#FF9900')
            .setTitle(`🎯 Scores de pondération pour ${team.name}`)
            .setDescription(`Camp: ${team.camp.replace('camp', 'Camp ')}\n\nClassement des adversaires par priorité :`);
        
        if (excellent.length > 0) {
            const excellentText = excellent.slice(0, 8).map(s => 
                `**${s.name}** (${s.camp.replace('camp', 'Camp ')}): ${s.score} pts`
            ).join('\n');
            embed.addFields({ 
                name: `🏆 Priorité MAXIMALE (≥130) - ${excellent.length} équipes`, 
                value: excellentText + (excellent.length > 8 ? `\n... et ${excellent.length - 8} autres` : ''),
                inline: false 
            });
        }
        
        if (good.length > 0) {
            const goodText = good.slice(0, 6).map(s => 
                `**${s.name}** (${s.camp.replace('camp', 'Camp ')}): ${s.score} pts`
            ).join('\n');
            embed.addFields({ 
                name: `⭐ Priorité ÉLEVÉE (80-129) - ${good.length} équipes`, 
                value: goodText + (good.length > 6 ? `\n... et ${good.length - 6} autres` : ''),
                inline: false 
            });
        }
        
        if (ok.length > 0) {
            const okText = ok.slice(0, 5).map(s => 
                `**${s.name}** (${s.camp.replace('camp', 'Camp ')}): ${s.score} pts`
            ).join('\n');
            embed.addFields({ 
                name: `⚠️ Priorité MODÉRÉE (50-79) - ${ok.length} équipes`, 
                value: okText + (ok.length > 5 ? `\n... et ${ok.length - 5} autres` : ''),
                inline: false 
            });
        }
        
        if (poor.length > 0) {
            const poorText = poor.slice(0, 5).map(s => 
                `**${s.name}** (${s.camp.replace('camp', 'Camp ')}): ${s.score} pts`
            ).join('\n');
            embed.addFields({ 
                name: `🚨 Priorité FAIBLE (<50) - ${poor.length} équipes`, 
                value: poorText + (poor.length > 5 ? `\n... et ${poor.length - 5} autres` : ''),
                inline: false 
            });
        }
        
        embed.addFields({ 
            name: '📝 Légende des scores', 
            value: '• **130+** : Jamais affrontés ou >5 matchs + autre camp\n' +
                   '• **100-129** : Jamais affrontés ou >5 matchs + même camp\n' +
                   '• **80-99** : 3-5 matchs de distance\n' +
                   '• **50-79** : Avant-dernier match (2 matchs)\n' +
                   '• **<50** : Dernier match (récemment affrontés)',
            inline: false 
        });
        
        await interaction.editReply({ embeds: [embed] });
        
        } catch (error) {
            console.error('Erreur dans debug-team-scores:', error);
            await interaction.editReply(`Erreur lors du calcul des scores: ${error.message}`);
        }
    }
};