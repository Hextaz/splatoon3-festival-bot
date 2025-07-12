// Modifier le code pour supprimer complètement le festival

const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { getCurrentFestival, resetFestivalData, saveFestival, deleteFestival } = require('../utils/festivalManager');
const scoreTracker = require('../utils/scoreTracker');
const { loadConfig } = require('../commands/config');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('end-festival')
        .setDescription('Mettre fin au festival en cours (Admin uniquement)')
        .setDefaultMemberPermissions(PermissionFlagsBits.ADMINISTRATOR),
    
    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });
        
        try {
            // Vérifier s'il y a un festival en cours
            const festival = getCurrentFestival();
            if (!festival) {
                return await interaction.editReply({
                    content: 'Aucun festival n\'est actif actuellement.',
                    ephemeral: true
                });
            }
            
            // Récupérer la guild
            const guild = interaction.guild;
            
            // Désactiver le festival et sauvegarder immédiatement pour l'annonce
            festival.deactivate();
            await saveFestival(festival);
            
            // Calculer les résultats finaux
            const winningCamp = scoreTracker.getWinningCamp();
            const scores = scoreTracker.getCurrentScores();
            
            // Créer l'embed d'annonce de fin
            let embed;
            
            // Gestion de l'égalité
            if (winningCamp === 'Tie') {
                embed = new EmbedBuilder()
                    .setColor('#9932CC')
                    .setTitle(`🏆 Le Festival "${festival.title}" a été terminé manuellement! 🏆`)
                    .setDescription('Il y a égalité entre plusieurs camps!')
                    .addFields(
                        { name: 'Résultats', value: 
                            `${festival.campNames[0]}: ${scores.camp1} points\n` +
                            `${festival.campNames[1]}: ${scores.camp2} points\n` +
                            `${festival.campNames[2]}: ${scores.camp3} points`
                        },
                        { name: 'Merci à tous les participants!', value: 'Un nouveau festival sera annoncé prochainement.' }
                    )
                    .setTimestamp();
            } else {
                const campIndex = winningCamp === 'camp1' ? 0 : winningCamp === 'camp2' ? 1 : 2;
                const winningCampName = festival.campNames[campIndex];
                
                embed = new EmbedBuilder()
                    .setColor('#9932CC')
                    .setTitle(`🏆 Le Festival "${festival.title}" a été terminé manuellement! 🏆`)
                    .setDescription(`Félicitations au camp **${winningCampName}** pour sa victoire!`)
                    .addFields(
                        { name: 'Résultats', value: 
                            `${festival.campNames[0]}: ${scores.camp1} points\n` +
                            `${festival.campNames[1]}: ${scores.camp2} points\n` +
                            `${festival.campNames[2]}: ${scores.camp3} points`
                        },
                        { name: 'Merci à tous les participants!', value: 'Un nouveau festival sera annoncé prochainement.' }
                    )
                    .setTimestamp();
            }
            
            // Envoyer l'annonce dans le canal d'annonce du festival
            const channel = await interaction.client.channels.fetch(festival.announcementChannelId);
            if (channel) {
                // Charger la configuration pour obtenir le rôle à mentionner
                const config = await loadConfig(interaction.guild.id);
                
                const mentionText = config.announcementRoleId ? 
                    `<@&${config.announcementRoleId}> ` : '';
                
                await channel.send({ 
                    content: `${mentionText}🏆 **Le Festival "${festival.title}" a été terminé manuellement!** 🏆`,
                    embeds: [embed] 
                });
                
                // Annoncer la dissolution des équipes
                await channel.send("Le festival a été terminé manuellement. Toutes les équipes seront dissoutes dans 30 secondes.");
            }
            
            // Répondre à l'administrateur qui a exécuté la commande
            await interaction.editReply({
                content: `Le festival "${festival.title}" a été terminé avec succès. Les équipes seront dissoutes dans 30 secondes.`,
                ephemeral: true
            });
            
            /// Attendre 30 secondes puis réinitialiser les données et supprimer le festival
            setTimeout(async () => {
                await resetFestivalData(guild);

                // S'assurer que le système d'équipes est bien nettoyé
                const teamManager = require('../utils/teamManager');
                await teamManager.clearAllTeams();
                
                // Supprimer complètement le festival
                await deleteFestival();
                
                console.log('Festival supprimé avec succès après 30 secondes');
            }, 30 * 1000); // 30 secondes
            
        } catch (error) {
            console.error('Erreur lors de la fin du festival:', error);
            await interaction.editReply({
                content: `Une erreur s'est produite: ${error.message}`,
                ephemeral: true
            });
        }
    },
};