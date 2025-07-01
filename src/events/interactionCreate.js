const { InteractionType } = require('discord.js');
const { 
    handleModalSubmit, 
    handleLeaveTeam, 
    handleKickMember, 
    handleTeamsList, 
    handleVoteInteraction, 
    handleMatchupInteraction, 
    handleResultEntry, 
    handleMatchupModal, 
    handleCampSelect, 
    handleTeamTypeButton, 
    handleDurationButton, 
    handleCreateFestivalConfirm, 
    handleVoteButton, 
    handleConfigSelect, 
    handleCancelSearchButton, 
    createTeamRole, 
    handleResultButton, 
    handleConfirmButton, 
    handleRejectButton, 
    handleUseDefaultChannel, 
    handleSelectCustomChannel,
    handleFestivalSetup,
    handleMapBanSelection,
    handleFinalFestivalSetup,
    handleFestivalDuration
} = require('../utils/interactionHandlers');

module.exports = {
    name: 'interactionCreate',
    async execute(interaction) {
        try {
            if (interaction.type === InteractionType.ApplicationCommand) {
                // Cherche et exécute la commande dans la collection client.commands
                const command = interaction.client.commands.get(interaction.commandName);
                if (!command) return;
                
                await command.execute(interaction);
            } 
            else if (interaction.type === InteractionType.ModalSubmit) {
                await handleModalSubmit(interaction);
            }
            else if (interaction.isStringSelectMenu()) {
                if (interaction.customId === 'campSelect') {
                    await handleCampSelect(interaction);
                } else if (interaction.customId === 'announcementChannelSelect') {
                    await handleAnnouncementChannelSelect(interaction);
                } else if (interaction.customId === 'config_channel_select' || interaction.customId === 'config_role_select') {
                    await handleConfigSelect(interaction);
                } else if (interaction.customId === 'mapban_selection') {
                    await handleMapBanSelection(interaction);
                } else if (interaction.customId === 'doc_section_select') {
                    await handleDocumentationSelect(interaction);
                }
            }
            else if (interaction.isButton()) {
                if (interaction.customId.startsWith('open_') || interaction.customId.startsWith('closed_')) {
                    await handleTeamTypeButton(interaction);
                } else if (interaction.customId.startsWith('duration_')) {
                    await handleDurationButton(interaction);
                } else if (interaction.customId === 'createFestivalConfirm') {
                    await handleCreateFestivalConfirm(interaction);
                } else if (interaction.customId === 'use_default_channel') {
                    await handleUseDefaultChannel(interaction);
                } else if (interaction.customId === 'select_custom_channel') {
                    await handleSelectCustomChannel(interaction);
                } else if (interaction.customId.startsWith('cancel_search_')) {
                    await handleCancelSearchButton(interaction);
                } else if (interaction.customId.startsWith('vote_')) {
                    await handleVoteButton(interaction);
                } else if (interaction.customId.startsWith('result_win_') || interaction.customId.startsWith('result_lose_')) {
                    await handleResultButton(interaction);
                } else if (interaction.customId.startsWith('confirm_')) {
                    await handleConfirmButton(interaction);
                } else if (interaction.customId.startsWith('reject_')) {
                    await handleRejectButton(interaction);
                } else if (interaction.customId.startsWith('teamsize_') || 
                           interaction.customId.startsWith('gamemode_') || 
                           interaction.customId.startsWith('mapban_')) {
                    await handleFestivalSetup(interaction);
                } else if (interaction.customId.startsWith('festivalduration_')) {
                    await handleFestivalDuration(interaction);
                }
            }
        } catch (error) {
            console.error('Interaction error:', error);
            
            // Ne pas essayer de répondre si l'interaction est expirée
            if (error.code === 10062) {
                console.log('Interaction expirée ou déjà répondue. Abandon de la réponse d\'erreur.');
                return;
            }
            
            try {
                const reply = { content: 'Une erreur est survenue lors de l\'exécution de cette commande.', ephemeral: true };
                
                // Vérifier si l'interaction est toujours valide avant de répondre
                if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply(reply).catch(e => {
                        console.error('Impossible d\'envoyer le message d\'erreur:', e);
                    });
                } else {
                    await interaction.followUp(reply).catch(e => {
                        console.error('Impossible d\'envoyer le message d\'erreur en followUp:', e);
                    });
                }
            } catch (replyError) {
                console.error('La gestion d\'erreur a échoué:', replyError);
            }
        }
    },
};

async function handleDocumentationSelect(interaction) {
    const section = interaction.values[0];
    const { getCurrentFestival } = require('../utils/festivalManager');
    const festival = getCurrentFestival();
    
    // NOUVEAU : Importer les fonctions directement depuis le module
    const {
        showCompleteGuide,
        showGettingStarted,
        showTeamManagement,
        showMatchSystem,
        showScoreSystem,
        showCommandsList,
        showRules
    } = require('../commands/documentation');
    
    // Simuler une interaction avec la section sélectionnée
    const fakeInteraction = {
        ...interaction,
        options: {
            getString: () => section
        },
        reply: async (options) => {
            await interaction.update({
                embeds: options.embeds,
                components: [],
                ephemeral: true
            });
        }
    };
    
    // Appeler la fonction appropriée selon la section
    switch (section) {
        case 'guide':
            await showCompleteGuide(fakeInteraction, festival);
            break;
        case 'start':
            await showGettingStarted(fakeInteraction, festival);
            break;
        case 'team':
            await showTeamManagement(fakeInteraction, festival);
            break;
        case 'matches':
            await showMatchSystem(fakeInteraction, festival);
            break;
        case 'scores':
            await showScoreSystem(fakeInteraction, festival);
            break;
        case 'commands':
            await showCommandsList(fakeInteraction, festival);
            break;
        case 'rules':
            await showRules(fakeInteraction, festival);
            break;
    }
}