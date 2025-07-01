const { SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
const scoreTracker = require('../utils/scoreTracker');
const { findTeamByMember, getAllTeams, saveTeams } = require('../utils/teamManager');
const { scheduleMatchChannelDeletion } = require('../utils/channelManager');
const { pendingResults } = require('../utils/interactionHandlers'); 

module.exports = {
    data: new SlashCommandBuilder()
        .setName('results')
        .setDescription('Déclarer le résultat de votre match actuel'),

    async execute(interaction) {
        try {
            // Vérifier si l'utilisateur est membre d'une équipe
            const userTeam = findTeamByMember(interaction.user.id);
            if (!userTeam) {
                return await interaction.reply({
                    content: "Vous n'êtes membre d'aucune équipe.",
                    ephemeral: true
                });
            }
            
            // Vérifier si l'utilisateur est capitaine de son équipe
            if (!userTeam.isLeader(interaction.user.id)) {
                return await interaction.reply({
                    content: "Seul le capitaine de l'équipe peut déclarer les résultats d'un match.",
                    ephemeral: true
                });
            }
            
            // Vérifier si l'équipe est en match
            if (!userTeam.currentOpponent) {
                return await interaction.reply({
                    content: "Votre équipe n'est pas actuellement en match.",
                    ephemeral: true
                });
            }
            
            // Récupérer l'équipe adverse
            const opponentTeam = getAllTeams().find(t => t.name === userTeam.currentOpponent);
            if (!opponentTeam) {
                return await interaction.reply({
                    content: "Équipe adverse introuvable. Veuillez contacter un administrateur.",
                    ephemeral: true
                });
            }
            
            // Créer un ID unique pour ce match
            const { createMatchId } = require('../utils/interactionHandlers');
            const matchId = createMatchId(userTeam.name, opponentTeam.name);
            
            // Vérifier si une déclaration est déjà en attente pour ce match
            if (pendingResults.has(matchId)) {
                const pendingResult = pendingResults.get(matchId);
                
                // Si c'est l'autre équipe qui a déjà déclaré
                if (pendingResult.declaringTeam !== userTeam.name) {
                    // On ne montre pas les boutons, mais un message pour dire que l'autre équipe a déjà déclaré
                    return await interaction.reply({
                        content: `L'équipe adverse a déjà déclaré un résultat. Veuillez attendre leur message de confirmation dans le salon de match.`,
                        ephemeral: true
                    });
                } else {
                    // Si c'est cette équipe qui a déjà déclaré, montrer son résultat actuel
                    return await interaction.reply({
                        content: `Vous avez déjà déclaré que votre équipe a ${pendingResult.result === 'V' ? 'gagné' : 'perdu'}. Attendez la confirmation de l'équipe adverse.`,
                        ephemeral: true
                    });
                }
            }
            
            // Créer les boutons pour déclarer le résultat
            const winButton = new ButtonBuilder()
                .setCustomId(`result_win_${matchId}`)
                .setLabel('Victoire')
                .setStyle(ButtonStyle.Success);
                
            const loseButton = new ButtonBuilder()
                .setCustomId(`result_lose_${matchId}`)
                .setLabel('Défaite')
                .setStyle(ButtonStyle.Danger);
                
            const row = new ActionRowBuilder()
                .addComponents(winButton, loseButton);
                
            // Envoyer le message avec les boutons
            await interaction.reply({
                content: `Capitaine ${interaction.user}, veuillez déclarer le résultat de votre match contre l'équipe **${opponentTeam.name}**:`,
                components: [row],
                ephemeral: false
            });
            
        } catch (error) {
            console.error('Erreur dans la commande results:', error);
            await interaction.reply({
                content: `Une erreur s'est produite: ${error.message}`,
                ephemeral: true
            });
        }
    }
};