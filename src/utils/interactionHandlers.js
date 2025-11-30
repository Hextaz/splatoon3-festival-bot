const { SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { createFestival, getCurrentFestival, createStartEmbed } = require('./festivalManager');
const { createTeam, joinTeam, leaveTeam, kickMember, findTeamByMember, findTeamByName, getAllTeams, generateTeamCode, saveTeams } = require('./teamManager');
const { getMatchup, validateResults, clearMatchup } = require('./matchmaking');
const { castVote } = require('./vote');
const scoreTracker = require('./scoreTracker');
const { scheduleMatchChannelDeletion } = require('./channelManager');
const { startMatchSearch, cleanupSearch } = require('./matchSearch');
const { loadConfig, saveConfig } = require('../commands/config');
const DataAdapter = require('./dataAdapter');
const { GAME_MODES, ALL_MAP_KEYS, MAPS } = require('../data/mapsAndModes');
const { safeReply, safeDefer, safeFollowUp, safeEdit } = require('./responseUtils');
const { parseFrenchDate } = require('./dateUtils');
const moment = require('moment-timezone');

// Global variables
const pendingResultsByGuild = new Map(); // Map<guildId, Map<key, value>>

// Fonction helper pour récupérer les résultats en attente d'une guilde
function getPendingResultsForGuild(guildId) {
    if (!pendingResultsByGuild.has(guildId)) {
        pendingResultsByGuild.set(guildId, new Map());
    }
    return pendingResultsByGuild.get(guildId);
}

// Fonction pour charger les résultats en attente d'une guilde spécifique
async function loadPendingResults(guildId) {
    try {
        if (!guildId) {
            console.error('Guild ID required for loadPendingResults');
            return;
        }

        const dataAdapter = new DataAdapter(guildId);
        const data = await dataAdapter.loadPendingResults(guildId);
        if (data) {
            const pendingResults = getPendingResultsForGuild(guildId);
            // Reconstituer la Map depuis l'objet JSON
            Object.entries(data).forEach(([key, value]) => {
                pendingResults.set(key, value);
            });
            
            console.log(`${pendingResults.size} résultats en attente chargés pour guilde ${guildId}`);
        }
    } catch (error) {
        console.error('Erreur lors du chargement des résultats en attente:', error);
    }
}

// Fonction pour sauvegarder les résultats en attente d'une guilde spécifique
async function savePendingResults(guildId) {
    try {
        if (!guildId) {
            console.error('Guild ID required for savePendingResults');
            return;
        }

        const pendingResults = getPendingResultsForGuild(guildId);
        // Convertir la Map en objet pour la sérialisation JSON
        const dataToSave = Object.fromEntries(pendingResults);
        const dataAdapter = new DataAdapter(guildId);
        await dataAdapter.savePendingResults(guildId, dataToSave);
    } catch (error) {
        console.error('Erreur lors de la sauvegarde des résultats en attente:', error);
    }
}

// Fonction d'initialisation pour une guilde spécifique
async function initializeForGuild(guildId) {
    if (!guildId) {
        console.error('Guild ID required for initialization');
        return;
    }
    
    console.log(`🔧 Initialisation interactionHandlers pour guilde ${guildId}`);
    await loadPendingResults(guildId);
}

// No automatic loading at module startup - wait for guildId to be set
// loadPendingResults();

function cleanupExpiredResults() {
    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000; // 24 heures
    
    let totalCleanedCount = 0;
    
    // Nettoyer pour chaque guilde
    for (const [guildId, pendingResults] of pendingResultsByGuild.entries()) {
        let cleanedCount = 0;
        for (const [matchId, result] of pendingResults.entries()) {
            if (now - result.timestamp > maxAge) {
                pendingResults.delete(matchId);
                cleanedCount++;
                totalCleanedCount++;
            }
        }
        
        if (cleanedCount > 0) {
            console.log(`${cleanedCount} résultats expirés supprimés pour guilde ${guildId}`);
            savePendingResults(guildId);
        }
    }
    
    if (totalCleanedCount > 0) {
        console.log(`${totalCleanedCount} résultats expirés supprimés au total`);
    }
}

// Le chargement des résultats se fait maintenant par guilde via loadPendingResults(guildId)
// Nettoyage périodique des résultats expirés
setInterval(cleanupExpiredResults, 60 * 60 * 1000); // Toutes les heures

// Gestionnaire pour le modal de configuration du festival
const handleFestivalSetupModal = async (interaction) => {
    try {
        // CRITICAL: Defer immédiatement pour éviter l'expiration
        if (!interaction.deferred && !interaction.replied) {
            await safeDefer(interaction, true);
        }
        
        // Récupérer les données du modal
        const title = interaction.fields.getTextInputValue('festivalTitle');
        const camp1 = interaction.fields.getTextInputValue('camp1Name');
        const camp2 = interaction.fields.getTextInputValue('camp2Name');
        const camp3 = interaction.fields.getTextInputValue('camp3Name');
        const startDateStr = interaction.fields.getTextInputValue('startDate');
        
        // Convertir la date de début (format: DD/MM/YYYY HH:MM)
        const dateRegex = /^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})$/;
        let startDate;
        
        try {
            if (!dateRegex.test(startDateStr)) {
                throw new Error("Format de date invalide. Utilisez JJ/MM/AAAA HH:MM");
            }
            
            // Utiliser l'utilitaire pour gérer correctement le fuseau horaire (Hiver UTC+1 / Été UTC+2)
            startDate = parseFrenchDate(startDateStr);
            
            if (isNaN(startDate.getTime())) {
                throw new Error("Date invalide");
            }

            const now = new Date();
            if (startDate <= now) {
                const nowParis = moment(now).tz("Europe/Paris").format("DD/MM/YYYY HH:mm:ss");
                const inputParis = moment(startDate).tz("Europe/Paris").format("DD/MM/YYYY HH:mm:ss");
                const diffSeconds = Math.round((now.getTime() - startDate.getTime()) / 1000);
                
                throw new Error(`La date doit être dans le futur.\nSaisie: ${inputParis}\nActuellement: ${nowParis}\n(Retard de ${diffSeconds} secondes)`);
            }
        } catch (error) {
            return await safeEdit(interaction, {
                content: `Erreur de format de date: ${error.message}`
            });
        }
        
        // Récupérer la configuration
        const config = interaction.client.configData || await loadConfig(interaction.guild.id);
        
        // Vérifier si un canal d'annonce est configuré
        if (!config.announcementChannelId) {
            return await safeEdit(interaction, {
                content: '⚠️ Aucun salon d\'annonces n\'est configuré. Veuillez utiliser `/config channel` pour en définir un.'
            });
        }
    
    // Créer les options pour la durée du festival
    const oneWeekButton = new ButtonBuilder()
        .setCustomId('duration_7')
        .setLabel('1 semaine')
        .setStyle(ButtonStyle.Primary);
        
    const twoWeeksButton = new ButtonBuilder()
        .setCustomId('duration_14')
        .setLabel('2 semaines')
        .setStyle(ButtonStyle.Secondary);
        
    const oneMonthButton = new ButtonBuilder()
        .setCustomId('duration_30')
        .setLabel('1 mois')
        .setStyle(ButtonStyle.Secondary);
        
    const customDateButton = new ButtonBuilder()
        .setCustomId('duration_custom')
        .setLabel('Date personnalisée')
        .setStyle(ButtonStyle.Secondary);
    
    // Créez une date par défaut 7 jours après le début
    const defaultEndDate = new Date(startDate);
    defaultEndDate.setDate(defaultEndDate.getDate() + 7);
    
    // Stocker les données temporaires
    interaction.client.tempFestivalData = {
        title,
        campNames: [camp1, camp2, camp3],
        startDate: startDate.toISOString(),
        endDate: defaultEndDate.toISOString(), // Date de fin par défaut
        announcementChannelId: config.announcementChannelId // Utiliser le canal configuré
    };

    // Créer l'embed
    const embed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle('Configuration du Festival')
        .setDescription(`Vous êtes en train de configurer le festival "${title}"`)
        .addFields(
            { name: 'Camps', value: `1. ${camp1}\n2. ${camp2}\n3. ${camp3}` },
            { name: 'Début', value: `<t:${Math.floor(startDate.getTime() / 1000)}:F>` },
            { name: 'Salon d\'annonces', value: `<#${config.announcementChannelId}>` },
            { name: 'Durée du festival', value: 'Veuillez choisir la durée du festival:' }
        );

    const durationRow = new ActionRowBuilder().addComponents(oneWeekButton, twoWeeksButton, oneMonthButton, customDateButton);

    await safeEdit(interaction, {
        embeds: [embed],
        components: [durationRow]
    });
    
    } catch (error) {
        console.error('Erreur dans handleFestivalSetupModal:', error);
        await safeEdit(interaction, {
            content: `Une erreur s'est produite: ${error.message}`
        });
    }
};

const handleCreateFestivalConfirm = async (interaction) => {
    // Reconnaître l'interaction immédiatement pour éviter le timeout
    await interaction.deferUpdate();
    
    const { tempFestivalData } = interaction.client;
    
    try {
        // Créer le festival
        const festival = await createFestival(
            tempFestivalData.title,
            tempFestivalData.campNames,
            tempFestivalData.startDate,
            tempFestivalData.endDate,
            tempFestivalData.announcementChannelId,
            interaction.guild
        );
        
        // Envoyer une annonce immédiate dans le canal d'annonce
        try {
            const channel = await interaction.client.channels.fetch(festival.announcementChannelId);
            if (channel) {
                // Charger la configuration pour obtenir le rôle à mentionner
                const config = await loadConfig(interaction.guild.id);
                const mentionText = config.announcementRoleId ? 
                    `<@&${config.announcementRoleId}> ` : '';
                
                // Créer un embed pour l'annonce de préparation
                const preEmbed = new EmbedBuilder()
                    .setColor('#FF9900')
                    .setTitle(`📣 Le Festival "${festival.title}" a été créé! 📣`)
                    .setDescription(`Vous pouvez dès maintenant commencer à vous préparer pour le festival!`)
                    .addFields(
                        { name: '⏳ Date de début', value: `<t:${Math.floor(new Date(festival.startDate).getTime() / 1000)}:F> (<t:${Math.floor(new Date(festival.startDate).getTime() / 1000)}:R>)` },
                        { name: '🗳️ Votez dès maintenant', value: 'Utilisez la commande `/vote` pour rejoindre l\'un des camps suivants:' },
                        { name: festival.campNames[0], value: 'Camp 1', inline: true },
                        { name: festival.campNames[1], value: 'Camp 2', inline: true },
                        { name: festival.campNames[2], value: 'Camp 3', inline: true },
                        { name: '👥 Formez votre équipe', value: 'Après avoir voté pour un camp, vous pourrez:\n- Créer votre équipe avec `/create-team`\n- Rejoindre une équipe existante avec `/join-team`\n- Consulter la liste des équipes avec `/teams-list`' },
                        { name: '🎮 Configuration', value: 
                            `**Taille d'équipe**: ${festival.getTeamSizeDisplay()}\n` +
                            `**Mode de jeu**: ${festival.getGameModeDisplay()}\n` +
                            `**Maps bannies**: ${festival.bannedMaps?.length || 0}`,
                            inline: false 
                        }
                    )
                    .setTimestamp();
                
                await channel.send({ 
                    content: `${mentionText}🎮 **NOUVEAU FESTIVAL EN PRÉPARATION!** 🎮`,
                    embeds: [preEmbed] 
                });
            }
        } catch (error) {
            console.error('Error sending initial announcement:', error);
        }
        
        // Créer l'embed de confirmation (code existant)
        const embed = new EmbedBuilder()
            .setColor('#00FF00')
            .setTitle('Festival créé avec succès')
            .setDescription(`Le festival "${tempFestivalData.title}" a été créé!`)
            .addFields(
                { name: 'Camps', value: tempFestivalData.campNames.join(', ') },
                { name: 'Début', value: `<t:${Math.floor(new Date(tempFestivalData.startDate).getTime() / 1000)}:F>` },
                { name: 'Fin', value: `<t:${Math.floor(new Date(tempFestivalData.endDate).getTime() / 1000)}:F>` },
                { name: 'Canal d\'annonce', value: `<#${tempFestivalData.announcementChannelId}>` }
            );
            
        // Nettoyer les données temporaires
        delete interaction.client.tempFestivalData;
        
        // Éditer la réponse différée au lieu d'utiliser update
        await safeEdit(interaction, {
            embeds: [embed],
            components: []
        });
    } catch (error) {
        console.error('Error creating festival:', error);
        await safeEdit(interaction, {
            content: `Erreur lors de la création du festival: ${error.message}`,
            embeds: [],
            components: []
        });
    }
};

