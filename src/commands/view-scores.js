const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const scoreTracker = require('../utils/scoreTracker');
const { getCurrentFestival } = require('../utils/festivalManager');
const { loadConfig } = require('./config');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('view-scores')
        .setDescription('Voir les scores actuels et l\'historique des matchs (Admin uniquement)')
        .setDefaultMemberPermissions(PermissionFlagsBits.ADMINISTRATOR)
        .addBooleanOption(option => 
            option.setName('announce')
                .setDescription('Annoncer les scores sur le canal d\'annonces')
                .setRequired(false)),
    
    async execute(interaction) {
        try {
            const festival = getCurrentFestival();
            if (!festival) {
                return await interaction.reply({
                    content: 'Aucun festival actif actuellement.',
                    ephemeral: true
                });
            }
            
            const shouldAnnounce = interaction.options.getBoolean('announce') || false;
            
            // Récupérer les scores et calculer les pourcentages
            const scores = scoreTracker.getCurrentScores();
            const percentages = scoreTracker.getScoresAsPercentages();
            const totalPoints = scores.camp1 + scores.camp2 + scores.camp3;
            
            // Créer un embed avec les informations de score
            const embed = new EmbedBuilder()
                .setColor('#FF9900')
                .setTitle(`📊 Scores du Festival "${festival.title}"`)
                .setDescription('Voici les scores actuels pour chaque camp')
                .addFields(
                    { 
                        name: `${festival.campNames[0]}`, 
                        value: `**${scores.camp1} points** (${percentages.camp1}%)`, 
                        inline: true 
                    },
                    { 
                        name: `${festival.campNames[1]}`, 
                        value: `**${scores.camp2} points** (${percentages.camp2}%)`, 
                        inline: true 
                    },
                    { 
                        name: `${festival.campNames[2]}`, 
                        value: `**${scores.camp3} points** (${percentages.camp3}%)`, 
                        inline: true 
                    },
                    {
                        name: 'Total des points',
                        value: `**${totalPoints}** points marqués dans ${scoreTracker.getMatchHistory().length} matchs`
                    }
                )
                .setTimestamp();
            
            // Ajouter les 5 derniers matchs avec leurs multiplicateurs
            const recentMatches = scoreTracker.getRecentMatches(5);
            if (recentMatches.length > 0) {
                const matchListText = recentMatches.reverse().map(match => {
                    const team1Result = match.team1.result === 'V' ? 'Victoire' : 'Défaite';
                    const team2Result = match.team2.result === 'V' ? 'Victoire' : 'Défaite';
                    const multiplierText = match.multiplier > 1 ? ` (x${match.multiplier})` : '';
                    const winningTeam = match.team1.result === 'V' ? match.team1.name : match.team2.name;
                    return `• **${match.team1.name}** (${team1Result}) vs **${match.team2.name}** (${team2Result})${multiplierText} - ${winningTeam} gagne ${match.pointsAwarded} pt${match.pointsAwarded > 1 ? 's' : ''}`;
                }).join('\n');
                
                embed.addFields({
                    name: '5 derniers matchs',
                    value: matchListText || 'Aucun match enregistré'
                });
            }
            
            // Répondre à l'interaction
            await interaction.reply({
                embeds: [embed],
                ephemeral: !shouldAnnounce
            });
            
            // Si demandé, faire une annonce publique
            if (shouldAnnounce && festival.announcementChannelId) {
                try {
                    const channel = await interaction.client.channels.fetch(festival.announcementChannelId);
                    if (channel) {
                        // Charger la configuration pour obtenir le rôle à mentionner
                        const config = await loadConfig();
                        const mentionText = config.announcementRoleId ? 
                            `<@&${config.announcementRoleId}> ` : '';
                        
                        // Créer un embed d'annonce publique
                        const publicEmbed = EmbedBuilder.from(embed);
                        
                        await channel.send({
                            content: `${mentionText}📊 **MISE À JOUR DES SCORES DU FESTIVAL** 📊`,
                            embeds: [publicEmbed]
                        });
                        
                        await interaction.followUp({
                            content: `Les scores ont été annoncés avec succès dans <#${festival.announcementChannelId}>`,
                            ephemeral: true
                        });
                    }
                } catch (error) {
                    console.error('Erreur lors de l\'annonce des scores:', error);
                    await interaction.followUp({
                        content: `Erreur lors de l'annonce des scores: ${error.message}`,
                        ephemeral: true
                    });
                }
            }
        } catch (error) {
            console.error('Erreur dans la commande view-scores:', error);
            await interaction.reply({
                content: `Une erreur s'est produite: ${error.message}`,
                ephemeral: true
            });
        }
    },
};