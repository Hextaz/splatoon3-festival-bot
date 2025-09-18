const { SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
const scoreTracker = require('../utils/scoreTracker');
const { findTeamByMember, getAllTeams, saveTeams } = require('../utils/teamManager');
const { scheduleMatchChannelDeletion } = require('../utils/channelManager');
const { pendingResults } = require('../utils/interactionHandlers');
const { safeReply } = require('../utils/responseUtils'); 

module.exports = {
    data: new SlashCommandBuilder()
        .setName('results')
        .setDescription('Déclarer le résultat de votre match actuel'),

    async execute(interaction) {
        await interaction.deferReply({ });
        
        try {
            // Vérifier si l'utilisateur est membre d'une équipe
            const userTeam = findTeamByMember(interaction.user.id, interaction.guild.id);
            if (!userTeam) {
                return await interaction.editReply({
                    content: "Vous n'êtes membre d'aucune équipe."
                });
            }
            
            // Vérifier si l'utilisateur est capitaine de son équipe
            if (!userTeam.isLeader(interaction.user.id)) {
                return await interaction.editReply({
                    content: "Seul le capitaine de l'équipe peut déclarer les résultats d'un match."
                });
            }
            
            // Vérifier si l'équipe est en match
            if (!userTeam.currentOpponent) {
                return await interaction.editReply({
                    content: "Votre équipe n'est pas actuellement en match."
                });
            }
            
            // Récupérer l'équipe adverse
            const allTeams = await getAllTeams();
            const opponentTeam = allTeams.find(t => t.name === userTeam.currentOpponent);
            if (!opponentTeam) {
                return await interaction.editReply({
                    content: "Équipe adverse introuvable. Veuillez contacter un administrateur."
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
                    return await interaction.editReply({
                        content: `L'équipe adverse a déjà déclaré un résultat. Veuillez attendre leur message de confirmation dans le salon de match.`
                    });
                } else {
                    // Si c'est cette équipe qui a déjà déclaré, montrer son résultat actuel
                    return await safeReply(interaction, {
                        content: `Vous avez déjà déclaré que votre équipe a ${pendingResult.result === 'V' ? 'gagné' : 'perdu'}. Attendez la confirmation de l'équipe adverse.`
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
            await safeReply(interaction, {
                content: `Capitaine ${interaction.user}, veuillez déclarer le résultat de votre match contre l'équipe **${opponentTeam.name}**:`,
                components: [row],
                ephemeral: false
            });
            
        } catch (error) {
            console.error('Erreur dans la commande results:', error);
            await safeReply(interaction, {
                content: `Une erreur s'est produite: ${error.message}`
            });
        }
    }
};