const handleDurationButton = async (interaction) => {
    const { tempFestivalData } = interaction.client;
    const startDate = new Date(tempFestivalData.startDate);
    let endDate;
    
    if (interaction.customId === 'duration_7') {
        endDate = new Date(startDate);
        endDate.setDate(endDate.getDate() + 7);
    } else if (interaction.customId === 'duration_14') {
        endDate = new Date(startDate);
        endDate.setDate(endDate.getDate() + 14);
    } else if (interaction.customId === 'duration_30') {
        endDate = new Date(startDate);
        endDate.setDate(endDate.getDate() + 30);
    } else if (interaction.customId === 'duration_custom') {
        // Afficher le modal pour la date personnalisée
        const modal = new ModalBuilder()
            .setCustomId('customEndDateModal')
            .setTitle('Date de fin personnalisée');
        
        const customEndDateInput = new TextInputBuilder()
            .setCustomId('customEndDate')
            .setLabel('Date de fin (JJ/MM/AAAA HH:MM)')
            .setPlaceholder('Ex: 25/05/2024 18:00')
            .setStyle(TextInputStyle.Short)
            .setRequired(true);
        
        modal.addComponents(new ActionRowBuilder().addComponents(customEndDateInput));
        
        return await interaction.showModal(modal);
    }
    
    // Mettre à jour la date de fin
    tempFestivalData.endDate = endDate.toISOString();

    if (endDate <= startDate) {
        return await safeReply(interaction, {
            content: "Erreur: La date de fin calculée n'est pas après la date de début. Veuillez choisir une autre durée.",
            ephemeral: true
        });
    }
    
    // Créer un bouton de confirmation
    const confirmButton = new ButtonBuilder()
        .setCustomId('createFestivalConfirm')
        .setLabel('Créer le festival')
        .setStyle(ButtonStyle.Success);
    
    const confirmRow = new ActionRowBuilder().addComponents(confirmButton);
    
    // Mettre à jour l'embed
    const embed = EmbedBuilder.from(interaction.message.embeds[0])
        .setFields(
            { name: 'Camps', value: `1. ${tempFestivalData.campNames[0]}\n2. ${tempFestivalData.campNames[1]}\n3. ${tempFestivalData.campNames[2]}` },
            { name: 'Début', value: `<t:${Math.floor(startDate.getTime() / 1000)}:F>` },
            { name: 'Fin', value: `<t:${Math.floor(endDate.getTime() / 1000)}:F>` },
            { name: 'Salon d\'annonces', value: `<#${tempFestivalData.announcementChannelId}>` }
        );
    
    await safeEdit(interaction, {
        embeds: [embed],
        components: [confirmRow]
    });
};

const handleCustomEndDateModal = async (interaction) => {
    const { tempFestivalData } = interaction.client;
    const customDateStr = interaction.fields.getTextInputValue('customEndDate');
    const startDate = new Date(tempFestivalData.startDate);
    
    try {
        // Utiliser l'utilitaire pour gérer correctement le fuseau horaire (Hiver UTC+1 / Été UTC+2)
        const customEndDate = parseFrenchDate(customDateStr);
        
        if (isNaN(customEndDate.getTime())) {
            throw new Error("Date invalide");
        }
        
        if (customEndDate <= startDate) {
            throw new Error("La date de fin doit être après la date de début");
        }
        
        tempFestivalData.endDate = customEndDate.toISOString();
        
        // Créer un bouton de confirmation
        const confirmButton = new ButtonBuilder()
            .setCustomId('createFestivalConfirm')
            .setLabel('Créer le festival')
            .setStyle(ButtonStyle.Success);
        
        const confirmRow = new ActionRowBuilder().addComponents(confirmButton);
        
        // Créer un nouvel embed
        const embed = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle('Configuration du Festival')
            .setDescription(`Vous êtes en train de configurer le festival "${tempFestivalData.title}"`)
            .addFields(
                { name: 'Camps', value: `1. ${tempFestivalData.campNames[0]}\n2. ${tempFestivalData.campNames[1]}\n3. ${tempFestivalData.campNames[2]}` },
                { name: 'Début', value: `<t:${Math.floor(startDate.getTime() / 1000)}:F>` },
                { name: 'Fin', value: `<t:${Math.floor(customEndDate.getTime() / 1000)}:F>` },
                { name: 'Salon d\'annonces', value: `<#${tempFestivalData.announcementChannelId}>` }
            );
        
        await safeReply(interaction, {
            embeds: [embed],
            components: [confirmRow],
            ephemeral: true
        });
    } catch (error) {
        await safeReply(interaction, {
            content: `Erreur: ${error.message}. Veuillez recommencer la commande.`,
            ephemeral: true
        });
    }
};

// Modifier la fonction handleModalSubmit pour gérer le modal du festival
const handleModalSubmit = async (interaction) => {
    if (interaction.customId === 'festivalSetupModal') {
        await handleFestivalSetupModal(interaction);
    } else if (interaction.customId === 'customEndDateModal') {
        await handleCustomEndDateModal(interaction);
    } else if (interaction.customId === 'createTeamModal') {
        await handleCreateTeamModal(interaction);
    } else if (interaction.customId === 'joinTeamModal') {
        await handleJoinTeamModal(interaction);
    } else if (interaction.customId === 'matchupModal') {
        await handleMatchupModal(interaction);
    } else if (interaction.customId === 'festival_final_setup') {
        await handleFinalFestivalSetup(interaction);
    } else if (interaction.customId === 'festival_camp3_setup') {
        await handleCamp3Setup(interaction);
    }
};

const handleVoteButton = async (interaction) => {
    // Format: vote_campX_campName
    const parts = interaction.customId.split('_');
    const campId = parts[1]; // camp1, camp2, camp3
    const campName = parts[2]; // Nom réel du camp
    const festival = getCurrentFestival(interaction.guild.id);
    
    if (!festival) {
        return await safeEdit(interaction, {
            content: 'Le festival n\'est plus disponible. Veuillez réessayer plus tard.',
            embeds: [],
            components: []
        });
    }
    
    try {
        // Vérifier si le joueur a déjà un rôle de camp
        const member = interaction.member;
        const existingCampRoles = festival.campNames.map(name => 
            member.roles.cache.find(role => role.name === `Camp ${name}`)
        ).filter(role => role);
        
        if (existingCampRoles.length > 0) {
            return await safeEdit(interaction, {
                content: `Vous avez déjà rejoint le camp ${existingCampRoles[0].name.replace('Camp ', '')}. Vous ne pouvez pas changer de camp.`,
                embeds: [],
                components: []
            });
        }
        
        // Trouver ou créer le rôle correspondant au camp
        const guild = interaction.guild;
        let campRole = guild.roles.cache.find(role => role.name === `Camp ${campName}`);
        
        if (!campRole) {
            // Définir la couleur en fonction du camp
            let color;
            switch (campId) {
                case 'camp1': color = '#FF0000'; break; // Rouge
                case 'camp2': color = '#00FF00'; break; // Vert
                case 'camp3': color = '#0000FF'; break; // Bleu
                default: color = '#FFFF00'; // Jaune par défaut
            }
            
            campRole = await guild.roles.create({
                name: `Camp ${campName}`,
                color: color,
                mentionable: true,
                reason: `Rôle de camp pour le festival "${festival.title}"`
            });
        }
        
        // Ajouter le rôle au membre
        await member.roles.add(campRole);
        
        // Enregistrer le vote dans le système de vote avec l'ID de l'utilisateur
        castVote(campId, interaction.user.id, interaction.guild.id);
        
        // Créer un embed de confirmation avec des instructions plus complètes
        const embed = new EmbedBuilder()
            .setColor(campRole.hexColor)
            .setTitle(`Bienvenue dans le camp ${campName}!`)
            .setDescription(`Vous avez rejoint le camp **${campName}** pour le festival "${festival.title}"`)
            .addFields(
                { name: '🎮 Prochaines étapes', value: 'Plusieurs options s\'offrent à vous:' },
                { name: '🔍 Explorer les équipes existantes', value: 'Utilisez `/teams-list` pour voir toutes les équipes de votre camp que vous pouvez rejoindre' },
                { name: '🛠️ Créer votre propre équipe', value: 'Utilisez `/create-team` pour créer et diriger votre propre équipe' },
                { name: '👥 Rejoindre une équipe', value: 'Utilisez `/join-team` pour rejoindre une équipe existante (code requis pour les équipes fermées)' },
                { name: '📊 Consulter le festival', value: 'Utilisez `/current-festival` pour voir les statistiques actuelles du festival' }
            )
            .setFooter({ text: 'Bon festival! Que le meilleur camp gagne!' });
        
        await safeEdit(interaction, {
            content: '',
            embeds: [embed],
            components: []
        });
        
    } catch (error) {
        console.error('Erreur lors du vote:', error);
        await safeEdit(interaction, {
            content: `Une erreur s'est produite: ${error.message}`,
            embeds: [],
            components: []
        });
    }
};

