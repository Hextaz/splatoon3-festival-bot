const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const DataAdapter = require('../utils/dataAdapter');
const { safeReply } = require('../utils/responseUtils');

// Structure de configuration par défaut
const defaultConfig = {
    announcementChannelId: null,
    announcementRoleId: null
};

// Fonction pour charger la configuration
async function loadConfig(guildId = null) {
    try {
        if (!guildId) {
            // Si pas de guildId fourni, retourner la config par défaut
            return { ...defaultConfig };
        }

        const adapter = new DataAdapter(guildId);
        const data = await adapter.loadConfig(guildId);
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

        const adapter = new DataAdapter(guildId);
        await adapter.saveConfig(guildId, config);
        console.log(`✅ Configuration sauvegardée pour le serveur ${guildId}`);
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
        const subcommand = interaction.options.getSubcommand();
        const guildId = interaction.guild?.id;
        
        if (!guildId) {
            return await safeReply(interaction, {
                content: 'Cette commande doit être utilisée dans un serveur.',
                ephemeral: true
            });
        }
        
        try {
            const config = await loadConfig(guildId);
            
            if (subcommand === 'channel') {
                const channel = interaction.options.getChannel('channel');
                config.announcementChannelId = channel.id;
                await saveConfig(config, guildId);
                
                return await safeReply(interaction, {
                    content: `Le salon d'annonces par défaut a été défini sur ${channel}`,
                    ephemeral: true
                });
            } 
            else if (subcommand === 'role') {
                const role = interaction.options.getRole('role');
                config.announcementRoleId = role.id;
                await saveConfig(config, guildId);
                
                return await safeReply(interaction, {
                    content: `Le rôle à mentionner a été défini sur ${role}`,
                    ephemeral: true
                });
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
                
                return await safeReply(interaction, {
                    embeds: [embed],
                    ephemeral: true
                });
            }
        } catch (error) {
            console.error('Erreur lors de la configuration:', error);
            return await safeReply(interaction, {
                content: `Une erreur s'est produite: ${error.message}`,
                ephemeral: true
            });
        }
    },
    
    // Exporter les fonctions pour les utiliser ailleurs
    loadConfig,
    saveConfig
};