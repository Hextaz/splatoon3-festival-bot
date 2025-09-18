const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { findTeamByMember } = require('../utils/teamManager');
const { getCurrentFestival } = require('../utils/festivalManager');
const { startMatchSearch } = require('../utils/matchSearch');
const { safeReply, safeFollowUp } = require('../utils/responseUtils');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('search-match')
        .setDescription('Rechercher un match contre une autre équipe'),
    
    async execute(interaction) {
        try {
            // Vérifier si un festival est actif
            const festival = getCurrentFestival();
            if (!festival || !festival.isActive) {
                return await safeReply(interaction, {
                    content: 'Aucun festival actif actuellement. Les matchs seront disponibles quand le festival démarrera.',
                    ephemeral: true
                });
            }
            
            // Vérifier si l'utilisateur est dans une équipe
            const team = findTeamByMember(interaction.user.id);
            if (!team) {
                return await safeReply(interaction, {
                    content: "Vous n'êtes membre d'aucune équipe. Rejoignez ou créez une équipe d'abord.",
                    ephemeral: true
                });
            }
            
            // NOUVELLE VÉRIFICATION ADAPTÉE AU FORMAT DU FESTIVAL
            const requiredSize = festival.teamSize || 4;
            const currentSize = team.members.length;
            
            if (currentSize < requiredSize) {
                const formatDisplay = `${requiredSize}v${requiredSize}`;
                return await safeReply(interaction, {
                    content: `Votre équipe doit avoir exactement ${requiredSize} membres pour rechercher un match en ${formatDisplay}. Votre équipe actuelle : ${currentSize}/${requiredSize} membres. Recrutez ${requiredSize - currentSize} joueur(s) supplémentaire(s) !`,
                    ephemeral: true
                });
            }
            
            // Vérifier si l'équipe est déjà en match
            if (team.currentOpponent) {
                return await safeReply(interaction, {
                    content: `Votre équipe est déjà en match contre l'équipe ${team.currentOpponent}. Terminez ce match avant d'en chercher un nouveau.`,
                    ephemeral: true
                });
            }
            
            // Lancer la recherche de match
            await startMatchSearch(interaction, team);
            
        } catch (error) {
            console.error('Error in search-match command:', error);
            
            // Vérifier si l'interaction a déjà été répondue
            if (!interaction.replied && !interaction.deferred) {
                await safeReply(interaction, {
                    content: `Une erreur s'est produite: ${error.message}`,
                    ephemeral: true
                });
            } else {
                // Si l'interaction a déjà été répondue, utiliser followUp
                await safeFollowUp(interaction, {
                    content: `Une erreur s'est produite: ${error.message}`,
                    ephemeral: true
                });
            }
        }
    },
};