// Gestion du modal de création d'équipe
const handleCreateTeamModal = async (interaction) => {
    const teamName = interaction.fields.getTextInputValue('teamNameInput');
    
    // Validation Regex pour le nom d'équipe
    const nameRegex = /^[a-zA-Z0-9À-ÿ -]{3,20}$/;
    if (!nameRegex.test(teamName)) {
        return await safeReply(interaction, {
            content: "❌ Le nom d'équipe est invalide.\nIl doit contenir entre **3 et 20 caractères** alphanumériques.\nAccents, espaces et tirets sont autorisés.",
            ephemeral: true
        });
    }

    const camp = interaction.fields.getTextInputValue('campInput');
    const teamType = interaction.fields.getTextInputValue('teamTypeInput').toLowerCase();
    
    const isOpen = teamType !== 'closed';
    const code = isOpen ? null : generateTeamCode();
    
    try {
        const team = await createTeam(
            teamName, 
            interaction.user.id, 
            camp, 
            interaction.guild.id,
            isOpen, 
            code,
            interaction.guild
        );
        
        const embed = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle('Team Created')
            .setDescription(`Your team "${team.name}" has been created successfully!`)
            .addFields(
                { name: 'Camp', value: team.camp },
                { name: 'Type', value: team.isOpen ? 'Open' : 'Closed' }
            );
            
        if (!team.isOpen) {
            embed.addFields({ name: 'Access Code', value: team.code });
        }
        
        // Créer un rôle pour l'équipe
        await createTeamRole(interaction, team);
        
        await safeReply(interaction, { embeds: [embed], ephemeral: true });
    } catch (error) {
        await safeReply(interaction, { 
            content: `Error creating team: ${error.message}`, 
            ephemeral: true 
        });
    }
};

const handleJoinTeamModal = async (interaction) => {
    const teamName = interaction.fields.getTextInputValue('teamNameInput');
    const code = interaction.fields.getTextInputValue('teamCodeInput') || null;
    
    try {
        // Vérifier si le joueur a choisi un camp
        const festival = getCurrentFestival(interaction.guild.id);
        if (!festival) {
            throw new Error('Aucun festival actif actuellement.');
        }
        
        // Trouver l'équipe
        const team = findTeamByName(teamName, interaction.guild.id);
        if (!team) {
            throw new Error(`L'équipe "${teamName}" n'existe pas.`);
        }
        
        // Vérifier le camp du joueur
        const member = interaction.member;
        let playerCamp = null;
        
        // Vérifier les rôles du joueur
        for (let i = 0; i < festival.campNames.length; i++) {
            const campName = festival.campNames[i];
            const campRole = member.roles.cache.find(role => role.name === `Camp ${campName}`);
            
            if (campRole) {
                playerCamp = `camp${i+1}`;
                break;
            }
        }
        
        if (!playerCamp) {
            throw new Error('Vous devez d\'abord choisir un camp avec la commande `/vote` avant de pouvoir rejoindre une équipe.');
        }
        
        // Vérifier que le joueur rejoint une équipe de son camp
        if (team.camp !== playerCamp) {
            const teamCampIndex = parseInt(team.camp.replace('camp', '')) - 1;
            const teamCampName = festival.campNames[teamCampIndex];
            
            throw new Error(`Vous ne pouvez pas rejoindre une équipe du camp ${teamCampName}. Vous devez rejoindre une équipe de votre propre camp.`);
        }
        
        // Rejoindre l'équipe
        joinTeam(teamName, interaction.user.id, interaction.guild.id, code, interaction.guild);
        
        // Obtenir le nom d'affichage du camp
        let campName;
        if (team.campDisplayName) {
            campName = team.campDisplayName;
        } else if (festival && team.camp.startsWith('camp')) {
            const campIndex = parseInt(team.camp.replace('camp', '')) - 1;
            campName = festival.campNames[campIndex];
            team.campDisplayName = campName;
        } else {
            campName = team.camp;
        }
        
        // Ajouter le rôle d'équipe au membre
        const guild = interaction.guild;
        let teamRole = guild.roles.cache.find(role => role.name === `Team ${team.name}`);
        
        if (!teamRole) {
            teamRole = await guild.roles.create({
                name: `Team ${team.name}`,
                color: getColorForCamp(team.camp),
                reason: 'New team member joined'
            });
        }
        
        await interaction.member.roles.add(teamRole);
        
        const embed = new EmbedBuilder()
            .setColor(getColorForCamp(team.camp))
            .setTitle('Équipe rejointe')
            .setDescription(`Vous avez rejoint l'équipe "${team.name}" avec succès!`)
            .addFields(
                { name: 'Camp', value: campName },
                { name: 'Statut', value: team.isOpen ? 'Ouverte' : 'Fermée' },
                { name: 'Membres', value: `${team.members.length} membre(s)` }
            );
        
        // Informer l'utilisateur du canal d'équipe
        if (team.channelId) {
            try {
                const teamChannel = await interaction.guild.channels.fetch(team.channelId);
                if (teamChannel) {
                    embed.addFields({ 
                        name: 'Salon d\'équipe', 
                        value: `Vous avez maintenant accès au salon ${teamChannel}` 
                    });
                }
            } catch (error) {
                console.error('Erreur lors de la récupération du salon d\'équipe:', error);
            }
        }
        
        await safeReply(interaction, { 
            embeds: [embed], 
            ephemeral: true 
        });
    } catch (error) {
        console.error('Error in handleJoinTeamModal:', error);
        
        // Utiliser safeReply qui gère automatiquement l'état de l'interaction
        await safeReply(interaction, { 
            content: `Erreur: ${error.message}`, 
            ephemeral: true 
        });
    }
};

// Gestion de la commande leave-team
const handleLeaveTeam = async (interaction) => {
    try {
        const result = leaveTeam(interaction.user.id, interaction.guild.id, interaction.guild);
        const guild = interaction.guild;
        
        // Retirer le rôle d'équipe avec gestion d'erreur
        const teamRole = guild.roles.cache.find(role => role.name === `Team ${result.team.name}`);
        if (teamRole) {
            try {
                await interaction.member.roles.remove(teamRole);
                console.log(`✅ Rôle d'équipe ${teamRole.name} retiré de ${interaction.user.username}`);
            } catch (error) {
                console.error(`❌ Erreur retrait rôle d'équipe ${teamRole.name}:`, error);
            }
        } else {
            console.log(`⚠️ Rôle d'équipe "Team ${result.team.name}" non trouvé`);
        }
        
        // Utiliser le gestionnaire centralisé pour le rôle Team Leader
        const { ensureTeamLeaderRole } = require('./teamLeaderRoleManager');
        let leaderRole = null;
        try {
            leaderRole = await ensureTeamLeaderRole(guild);
        } catch (error) {
            console.error('❌ Erreur récupération rôle Team Leader:', error);
        }
        
        if (result.removed) {
            // Si l'équipe a été supprimée car vide
            if (teamRole) {
                try {
                    await teamRole.delete('Team is empty');
                    console.log(`✅ Rôle d'équipe ${teamRole.name} supprimé (équipe vide)`);
                } catch (error) {
                    console.error(`❌ Erreur suppression rôle d'équipe ${teamRole.name}:`, error);
                }
            }
            
            // Retirez le rôle de leader si la personne était leader
            if (leaderRole && result.team.leader === interaction.user.id) {
                try {
                    await interaction.member.roles.remove(leaderRole);
                    console.log(`✅ Rôle Team Leader retiré de ${interaction.user.username}`);
                } catch (error) {
                    console.error(`❌ Erreur retrait rôle Team Leader:`, error);
                }
            }
            
            await safeEdit(interaction, { 
                content: `You have left team "${result.team.name}". The team has been disbanded as it is now empty.`
            });
        } else {
            // Si le membre était le leader et qu'un nouveau leader a été désigné
            if (result.wasLeader && result.newLeader) {
                // Retirer le rôle de leader de l'ancien leader
                if (leaderRole) {
                    try {
                        await interaction.member.roles.remove(leaderRole);
                        console.log(`✅ Rôle Team Leader retiré de l'ancien leader ${interaction.user.username}`);
                    } catch (error) {
                        console.error(`❌ Erreur retrait rôle Team Leader de l'ancien leader:`, error);
                    }
                    
                    // Attribuer le rôle de leader au nouveau leader
                    try {
                        const newLeaderMember = await guild.members.fetch(result.newLeader);
                        if (newLeaderMember) {
                            await newLeaderMember.roles.add(leaderRole);
                            console.log(`✅ Rôle Team Leader attribué au nouveau leader ${newLeaderMember.user.username}`);
                        } else {
                            console.error(`❌ Nouveau leader non trouvé: ${result.newLeader}`);
                        }
                    } catch (error) {
                        console.error(`❌ Erreur attribution rôle Team Leader au nouveau leader:`, error);
                    }
                }
                
                const newLeaderUser = await interaction.client.users.fetch(result.newLeader);
                await safeEdit(interaction, { 
                    content: `You have left team "${result.team.name}". ${newLeaderUser.username} is now the team leader.`
                });
            } else {
                await safeEdit(interaction, { 
                    content: `You have left team "${result.team.name}".`
                });
            }
        }
    } catch (error) {
        await safeEdit(interaction, { 
            content: `Error leaving team: ${error.message}`
        });
    }
};

// Gestion de la commande kick-member
const handleKickMember = async (interaction) => {
    const memberToKick = interaction.options.getUser('member');
    
    try {
        const team = kickMember(interaction.user.id, memberToKick.id, interaction.guild.id, interaction.guild);
        
        // Retirer le rôle d'équipe au membre expulsé
        const guild = interaction.guild;
        const teamRole = guild.roles.cache.find(role => role.name === `Team ${team.name}`);
        if (teamRole) {
            const guildMember = await guild.members.fetch(memberToKick.id);
            if (guildMember) {
                await guildMember.roles.remove(teamRole);
            }
        }
        
        await safeEdit(interaction, { 
            content: `${memberToKick.username} has been kicked from team "${team.name}".`
        });
    } catch (error) {
        await safeEdit(interaction, { 
            content: `Error kicking member: ${error.message}`
        });
    }
};

// Gestion de la commande teams-list
const handleTeamsList = async (interaction) => {
    const teams = getAllTeams(interaction.guild.id);
    const festival = getCurrentFestival(interaction.guild.id);
    
    if (teams.length === 0) {
        await safeEdit(interaction, { 
            content: 'No teams have been registered yet.'
        });
        return;
    }
    
    const embeds = [];
    const teamsPerEmbed = 5; // Max 5 équipes par embed (limite de 25 fields)
    
    // Diviser les équipes en groupes pour multiple embeds si nécessaire
    for (let i = 0; i < teams.length; i += teamsPerEmbed) {
        const embed = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle('Teams List')
            .setDescription(`Page ${Math.floor(i / teamsPerEmbed) + 1}/${Math.ceil(teams.length / teamsPerEmbed)}`);
        
        const teamGroup = teams.slice(i, i + teamsPerEmbed);
        
        for (const team of teamGroup) {
            // Récupérer les noms des membres
            const memberNames = await Promise.all(team.members.map(async (memberId) => {
                try {
                    const user = await interaction.client.users.fetch(memberId);
                    return memberId === team.leader ? `${user.username} (Leader)` : user.username;
                } catch (error) {
                    return memberId;
                }
            }));
            
            // Obtenir le nom d'affichage du camp
            let campName;
            if (team.campDisplayName) {
                campName = team.campDisplayName;
            } else if (festival && team.camp.startsWith('camp')) {
                // Fallback pour les équipes créées avant cette mise à jour
                const campIndex = parseInt(team.camp.replace('camp', '')) - 1;
                campName = festival.campNames[campIndex];
            } else {
                campName = team.camp;
            }
            
            embed.addFields(
                { name: `${team.name} (${campName})`, value: `Status: ${team.isOpen ? 'Open' : 'Closed'}\nMembers: ${memberNames.join(', ')}` }
            );
        }
        
        embeds.push(embed);
    }
    
    await safeEdit(interaction, { content: 'Teams list:' });
    
    // Envoyer tous les embeds
    for (const embed of embeds) {
        await safeFollowUp(interaction, { embeds: [embed], ephemeral: true });
    }
};

