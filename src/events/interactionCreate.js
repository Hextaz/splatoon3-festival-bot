const { InteractionType } = require('discord.js');
const { safeReply } = require('../utils/responseUtils');
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
        
        // Protection contre les doublons d'interaction avec détection triple couche
        if (!interaction.client._processedInteractions) {
            interaction.client._processedInteractions = new Map();
        }
        if (!interaction.client._lastUserActions) {
            interaction.client._lastUserActions = new Map();
        }
        if (!interaction.client._recentInteractions) {
            interaction.client._recentInteractions = new Map();
        }
        
        // Couche 1: Vérifier l'ID unique de l'interaction Discord
        const interactionKey = interaction.id;
        if (interaction.client._processedInteractions.has(interactionKey)) {
            const previousTime = interaction.client._processedInteractions.get(interactionKey);
            console.log(`🔄 Interaction duplicate ignorée (ID: ${interaction.id}): ${interaction.commandName || interaction.customId} (${startTime - previousTime}ms d'écart)`);
            return;
        }
        
        // Couche 2: Protection contre les actions utilisateur trop rapides (même action)
        const userActionKey = `${interaction.user.id}_${interaction.commandName || interaction.customId}`;
        const lastUserAction = interaction.client._lastUserActions.get(userActionKey) || 0;
        
        if (startTime - lastUserAction < 1000) { // Augmenté à 1 seconde pour être plus agressif
            console.log(`⚡ Action trop rapide ignorée: ${interaction.commandName || interaction.customId} (${startTime - lastUserAction}ms depuis la dernière)`);
            return;
        }
        
        // Couche 3: Protection contre les interactions très similaires dans une fenêtre de temps courte
        const recentKey = `${interaction.user.id}_${interaction.type}_${Math.floor(startTime / 2000)}`; // Fenêtre de 2 secondes
        if (interaction.client._recentInteractions.has(recentKey)) {
            const recentInteractions = interaction.client._recentInteractions.get(recentKey);
            const similarAction = recentInteractions.find(recent => 
                recent.commandName === (interaction.commandName || interaction.customId) ||
                (recent.customId && interaction.customId && recent.customId.startsWith(interaction.customId.split('_')[0]))
            );
            
            if (similarAction && startTime - similarAction.timestamp < 2000) {
                console.log(`🚫 Interaction similaire récente ignorée: ${interaction.commandName || interaction.customId} (${startTime - similarAction.timestamp}ms d'écart)`);
                return;
            }
        }
        
        // Marquer toutes les couches de protection
        interaction.client._processedInteractions.set(interactionKey, startTime);
        interaction.client._lastUserActions.set(userActionKey, startTime);
        
        // Ajouter à la liste des interactions récentes
        if (!interaction.client._recentInteractions.has(recentKey)) {
            interaction.client._recentInteractions.set(recentKey, []);
        }
        interaction.client._recentInteractions.get(recentKey).push({
            id: interaction.id,
            commandName: interaction.commandName,
            customId: interaction.customId,
            timestamp: startTime
        });
        
        // Nettoyage automatique
        setTimeout(() => {
            interaction.client._processedInteractions.delete(interactionKey);
        }, 10000);
        
        if (!interaction.client._lastCleanup || startTime - interaction.client._lastCleanup > 30000) {
            interaction.client._lastCleanup = startTime;
            // Nettoyer les anciennes actions (plus de 10 secondes)
            for (const [key, timestamp] of interaction.client._lastUserActions.entries()) {
                if (startTime - timestamp > 10000) {
                    interaction.client._lastUserActions.delete(key);
                }
            }
            // Nettoyer les interactions récentes (plus de 5 secondes)
            for (const [key, interactions] of interaction.client._recentInteractions.entries()) {
                const filtered = interactions.filter(i => startTime - i.timestamp <= 5000);
                if (filtered.length === 0) {
                    interaction.client._recentInteractions.delete(key);
                } else {
                    interaction.client._recentInteractions.set(key, filtered);
                }
            }
        }
        
        console.log(`📱 Interaction received: ${interaction.commandName || interaction.customId} at ${startTime}`);
        
        try {
            // CRITICAL: Final safety check before processing
            if (interaction.replied || interaction.deferred) {
                console.log(`⚠️ Interaction already handled: ${interaction.commandName || interaction.customId}`);
                return;
            }
            
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
                    // Double-check interaction state right before defer
                    if (interaction.replied) {
                        console.log(`⚠️ Interaction already replied, skipping defer: ${interaction.commandName || interaction.customId}`);
                    } else if (interaction.deferred) {
                        console.log(`⚠️ Interaction already deferred, skipping defer: ${interaction.commandName || interaction.customId}`);
                    } else {
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
                    
                    // Spécialiser la gestion d'erreur selon le code
                    if (deferError.code === 10062) {
                        console.log(`🚫 Interaction expired before defer (${interaction.id})`);
                    } else if (deferError.code === 40060) {
                        console.log(`🚫 Interaction already acknowledged (${interaction.id})`);
                    } else {
                        console.log(`🚫 Unknown defer error (${interaction.id}):`, deferError.message);
                    }
                    return; // Don't continue processing if defer failed
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
                } else if (interaction.customId.startsWith('debug_')) {
                    await handleDebugButton(interaction);
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

async function handleDebugButton(interaction) {
    try {
        await interaction.deferUpdate({ flags: 64 });
        
        const { safeEdit } = require('../utils/responseUtils');
        const { EmbedBuilder } = require('discord.js');
        
        const buttonId = interaction.customId;
        const timestamp = Date.now();
        
        const embed = new EmbedBuilder()
            .setColor('#00ff00')
            .setTitle('✅ Debug Button Response')
            .addFields(
                { name: 'Button ID', value: buttonId, inline: true },
                { name: 'User', value: interaction.user.username, inline: true },
                { name: 'Timestamp', value: new Date(timestamp).toISOString(), inline: true },
                { name: 'Interaction ID', value: interaction.id, inline: true },
                { name: 'Processing Time', value: `${Date.now() - timestamp}ms`, inline: true }
            );
        
        await safeEdit(interaction, { embeds: [embed], components: [] });
        
    } catch (error) {
        console.error('Erreur dans handleDebugButton:', error);
    }
}

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
            const { safeEdit } = require('../utils/responseUtils');
            await safeEdit(interaction, {
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