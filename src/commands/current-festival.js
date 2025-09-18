const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getCurrentFestivalAsync, saveFestival, setCurrentGuildId, loadFestivalAuto } = require('../utils/festivalManager');
const { getAllTeams } = require('../utils/teamManager');
const { getVotes } = require('../utils/vote');
const scoreTracker = require('../utils/scoreTracker');
const { safeReply } = require('../utils/responseUtils');
const DataAdapter = require('../utils/dataAdapter');

const { MAPS } = require('../data/mapsAndModes');

function getGameModeDisplay(gameMode) {
    const modes = {
        'turf': 'Guerre de Territoire uniquement',
        'ranked': 'Modes Pro uniquement', 
        'splat_zones': 'Défense de Zone uniquement',
        'mixed': 'Modes mixtes (BO3 varié)'
    };
    return modes[gameMode] || 'Modes mixtes';
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('current-festival')
        .setDescription('Affiche les informations sur le festival actuel'),
    
    async execute(interaction) {
    try {
        await interaction.deferReply({ ephemeral: true });
        
        // Charger le festival directement depuis la base de données pour ce serveur
        const festival = await getCurrentFestivalAsync(interaction.guild.id);
            
        if (!festival) {
            return await interaction.editReply({
                content: 'Aucun festival n\'est actuellement programmé. Utilisez `/start-festival` pour en créer un nouveau.'
            });
        }            // Vérifier si le festival est programmé pour l'avenir ou s'il est terminé
            const now = new Date();
            const startDate = new Date(festival.startDate);
            const endDate = new Date(festival.endDate);
            
            // Si le festival n'est pas actif, vérifier s'il est programmé pour l'avenir ou s'il est terminé
            if (!festival.isActive) {
                if (startDate > now) {
                    // Festival à venir
                    const embed = new EmbedBuilder()
                        .setColor('#FFA500')
                        .setTitle(`Festival à venir : ${festival.title}`)
                        .setDescription('**Festival programmé**')
                        .addFields(
                            { name: '📅 Dates', value: 
                                `**Début**: <t:${Math.floor(startDate.getTime() / 1000)}:F> (<t:${Math.floor(startDate.getTime() / 1000)}:R>)\n` +
                                `**Fin**: <t:${Math.floor(endDate.getTime() / 1000)}:F>`, 
                                inline: false 
                            },
                            { name: '🎮 Camps', value: 
                                `**${festival.campNames[0]}** vs **${festival.campNames[1]}** vs **${festival.campNames[2]}**`,
                                inline: false 
                            },
                            { name: '⚙️ Configuration', value: 
                                `**Taille d'équipe**: ${festival.getTeamSizeDisplay()}\n` +
                                `**Mode de jeu**: ${getGameModeDisplay(festival.gameMode)}\n` +
                                `**Maps bannies**: ${festival.bannedMaps?.length || 0}`,
                                inline: false 
                            }
                        )
                        .setTimestamp()
                        .setFooter({ text: 'Vous pouvez déjà voter et former des équipes pour ce festival!' });
                    
                    // Ajouter le canal d'annonce
                    if (festival.announcementChannelId) {
                        embed.addFields({ 
                            name: '📢 Canal d\'annonce', 
                            value: `<#${festival.announcementChannelId}>` 
                        });
                    }
                    
                    return await interaction.editReply({ embeds: [embed] });
                } else if (endDate < now) {
                    // Festival réellement terminé
                    return await interaction.editReply({
                        content: `Le festival "${festival.title}" est terminé. Il sera complètement supprimé sous peu.`
                    });
                } else {
                    // Festival en cours mais pas encore activé
                    console.log('🔧 Festival détecté comme devant être actif, activation...');
                    festival.activate();
                    await saveFestival(festival, interaction.guild.id);
                    
                    // Envoyer l'annonce de début maintenant
                    try {
                        // Vérifier que l'announcementChannelId existe
                        if (!festival.announcementChannelId) {
                            const { loadConfig } = require('./config');
                            const config = await loadConfig(interaction.guild.id);
                            if (config && config.announcementChannelId) {
                                festival.announcementChannelId = config.announcementChannelId;
                            }
                        }
                        
                        if (festival.announcementChannelId) {
                            const channel = await interaction.client.channels.fetch(festival.announcementChannelId);
                            if (channel) {
                                const { loadConfig } = require('./config');
                                const config = await loadConfig(interaction.guild.id);
                                const mentionText = config.announcementRoleId ? 
                                    `<@&${config.announcementRoleId}> ` : '';
                                
                                const { createStartEmbed } = require('../utils/festivalManager');
                                const startEmbed = createStartEmbed(festival);
                                
                                await channel.send({
                                    content: `${mentionText}🎉 **LE FESTIVAL COMMENCE MAINTENANT !** 🎉`,
                                    embeds: [startEmbed]
                                });
                                
                                console.log('✅ Annonce de début du festival envoyée');
                            } else {
                                console.error(`Canal d'annonce non trouvé: ${festival.announcementChannelId}`);
                            }
                        } else {
                            console.error('Aucun canal d\'annonce configuré - impossible d\'envoyer l\'annonce de début');
                        }
                    } catch (error) {
                        console.error('Erreur lors de l\'envoi de l\'annonce de début:', error);
                    }
                }
            }
            
            // Si on arrive ici, le festival est actif
            // Récupérer les données spécifiques à cette guild
            const adapter = new DataAdapter(interaction.guild.id);
            
            // Récupérer uniquement le nombre total de votes pour cette guild
            const votesData = await adapter.getVotes();
            const totalVotes = (votesData.camp1 || 0) + (votesData.camp2 || 0) + (votesData.camp3 || 0);
            
            // Récupérer uniquement le nombre total d'équipes pour cette guild
            const allTeams = await adapter.getTeams();
            const totalTeams = Array.isArray(allTeams) ? allTeams.length : 0;
            
            // Récupérer l'historique des matchs pour cette guild
            const matchHistory = await adapter.getMatchHistory();
            console.log('🔍 DEBUG matchHistory:', matchHistory);
            const totalMatches = Array.isArray(matchHistory) ? matchHistory.length : 0;
            
            // Créer un embed avec les informations autorisées
            const embed = new EmbedBuilder()
                .setColor('#0099ff')
                .setTitle(`Festival : ${festival.title}`)
                .setDescription('**Festival en cours**')
                .addFields(
                    { name: '📅 Dates', value: 
                        `**Début**: <t:${Math.floor(startDate.getTime() / 1000)}:F>\n` +
                        `**Fin**: <t:${Math.floor(endDate.getTime() / 1000)}:F> (<t:${Math.floor(endDate.getTime() / 1000)}:R>)`, 
                        inline: false 
                    },
                    { name: '🎮 Camps', value: 
                        `**${festival.campNames[0]}** vs **${festival.campNames[1]}** vs **${festival.campNames[2]}**`,
                        inline: false 
                    },
                    { name: '📊 Statistiques', value: 
                        `**Votes totaux**: ${totalVotes}\n` +
                        `**Équipes totales**: ${totalTeams}\n` +
                        `**Matchs joués**: ${totalMatches}`, 
                        inline: false 
                    }
                )
                .setTimestamp()
                .setFooter({ text: 'Les scores seront automatiquement annoncés à mi-parcours et à la fin du festival!' });
            
            // Ajouter le canal d'annonce
            if (festival.announcementChannelId) {
                embed.addFields({ 
                    name: '📢 Canal d\'annonce', 
                    value: `<#${festival.announcementChannelId}>` 
                });
            }
            
            // Ajouter les nouvelles informations
            embed.addFields(
                { name: '⚙️ Configuration', value: 
                    `**Taille d'équipe**: ${festival.getTeamSizeDisplay()}\n` +
                    `**Mode de jeu**: ${getGameModeDisplay(festival.gameMode)}\n` +
                    `**Maps bannies**: ${festival.bannedMaps.length > 0 ? festival.bannedMaps.length : 'Aucune'}`,
                    inline: false 
                }
            );
            
            // Si il y a des maps bannies, les afficher
            if (festival.bannedMaps.length > 0) {
                const bannedMapNames = festival.bannedMaps
                    .map(mapKey => MAPS[mapKey])
                    .join(', ');
                
                embed.addFields({
                    name: '🚫 Maps bannies', 
                    value: bannedMapNames,
                    inline: false
                });
            }
            
            await interaction.editReply({
                embeds: [embed]
            });
            
        } catch (error) {
            console.error('Erreur dans la commande current-festival:', error);
            await interaction.editReply({
                content: `Une erreur s'est produite: ${error.message}`
            });
        }
    }
};