// Fonction pour créer un rôle d'équipe
const createTeamRole = async (interaction, team) => {
    try {
        const guild = interaction.guild;
        const { getOrCreateTeamRole } = require('./channelManager');
        
        // Utiliser la fonction centralisée 
        const teamRole = await getOrCreateTeamRole(guild, team);
        
        // Ajouter le rôle d'équipe au créateur (le rôle Team Leader sera attribué par teamManager.js)
        await interaction.member.roles.add(teamRole);
        
        return teamRole;
    } catch (error) {
        console.error(`Erreur lors de la création des rôles d'équipe:`, error);
        return null;
    }
};

// Fonction utilitaire pour obtenir une couleur par camp
const getColorForCamp = (camp) => {
    switch (camp) {
        case 'camp1': return '#FF0000'; // Rouge
        case 'camp2': return '#00FF00'; // Vert
        case 'camp3': return '#0000FF'; // Bleu
        default: return '#FFFF00'; // Jaune par défaut
    }
};

const handleVoteInteraction = async (interaction) => {
    const camp = interaction.options.getString('camp');
    
    try {
        castVote(camp, interaction.user.id, interaction.guild.id);
        await safeReply(interaction, `Vote cast for ${camp}.`);
    } catch (error) {
        await safeReply(interaction, `Error: ${error.message}`);
    }
};

function createMatchId(team1Name, team2Name) {
    // Trier les noms pour assurer la cohérence peu importe l'ordre
    const sortedNames = [team1Name, team2Name].sort();
    return `${sortedNames[0]}_VS_${sortedNames[1]}`;
}

const handleMatchupInteraction = async (interaction) => {
    try {
        const teamName = interaction.options.getString('team_name');
        const guildId = interaction.guild.id;
        const result = getMatchup(teamName, guildId);
        
        if (result.alreadyMatched) {
            await safeReply(interaction, `Your team is already matched with: ${result.opponent.name}`);
        } else {
            await safeReply(interaction, `Matchup: ${result.team.name} vs ${result.opponent.name}`);
        }
    } catch (error) {
        await safeReply(interaction, `Error: ${error.message}`);
    }
};

const handleResultEntry = async (interaction) => {
    const team1Name = interaction.options.getString('team1_name');
    const team1Result = interaction.options.getString('team1_result');
    const team2Name = interaction.options.getString('team2_name');
    const team2Result = interaction.options.getString('team2_result');

    try {
        validateResults(team1Result, team2Result);
        scoreTracker.updateScores(team1Result, team2Result, team1Name, team2Name, interaction.guild.id, 1);
        
        // MAINTENANT ajouter le match à l'historique (seulement quand les résultats sont soumis)
        const { addMatchToHistory } = require('./matchHistoryManager');
        addMatchToHistory(team1Name, team2Name, interaction.guild.id);
        console.log(`✅ Match ajouté à l'historique après soumission directe: ${team1Name} vs ${team2Name}`);
        
        // Sauvegarder le match complet dans la collection Match
        try {
            const DataAdapter = require('./dataAdapter');
            const adapter = new DataAdapter(interaction.guild.id);
            const { findTeamByName } = require('./teamManager');
            
            const team1 = findTeamByName(team1Name, interaction.guild.id);
            const team2 = findTeamByName(team2Name, interaction.guild.id);
            
            if (team1 && team2) {
                const matchData = {
                    team1: { name: team1Name, camp: team1.camp },
                    team2: { name: team2Name, camp: team2.camp },
                    winner: team1Result === 'V' ? team1Name : team2Name,
                    multiplier: 1,
                    pointsAwarded: 1,
                    status: 'completed',
                    completedAt: new Date(),
                    submittedBy: interaction.user.id
                };
                
                const savedMatch = await adapter.saveMatch(matchData);
                console.log(`💾 Match complet sauvegardé dans la collection Match avec ID: ${savedMatch._id}`);
            }
        } catch (error) {
            console.error('❌ Erreur lors de la sauvegarde du match complet:', error);
            // Ne pas faire échouer la soumission pour autant
        }
        
        // Clear the matchup to make teams available again
        clearMatchup(team1Name, team2Name, interaction.guild.id);
        
        await safeReply(interaction, `Results submitted: ${team1Name} - ${team1Result}, ${team2Name} - ${team2Result}`);
    } catch (error) {
        await safeReply(interaction, `Error: ${error.message}`);
    }
};

const handleMatchupModal = async (interaction) => {
    // Vérifier si un festival est actif
    const festival = getCurrentFestival(interaction.guild.id);
    if (!festival || !festival.isActive) {
        return await safeReply(interaction, {
            content: 'Aucun festival actif actuellement. Les matchups seront disponibles quand le festival démarrera.',
            ephemeral: true
        });
    }
    
    const teamName = interaction.fields.getTextInputValue('teamNameInput');
    
    try {
        const guildId = interaction.guild.id;
        const team = findTeamByName(teamName, guildId);
        if (!team) {
            throw new Error(`Team "${teamName}" not found.`);
        }
        
        const result = getMatchup(teamName, guildId);
        
        const embed = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle('Matchup Result')
            .setTimestamp();
            
        if (result.alreadyMatched) {
            embed.setDescription(`Your team is already matched!`)
                .addFields({ name: 'Your Team', value: result.team.name })
                .addFields({ name: 'Opponent', value: result.opponent.name });
        } else {
            embed.setDescription(`New matchup created!`)
                .addFields({ name: 'Your Team', value: result.team.name })
                .addFields({ name: 'Opponent', value: result.opponent.name });
        }
        
        await safeReply(interaction, { embeds: [embed], ephemeral: true });
    } catch (error) {
        await safeReply(interaction, { 
            content: `Error finding matchup: ${error.message}`, 
            ephemeral: true 
        });
    }
};

const handleCampSelect = async (interaction) => {
    const campValue = interaction.values[0]; // Valeur technique (camp1, camp2, camp3)
    const teamName = interaction.message.content.match(/Creating team "([^"]+)"/)[1];
    
    // Récupérer le festival et le nom réel du camp
    const festival = getCurrentFestival(interaction.guild.id);
    const campIndex = parseInt(campValue.replace('camp', '')) - 1;
    const campDisplayName = festival.campNames[campIndex];
    
    // Stocker temporairement les valeurs
    interaction.client.tempTeamData = interaction.client.tempTeamData || {};
    interaction.client.tempTeamData[interaction.user.id] = {
        teamName,
        camp: campValue,
        campDisplayName: campDisplayName
    };
    
    await safeEdit(interaction, {
        content: `Creating team "${teamName}". Camp: ${campDisplayName}. Please select if your team is open or closed:`,
        components: interaction.message.components.slice(1) // Garder seulement la rangée des boutons
    });
};

// Gestionnaire pour les boutons d'équipe ouverte/fermée
const handleTeamTypeButton = async (interaction) => {
    let type, encodedTeamName;
    
    // Gérer les deux formats d'ID: "open_" et "team_open_"
    if (interaction.customId.startsWith('team_')) {
        const parts = interaction.customId.split('_');
        type = parts[1]; // 'open' ou 'closed'
        encodedTeamName = parts[2]; // nom optionnel
    } else {
        [type, encodedTeamName] = interaction.customId.split('_');
    }
    
    const isOpen = type === 'open';
    
    // Récupérer les données temporaires
    const teamData = interaction.client.tempTeamData?.[interaction.user.id];
    if (!teamData) {
        return await safeEdit(interaction, {
            content: 'An error occurred. Please try again.',
            components: []
        });
    }
    
    const { teamName, camp, campDisplayName } = teamData;
    const code = isOpen ? null : generateTeamCode();
    
    try {
        const team = await createTeam(
            teamName, 
            interaction.user.id, 
            camp, 
            interaction.guild.id,
            isOpen, 
            code,
            interaction.guild // Passer l'objet guild
        );
        
        // Stocker le nom d'affichage du camp
        team.campDisplayName = campDisplayName;
        
        const embed = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle('Team Created')
            .setDescription(`Your team "${team.name}" has been created successfully!`)
            .addFields(
                { name: 'Camp', value: campDisplayName }, // Utiliser le nom d'affichage ici
                { name: 'Type', value: team.isOpen ? 'Open' : 'Closed' }
            );
            
        if (!team.isOpen) {
            embed.addFields({ name: 'Access Code', value: team.code });
        }
        
        // Créer un rôle pour l'équipe et leader
        await createTeamRole(interaction, team);
        
        // Nettoyer les données temporaires
        delete interaction.client.tempTeamData[interaction.user.id];
        
        await safeEdit(interaction, {
            content: '',
            embeds: [embed],
            components: []
        });
    } catch (error) {
        await safeEdit(interaction, { 
            content: `Error creating team: ${error.message}`, 
            components: []
        });
    }
};

const handleCancelSearchButton = async (interaction) => {
    const teamName = interaction.customId.split('_')[2];
    
    // Trouver l'équipe
    const team = findTeamByName(teamName, interaction.guild.id);
    if (!team) {
        return await safeEdit(interaction, {
            content: 'Équipe introuvable. La recherche a peut-être déjà été annulée.',
            embeds: [],
            components: []
        });
    }
    
    // Vérifier si l'utilisateur est membre de cette équipe
    if (!team.isMember(interaction.user.id)) {
        return await safeEdit(interaction, {
            content: 'Vous n\'êtes pas membre de cette équipe.',
            embeds: [],
            components: []
        });
    }
    
    // Annuler la recherche
    const cancelled = cleanupSearch(teamName);
    
    if (cancelled) {
        await safeEdit(interaction, {
            content: `La recherche de match pour l'équipe **${teamName}** a été annulée.`,
            embeds: [],
            components: []
        });
    } else {
        await safeEdit(interaction, {
            content: `La recherche de match pour l'équipe **${teamName}** avait déjà été annulée ou l'équipe est déjà en match.`,
            embeds: [],
            components: []
        });
    }
};

const handleConfigSelect = async (interaction) => {
    // Vérifier si les données temporaires existent
    if (!interaction.client.tempConfigData || interaction.client.tempConfigData.userId !== interaction.user.id) {
        return await safeEdit(interaction, {
            content: 'Cette session de configuration a expiré. Veuillez relancer la commande `/config`.',
            components: [],
            ephemeral: true
        });
    }
    
    const { type, config } = interaction.client.tempConfigData;
    const selectedId = interaction.values[0];
    
    try {
        if (type === 'channel') {
            // Mettre à jour le salon d'annonces
            config.announcementChannelId = selectedId;
            await saveConfig(config);
            
            const channel = await interaction.guild.channels.fetch(selectedId);
            await safeEdit(interaction, {
                content: `Le salon d'annonces a été défini sur ${channel}`,
                components: [],
                ephemeral: true
            });
        } 
        else if (type === 'role') {
            // Mettre à jour le rôle à mentionner
            config.announcementRoleId = selectedId;
            await saveConfig(config);
            
            const role = await interaction.guild.roles.fetch(selectedId);
            await safeEdit(interaction, {
                content: `Le rôle à mentionner a été défini sur ${role}`,
                components: [],
                ephemeral: true
            });
        }
        
        // Nettoyer les données temporaires
        delete interaction.client.tempConfigData;
    } catch (error) {
        console.error('Erreur lors de la mise à jour de la configuration:', error);
        await safeEdit(interaction, {
            content: `Une erreur s'est produite: ${error.message}`,
            components: [],
            ephemeral: true
        });
    }
};

