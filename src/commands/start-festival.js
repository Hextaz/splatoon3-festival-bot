const { SlashCommandBuilder, PermissionFlagsBits, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, EmbedBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { loadConfig } = require('../commands/config');
const { setCurrentGuildId } = require('../utils/festivalManager');
const { safeReply, safeDefer, safeEdit, safeFollowUp } = require('../utils/responseUtils');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('start-festival')
        .setDescription('Démarrer un nouveau festival (Admin uniquement)')
        .setDefaultMemberPermissions(PermissionFlagsBits.ADMINISTRATOR),
    
    async execute(interaction) {
        // Check if interaction was already deferred by the event handler
        let deferResult = true;
        if (!interaction._preDeferredByEventHandler && !interaction.deferred && !interaction.replied) {
            // Only defer if not already deferred by the event handler
            deferResult = await safeDefer(interaction, true);
        }
        
        // If defer failed (interaction expired), don't attempt any further operations
        if (!deferResult) {
            console.log('Failed to defer interaction, aborting start-festival command');
            return;
        }
        
        try {
            // Définir le serveur actuel pour le gestionnaire de festival
            setCurrentGuildId(interaction.guild.id);
            
            // Charger la configuration
            const config = await loadConfig(interaction.guild.id);
            
            // Vérifier si un salon d'annonces est configuré
            if (!config.announcementChannelId) {
                return await safeEdit(interaction, {
                    content: '⚠️ Aucun salon d\'annonces n\'a été configuré. Veuillez utiliser `/config channel` pour en définir un avant de créer un festival.'
                });
            }

            // Étape 1: Choix de la taille des équipes
            const embed = new EmbedBuilder()
                .setColor('#0099ff')
                .setTitle('🎮 Configuration du Festival - Étape 1/4')
                .setDescription('Choisissez la taille des équipes pour ce festival:')
                .addFields(
                    { name: '👥 2v2', value: 'Équipes de 2 joueurs - Matchs rapides', inline: true },
                    { name: '👥 3v3', value: 'Équipes de 3 joueurs - Équilibre parfait', inline: true },
                    { name: '👥 4v4', value: 'Équipes de 4 joueurs - Expérience complète', inline: true }
                );

            const teamSizeRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('teamsize_2')
                        .setLabel('2v2')
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId('teamsize_3')
                        .setLabel('3v3')
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId('teamsize_4')
                        .setLabel('4v4')
                        .setStyle(ButtonStyle.Success)
                );

            // Stocker les données de configuration temporaires
            interaction.client.festivalSetup = interaction.client.festivalSetup || {};
            interaction.client.festivalSetup[interaction.user.id] = {
                step: 1,
                config: config
            };

            await safeEdit(interaction, {
                content: null, // Effacer le message de chargement
                embeds: [embed],
                components: [teamSizeRow]
            });

        } catch (error) {
            console.error('Erreur lors de la configuration du festival:', error);
            
            // Only attempt to respond if the interaction was successfully deferred
            if (interaction.deferred) {
                try {
                    await safeEdit(interaction, {
                        content: `❌ Une erreur s'est produite: ${error.message}`
                    });
                } catch (editError) {
                    console.error('Failed to send error message:', editError);
                }
            }
        }
    }
};