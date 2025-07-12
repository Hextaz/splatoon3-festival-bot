const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const DataAdapter = require('../utils/dataAdapter');
const { safeDefer, smartReply } = require('../utils/responseUtils');

// Structure de configuration par défaut
const defaultConfig = {
    announcementChannelId: null,
    announcementRoleId: null
};

const dataAdapter = new DataAdapter();

// Fonction pour charger la configuration
async function loadConfig(guildId = null) {
    try {
        if (!guildId) {
            // Si pas de guildId fourni, retourner la config par défaut
            return { ...defaultConfig };
        }

        const data = await dataAdapter.loadConfig(guildId);
        return data || { ...defaultConfig };
    } catch (error) {
        console.error('Erreur lors du chargement de la configuration:', error);
        return { ...defaultConfig };
    }
}

// Fonction pour sauvegarder la configuration
async function saveConfig(config, guildId) {
    try {
        if (!guildId) {
            throw new Error('Guild ID required for saving config');
        }

        await dataAdapter.saveConfig(guildId, config);
    } catch (error) {
        console.error('Erreur lors de la sauvegarde de la configuration:', error);
        throw error;
    }
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('config')
        .setDescription('Configurer les paramètres du bot (Admin uniquement)')
        .setDefaultMemberPermissions(PermissionFlagsBits.ADMINISTRATOR)
        .addSubcommand(subcommand => 
            subcommand
                .setName('channel')
                .setDescription('Définir le salon d\'annonces par défaut')
                .addChannelOption(option =>
                    option.setName('channel')
                    .setDescription('Le salon d\'annonces à définir')
                    .setRequired(true)))
        .addSubcommand(subcommand => 
            subcommand
                .setName('role')
                .setDescription('Définir le rôle à mentionner dans les annonces')
                .addRoleOption(option =>
                    option.setName('role')
                    .setDescription('Le rôle à mentionner')
                    .setRequired(true)))
        .addSubcommand(subcommand => 
            subcommand
                .setName('show')
                .setDescription('Afficher la configuration actuelle')),
    
    async execute(interaction) {
        // Try to defer immediately to prevent timeout on database operations
        const deferSuccess = await safeDefer(interaction, true);
        
        const subcommand = interaction.options.getSubcommand();
        const guildId = interaction.guild?.id;
        
        // Only prefer followUp if deferral actually succeeded
        const preferFollowUp = deferSuccess !== null && (interaction.deferred || interaction.replied);
        
        if (!guildId) {
            return await smartReply(interaction, {
                content: 'Cette commande doit être utilisée dans un serveur.',
                ephemeral: true
            }, preferFollowUp);
        }
        
        try {
            const config = await loadConfig(guildId);
            
            if (subcommand === 'channel') {
                const channel = interaction.options.getChannel('channel');
                config.announcementChannelId = channel.id;
                await saveConfig(config, guildId);
                
                return await smartReply(interaction, {
                    content: `Le salon d'annonces par défaut a été défini sur ${channel}`,
                    ephemeral: true
                }, preferFollowUp);
            } 
            else if (subcommand === 'role') {
                const role = interaction.options.getRole('role');
                config.announcementRoleId = role.id;
                await saveConfig(config, guildId);
                
                return await smartReply(interaction, {
                    content: `Le rôle à mentionner a été défini sur ${role}`,
                    ephemeral: true
                }, preferFollowUp);
            } 
            else if (subcommand === 'show') {
                const embed = new EmbedBuilder()
                    .setColor('#0099ff')
                    .setTitle('Configuration actuelle')
                    .setDescription('Voici les paramètres actuels du bot')
                    .addFields(
                        { 
                            name: 'Salon d\'annonces', 
                            value: config.announcementChannelId ? `<#${config.announcementChannelId}>` : 'Non défini' 
                        },
                        { 
                            name: 'Rôle à mentionner', 
                            value: config.announcementRoleId ? `<@&${config.announcementRoleId}>` : 'Non défini' 
                        }
                    )
                    .setTimestamp();
                
                return await smartReply(interaction, {
                    embeds: [embed],
                    ephemeral: true
                }, preferFollowUp);
            }
        } catch (error) {
            console.error('Erreur lors de la configuration:', error);
            return await smartReply(interaction, {
                content: `Une erreur s'est produite: ${error.message}`,
                ephemeral: true
            }, preferFollowUp);
        }
    },
    
    // Exporter les fonctions pour les utiliser ailleurs
    loadConfig,
    saveConfig
};