// Stockage temporaire des résultats en attente de confirmation
// Using global pendingResults Map declared at top of file

const handleResultButton = async (interaction) => {
    try {
        const [_, result, ...matchIdParts] = interaction.customId.split('_');
        const guildId = interaction.guild.id;
        
        // Vérifier si l'utilisateur est capitaine d'une équipe en match
        const userTeam = findTeamByMember(interaction.user.id, guildId);
        
        if (!userTeam) {
            return await safeEdit(interaction, {
                content: "Vous n'êtes membre d'aucune équipe.",
                components: []
            });
        }
        
        if (!userTeam.isLeader(interaction.user.id)) {
            return await safeEdit(interaction, {
                content: "Seul le capitaine peut déclarer les résultats.",
                components: []
            });
        }
        
        // Vérifier si l'équipe est en match
        if (!userTeam.currentOpponent) {
            return await safeEdit(interaction, {
                content: "Votre équipe n'est pas actuellement en match.",
                components: []
            });
        }
        
        // Récupérer l'équipe adverse directement via currentOpponent
        const opponentTeam = getAllTeams(guildId).find(t => t.name === userTeam.currentOpponent);
        
        if (!opponentTeam) {
            return await safeReply(interaction, {
                content: "Équipe adverse introuvable. Veuillez contacter un administrateur.",
                ephemeral: true
            });
        }
        
        // Créer un matchId plus simple basé sur les équipes réelles
        const sortedNames = [userTeam.name, opponentTeam.name].sort(); // Trier pour consistance
        const realMatchId = createMatchId(userTeam.name, opponentTeam.name);
        
        // Continuer avec team1 = userTeam et team2 = opponentTeam
        const team1 = userTeam;
        const team2 = opponentTeam;
        
        // AJOUTER CES VARIABLES QUI MANQUENT
        const team1Name = team1.name;
        const team2Name = team2.name;
        const matchId = realMatchId;
        
        // Vérification de sécurité
        if (!team1 || !team2) {
            return await safeReply(interaction, {
                content: `Erreur: Une ou les deux équipes n'existent plus.`,
                ephemeral: true
            });
        }
        
        // Déterminer si c'est la première déclaration ou une confirmation
        const pendingResults = getPendingResultsForGuild(guildId);
        if (!pendingResults.has(matchId)) {
            // 🔍 LOGGING: Première déclaration de résultat
            console.log(`📝 DÉCLARATION RÉSULTAT: ${matchId}`);
            console.log(`  👤 Déclarant: ${interaction.user.tag} (${interaction.user.id})`);
            console.log(`  🏆 Résultat: ${userTeam.name} - ${result === 'win' ? 'VICTOIRE' : 'DÉFAITE'}`);
            console.log(`  ⏰ Timestamp: ${new Date().toISOString()}`);
            
            // Première déclaration
            const userResult = result === 'win' ? 'V' : 'D';
            const opponentResult = userResult === 'V' ? 'D' : 'V';
            
            // Stocker le résultat en attente
            pendingResults.set(matchId, {
                declaringTeam: userTeam.name,
                declaringTeamResult: userResult,
                opponentTeam: opponentTeam.name,
                opponentTeamResult: opponentResult,
                timestamp: Date.now(),
                declaringUserId: interaction.user.id, // 🛡️ Traçabilité utilisateur
                matchChannelId: userTeam.matchChannelId || opponentTeam.matchChannelId
            });

            await savePendingResults(guildId);
            
            // Mise à jour du message original
            await safeEdit(interaction, {
                content: `${interaction.user} a déclaré une ${userResult === 'V' ? 'victoire' : 'défaite'} pour l'équipe ${userTeam.name}. Attendez la confirmation de l'équipe adverse.`,
                components: [],
                ephemeral: false
            });
            
            // Créer les boutons de confirmation pour l'équipe adverse
            const confirmButton = new ButtonBuilder()
                .setCustomId(`confirm_${matchId}`)
                .setLabel('Confirmer')
                .setStyle(ButtonStyle.Success);
                
            const rejectButton = new ButtonBuilder()
                .setCustomId(`reject_${matchId}`)
                .setLabel('Contester')
                .setStyle(ButtonStyle.Danger);
                
            const row = new ActionRowBuilder()
                .addComponents(confirmButton, rejectButton);
            
            // Envoyer un message dans le salon de match pour l'équipe adverse
            try {
                // Obtenir le salon de match avec vérification supplémentaire
                const matchChannelId = team1?.matchChannelId || team2?.matchChannelId;
                
                if (matchChannelId) {
                    const matchChannel = await interaction.guild.channels.fetch(matchChannelId).catch(() => null);
                    if (matchChannel) {
                        // Tag le rôle de l'équipe adverse
                        const opponentTeamName = userTeam.name === team1Name ? team2Name : team1Name;
                        const opponentTeamObj = userTeam.name === team1Name ? team2 : team1;
                        const opponentRole = interaction.guild.roles.cache.find(role => role.name === `Team ${opponentTeamName}`);
                        
                        // Trouver le capitaine de l'équipe adverse pour le ping direct
                        const opponentCaptain = opponentTeamObj.leader;
                        let mentionText = `<@${opponentCaptain}>`;
                        
                        // Créer l'embed de confirmation
                        const embed = new EmbedBuilder()
                            .setColor('#FFA500')
                            .setTitle('Confirmation de résultat de match')
                            .setDescription(`L'équipe **${userTeam.name}** a déclaré une **${userResult === 'V' ? 'victoire' : 'défaite'}**.`)
                            .addFields(
                                { name: 'Résultat déclaré', value: `${userTeam.name}: ${userResult === 'V' ? 'Victoire' : 'Défaite'}\n${opponentTeamName}: ${opponentResult === 'V' ? 'Victoire' : 'Défaite'}` },
                                { name: 'Action requise', value: `Le capitaine <@${opponentCaptain}> doit confirmer ou contester ce résultat.` }
                            )
                            .setTimestamp();
                            
                        await matchChannel.send({
                            content: `${mentionText} Confirmation de résultat requise! (Message visible par tous)`,
                            embeds: [embed],
                            components: [row]
                        });
                    }
                } else {
                    // Pas de salon de match, envoi des notifications dans les canaux d'équipe à la place
                    console.log('Aucun salon de match trouvé pour ce match, utilisation des canaux d\'équipe');
                    
                    // Fallback: envoyer dans le canal de l'équipe adverse
                    const opponentTeamName = userTeam.name === team1Name ? team2Name : team1Name;
                    const opponentTeamObj = userTeam.name === team1Name ? team2 : team1;
                    
                    if (opponentTeamObj && opponentTeamObj.channelId) {
                        try {
                            const opponentChannel = await interaction.guild.channels.fetch(opponentTeamObj.channelId).catch(() => null);
                            if (opponentChannel) {
                                const opponentCaptain = opponentTeamObj.leader;
                                
                                // Créer l'embed de confirmation pour le canal d'équipe
                                const embed = new EmbedBuilder()
                                    .setColor('#FFA500')
                                    .setTitle('⚠️ Confirmation de résultat de match requise')
                                    .setDescription(`L'équipe **${userTeam.name}** a déclaré une **${userResult === 'V' ? 'victoire' : 'défaite'}**.`)
                                    .addFields(
                                        { name: 'Résultat déclaré', value: `${userTeam.name}: ${userResult === 'V' ? 'Victoire' : 'Défaite'}\n${opponentTeamName}: ${opponentResult === 'V' ? 'Victoire' : 'Défaite'}` },
                                        { name: 'Action requise', value: `Le capitaine <@${opponentCaptain}> doit confirmer ou contester ce résultat.` },
                                        { name: 'Note', value: 'Seul le capitaine peut utiliser les boutons ci-dessous.' }
                                    )
                                    .setTimestamp();
                                    
                                await opponentChannel.send({
                                    content: `<@${opponentCaptain}> 🚨 **Confirmation de résultat requise !**`,
                                    embeds: [embed],
                                    components: [row]
                                });
                                
                                console.log(`✅ Message de confirmation envoyé dans le canal de ${opponentTeamName}`);
                            } else {
                                console.warn(`❌ Canal de l'équipe ${opponentTeamName} introuvable`);
                                // Fallback: notifier l'utilisateur qu'il doit contacter l'autre équipe
                                await safeFollowUp(interaction, {
                                    content: `⚠️ Impossible de notifier automatiquement l'équipe adverse. Veuillez contacter le capitaine de **${opponentTeamName}** pour confirmer le résultat.`,
                                    ephemeral: true
                                });
                            }
                        } catch (channelError) {
                            console.error('Erreur lors de l\'envoi dans le canal d\'équipe:', channelError);
                            await safeFollowUp(interaction, {
                                content: `⚠️ Erreur lors de la notification automatique. Veuillez contacter le capitaine de **${opponentTeamName}** pour confirmer le résultat.`,
                                ephemeral: true
                            });
                        }
                    } else {
                        console.warn(`❌ Équipe adverse ${opponentTeamName} n'a pas de canal d'équipe`);
                        await safeFollowUp(interaction, {
                            content: `⚠️ L'équipe adverse n'a pas de canal d'équipe configuré. Veuillez contacter le capitaine de **${opponentTeamName}** pour confirmer le résultat.`,
                            ephemeral: true
                        });
                    }
                }
            } catch (error) {
                console.error('Erreur lors de la demande de confirmation:', error);
                await safeFollowUp(interaction, {
                    content: "Une erreur s'est produite lors de la notification de l'équipe adverse. Veuillez demander à l'autre capitaine d'utiliser /results pour soumettre le résultat de son côté.",
                    ephemeral: true
                });
            }
        }
    } catch (error) {
        console.error('Erreur dans handleResultButton:', error);
        await safeEdit(interaction, {
            content: `Une erreur s'est produite: ${error.message}`,
            components: []
        });
    }
};

