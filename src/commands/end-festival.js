const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { getCurrentFestival, resetFestivalData, saveFestival, deleteFestival } = require('../utils/festivalManager');
const scoreTracker = require('../utils/scoreTracker');
const { loadConfig } = require('../commands/config');
const { safeReply, safeEdit, safeFollowUp } = require('../utils/responseUtils');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('end-festival')
        .setDescription('Mettre fin au festival en cours (Admin uniquement)')
        .setDefaultMemberPermissions(PermissionFlagsBits.ADMINISTRATOR),
    
    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });
        
        try {
            const guildId = interaction.guild.id;
            console.log(`🔍 end-festival exécuté pour guild: ${guildId} (${interaction.guild.name})`);
            
            // Vérifier s'il y a un festival en cours (d'abord en mémoire, puis en base)
            let festival = getCurrentFestival(guildId);
            
            if (festival) {
                console.log(`🎪 Festival trouvé: "${festival.title}" pour guildId: ${guildId}`);
            }
            
            // Si pas trouvé en mémoire, essayer de charger depuis la base de données
            if (!festival) {
                console.log('🔍 Festival non trouvé en mémoire, chargement depuis la base...');
                const { loadFestival, setCurrentFestival } = require('../utils/festivalManager');
                festival = await loadFestival(guildId);
                
                if (festival) {
                    console.log('✅ Festival chargé depuis la base de données');
                    setCurrentFestival(festival, guildId);
                } else {
                    return await safeEdit(interaction, {
                        content: 'Aucun festival n\'est actif actuellement.',
                        ephemeral: true
                    });
                }
            }
            
            // Récupérer la guild
            const guild = interaction.guild;
            
            // Désactiver le festival et sauvegarder immédiatement pour l'annonce
            festival.deactivate();
            await saveFestival(festival, guildId);
            
            // Calculer les résultats finaux
            const winningCamp = scoreTracker.getWinningCamp(guildId);
            const scores = scoreTracker.getCurrentScores(guildId);
            
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
            console.log(`🔍 Tentative d'envoi d'annonce de fin de festival...`);
            console.log(`📢 Festival announcementChannelId: ${festival.announcementChannelId}`);
            
            if (festival.announcementChannelId) {
                try {
                    console.log(`🔍 Récupération du canal d'annonce: ${festival.announcementChannelId}`);
                    const channel = await interaction.client.channels.fetch(festival.announcementChannelId);
                    
                    if (channel) {
                        console.log(`✅ Canal d'annonce trouvé: ${channel.name} (${channel.id})`);
                        
                        // Charger la configuration pour obtenir le rôle à mentionner
                        const config = await loadConfig(interaction.guild.id);
                        console.log(`🔍 Configuration chargée, announcementRoleId: ${config.announcementRoleId || 'AUCUN'}`);
                        
                        const mentionText = config.announcementRoleId ? 
                            `<@&${config.announcementRoleId}> ` : '';
                        
                        console.log(`📤 Envoi du message d'annonce de fin...`);
                        await channel.send({ 
                            content: `${mentionText}🏆 **Le Festival "${festival.title}" a été terminé manuellement!** 🏆`,
                            embeds: [embed] 
                        });
                        console.log(`✅ Message d'annonce de fin envoyé avec succès`);
                        
                        // Annoncer la dissolution des équipes
                        console.log(`📤 Envoi du message de dissolution...`);
                        await channel.send("Le festival a été terminé manuellement. Toutes les équipes seront dissoutes dans 30 secondes.");
                        console.log(`✅ Message de dissolution envoyé avec succès`);
                    } else {
                        console.error(`❌ Canal d'annonce non trouvé avec l'ID: ${festival.announcementChannelId}`);
                    }
                } catch (channelError) {
                    console.error('❌ Erreur lors de l\'envoi de l\'annonce dans le canal:', channelError);
                }
            } else {
                console.warn('⚠️ Aucun canal d\'annonce configuré pour ce festival');
            }
            
            // Répondre à l'administrateur qui a exécuté la commande
            await safeEdit(interaction, {
                content: `Le festival "${festival.title}" a été terminé avec succès. Les équipes seront dissoutes dans 30 secondes.`,
                ephemeral: true
            });
            
            // Attendre 30 secondes puis réinitialiser les données et supprimer le festival
            console.log(`⏰ Programmation du nettoyage automatique dans 30 secondes...`);
            setTimeout(async () => {
                try {
                    console.log(`🧹 Début du nettoyage ROBUSTE pour guild: ${guildId}`);
                    
                    // 🎯 NOUVEAU: Nettoyage robuste anti-duplication
                    const RobustCleaner = require('../utils/robustCleaner');
                    const cleaner = new RobustCleaner(guildId);
                    
                    console.log(`🔄 Nettoyage robuste en cours...`);
                    const results = await cleaner.cleanupGuild();
                    console.log(`✅ Nettoyage robuste terminé:`, results);

                    // Nettoyage traditionnel en complément (pour la mémoire)
                    console.log(` Appel de resetFestivalData...`);
                    await resetFestivalData(guild);
                    console.log(`✅ resetFestivalData terminé`);

                    // SUPPRESSION DU FESTIVAL ET ANNULATION DES TIMERS
                    console.log(`🗑️ Appel de deleteFestival...`);
                    await deleteFestival(guildId);
                    console.log(`✅ deleteFestival terminé`);
                    
                    console.log(`🎉 Festival supprimé avec succès après 30 secondes pour guild: ${guildId}`);
                    
                    // Envoyer une confirmation dans le canal d'annonce si possible
                    if (festival.announcementChannelId) {
                        try {
                            const channel = await interaction.client.channels.fetch(festival.announcementChannelId);
                            if (channel) {
                                await channel.send("✅ **Nettoyage terminé !** Toutes les équipes et rôles ont été supprimés.");
                                console.log(`✅ Message de confirmation de nettoyage envoyé`);
                            }
                        } catch (e) {
                            console.warn('⚠️ Impossible d\'envoyer la confirmation de nettoyage:', e.message);
                        }
                    }
                    
                } catch (cleanupError) {
                    console.error(`❌ Erreur lors du nettoyage automatique:`, cleanupError);
                }
            }, 30 * 1000); // 30 secondes
            
        } catch (error) {
            console.error('Erreur lors de la fin du festival:', error);
            await safeEdit(interaction, {
                content: `Une erreur s'est produite: ${error.message}`,
                ephemeral: true
            });
        }
    },
};