const { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const { getCurrentFestival } = require('../utils/festivalManager');
const { createTeam } = require('../utils/teamManager'); // Assurez-vous d'importer la fonction createTeam
const { safeReply } = require('../utils/responseUtils');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('create-team')
        .setDescription('Create a new team')
        .addStringOption(option =>
            option.setName('name')
                .setDescription('Enter your team name')
                .setRequired(true)),
    async execute(interaction) {
        const teamName = interaction.options.getString('name');
        
        // Récupérer le festival pour cette guild
        const festival = getCurrentFestival(interaction.guild.id);
        if (!festival) {
            return await safeReply(interaction, {
                content: 'Aucun festival n\'a été créé. Veuillez attendre que les administrateurs créent un festival.',
                ephemeral: true
            });
        }
        
        // AJOUTER INFORMATION SUR LE FORMAT
        const teamSize = festival.teamSize || 4;
        const formatDisplay = `${teamSize}v${teamSize}`;
        
        // Vérifier si le joueur a choisi un camp
        const member = interaction.member;
        let playerCamp = null;
        let playerCampName = null;
        
        // Vérifier les rôles du joueur
        for (let i = 0; i < festival.campNames.length; i++) {
            const campName = festival.campNames[i];
            const campRole = member.roles.cache.find(role => role.name === `Camp ${campName}`);
                    
            if (campRole) {
                playerCamp = `camp${i+1}`;
                playerCampName = campName;
                break;
            }
        }
        
        if (!playerCamp) {
            return await safeReply(interaction, {
                content: 'Vous devez d\'abord choisir un camp avec la commande `/vote` avant de pouvoir créer une équipe.',
                ephemeral: true
            });
        }
        
        // Créer l'embed de présentation
        const embed = new EmbedBuilder()
            .setColor('#0099FF')
            .setTitle('🏗️ Création d\'équipe')
            .setDescription(`Vous allez créer l'équipe **${teamName}** pour le camp **${playerCampName}**`)
            .addFields(
                { name: '📊 Format du festival', value: formatDisplay, inline: true },
                { name: '🎯 Camp', value: playerCampName, inline: true },
                { name: '👥 Taille d\'équipe', value: `${teamSize} joueurs`, inline: true }
            );
        
        // Créer les boutons pour le type d'équipe (ouverte/fermée)
        const openButton = new ButtonBuilder()
            .setCustomId(`team_open_${teamName}`)
            .setLabel('🔓 Équipe ouverte')
            .setStyle(ButtonStyle.Success);
                
        const closedButton = new ButtonBuilder()
            .setCustomId(`team_closed_${teamName}`)
            .setLabel('🔒 Équipe fermée (code requis)')
            .setStyle(ButtonStyle.Secondary);
                
        const buttonRow = new ActionRowBuilder().addComponents(openButton, closedButton);
        
        // Stocker temporairement les informations de l'équipe
        interaction.client.tempTeamData = interaction.client.tempTeamData || {};
        interaction.client.tempTeamData[interaction.user.id] = {
            teamName,
            camp: playerCamp,
            campDisplayName: playerCampName
        };
        
        await safeReply(interaction, {
            embeds: [embed],
            components: [buttonRow],
            ephemeral: true
        });
    },
};