const handleConfirmButton = async (interaction) => {
    try {
        const guildId = interaction.guild.id;
        const pendingResults = getPendingResultsForGuild(guildId);
        
        const customId = interaction.customId; // Par exemple: "confirm_iuiiia_VS_ooiia"
        console.log('Debug customId complet:', customId);
        
        // Séparer sur le premier underscore seulement pour isoler "confirm" du reste
        const parts = customId.split('_');
        console.log('Debug parts:', parts);
        
        if (parts.length < 4) { // Au minimum: ["confirm", "team1", "VS", "team2"]
            return await safeReply(interaction, {
                content: "Format de bouton invalide. Veuillez contacter un administrateur.",
                ephemeral: true
            });
        }
        
        // Reconstituer le matchId en retirant le préfixe "confirm_"
        const receivedMatchId = parts.slice(1).join('_'); // Tout sauf "confirm"
        console.log('Debug receivedMatchId:', receivedMatchId);
        
        // Diviser le matchId pour obtenir les noms d'équipes
        const teamParts = receivedMatchId.split('_VS_');
        console.log('Debug teamParts:', teamParts);
        
        if (teamParts.length !== 2) {
            return await safeReply(interaction, {
                content: `Format de match invalide: ${receivedMatchId}. Attendu: team1_VS_team2`,
                ephemeral: true
            });
        }
        
        const [team1Name, team2Name] = teamParts;
        console.log('Debug noms extraits:', { team1Name, team2Name });
        
        // Vérifier que les deux noms sont définis
        if (!team1Name || !team2Name) {
            return await safeReply(interaction, {
                content: `Noms d'équipes invalides: team1="${team1Name}", team2="${team2Name}"`,
                ephemeral: true
            });
        }
        
        // Recreer le matchId avec la fonction centralisée
        const matchId = createMatchId(team1Name, team2Name);
        
        console.log('Debug handleConfirmButton:', {
            customId,
            receivedMatchId,
            team1Name,
            team2Name,
            recreatedMatchId: matchId,
            pendingKeys: Array.from(pendingResults.keys())
        });
        
        // Vérifier si le résultat en attente existe
        if (!pendingResults.has(matchId)) {
            return await safeReply(interaction, {
                content: `Ce résultat n'est plus en attente de confirmation.\nDebug:\n- Cherché: '${matchId}'\n- Disponibles: ${Array.from(pendingResults.keys()).join(', ')}\n- CustomId original: ${customId}`,
                ephemeral: true
            });
        }
        
        const pendingResult = pendingResults.get(matchId);
        
        // Récupérer les équipes
        const team1 = findTeamByName(team1Name, interaction.guild.id);
        const team2 = findTeamByName(team2Name, interaction.guild.id);
        
        // Vérifier que les équipes existent encore
        if (!team1 || !team2) {
            console.error('❌ Teams not found during confirmation:', {
                team1Name,
                team2Name,
                team1Found: !!team1,
                team2Found: !!team2,
                guildId: interaction.guild.id
            });
            
            // Nettoyer le résultat en attente puisque les équipes n'existent plus
            pendingResults.delete(matchId);
            await savePendingResults(guildId);
            
            return await safeReply(interaction, {
                content: `❌ Impossible de confirmer le résultat : une ou plusieurs équipes n'existent plus.\n\n**Équipes recherchées:**\n- ${team1Name}: ${team1 ? '✅ Trouvée' : '❌ Introuvable'}\n- ${team2Name}: ${team2 ? '✅ Trouvée' : '❌ Introuvable'}\n\nLe résultat en attente a été supprimé.`,
                ephemeral: true
            });
        }
        
        // Vérifier si l'utilisateur est capitaine de l'équipe adverse
        const userTeam = findTeamByMember(interaction.user.id, interaction.guild.id);
        
        if (!userTeam || userTeam.name === pendingResult.declaringTeam) {
            return await safeReply(interaction, {
                content: "Seul le capitaine de l'équipe adverse peut confirmer ce résultat.",
                ephemeral: true
            });
        }
        
        if (!userTeam.isLeader(interaction.user.id)) {
            return await safeReply(interaction, {
                content: "Seul le capitaine peut confirmer les résultats.",
                ephemeral: true
            });
        }
        
        // Récupérer le multiplicateur associé au match, s'il existe
        const multiplier = team1.currentMatchMultiplier || team2.currentMatchMultiplier || 1;
        
        // Déterminer team1Result et team2Result
        const team1Result = team1Name === pendingResult.declaringTeam ? 
                           pendingResult.declaringTeamResult : 
                           pendingResult.opponentTeamResult;
                           
        const team2Result = team2Name === pendingResult.declaringTeam ? 
                           pendingResult.declaringTeamResult : 
                           pendingResult.opponentTeamResult;
        
        // Mettre à jour les scores avec le multiplicateur
        scoreTracker.updateScores(team1Result, team2Result, team1Name, team2Name, interaction.guild.id, multiplier);
        
        // MAINTENANT ajouter le match à l'historique (seulement quand les résultats sont confirmés)
        const { addMatchToHistory } = require('./matchHistoryManager');
        addMatchToHistory(team1Name, team2Name, interaction.guild.id);
        console.log(`✅ Match ajouté à l'historique après confirmation: ${team1Name} vs ${team2Name}`);
        
        // Sauvegarder le match complet dans la collection Match
        try {
            const DataAdapter = require('./dataAdapter');
            const adapter = new DataAdapter(interaction.guild.id);
            
            const matchData = {
                team1Name: team1Name,
                team2Name: team2Name,
                team1Camp: team1.camp,
                team2Camp: team2.camp,
                winner: team1Result === 'V' ? team1Name : team2Name,
                multiplier: multiplier,
                pointsAwarded: multiplier,
                status: 'completed',
                completedAt: new Date(),
                confirmedBy: interaction.user.id,
                bo3Maps: pendingResult.bo3Maps || []
            };
            
            const savedMatch = await adapter.saveMatch(matchData);
            console.log(`💾 Match complet sauvegardé dans la collection Match avec ID: ${savedMatch._id}`);
        } catch (error) {
            console.error('❌ Erreur lors de la sauvegarde du match complet:', error);
            // Ne pas faire échouer la confirmation pour autant
        }
        
        // Créer un message de résultat détaillé
        let resultMessage = `✅ **Résultat confirmé** : ${team1Name} - ${team1Result === 'V' ? 'Victoire' : 'Défaite'}, ${team2Name} - ${team2Result === 'V' ? 'Victoire' : 'Défaite'}`;
        
        // Ajouter l'information sur le multiplicateur si > 1
        if (multiplier > 1) {
            resultMessage += `\n🏅 Match avec multiplicateur x${multiplier} ! ${team1Result === 'V' ? team1Name : team2Name} a fait gagner **${multiplier} points** à son camp!`;
        }
        
        // Mettre à jour le message et supprimer les boutons
        await safeEdit(interaction, {
            content: `${resultMessage}\n\n**Confirmé par:** <@${interaction.user.id}>`,
            embeds: [],
            components: []
            // Supprimez l'ephemeral: false car update() ne prend pas ce paramètre
        });
        
        // Retirer le résultat en attente
        pendingResults.delete(matchId);

        await savePendingResults(guildId);
        
        // Vérifier s'il y a un salon de match à supprimer
        let matchChannelId = null;
        if (team1.matchChannelId) {
            matchChannelId = team1.matchChannelId;
        } else if (team2.matchChannelId) {
            matchChannelId = team2.matchChannelId;
        }
        
        // Terminer le match proprement (libérer les équipes + mettre à jour le statut BD)
        const { finishMatch } = require('./matchSearch');
        await finishMatch(team1Name, team2Name, guildId);
        
        // Programmer la suppression du salon de match s'il existe
        if (matchChannelId) {
            try {
                const matchChannel = await interaction.guild.channels.fetch(matchChannelId).catch(() => null);
                if (matchChannel) {
                    // Annoncer la fin du match
                    await matchChannel.send({
                        content: `🏁 **MATCH TERMINÉ !** 🏁\n${resultMessage}\n\n⚠️ Ce salon sera supprimé dans 2 minutes.`
                    });
                    
                    // Programmer la suppression du salon dans 2 minutes
                    scheduleMatchChannelDeletion(interaction.guild, matchChannelId);
                }
            } catch (error) {
                console.error('Erreur lors de la notification de fin de match:', error);
            }
        }
        
    } catch (error) {
        console.error('Erreur dans handleConfirmButton:', error);
        
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
};

const handleRejectButton = async (interaction) => {
    try {
        const guildId = interaction.guild.id;
        const pendingResults = getPendingResultsForGuild(guildId);
        
        const customId = interaction.customId; // Par exemple: "reject_iuiiia_VS_ooiia"
        
        // Séparer sur le premier underscore seulement pour isoler "reject" du reste
        const parts = customId.split('_');
        
        if (parts.length < 4) { // Au minimum: ["reject", "team1", "VS", "team2"]
            return await safeReply(interaction, {
                content: "Format de bouton invalide. Veuillez contacter un administrateur.",
                ephemeral: true
            });
        }
        
        // Reconstituer le matchId en retirant le préfixe "reject_"
        const receivedMatchId = parts.slice(1).join('_'); // Tout sauf "reject"
        
        // Diviser le matchId pour obtenir les noms d'équipes
        const teamParts = receivedMatchId.split('_VS_');
        
        if (teamParts.length !== 2) {
            return await safeReply(interaction, {
                content: `Format de match invalide: ${receivedMatchId}`,
                ephemeral: true
            });
        }
        
        const [team1Name, team2Name] = teamParts;
        
        // Vérifier que les deux noms sont définis
        if (!team1Name || !team2Name) {
            return await safeReply(interaction, {
                content: `Noms d'équipes invalides: team1="${team1Name}", team2="${team2Name}"`,
                ephemeral: true
            });
        }
        
        // Recreer le matchId avec la fonction centralisée
        const matchId = createMatchId(team1Name, team2Name);
        
        // Vérifier si le résultat en attente existe
        if (!pendingResults.has(matchId)) {
            return await safeReply(interaction, {
                content: "Ce résultat n'est plus en attente de confirmation.",
                ephemeral: true
            });
        }
        
        const pendingResult = pendingResults.get(matchId);
        
        // Vérifier si l'utilisateur est capitaine de l'équipe adverse
        const userTeam = findTeamByMember(interaction.user.id, interaction.guild.id);
        
        if (!userTeam || userTeam.name === pendingResult.declaringTeam) {
            return await safeReply(interaction, {
                content: "Seul le capitaine de l'équipe adverse peut contester ce résultat.",
                ephemeral: true
            });
        }
        
        if (!userTeam.isLeader(interaction.user.id)) {
            return await safeReply(interaction, {
                content: "Seul le capitaine peut contester les résultats.",
                ephemeral: true
            });
        }
        
        // Retirer le résultat en attente
        pendingResults.delete(matchId);

        await savePendingResults(guildId);
        
        // Mettre à jour le message
        await safeEdit(interaction, {
            content: `❌ **Résultat contesté** par <@${interaction.user.id}>. Les deux capitaines doivent se mettre d'accord et recommencer la procédure avec \`/results\`.`,
            embeds: [],
            components: []
            // Supprimez l'ephemeral: false car update() ne prend pas ce paramètre
        });
        
    } catch (error) {
        console.error('Erreur dans handleRejectButton:', error);
        await safeReply(interaction, {
            content: `Une erreur s'est produite: ${error.message}`,
            ephemeral: true
        });
    }
};

// Add this function in src/utils/interactionHandlers.js

const handleFestivalSetup = async (interaction) => {
    try {
        // Defer l'interaction si ce n'est pas déjà fait
        if (!interaction.deferred && !interaction.replied) {
            await safeDefer(interaction, false, true); // true pour isUpdate car c'est un bouton
        }
        
        const setup = interaction.client.festivalSetup?.[interaction.user.id];
        
        // DEBUG: Logs détaillés pour comprendre le problème de session
        console.log(`🔍 Festival Setup Debug:`);
        console.log(`  - User ID: ${interaction.user.id}`);
        console.log(`  - Setup exists: ${!!setup}`);
        console.log(`  - Client has festivalSetup: ${!!interaction.client.festivalSetup}`);
        if (interaction.client.festivalSetup) {
            console.log(`  - Active sessions: ${Object.keys(interaction.client.festivalSetup).length}`);
            console.log(`  - Session keys: ${Object.keys(interaction.client.festivalSetup).join(', ')}`);
        }
        if (setup) {
            console.log(`  - Setup step: ${setup.step}`);
            console.log(`  - Setup data:`, JSON.stringify(setup, null, 2));
        }
        
        if (!setup) {
            console.log(`❌ Session de configuration manquante pour ${interaction.user.id}`);
            if (interaction.deferred) {
                return await safeEdit(interaction, {
                    content: 'Session de configuration expirée. Veuillez recommencer avec `/start-festival`.'
                });
            } else {
                return await safeReply(interaction, {
                    content: 'Session de configuration expirée. Veuillez recommencer avec `/start-festival`.',
                    ephemeral: true
                });
            }
        }

        if (interaction.customId.startsWith('teamsize_')) {
            // Étape 1: Taille des équipes sélectionnée
            const teamSize = parseInt(interaction.customId.split('_')[1]);
            setup.teamSize = teamSize;
            setup.step = 2;
            
            console.log(`✅ Teamsize ${teamSize} sélectionné, passage à l'étape 2`);

            // Étape 2: Choix du mode de jeu
            const embed = new EmbedBuilder()
                .setColor('#0099ff')
                .setTitle(`🎮 Configuration du Festival - Étape 2/4`)
                .setDescription(`Équipes ${teamSize}v${teamSize} sélectionnées.\n\nChoisissez maintenant le type de modes de jeu:`)
                .addFields(
                    { name: '🌱 Guerre de Territoire', value: 'Tous les matchs en Turf War uniquement', inline: true },
                    { name: '⚔️ Modes Pro', value: 'Tous les matchs en modes classés (Zones, Tour, Rainmaker, Palourdes)', inline: true },
                    { name: '🎯 Défense de Zone', value: 'Tous les matchs en Défense de Zone uniquement', inline: true },
                    { name: '🎲 Modes Mixtes', value: 'BO3 avec des modes variés (recommandé)', inline: true }
                );

            const gameModeRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('gamemode_turf')
                        .setLabel('Guerre de Territoire')
                        .setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder()
                        .setCustomId('gamemode_ranked')
                        .setLabel('Modes Pro')
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId('gamemode_splat_zones')
                        .setLabel('Défense de Zone')
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId('gamemode_mixed')
                        .setLabel('Modes Mixtes')
                        .setStyle(ButtonStyle.Success)
                );

            // Pour les boutons après deferUpdate, toujours utiliser safeEdit
            await safeEdit(interaction, {
                embeds: [embed],
                components: [gameModeRow]
            });
            
            // Sauvegarder la session après modification
            console.log(`💾 Session sauvegardée après teamsize, step maintenant: ${setup.step}`);

        } else if (interaction.customId.startsWith('gamemode_')) {
        // Étape 2: Mode de jeu sélectionné
        const rawGameMode = interaction.customId.replace('gamemode_', '');
    
        // Fix the gameMode value if it's truncated due to button ID limits
        let correctedGameMode = rawGameMode;
        if (rawGameMode === 'splat') {
            correctedGameMode = 'splat_zones';
        }
        
        setup.gameMode = correctedGameMode;
        setup.step = 3;

        // Obtenir le nom d'affichage correct
        let gameModeDisplayName = 'Modes Pro';
        if (correctedGameMode === 'mixed') {
            gameModeDisplayName = 'Modes Mixtes';
        } else if (correctedGameMode === 'turf') {
            gameModeDisplayName = 'Guerre de Territoire';
        } else if (correctedGameMode === 'splat_zones') {
            gameModeDisplayName = 'Défense de Zone';
        } else if (correctedGameMode === 'ranked') {
            gameModeDisplayName = 'Modes Pro';
        }

        // Étape 3: Bannissement de maps
        const embed = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle(`🎮 Configuration du Festival - Étape 3/4`)
            .setDescription(`Mode "${gameModeDisplayName}" sélectionné.\n\nVoulez-vous bannir certaines maps pour ce festival?`)
            .addFields(
                { name: '✅ Toutes les maps', value: 'Utiliser toutes les maps disponibles', inline: true },
                { name: '🚫 Bannir des maps', value: 'Choisir quelles maps exclure', inline: true }
            );

        const mapBanRow = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('mapban_none')
                    .setLabel('Toutes les maps')
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId('mapban_select')
                    .setLabel('Bannir des maps')
                    .setStyle(ButtonStyle.Danger)
            );

        await safeEdit(interaction, {
            embeds: [embed],
            components: [mapBanRow]
        });

    } else if (interaction.customId === 'mapban_none') {
        // Étape 3: Aucune map bannie
        setup.bannedMaps = [];
        await showFinalSetup(interaction, setup);

    } else if (interaction.customId === 'mapban_select') {
        // Étape 3: Sélection des maps à bannir
        const mapOptions = ALL_MAP_KEYS.slice(0, 25).map(mapKey => ({
            label: MAPS[mapKey],
            value: mapKey,
            description: `Bannir ${MAPS[mapKey]}`
        }));

        const mapSelectMenu = new StringSelectMenuBuilder()
            .setCustomId('mapban_selection')
            .setPlaceholder('Sélectionnez les maps à bannir...')
            .setMinValues(0)
            .setMaxValues(Math.min(25, mapOptions.length))
            .addOptions(mapOptions);

        const embed = new EmbedBuilder()
            .setColor('#ff9900')
            .setTitle('🚫 Sélection des maps à bannir')
            .setDescription('Choisissez les maps que vous voulez exclure de ce festival.\nVous pouvez en sélectionner plusieurs ou aucune.')
            .addFields(
                { name: 'Maps disponibles', value: `${ALL_MAP_KEYS.length} maps au total` }
            );

        const actionRow = new ActionRowBuilder().addComponents(mapSelectMenu);
        const confirmRow = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('mapban_confirm')
                    .setLabel('Confirmer la sélection')
                    .setStyle(ButtonStyle.Success)
            );

        setup.bannedMaps = [];

        await safeEdit(interaction, {
            embeds: [embed],
            components: [actionRow, confirmRow]
        });

    } else if (interaction.customId === 'mapban_confirm') {
        // Confirmer la sélection des maps bannies
        await showFinalSetup(interaction, setup);
    }

    } catch (error) {
        console.error('Erreur dans handleFestivalSetup:', error);
        
        // Nettoyer la session en cas d'erreur
        if (interaction.client.festivalSetup && interaction.client.festivalSetup[interaction.user.id]) {
            delete interaction.client.festivalSetup[interaction.user.id];
        }
        
        if (interaction.deferred || interaction.replied) {
            await safeEdit(interaction, {
                content: `Une erreur s'est produite lors de la configuration: ${error.message}\nVeuillez recommencer avec \`/start-festival\`.`
            });
        } else {
            await safeReply(interaction, {
                content: `Une erreur s'est produite lors de la configuration: ${error.message}\nVeuillez recommencer avec \`/start-festival\`.`,
                ephemeral: true
            });
        }
    }
};



