// src/commands/debug-matchmaking.js
const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { getAllTeams } = require('../utils/teamManager');
const { getTeamMatchHistory, calculateOpponentScore } = require('../utils/matchSearch');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('debug-matchmaking')
        .setDescription('DEBUG: Afficher l\'état complet du système de matchmaking (Admin)')
        .addStringOption(option =>
            option.setName('team1')
                .setDescription('Première équipe pour comparaison')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('team2')
                .setDescription('Deuxième équipe pour comparaison')
                .setRequired(false))
        .setDefaultMemberPermissions(PermissionFlagsBits.ADMINISTRATOR),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });
        
        const team1Name = interaction.options.getString('team1');
        const team2Name = interaction.options.getString('team2');
        const allTeams = await getAllTeams();
        
        if (team1Name && team2Name) {
            // Comparaison spécifique entre deux équipes
            const team1 = allTeams.find(t => t.name.toLowerCase().includes(team1Name.toLowerCase()));
            const team2 = allTeams.find(t => t.name.toLowerCase().includes(team2Name.toLowerCase()));
            
            if (!team1 || !team2) {
                return await interaction.editReply('Une ou plusieurs équipes introuvables.');
            }
            
            // Calculer le score que team1 donnerait à team2
            const score1to2 = calculateOpponentScore(team1.name, team2);
            const score2to1 = calculateOpponentScore(team2.name, team1);
            
            const history1 = getTeamMatchHistory(team1.name);
            const history2 = getTeamMatchHistory(team2.name);
            
            // Trouver leur dernière confrontation
            const lastFaceOff1 = history1.recentHistory.find(h => h.opponent === team2.name);
            
            let confrontationInfo = '**Jamais affrontées**';
            if (lastFaceOff1) {
                confrontationInfo = `**Dernière confrontation** : il y a ${lastFaceOff1.matchesAgo} match(s) pour ${team1.name}`;
            }
            
            const embed = new EmbedBuilder()
                .setColor('#FF9900')
                .setTitle(`🔍 Debug Matchmaking: ${team1.name} vs ${team2.name}`)
                .addFields(
                    { 
                        name: '📊 Scores de priorité', 
                        value: `${team1.name} → ${team2.name}: **${score1to2}** points\n${team2.name} → ${team1.name}: **${score2to1}** points`,
                        inline: false 
                    },
                    { 
                        name: '🏟️ Confrontations passées', 
                        value: confrontationInfo,
                        inline: false 
                    },
                    { 
                        name: '🎮 Statistiques de matchs', 
                        value: `${team1.name}: ${history1.totalMatches} matchs totaux\n${team2.name}: ${history2.totalMatches} matchs totaux`,
                        inline: false 
                    },
                    { 
                        name: '🏕️ Camps', 
                        value: `${team1.name}: ${team1.camp.replace('camp', 'Camp ')}\n${team2.name}: ${team2.camp.replace('camp', 'Camp ')}`,
                        inline: false 
                    }
                );
            
            // Ajouter historique récent si disponible
            if (history1.recentHistory.length > 0) {
                const recentMatches1 = history1.recentHistory.slice(-5).map(h => 
                    `vs ${h.opponent} (il y a ${h.matchesAgo} matchs)`
                ).join('\n');
                embed.addFields({ 
                    name: `📝 ${team1.name} - 5 derniers adversaires`, 
                    value: recentMatches1 || 'Aucun match récent',
                    inline: true 
                });
            }
            
            if (history2.recentHistory.length > 0) {
                const recentMatches2 = history2.recentHistory.slice(-5).map(h => 
                    `vs ${h.opponent} (il y a ${h.matchesAgo} matchs)`
                ).join('\n');
                embed.addFields({ 
                    name: `📝 ${team2.name} - 5 derniers adversaires`, 
                    value: recentMatches2 || 'Aucun match récent',
                    inline: true 
                });
            }
            
            await interaction.editReply({ embeds: [embed] });
            
        } else {
            // Vue d'ensemble du système
            const nonVirtualTeams = allTeams.filter(t => !t.isVirtual);
            const teamsWithMatches = nonVirtualTeams.filter(t => {
                const history = getTeamMatchHistory(t.name);
                return history.totalMatches > 0;
            });
            
            // Statistiques générales
            const totalTeams = nonVirtualTeams.length;
            const teamsWithNoMatches = totalTeams - teamsWithMatches.length;
            
            // Top équipes par nombre de matchs
            const sortedByMatches = teamsWithMatches
                .map(t => ({ ...t, history: getTeamMatchHistory(t.name) }))
                .sort((a, b) => b.history.totalMatches - a.history.totalMatches)
                .slice(0, 10);
            
            const embed = new EmbedBuilder()
                .setColor('#0099FF')
                .setTitle('🔍 Debug Matchmaking - Vue d\'ensemble')
                .addFields(
                    { 
                        name: '📊 Statistiques générales', 
                        value: `**${totalTeams}** équipes au total\n**${teamsWithMatches.length}** équipes avec des matchs\n**${teamsWithNoMatches}** équipes sans match`,
                        inline: false 
                    }
                );
            
            if (sortedByMatches.length > 0) {
                const topTeamsText = sortedByMatches.map(t => 
                    `**${t.name}**: ${t.history.totalMatches} matchs (${t.camp.replace('camp', 'Camp ')})`
                ).join('\n');
                
                embed.addFields({ 
                    name: '🏆 Top équipes par matchs joués', 
                    value: topTeamsText,
                    inline: false 
                });
            }
            
            embed.addFields({ 
                name: '💡 Utilisation avancée', 
                value: 'Utilisez `/debug-matchmaking team1:Equipe1 team2:Equipe2` pour analyser une confrontation spécifique',
                inline: false 
            });
            
            await interaction.editReply({ embeds: [embed] });
        }
    }
};