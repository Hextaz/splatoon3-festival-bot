const { InteractionType } = require('discord.js');
const { safeReply, safeUpdate } = require('../utils/responseUtils');
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
        const startTime = Date.now();
        
        // Protection contre les doublons d'interaction avec détection robuste
        if (!interaction.client._processedInteractions) {
            interaction.client._processedInteractions = new Map();
        }
        
        // Utiliser l'ID unique de l'interaction Discord lui-même comme clé principale
        const interactionKey = interaction.id;
        
        if (interaction.client._processedInteractions.has(interactionKey)) {
            const previousTime = interaction.client._processedInteractions.get(interactionKey);
            console.log(`🔄 Interaction duplicate ignorée (ID: ${interaction.id}): ${interaction.commandName || interaction.customId} (${startTime - previousTime}ms d'écart)`);
            return;
        }
        
        // Marquer l'interaction comme en cours de traitement avec son ID unique
        interaction.client._processedInteractions.set(interactionKey, startTime);
        setTimeout(() => {
            interaction.client._processedInteractions.delete(interactionKey);
        }, 10000); // 10 secondes pour être sûr
        
        // Protection additionnelle contre les clics rapides du même utilisateur/bouton
        const userActionKey = `${interaction.user.id}_${interaction.commandName || interaction.customId}`;
        const lastUserAction = interaction.client._lastUserActions?.get(userActionKey) || 0;
        
        if (!interaction.client._lastUserActions) {
            interaction.client._lastUserActions = new Map();
        }
        
        if (startTime - lastUserAction < 500) { // Moins de 500ms = probablement un double-clic
            console.log(`⚡ Action trop rapide ignorée: ${interaction.commandName || interaction.customId} (${startTime - lastUserAction}ms depuis la dernière)`);
            return;
        }
        
        interaction.client._lastUserActions.set(userActionKey, startTime);
        
        // Nettoyer les anciennes actions utilisateur (toutes les 30 secondes)
        if (!interaction.client._lastCleanup || startTime - interaction.client._lastCleanup > 30000) {
            interaction.client._lastCleanup = startTime;
            // Supprimer les actions plus anciennes que 10 secondes
            for (const [key, timestamp] of interaction.client._lastUserActions.entries()) {
                if (startTime - timestamp > 10000) {
                    interaction.client._lastUserActions.delete(key);
                }
            }
        }
        
        console.log(`📱 Interaction received: ${interaction.commandName || interaction.customId} at ${startTime}`);
        
        try {
            // CRITICAL: Immediate defer for critical commands that are known to timeout
            const criticalCommands = ['start-festival'];
            const criticalButtons = ['teamsize_', 'gamemode_', 'mapban_', 'festivalduration_'];
            const criticalModals = ['festivalSetupModal'];
            
            const isCriticalCommand = interaction.type === InteractionType.ApplicationCommand && 
                                     criticalCommands.includes(interaction.commandName);
            const isCriticalButton = interaction.isButton() && 
                                    criticalButtons.some(prefix => interaction.customId.startsWith(prefix));
            const isCriticalModal = interaction.type === InteractionType.ModalSubmit &&
                                   criticalModals.includes(interaction.customId);
            
            if (isCriticalCommand || isCriticalButton || isCriticalModal) {
                const deferStart = Date.now();
                try {
                    if (!interaction.deferred && !interaction.replied) {
                        if (interaction.isButton() || interaction.isStringSelectMenu()) {
                            console.log(`🔘 Using deferUpdate for button/select: ${interaction.customId}`);
                            await interaction.deferUpdate({ flags: 64 });
                        } else {
                            console.log(`💬 Using deferReply for command/modal: ${interaction.commandName || interaction.customId}`);
                            await interaction.deferReply({ flags: 64 });
                        }
                        console.log(`⚡ Critical defer completed in ${Date.now() - deferStart}ms`);
                    }
                } catch (deferError) {
                    console.error(`❌ Critical defer failed after ${Date.now() - deferStart}ms:`, deferError);
                    return;
                }
            }

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
            
            console.log(`✅ Interaction ${interaction.commandName || interaction.customId} completed in ${Date.now() - startTime}ms`);
            
        } catch (error) {
            console.error(`❌ Interaction ${interaction.commandName || interaction.customId} failed after ${Date.now() - startTime}ms:`, error);
            
            // Ne pas essayer de répondre si l'interaction est expirée
            if (error.code === 10062) {
                console.log('Interaction expirée ou déjà répondue. Abandon de la réponse d\'erreur.');
                return;
            }
            
            try {
                await safeReply(interaction, {
                    content: 'Une erreur est survenue lors de l\'exécution de cette commande.',
                    flags: 64 // Use flags instead of ephemeral
                });
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
            await safeUpdate(interaction, {
                embeds: options.embeds,
                components: []
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