// Helper function for the final setup step
async function showFinalSetup(interaction, setup) {
    const embed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle(`🎮 Configuration du Festival - Étape 4/5`)
        .setDescription(`Configuration presque terminée !\n\nChoisissez maintenant la durée du festival :`)
        .addFields(
            { name: '⚡ 1 jour', value: 'Festival express', inline: true },
            { name: '🎯 3 jours', value: 'Festival court', inline: true },
            { name: '📅 1 semaine', value: 'Durée standard recommandée', inline: true },
            { name: '📅 2 semaines', value: 'Festival étendu', inline: true },
            { name: '📅 1 mois', value: 'Festival long', inline: true },
            { name: '⚙️ Personnalisée', value: 'Choisir une date de fin précise', inline: true }
        );

    const durationRow = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('festivalduration_1')
                .setLabel('1 jour')
                .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
                .setCustomId('festivalduration_3')
                .setLabel('3 jours')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId('festivalduration_7')
                .setLabel('1 semaine')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId('festivalduration_14')
                .setLabel('2 semaines')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId('festivalduration_custom')
                .setLabel('Personnalisée')
                .setStyle(ButtonStyle.Secondary)
        );

    try {
        await safeEdit(interaction, {
            embeds: [embed],
            components: [durationRow]
        });
    } catch (error) {
        console.error('Erreur showFinalSetup:', error);
        // En cas d'erreur, nettoyer la session et informer l'utilisateur
        delete interaction.client.festivalSetup[interaction.user.id];
        throw error;
    }
}

