const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const fs = require('fs').promises;
const path = require('path');

// Chemin vers le fichier de configuration
const configPath = path.join(__dirname, '../../data/config.json');

// Structure de configuration par défaut
const defaultConfig = {
    announcementChannelId: null,
    announcementRoleId: null
};

// Fonction pour charger la configuration
async function loadConfig() {
    try {
        // Créer le dossier data s'il n'existe pas
        const dataDir = path.join(__dirname, '../../data');
        await fs.mkdir(dataDir, { recursive: true });
        
        const data = await fs.readFile(configPath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        if (error.code === 'ENOENT') {
            // Si le fichier n'existe pas, retourner la config par défaut
            return { ...defaultConfig };
        }
        console.error('Erreur lors du chargement de la configuration:', error);
        throw error;
    }
}

// Fonction pour sauvegarder la configuration
async function saveConfig(config) {
    try {
        // Créer le dossier data s'il n'existe pas
        const dataDir = path.join(__dirname, '../../data');
        await fs.mkdir(dataDir, { recursive: true });
        
        await fs.writeFile(configPath, JSON.stringify(config, null, 2));
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
        
        try {
            const config = await loadConfig();
            
            if (subcommand === 'channel') {
                const channel = interaction.options.getChannel('channel');
                config.announcementChannelId = channel.id;
                await saveConfig(config);
                
                await interaction.reply({
                    content: `Le salon d'annonces par défaut a été défini sur ${channel}`,
                    ephemeral: true
                });
            } 
            else if (subcommand === 'role') {
                const role = interaction.options.getRole('role');
                config.announcementRoleId = role.id;
                await saveConfig(config);
                
                await interaction.reply({
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
                
                await interaction.reply({
                    embeds: [embed],
                    ephemeral: true
                });
            }
        } catch (error) {
            console.error('Erreur lors de la configuration:', error);
            await interaction.reply({
                content: `Une erreur s'est produite: ${error.message}`,
                ephemeral: true
            });
        }
    },
    
    // Exporter les fonctions pour les utiliser ailleurs
    loadConfig,
    saveConfig
};