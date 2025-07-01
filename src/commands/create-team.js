const { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getCurrentFestival } = require('../utils/festivalManager');
const { createTeam } = require('../utils/teamManager'); // Assurez-vous d'importer la fonction createTeam

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
        
        // Récupérer le festival
        const festival = getCurrentFestival();
        if (!festival) {
            return await interaction.reply({
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
            return await interaction.reply({
                content: 'Vous devez d\'abord choisir un camp avec la commande `/vote` avant de pouvoir créer une équipe.',
                ephemeral: true
            });
        }
        
        // Créer les boutons pour le type d'équipe (ouverte/fermée)
        const openButton = new ButtonBuilder()
            .setCustomId(`open_${teamName}`)
            .setLabel('Équipe ouverte')
            .setStyle(ButtonStyle.Success);
                
        const closedButton = new ButtonBuilder()
            .setCustomId(`closed_${teamName}`)
            .setLabel('Équipe fermée (code requis)')
            .setStyle(ButtonStyle.Danger);
                
        const buttonRow = new ActionRowBuilder().addComponents(openButton, closedButton);
        
        // Stocker temporairement les informations de l'équipe
        interaction.client.tempTeamData = interaction.client.tempTeamData || {};
        interaction.client.tempTeamData[interaction.user.id] = {
            teamName,
            camp: playerCamp,
            campDisplayName: playerCampName
        };
        
        try {
            // Créer l'équipe
            const team = createTeam(teamName, interaction.user.id, playerCamp, true, null, interaction.guild);
            
            // Message de succès adapté au format
            await interaction.reply({
                content: `✅ Équipe **${teamName}** créée avec succès pour le camp **${playerCampName}** !\n\n` +
                        `📊 **Format du festival** : ${formatDisplay}\n` +
                        `👥 **Membres actuels** : 1/${teamSize}\n` +
                        `📝 **Prochaine étape** : Recrutez ${teamSize - 1} joueur(s) supplémentaire(s) pour compléter votre équipe.\n\n` +
                        `💡 Les autres joueurs peuvent vous rejoindre avec \`/join-team name:${teamName}\``,
                ephemeral: true
            });
            
        } catch (error) {
            await interaction.reply({
                content: `Erreur lors de la création de l'équipe: ${error.message}`,
                ephemeral: true
            });
        }
    },
};