const handleFinalFestivalSetup = async (interaction) => {
    const setup = interaction.client.festivalSetup?.[interaction.user.id];
    if (!setup) {
        return await safeReply(interaction, {
            content: 'Session de configuration expirée. Veuillez recommencer avec `/start-festival`.',
            ephemeral: true
        });
    }

    // Récupérer les données du modal
    const title = interaction.fields.getTextInputValue('festivalTitle');
    
    let startDate, endDate;
    let camp1, camp2, camp3;
    
    if (setup.isCustomDate) {
        // NOUVEAU : Mode dates personnalisées avec tous les camps en une ligne
        const allCampsInput = interaction.fields.getTextInputValue('allCamps');
        const customStartDateStr = interaction.fields.getTextInputValue('customStartDate');
        const customEndDateStr = interaction.fields.getTextInputValue('customEndDate');
        
        try {
            // Parser les camps (format: "Camp1, Camp2, Camp3")
            const camps = allCampsInput.split(',').map(camp => camp.trim());
            if (camps.length !== 3) {
                throw new Error("Vous devez spécifier exactement 3 camps séparés par des virgules (ex: Camp 1, Camp 2, Camp 3)");
            }
            
            [camp1, camp2, camp3] = camps;
            
            if (!camp1 || !camp2 || !camp3) {
                throw new Error("Tous les noms de camps sont obligatoires");
            }
            
            // Valider date de début
            const dateRegex = /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})$/;
            if (!dateRegex.test(customStartDateStr)) {
                throw new Error("Format de date de début invalide. Utilisez le format JJ/MM/AAAA HH:MM");
            }
            
            // Utiliser l'utilitaire pour gérer correctement le fuseau horaire
            startDate = parseFrenchDate(customStartDateStr);
            
            if (isNaN(startDate.getTime())) {
                throw new Error("Date de début invalide");
            }
            
            // Valider date de fin
            if (!dateRegex.test(customEndDateStr)) {
                throw new Error("Format de date de fin invalide. Utilisez le format JJ/MM/AAAA HH:MM");
            }
            
            // Utiliser l'utilitaire pour gérer correctement le fuseau horaire
            endDate = parseFrenchDate(customEndDateStr);
            
            if (isNaN(endDate.getTime())) {
                throw new Error("Date de fin invalide");
            }
            
            const now = new Date();
            if (startDate <= now) {
                const nowParis = moment(now).tz("Europe/Paris").format("DD/MM/YYYY HH:mm:ss");
                const inputParis = moment(startDate).tz("Europe/Paris").format("DD/MM/YYYY HH:mm:ss");
                const diffSeconds = Math.round((now.getTime() - startDate.getTime()) / 1000);
                
                throw new Error(`La date de début doit être dans le futur.\nSaisie: ${inputParis}\nActuellement: ${nowParis}\n(Retard de ${diffSeconds} secondes)`);
            }
            
            if (endDate <= startDate) {
                throw new Error("La date de fin doit être après la date de début");
            }
            
            // Calculer la durée pour information
            const durationMs = endDate.getTime() - startDate.getTime();
            const durationDays = Math.ceil(durationMs / (1000 * 60 * 60 * 24));
            
            console.log(`Dates personnalisées - Début: ${startDate.toISOString()}, Fin: ${endDate.toISOString()}, Durée: ${durationDays} jours`);
            
        } catch (error) {
            return await safeReply(interaction, {
                content: `Erreur dates personnalisées : ${error.message}`,
                ephemeral: true
            });
        }
        
    } else {
        // Mode durée prédéfinie (existant)
        camp1 = interaction.fields.getTextInputValue('camp1Name');
        camp2 = interaction.fields.getTextInputValue('camp2Name');
        camp3 = interaction.fields.getTextInputValue('camp3Name');
        const startDateInput = interaction.fields.getTextInputValue('startDate');
        
        try {
            const dateRegex = /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})$/;
            if (!dateRegex.test(startDateInput)) {
                throw new Error("Format de date de début invalide. Utilisez le format JJ/MM/AAAA HH:MM");
            }
            
            // Utiliser l'utilitaire pour gérer correctement le fuseau horaire
            startDate = parseFrenchDate(startDateInput);
            
            if (isNaN(startDate.getTime())) {
                throw new Error("Date de début invalide");
            }
            
            const now = new Date();
            if (startDate <= now) {
                const nowParis = moment(now).tz("Europe/Paris").format("DD/MM/YYYY HH:mm:ss");
                const inputParis = moment(startDate).tz("Europe/Paris").format("DD/MM/YYYY HH:mm:ss");
                const diffSeconds = Math.round((now.getTime() - startDate.getTime()) / 1000);
                
                throw new Error(`La date de début du festival doit être dans le futur.\nSaisie: ${inputParis}\nActuellement: ${nowParis}\n(Retard de ${diffSeconds} secondes)`);
            }
            
            // Calculer la date de fin avec la durée choisie
            const durationDays = setup.durationDays || 7;
            endDate = new Date(startDate.getTime() + (durationDays * 24 * 60 * 60 * 1000));
            
            console.log(`Durée prédéfinie - ${durationDays} jours`);
            
        } catch (error) {
            return await safeReply(interaction, {
                content: `Erreur date de début : ${error.message}`,
                ephemeral: true
            });
        }
    }
    
    // Maintenant on a toutes les données, créer le festival directement
    await createFinalFestival(interaction, setup, {
        title,
        campNames: [camp1, camp2, camp3],
        startDate,
        endDate
    });
};

// Fonction commune pour créer le festival
const createFinalFestival = async (interaction, setup, festivalData) => {
    // Récupérer la configuration
    const config = interaction.client.configData || await loadConfig(interaction.guild.id);
    
    if (!config.announcementChannelId) {
        return await safeReply(interaction, {
            content: '⚠️ Aucun salon d\'annonces n\'est configuré.',
            ephemeral: true
        });
    }
    
    // Récupérer les données de configuration
    const { teamSize, gameMode, bannedMaps } = setup;
    
    // RÉPONDRE IMMÉDIATEMENT À L'INTERACTION
    await safeReply(interaction, {
        content: `⏳ Création du festival "${festivalData.title}" en cours...`,
        ephemeral: true
    });
    
    // PUIS créer le festival
    try {
        const festival = await createFestival(
            festivalData.title,
            festivalData.campNames,
            festivalData.startDate.toISOString(),
            festivalData.endDate.toISOString(),
            config.announcementChannelId,
            interaction.guild,
            {
                teamSize: teamSize || 4,
                gameMode: gameMode || 'mixed',
                bannedMaps: bannedMaps || []
            }
        );

        // Nettoyer la session
        delete interaction.client.festivalSetup[interaction.user.id];

        // METTRE À JOUR la réponse de l'admin après création réussie
        await safeEdit(interaction, {
            content: `✅ Festival "${festivalData.title}" créé avec succès!\n` +
                    `📊 Configuration: ${teamSize}v${teamSize}, ${getGameModeDisplayName(gameMode)}\n` +
                    `🗓️ Début: <t:${Math.floor(festivalData.startDate.getTime() / 1000)}:F>\n` +
                    `🏁 Fin: <t:${Math.floor(festivalData.endDate.getTime() / 1000)}:F>\n` +
                    `📢 L'annonce publique a été publiée dans <#${config.announcementChannelId}>`
        });

    } catch (error) {
        console.error('Erreur lors de la création du festival:', error);
        await safeEdit(interaction, {
            content: `Erreur lors de la création du festival: ${error.message}`
        });
    }
};

// Ajouter cette fonction utilitaire dans src/utils/interactionHandlers.js
function getGameModeDisplayName(gameMode) {
    const modes = {
        'turf': 'Guerre de Territoire uniquement',
        'ranked': 'Modes Pro uniquement',
        'splat_zones': 'Défense de Zone uniquement',
        'mixed': 'Modes mixtes'
    };
    return modes[gameMode] || 'Modes mixtes';
}

// Ajouter la fonction handleMapBanSelection
const handleMapBanSelection = async (interaction) => {
    // IMPORTANT: Répondre à l'interaction pour éviter "This interaction failed"
    await interaction.deferUpdate();
    
    const setup = interaction.client.festivalSetup?.[interaction.user.id];
    if (!setup) {
        return await safeEdit(interaction, {
            content: 'Session de configuration expirée.',
            ephemeral: true
        });
    }

    // Sauvegarder les maps bannies sélectionnées
    setup.bannedMaps = interaction.values || [];
    
    console.log(`📋 Maps bannies sélectionnées: ${setup.bannedMaps.join(', ')}`);
    
    // L'utilisateur doit maintenant cliquer sur "Confirmer la sélection" pour continuer
};

const handleFestivalDuration = async (interaction) => {
    try {
        // ✅ Le defer est déjà fait dans interactionCreate.js pour les boutons critiques
        // Pas besoin de re-defer ici
        
        const setup = interaction.client.festivalSetup?.[interaction.user.id];
        if (!setup) {
            return await safeEdit(interaction, {
                content: 'Session de configuration expirée. Veuillez recommencer avec `/start-festival`.'
            });
        }

    if (interaction.customId === 'festivalduration_custom') {
        // Modal avec TOUS les champs y compris les 3 camps
        const modal = new ModalBuilder()
            .setCustomId('festival_final_setup')
            .setTitle('Configuration Finale - Dates Personnalisées');

        const titleInput = new TextInputBuilder()
            .setCustomId('festivalTitle')
            .setLabel('Titre du Festival')
            .setPlaceholder('Entrez le titre du festival')
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        // NOUVEAU : Un seul champ pour tous les camps
        const campsInput = new TextInputBuilder()
            .setCustomId('allCamps')
            .setLabel('Noms des 3 camps (séparés par des virgules)')
            .setPlaceholder('Camp 1, Camp 2, Camp 3')
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        const startDateInput = new TextInputBuilder()
            .setCustomId('customStartDate')
            .setLabel('Date de début (JJ/MM/AAAA HH:MM)')
            .setPlaceholder('Ex: 25/12/2024 12:00')
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        const endDateInput = new TextInputBuilder()
            .setCustomId('customEndDate')
            .setLabel('Date de fin (JJ/MM/AAAA HH:MM)')
            .setPlaceholder('Ex: 30/12/2024 18:00')
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        modal.addComponents(
            new ActionRowBuilder().addComponents(titleInput),
            new ActionRowBuilder().addComponents(campsInput),      // ← Tous les camps en une ligne
            new ActionRowBuilder().addComponents(startDateInput),  // ← Date de début
            new ActionRowBuilder().addComponents(endDateInput)     // ← Date de fin
        );

        // Marquer que c'est une configuration avec dates personnalisées
        setup.isCustomDate = true;
        
        return await interaction.showModal(modal);

    } else {
        // Durées prédéfinies (existant) - modal normal
        const days = parseInt(interaction.customId.split('_')[1]);
        setup.durationDays = days;
        setup.isCustomDate = false;
        
        const modal = new ModalBuilder()
            .setCustomId('festival_final_setup')
            .setTitle('Configuration Finale du Festival');

        const titleInput = new TextInputBuilder()
            .setCustomId('festivalTitle')
            .setLabel('Titre du Festival')
            .setPlaceholder('Entrez le titre du festival')
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        const camp1Input = new TextInputBuilder()
            .setCustomId('camp1Name')
            .setLabel('Nom du Camp 1')
            .setPlaceholder('Entrez le nom du premier camp')
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        const camp2Input = new TextInputBuilder()
            .setCustomId('camp2Name')
            .setLabel('Nom du Camp 2')
            .setPlaceholder('Entrez le nom du deuxième camp')
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        const camp3Input = new TextInputBuilder()
            .setCustomId('camp3Name')
            .setLabel('Nom du Camp 3')
            .setPlaceholder('Entrez le nom du troisième camp')
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        const startDateInput = new TextInputBuilder()
            .setCustomId('startDate')
            .setLabel('Date de début (JJ/MM/AAAA HH:MM)')
            .setPlaceholder('Ex: 25/04/2024 18:00')
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        modal.addComponents(
            new ActionRowBuilder().addComponents(titleInput),
            new ActionRowBuilder().addComponents(camp1Input),
            new ActionRowBuilder().addComponents(camp2Input),
            new ActionRowBuilder().addComponents(camp3Input),
            new ActionRowBuilder().addComponents(startDateInput)
        );

        return await interaction.showModal(modal);
    }
    
    } catch (error) {
        console.error('Erreur dans handleFestivalDuration:', error);
        
        if (interaction.deferred || interaction.replied) {
            await safeEdit(interaction, {
                content: `Une erreur s'est produite: ${error.message}\nVeuillez recommencer avec \`/start-festival\`.`
            });
        } else {
            await safeReply(interaction, {
                content: `Une erreur s'est produite: ${error.message}\nVeuillez recommencer avec \`/start-festival\`.`,
                ephemeral: true
            });
        }
    }
};

module.exports = {
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
    getPendingResultsForGuild,  // ← Helper function
    loadPendingResults,
    savePendingResults,
    initializeForGuild,         // ← Initialize function for guild
    handleFestivalSetup,        // ← Ajouter
    handleMapBanSelection,      // ← Ajouter
    handleFinalFestivalSetup,
    handleFestivalDuration,
    createFinalFestival,
    createMatchId               // ← Ajouter la fonction manquante
};
