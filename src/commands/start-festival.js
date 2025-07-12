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
        try {
            // Définir le serveur actuel pour le gestionnaire de festival
            setCurrentGuildId(interaction.guild.id);
            
            // Defer la réponse pour avoir le temps de traiter
            await safeDefer(interaction, true);
            
            // Charger la configuration
            const config = await loadConfig(interaction.guild.id);
            
            // Vérifier si un salon d'annonces est configuré
            if (!config.announcementChannelId) {
                return await safeEdit(interaction, {
                    content: '⚠️ Aucun salon d\'annonces n\'a été configuré. Veuillez utiliser `/config channel` pour en définir un avant de créer un festival.'
                });
            }

            // Interface unique optimisée - Toutes les options sur une page
            const embed = new EmbedBuilder()
                .setColor('#0099ff')
                .setTitle('🎮 Configuration Rapide du Festival')
                .setDescription('**Configurez tous les paramètres en une seule fois :**\n*Sélectionnez vos options ci-dessous, puis cliquez sur "Continuer"*')
                .addFields(
                    { name: '� Étapes suivantes', value: '1️⃣ Sélectionner les options\n2️⃣ Définir les camps et dates\n3️⃣ Lancer le festival', inline: false }
                );

            // Dropdown pour la taille des équipes
            const teamSizeSelect = new StringSelectMenuBuilder()
                .setCustomId('select_teamsize')
                .setPlaceholder('🏆 Choisir la taille des équipes')
                .addOptions([
                    {
                        label: '2v2 - Matchs Rapides',
                        description: 'Équipes de 2 joueurs, parties courtes et intenses',
                        value: '2',
                        emoji: '⚡'
                    },
                    {
                        label: '3v3 - Équilibre Parfait',
                        description: 'Équipes de 3 joueurs, format équilibré',
                        value: '3',
                        emoji: '⚖️'
                    },
                    {
                        label: '4v4 - Expérience Complète',
                        description: 'Équipes de 4 joueurs, format classique Splatoon',
                        value: '4',
                        emoji: '🎮'
                    }
                ]);

            // Dropdown pour le mode de jeu
            const gameModeSelect = new StringSelectMenuBuilder()
                .setCustomId('select_gamemode')
                .setPlaceholder('🎯 Choisir le type de modes de jeu')
                .addOptions([
                    {
                        label: 'Guerre de Territoire',
                        description: 'Tous les matchs en Turf War uniquement',
                        value: 'turf',
                        emoji: '🌱'
                    },
                    {
                        label: 'Modes Pro Classés',
                        description: 'Zones, Tour, Rainmaker, Palourdes',
                        value: 'ranked',
                        emoji: '⚔️'
                    },
                    {
                        label: 'Défense de Zone',
                        description: 'Tous les matchs en Splat Zones uniquement',
                        value: 'splat_zones',
                        emoji: '🎯'
                    },
                    {
                        label: 'Modes Mixtes (Recommandé)',
                        description: 'BO3 avec des modes variés et maps dynamiques',
                        value: 'mixed',
                        emoji: '🎲'
                    }
                ]);

            // Dropdown pour les maps
            const mapModeSelect = new StringSelectMenuBuilder()
                .setCustomId('select_mapmode')
                .setPlaceholder('🗺️ Configuration des maps')
                .addOptions([
                    {
                        label: 'Toutes les Maps',
                        description: 'Utiliser toutes les maps disponibles',
                        value: 'all',
                        emoji: '✅'
                    },
                    {
                        label: 'Bannir des Maps',
                        description: 'Exclure certaines maps du festival',
                        value: 'ban',
                        emoji: '🚫'
                    },
                    {
                        label: 'Maps Populaires Seulement',
                        description: 'Sélection automatique des maps les plus appréciées',
                        value: 'popular',
                        emoji: '⭐'
                    }
                ]);

            const row1 = new ActionRowBuilder().addComponents(teamSizeSelect);
            const row2 = new ActionRowBuilder().addComponents(gameModeSelect);
            const row3 = new ActionRowBuilder().addComponents(mapModeSelect);
            
            // Bouton pour continuer (initialement désactivé)
            const continueButton = new ButtonBuilder()
                .setCustomId('festival_continue_setup')
                .setLabel('Continuer la Configuration')
                .setStyle(ButtonStyle.Success)
                .setEmoji('▶️')
                .setDisabled(true);

            const buttonRow = new ActionRowBuilder().addComponents(continueButton);

            // Stocker les données de configuration temporaires
            interaction.client.festivalSetup = interaction.client.festivalSetup || {};
            interaction.client.festivalSetup[interaction.user.id] = {
                step: 'advanced_setup',
                config: config,
                selections: {
                    teamSize: null,
                    gameMode: null,
                    mapMode: null
                }
            };

            await safeEdit(interaction, {
                content: null,
                embeds: [embed],
                components: [row1, row2, row3, buttonRow]
            });

        } catch (error) {
            console.error('Erreur lors de la configuration du festival:', error);
            if (interaction.deferred || interaction.replied) {
                await safeEdit(interaction, {
                    content: `Une erreur s'est produite: ${error.message}`
                });
            } else {
                await safeReply(interaction, {
                    content: `Une erreur s'est produite: ${error.message}`,
                    ephemeral: true
                });
            }
        }
    }
};