const { EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
const { getAllTeams, findTeamByName, saveTeams, isTeamComplete } = require('./teamManager');
const { getCurrentFestival } = require('./festivalManager');
const { createMatchChannel, scheduleMatchChannelDeletion } = require('./channelManager');
const scoreTracker = require('./scoreTracker');
const BO3Generator = require('./bo3Generator');
const matchHistoryManager = require('./matchHistoryManager');
const { safeUpdate, safeReply } = require('../utils/responseUtils');
const DataAdapter = require('./dataAdapter');

// File d'attente pour les équipes en recherche par guild
const searchingTeamsByGuild = new Map(); // guildId -> Array<searchEntry>

const lastMatchEndTime = new Map(); // Map pour suivre les temps de fin de match

// Helper pour obtenir la file d'attente d'une guild
function getSearchingTeamsForGuild(guildId) {
    if (!guildId) return [];
    if (!searchingTeamsByGuild.has(guildId)) {
        searchingTeamsByGuild.set(guildId, []);
    }
    return searchingTeamsByGuild.get(guildId);
}

// Fonction pour ajouter un match à l'historique avec compteur de matchs
const addMatchToHistory = (team1Name, team2Name, guildId) => {
    matchHistoryManager.addMatchToHistory(team1Name, team2Name, guildId);
};

const calculateOpponentScore = (teamName, potentialOpponent, guildId) => {
    return matchHistoryManager.calculateOpponentScore(teamName, potentialOpponent, guildId);
};

const getTeamMatchHistory = (teamName, guildId) => {
    return matchHistoryManager.getTeamHistory(teamName, guildId);
};

// Période de "recharge" de 3 secondes
const COOLDOWN_AFTER_MATCH = 3000; 

const MATCHMAKING_TIMEOUT = 5 * 60 * 1000; // 5 minutes en millisecondes

const teamLocks = new Map(); // Map pour suivre les équipes en cours de traitement

// Fonction pour acquérir un verrou sur une équipe
function lockTeam(teamName, action) {
    if (teamLocks.has(teamName)) {
        console.log(`[VERROU] Équipe ${teamName} déjà verrouillée. Action ${action} refusée.`);
        return false;
    }
    teamLocks.set(teamName, action);
    console.log(`[VERROU] Équipe ${teamName} verrouillée pour action: ${action}`);
    return true;
}

// Fonction pour libérer un verrou
function unlockTeam(teamName) {
    if (teamLocks.has(teamName)) {
        teamLocks.delete(teamName);
        console.log(`[VERROU] Équipe ${teamName} déverrouillée`);
        return true;
    }
    return false;
}

// Fonction pour exécuter une opération sous verrou
async function withTeamLock(teamNames, action, guildId, callback) {
    // Récupérer tous les verrous d'un coup pour éviter les deadlocks
    const locks = [];
    
    try {
        // Phase 1: Acquisition des verrous (avec timeout pour éviter de bloquer indéfiniment)
        const acquireStartTime = Date.now();
        while (locks.length < teamNames.length) {
            if (Date.now() - acquireStartTime > 10000) { // Timeout après 10 sec
                console.log(`[VERROU] Timeout lors de l'acquisition des verrous pour ${action}`);
                return false;
            }
            
            // Vérifier que toutes les équipes sont disponibles
            let allAvailable = true;
            
            for (const teamName of teamNames) {
                if (teamLocks.has(teamName)) {
                    allAvailable = false;
                    await new Promise(resolve => setTimeout(resolve, 100)); // Attendre 100ms
                    break;
                }
            }
            
            // Si toutes disponibles, acquérir les verrous
            if (allAvailable) {
                for (const teamName of teamNames) {
                    teamLocks.set(teamName, action);
                    locks.push(teamName);
                    console.log(`[VERROU] Équipe ${teamName} verrouillée pour action: ${action}`);
                }
            }
        }
        
        // Phase 2: Exécution atomique avec l'état le plus à jour
        // Important: Recharger les équipes depuis la source pour avoir l'état le plus récent
        const allTeams = getAllTeams(guildId);
        const teams = teamNames.map(name => allTeams.find(t => t.name === name)).filter(Boolean);
        
        // Vérifier que les équipes sont dans un état cohérent avant de continuer
        const busyTeam = teams.find(t => t.busy && t.currentOpponent && !teamNames.includes(t.currentOpponent));
        if (busyTeam) {
            console.log(`[VERROU] Annulation: ${busyTeam.name} est déjà en match avec ${busyTeam.currentOpponent}`);
            return false;
        }
        
        // Exécuter l'opération avec les équipes mises à jour
        return await callback(teams);
    } finally {
        // Phase 3: Libération des verrous (toujours exécutée)
        for (const teamName of locks) {
            teamLocks.delete(teamName);
            console.log(`[VERROU] Équipe ${teamName} déverrouillée`);
        }
    }
}

// Commencer la recherche de match
async function startMatchSearch(interaction, team, isTestMode = false) {
    const guildId = interaction?.guild?.id;
    if (!guildId) {
        console.error('Aucun guildId trouvé dans startMatchSearch');
        return false;
    }
    
    // Vérifier si le festival est actif
    const festival = getCurrentFestival(guildId);
    if (!festival || !festival.isActive) {
        console.log(`Tentative de recherche annulée: aucun festival actif`);
        if (interaction) {
            await safeReply(interaction, {
                content: "Aucun festival actif actuellement. Les matchs seront disponibles quand un festival démarrera.",
                ephemeral: true
            });
        }
        return false;
    }
    
    // Vérifier si l'équipe est déjà en recherche
    const searchingTeams = getSearchingTeamsForGuild(guildId);
    const existingSearch = searchingTeams.find(entry => entry.team.name === team.name);
    
    // Vérifier si l'équipe est occupée (en match ou avec verrou)
    if (team.busy || team.currentOpponent || teamLocks.has(team.name)) {
        console.log(`❌ Équipe ${team.name} occupée: busy=${team.busy}, opponent=${team.currentOpponent}, locked=${teamLocks.has(team.name)}`);
        
        // 🔧 RÉPARATION AUTOMATIQUE: Si busy=true mais pas d'adversaire, corriger l'état
        if (team.busy && !team.currentOpponent) {
            console.warn(`🔧 RÉPARATION: Équipe ${team.name} marquée busy sans adversaire, correction automatique...`);
            team.busy = false;
            team.currentMatchMultiplier = null;
            team.currentMatchId = null;
            team.currentBO3 = null;
            saveTeams(guildId);
            console.log(`✅ État de l'équipe ${team.name} réparé`);
            // Continuer avec la recherche normale après réparation
        } else {
            return await safeReply(interaction, {
                content: `Votre équipe ne peut pas rechercher de match actuellement. ${team.currentOpponent ? `En match contre ${team.currentOpponent}.` : 'Équipe occupée.'}`,
                ephemeral: true
            });
        }
    }

    // Vérifier si l'utilisateur est le leader de l'équipe (sauf en mode test)
    if (!isTestMode && !team.isLeader(interaction.user.id)) {
        return await safeReply(interaction, {
            content: "Seul le chef d'équipe peut lancer une recherche de match.",
            ephemeral: true
        });
    }
    
    // Vérifier si l'équipe a le bon nombre de membres selon le festival
    if (!isTestMode) {
        const festival = getCurrentFestival(guildId);
        const requiredSize = festival?.teamSize || 4;
        const currentSize = team.members.length;
        
        if (currentSize !== requiredSize) {
            const formatDisplay = `${requiredSize}v${requiredSize}`;
            return await safeReply(interaction, {
                content: `Votre équipe doit avoir exactement ${requiredSize} membres pour rechercher un match en ${formatDisplay}. Votre équipe actuelle : ${currentSize}/${requiredSize} membres.`,
                ephemeral: true
            });
        }
    }
    
    if (existingSearch) {
        // Calculer le temps de recherche
        const searchTime = Math.floor((Date.now() - existingSearch.startTime) / 1000); // en secondes
        
        // Formater le temps de recherche
        let timeDisplay;
        if (searchTime < 60) {
            timeDisplay = `${searchTime} secondes`;
        } else {
            const minutes = Math.floor(searchTime / 60);
            const seconds = searchTime % 60;
            timeDisplay = `${minutes} minute${minutes > 1 ? 's' : ''} et ${seconds} seconde${seconds > 1 ? 's' : ''}`;
        }
        
        // Créer un embed avec les infos de recherche
        const embed = new EmbedBuilder()
            .setColor('#FFA500')
            .setTitle(`Recherche en cours...`)
            .setDescription(`Votre équipe **${team.name}** est déjà en recherche de match.`)
            .addFields(
                { name: 'Temps de recherche', value: timeDisplay },
                { name: 'Statut', value: 'En attente d\'un adversaire...' },
                { name: 'Temps restant', value: `La recherche sera annulée automatiquement dans ${Math.floor((MATCHMAKING_TIMEOUT - searchTime * 1000) / 60000)} minutes.` }
            );
        
        // Créer un bouton d'annulation
        const cancelButton = new ButtonBuilder()
            .setCustomId(`cancel_search_${team.name}`)
            .setLabel('Annuler la recherche')
            .setStyle(ButtonStyle.Danger);
        
        const buttonRow = new ActionRowBuilder().addComponents(cancelButton);
        
        return await safeReply(interaction, {
            content: 'Votre équipe est déjà en recherche. Utilisez le bouton ci-dessous pour annuler.',
            embeds: [embed],
            components: [buttonRow],
            ephemeral: true
        });
    }
    
    // Vérifier si l'équipe est en match
    if (team.currentOpponent) {
        return await safeReply(interaction, {
            content: `Votre équipe est déjà en match contre l'équipe ${team.currentOpponent}.`,
            ephemeral: true
        });
    }
    
    // Vérifier immédiatement s'il y a déjà une équipe disponible
    const match = findMatch(team, guildId);
    
    if (match) {
        // Un match a été trouvé immédiatement
        await safeReply(interaction, {
            content: "Un adversaire a été trouvé immédiatement! Création du match en cours...",
            ephemeral: true
        });
        return await createMatch(interaction, team, match);
    }
    
    // Pas de match immédiat, ajouter à la file d'attente
    const searchEntry = {
        team: team,
        interaction: interaction,
        startTime: Date.now(),
        notifiedAfterWait: false,
        timeoutId: null // Pour stocker l'ID du timeout
    };
    
    // Configurer le timeout pour annuler automatiquement après 5 minutes
    searchEntry.timeoutId = setTimeout(() => {
        // Vérifier si l'équipe est toujours en recherche
        const searchingTeams = getSearchingTeamsForGuild(guildId);
        const index = searchingTeams.findIndex(entry => entry.team.name === team.name);
        if (index !== -1) {
            console.log(`[TIMEOUT] L'équipe ${team.name} a été retirée du matchmaking après 5 minutes`);
            
            // Retirer de la file d'attente
            cleanupSearch(team.name, guildId);
            
            // Notifier l'équipe dans son salon
            try {
                if (team.channelId) {
                    const guild = interaction.guild;
                    const teamChannel = guild.channels.cache.get(team.channelId);
                    if (teamChannel) {
                        teamChannel.send({
                            content: `⏱️ La recherche de match pour l'équipe **${team.name}** a été automatiquement annulée après 5 minutes d'attente.`,
                            embeds: [
                                new EmbedBuilder()
                                    .setColor('#FF0000')
                                    .setTitle('Recherche de match annulée')
                                    .setDescription(`La recherche de match a été automatiquement arrêtée après 5 minutes.`)
                                    .addFields({ name: 'Que faire?', value: 'Vous pouvez relancer une recherche avec la commande `/search-match`.' })
                            ]
                        });
                    }
                }
            } catch (error) {
                console.error('Erreur lors de la notification de timeout:', error);
            }
        }
    }, MATCHMAKING_TIMEOUT);
    
    searchingTeams.push(searchEntry);
    
    // Informer l'utilisateur que la recherche commence avec un message éphémère
    await safeReply(interaction, {
        content: `La recherche de match a commencé pour votre équipe. Un message a été envoyé dans le salon d'équipe.`,
        ephemeral: true
    });
    
    // Créer un embed pour le salon d'équipe
    const teamEmbed = new EmbedBuilder()
        .setColor('#0099FF')
        .setTitle(`🔍 Recherche de match en cours`)
        .setDescription(`L'équipe **${team.name}** est en recherche d'un adversaire.`)
        .addFields(
            { name: 'Statut', value: 'En attente d\'un adversaire...' },
            { name: 'Démarré par', value: `<@${interaction.user.id}>` },
            { name: 'Temps maximum', value: 'La recherche sera automatiquement annulée après 5 minutes.' },
            { name: 'Note', value: 'Si le bouton d\'annulation ne répond pas, utilisez à nouveau la commande `/search-match` et cliquez sur le nouveau bouton.' }
        )
        .setFooter({ text: `La recherche a commencé à ${new Date().toLocaleTimeString()}` })
        .setTimestamp();
    
    // Créer un bouton d'annulation
    const cancelButton = new ButtonBuilder()
        .setCustomId(`cancel_search_${team.name}`)
        .setLabel('Annuler la recherche')
        .setStyle(ButtonStyle.Danger);
    
    const buttonRow = new ActionRowBuilder().addComponents(cancelButton);
    
    // Envoyer dans le salon d'équipe
    try {
        if (team.channelId) {
            const teamChannel = interaction.guild.channels.cache.get(team.channelId);
            if (teamChannel) {
                const teamRole = interaction.guild.roles.cache.find(role => role.name === `Team ${team.name}`);
                const mentionText = teamRole ? `${teamRole}` : `@everyone`;
                
                await teamChannel.send({
                    content: `${mentionText} Une recherche de match a été lancée!`,
                    embeds: [teamEmbed],
                    components: [buttonRow]
                });
            }
        }
    } catch (error) {
        console.error('Erreur lors de l\'envoi dans le salon d\'équipe:', error);
    }
    
    // Planifier la notification après 30 secondes
    setTimeout(() => checkWaitingTeam(searchEntry, guildId), 30000);
}

// Commencer la recherche de match sans nécessiter d'interaction (pour les équipes virtuelles)
// Fonction supprimée: startVirtualTeamSearch - tests virtuels retirés

// Vérifier une équipe après son temps d'attente minimum
async function checkWaitingTeam(searchEntry, guildId) {
    // Vérifier si l'équipe est toujours en recherche
    const searchingTeams = getSearchingTeamsForGuild(guildId);
    const index = searchingTeams.findIndex(entry => entry.team.name === searchEntry.team.name);
    if (index === -1) return; // L'équipe n'est plus en recherche
    
    // Vérifier à nouveau s'il y a un match disponible
    const match = findMatch(searchEntry.team, guildId);
    
    if (match) {
        // Un match a été trouvé
        createMatch(searchEntry.interaction, searchEntry.team, match);
    } else if (!searchEntry.notifiedAfterWait) {
        // Pas de match trouvé après 30 secondes, mais on continue de chercher
        searchEntry.notifiedAfterWait = true;
        
        try {
            // Calculer le temps restant
            const elapsedMs = Date.now() - searchEntry.startTime;
            const remainingMs = MATCHMAKING_TIMEOUT - elapsedMs;
            const remainingMinutes = Math.max(0, Math.floor(remainingMs / 60000));
            const remainingSeconds = Math.max(0, Math.floor((remainingMs % 60000) / 1000));
            
            // Mettre à jour dans le salon d'équipe si possible
            if (searchEntry.team.channelId && searchEntry.interaction && searchEntry.interaction.guild) {
                const teamChannel = searchEntry.interaction.guild.channels.cache.get(searchEntry.team.channelId);
                if (teamChannel) {
                    const embed = new EmbedBuilder()
                        .setColor('#FFA500')
                        .setTitle(`Recherche en cours...`)
                        .setDescription(`Aucun adversaire trouvé pour **${searchEntry.team.name}** après 30 secondes.`)
                        .addFields(
                            { name: 'Statut', value: 'La recherche continue en arrière-plan.' },
                            { name: 'Temps écoulé', value: `${Math.floor(elapsedMs / 60000)} min ${Math.floor((elapsedMs % 60000) / 1000)} sec` },
                            { name: 'Temps restant', value: `La recherche sera annulée dans ${remainingMinutes}:${remainingSeconds < 10 ? '0' : ''}${remainingSeconds}.` }
                        );
                    
                    await teamChannel.send({
                        embeds: [embed]
                    });
                }
            }
        } catch (error) {
            console.error('Erreur lors de la notification d\'attente prolongée:', error);
        }
    }
}

// Trouver un match pour une équipe
function findMatch(team, guildId) {
    const allTeams = getAllTeams(guildId);
    const searchingTeams = getSearchingTeamsForGuild(guildId);
    const now = Date.now();

    // Récupérer toutes les équipes disponibles avec vérifications de base
    const availableTeams = allTeams.filter(t => {
        // VÉRIFICATIONS DE BASE
        if (!t || !t.name || t.name === team.name) {
            return false;
        }
        
        // CRITÈRES D'ÉLIGIBILITÉ
        const isNotBusy = !t.busy;
        const hasNoOpponent = !t.currentOpponent;
        const isInSearch = searchingTeams.some(entry => entry.team.name === t.name);
        const hasCooldownPassed = !lastMatchEndTime.has(t.name) || 
                         (now - lastMatchEndTime.get(t.name)) > COOLDOWN_AFTER_MATCH;
        
        const isEligible = isNotBusy && hasNoOpponent && isInSearch && hasCooldownPassed;
        
        if (isEligible) {
            // Vérifier si l'équipe est complète
            try {
                return isTeamComplete(t, guildId);
            } catch (error) {
                console.error(`Erreur lors de la vérification de complétude pour ${t.name}:`, error);
                return false;
            }
        }
        
        return false;
    });
    
    if (availableTeams.length === 0) {
        console.log('Aucune équipe disponible trouvée');
        return null;
    }
    
    // Ajouter le temps d'attente et calculer les scores de pondération
    const availableTeamsWithScores = availableTeams.map(t => {
        const searchEntry = searchingTeams.find(entry => entry.team.name === t.name);
        const waitTime = searchEntry ? (Date.now() - searchEntry.startTime) : 0;
        
        return {
            ...t,
            waitTime: waitTime,
            score: calculateOpponentScore(team.name, { ...t, waitTime }, guildId)
        };
    });
    
    // Trier par score décroissant (meilleur score en premier)
    availableTeamsWithScores.sort((a, b) => b.score - a.score);
    
    console.log(`Scores de matchmaking pour ${team.name}:`, 
        availableTeamsWithScores.slice(0, 3).map(t => `${t.name}: ${t.score}`).join(', '));
    
    // Système de sélection pondérée intelligente
    return selectOpponentWithWeighting(team, availableTeamsWithScores, guildId);
}

// Sélectionner un adversaire selon les critères de priorité
function selectOpponent(team, availableTeams, lastOpponent, areSearching) {
    // Rediriger vers le nouveau système de pondération
    const teamsWithScores = availableTeams.map(t => ({
        ...t,
        score: calculateOpponentScore(team.name, t)
    }));
    
    return selectOpponentWithWeighting(team, teamsWithScores);
}

// Sélectionner un adversaire avec pondération
function selectOpponentWithWeighting(team, availableTeamsWithScores, guildId) {
    if (availableTeamsWithScores.length === 0) return null;
    
    // Séparer en catégories selon votre priorité souhaitée
    const otherCampTeams = availableTeamsWithScores.filter(t => t.camp !== team.camp);
    const sameCampTeams = availableTeamsWithScores.filter(t => t.camp === team.camp);
    
    // NOUVEAUX SEUILS basés sur les matchs plutôt que le temps
    
    // 1. PRIORITÉ MAXIMALE : Équipes d'autres camps jamais affrontées ou >5 matchs (score ≥ 130)
    const excellentOtherCampTeams = otherCampTeams.filter(t => t.score >= 130);
    
    // 2. PRIORITÉ TRÈS ÉLEVÉE : Équipes du même camp jamais affrontées ou >5 matchs (score ≥ 130)
    const excellentSameCampTeams = sameCampTeams.filter(t => t.score >= 130);
    
    // 3. PRIORITÉ ÉLEVÉE : Équipes d'autres camps avec 3-5 matchs de distance (score 80-129)
    const goodOtherCampTeams = otherCampTeams.filter(t => t.score >= 80 && t.score < 130);
    
    // 4. PRIORITÉ MODÉRÉE : Équipes du même camp avec 3-5 matchs de distance (score 80-129)
    const goodSameCampTeams = sameCampTeams.filter(t => t.score >= 80 && t.score < 130);
    
    // 5. PRIORITÉ FAIBLE : Équipes d'autres camps avec 2 matchs de distance (score 50-79)
    const okOtherCampTeams = otherCampTeams.filter(t => t.score >= 50 && t.score < 80);
    
    // 6. PRIORITÉ TRÈS FAIBLE : Équipes du même camp avec 2 matchs de distance (score 50-79)
    const okSameCampTeams = sameCampTeams.filter(t => t.score >= 50 && t.score < 80);
    
    // 7. PRIORITÉ MINIMALE : Équipes affrontées au dernier match (score < 50)
    const lastResortTeams = availableTeamsWithScores.filter(t => t.score < 50);
    
    // NOUVEAU : Temps d'attente minimum pour éviter les revendications rapides
    // Note: Cette fonction nécessiterait un guildId pour fonctionner correctement
    // Pour l'instant, on utilise une approche de fallback
    let teamWaitTime = 0;
    // TODO: Passer guildId à cette fonction pour une isolation complète
    
    console.log(`${team.name} attend depuis un temps indéterminé (fonction à mettre à jour)`);
    
    // Si l'équipe attend depuis MOINS de 1 minute, être plus sélectif
    const waitTimeMinutes = teamWaitTime / (60 * 1000);
    if (waitTimeMinutes < 1) {
        if (excellentOtherCampTeams.length > 0) {
            console.log(`${team.name} - Pool EXCELLENT autres camps (attente < 1min)`);
            excellentOtherCampTeams.sort((a, b) => b.waitTime - a.waitTime);
            return excellentOtherCampTeams[0];
        } else if (excellentSameCampTeams.length > 0) {
            console.log(`${team.name} - Pool EXCELLENT même camp (attente < 1min)`);
            excellentSameCampTeams.sort((a, b) => b.waitTime - a.waitTime);
            return excellentSameCampTeams[0];
        } else {
            console.log(`${team.name} - Pas d'adversaire excellent, attente prolongée...`);
            return null; // Forcer l'attente
        }
    }
    
    // Si l'équipe attend depuis 1-2 minutes, autoriser les bons matchs
    if (waitTimeMinutes < 2) {
        const goodPools = [excellentOtherCampTeams, excellentSameCampTeams, goodOtherCampTeams, goodSameCampTeams];
        
        for (const pool of goodPools) {
            if (pool.length > 0) {
                pool.sort((a, b) => b.waitTime - a.waitTime);
                const poolName = pool === excellentOtherCampTeams ? 'EXCELLENT autres camps' :
                                pool === excellentSameCampTeams ? 'EXCELLENT même camp' :
                                pool === goodOtherCampTeams ? 'BON autres camps' : 'BON même camp';
                console.log(`${team.name} - Pool ${poolName} (attente 1-2min)`);
                return pool[0];
            }
        }
        
        console.log(`${team.name} - Pas de bon adversaire, attente prolongée...`);
        return null;
    }
    
    // Après 2 minutes, autoriser tous les matchs dans l'ordre de priorité
    const allPools = [
        { pool: excellentOtherCampTeams, name: 'EXCELLENT autres camps' },
        { pool: excellentSameCampTeams, name: 'EXCELLENT même camp' },
        { pool: goodOtherCampTeams, name: 'BON autres camps' },
        { pool: goodSameCampTeams, name: 'BON même camp' },
        { pool: okOtherCampTeams, name: 'OK autres camps (2 matchs)' },
        { pool: okSameCampTeams, name: 'OK même camp (2 matchs)' },
        { pool: lastResortTeams, name: 'DERNIER RECOURS (dernier match)' }
    ];
    
    for (const { pool, name } of allPools) {
        if (pool.length > 0) {
            pool.sort((a, b) => b.waitTime - a.waitTime);
            console.log(`${team.name} vs ${pool[0].name} - Pool: ${name}, Score: ${pool[0].score}, Attente: ${Math.round(pool[0].waitTime/1000)}s`);
            return pool[0];
        }
    }
    
    return null;
}

let isProcessingMatches = false; // Variable de verrouillage

setInterval(async () => {
    // Ne pas traiter si déjà en cours de traitement
    if (isProcessingMatches) return;
    
    try {
        isProcessingMatches = true;
        
        // Traiter chaque guilde séparément
        const guilds = searchingTeamsByGuild.keys();
        
        for (const guildId of guilds) {
            const searchingTeams = getSearchingTeamsForGuild(guildId);
            
            // Si pas d'équipes en recherche pour cette guilde, passer à la suivante
            if (searchingTeams.length === 0) continue;
            
            // Travailler sur une copie de l'array pour éviter les modifications pendant l'itération
            const teamsToProcess = [...searchingTeams];
            
            for (let i = 0; i < teamsToProcess.length; i++) {
                const entry = teamsToProcess[i];
                
                // Vérifier que l'équipe est toujours dans la file d'attente
                const currentSearchingTeams = getSearchingTeamsForGuild(guildId);
                if (!currentSearchingTeams.some(e => e.team.name === entry.team.name)) continue;
                
                // Vérifier que l'équipe est toujours disponible
                if (entry.team.busy || entry.team.currentOpponent) {
                    cleanupSearch(entry.team.name, guildId);
                    continue;
                }
                
                const match = findMatch(entry.team, guildId);
                
                if (match) {
                    // Marquer les deux équipes comme occupées IMMÉDIATEMENT
                    entry.team.busy = true;
                    match.busy = true;
                    
                    await createMatch(entry.interaction, entry.team, match);
                    // Traiter un seul match par intervalle pour éviter les conflits
                    break;
                }
            }
        }
    } finally {
        isProcessingMatches = false;
    }
}, 10000); // Vérifier toutes les 10 secondes

// Créer un match entre deux équipes
async function createMatch(interaction, team1, team2, onMatchCreated = null) {
    const guildId = interaction?.guild?.id;
    if (!guildId) {
        console.error('Aucun guildId trouvé dans createMatch');
        return false;
    }
    
    // Utiliser le nouveau mécanisme de verrouillage avec les équipes mises à jour
    return await withTeamLock([team1.name, team2.name], 'createMatch', guildId, async () => {
        const allTeams = getAllTeams(guildId);
        const updatedTeam1 = allTeams.find(t => t.name === team1.name);
        const updatedTeam2 = allTeams.find(t => t.name === team2.name);

        // Ajouter une vérification de sécurité :
        if (!updatedTeam1 || !updatedTeam2) {
            console.error(`ERREUR: Équipe(s) introuvable(s): ${team1.name}, ${team2.name}`);
            return false;
        }
        
        if (updatedTeam1.name === updatedTeam2.name) {
            console.error(`ERREUR: Tentative de match d'une équipe avec elle-même: ${updatedTeam1.name}`);
            return false;
        }
        
        // AJOUTER CETTE LIGNE au début de la fonction callback
        const guild = interaction?.guild || updatedTeam1.storedGuild || updatedTeam2.storedGuild;
        
        console.log(`[TRANSACTION] Début création de match: ${updatedTeam1.name} vs ${updatedTeam2.name}`);
        
        // SECTION CRITICHE: Nettoyer et mettre à jour l'état des équipes atomiquement
        
        // 1. Supprimer les équipes de la file d'attente de recherche
        const searchingTeams = getSearchingTeamsForGuild(guildId);
        const searchIndex1 = searchingTeams.findIndex(entry => entry.team.name === updatedTeam1.name);
        if (searchIndex1 !== -1) searchingTeams.splice(searchIndex1, 1);
        
        const searchIndex2 = searchingTeams.findIndex(entry => entry.team.name === updatedTeam2.name);
        if (searchIndex2 !== -1) searchingTeams.splice(searchIndex2, 1);
        
        // AJOUTER L'HISTORIQUE DU MATCH
        addMatchToHistory(updatedTeam1.name, updatedTeam2.name, guildId);
        
        // 2. Marquer les équipes comme occupées
        updatedTeam1.busy = true;
        updatedTeam1.currentOpponent = updatedTeam2.name;
        updatedTeam2.busy = true;
        updatedTeam2.currentOpponent = updatedTeam1.name;
        
        // 3. Générer un multiplicateur
        const multiplier = scoreTracker.generateMultiplier();
        updatedTeam1.currentMatchMultiplier = multiplier;
        updatedTeam2.currentMatchMultiplier = multiplier;
        
        // 4. Sauvegarder immédiatement pour empêcher d'autres opérations de matchmaking
        saveTeams(guildId);

        // NOUVEAU: Générer le BO3
        const festival = getCurrentFestival(guildId); // Récupérer le festival actuel
        const bo3Generator = new BO3Generator(festival, guildId); // Passer le festival et guildId au générateur
        let bo3Data = null;
        
        try {
            bo3Data = await bo3Generator.generateBO3(updatedTeam1.name, updatedTeam2.name);
            console.log(`BO3 généré pour ${updatedTeam1.name} vs ${updatedTeam2.name}:`, 
                bo3Data.games.map(g => `${g.modeDisplayName} sur ${g.mapDisplayName}`).join(', '));
        } catch (error) {
            console.error('Erreur lors de la génération du BO3:', error);
            // Fallback si génération BO3 échoue
        }
        
        // Stocker le BO3 dans les équipes
        if (bo3Data) {
            updatedTeam1.currentBO3 = bo3Data;
            updatedTeam2.currentBO3 = bo3Data;
        }

        // 🎯 NOUVEAU: Sauvegarder le match dans la base de données
        try {
            const adapter = new DataAdapter(guildId);
            const matchData = {
                team1Name: updatedTeam1.name,
                team2Name: updatedTeam2.name,
                team1Camp: updatedTeam1.camp,
                team2Camp: updatedTeam2.camp,
                multiplier: multiplier,
                bo3: bo3Data ? bo3Data.games.map(game => ({
                    map: game.map,
                    mode: game.mode
                })) : [],
                status: 'in_progress',
                createdAt: new Date(),
                guildId: guildId
            };
            
            const savedMatch = await adapter.saveMatch(matchData);
            console.log(`💾 Match sauvegardé dans la BD avec ID: ${savedMatch._id}`);
            
            // Stocker l'ID du match dans les équipes pour référence future
            updatedTeam1.currentMatchId = savedMatch._id.toString();
            updatedTeam2.currentMatchId = savedMatch._id.toString();
        } catch (error) {
            console.error('❌ Erreur lors de la sauvegarde du match:', error);
            // Le match peut continuer même si la sauvegarde échoue
        }

        // Sauvegarder immédiatement
        saveTeams(guildId);
        
        // Créer un salon de match
        const matchChannel = await createMatchChannel(guild, team1, team2);
        
        if (matchChannel) {
            // Stocker l'ID du salon de match dans les deux équipes
            team1.matchChannelId = matchChannel.id;
            team2.matchChannelId = matchChannel.id;
        }
        
        // Récupérer les rôles pour les mentions
        let team1Role = guild.roles.cache.find(role => role.name === `Team ${team1.name}`);
        let team2Role = guild.roles.cache.find(role => role.name === `Team ${team2.name}`);
        
        // Créer l'embed du match avec BO3
        let matchEmbed;
        if (bo3Data) {
            matchEmbed = bo3Generator.createBO3Embed(bo3Data, multiplier);
        } else {
            // Fallback à l'ancien système si BO3 échoue
            matchEmbed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle(`🎮 Nouveau match! 🎮`)
                .setDescription(`Un match a été trouvé!`)
                .addFields(
                    { name: 'Équipe 1', value: `${updatedTeam1.name} (${getCampDisplayName(updatedTeam1, guildId)})`, inline: true },
                    { name: 'Équipe 2', value: `${updatedTeam2.name} (${getCampDisplayName(updatedTeam2, guildId)})`, inline: true }
                )
                .setTimestamp();
        }
        
        // Envoyer le message dans le canal de match si créé
        if (matchChannel) {
            // Utiliser les rôles pour les mentions
            await matchChannel.send({
                content: `🏆 **MATCH COMMENCÉ !** 🏆\n${team1Role ? team1Role.toString() : team1.name} VS ${team2Role ? team2Role.toString() : team2.name}${multiplier > 1 ? `\n\n${getMultiplierAnnouncement(multiplier)}` : ''}`,
                embeds: [matchEmbed]
            });
        }
        
        // Notifier dans les salons d'équipe respectifs
        try {
            if (team1.channelId) {
                const team1Channel = await guild.channels.fetch(team1.channelId).catch(() => null);
                if (team1Channel) {
                    await team1Channel.send({
                        content: `🏆 **MATCH TROUVÉ !** 🏆\nVotre adversaire est l'équipe **${team2.name}**${multiplier > 1 ? `\n\n${getMultiplierAnnouncement(multiplier)}` : ''}`,
                        embeds: [matchEmbed]
                    });
                    
                    if (matchChannel) {
                        await team1Channel.send(`Un salon temporaire a été créé pour ce match: ${matchChannel}`);
                    }
                }
            }
            
            if (team2.channelId) {
                const team2Channel = await guild.channels.fetch(team2.channelId).catch(() => null);
                if (team2Channel) {
                    await team2Channel.send({
                        content: `🏆 **MATCH TROUVÉ !** 🏆\nVotre adversaire est l'équipe **${team1.name}**${multiplier > 1 ? `\n\n${getMultiplierAnnouncement(multiplier)}` : ''}`,
                        embeds: [matchEmbed]
                    });
                    
                    if (matchChannel) {
                        await team2Channel.send(`Un salon temporaire a été créé pour ce match: ${matchChannel}`);
                    }
                }
            }
        } catch (error) {
            console.error('Erreur lors de la notification dans les salons d\'équipe:', error);
        }

        // NOUVEAU : Notifier la création du match
        if (onMatchCreated && typeof onMatchCreated === 'function') {
            onMatchCreated();
        }
        
        // Sauvegarder les modifications des équipes
        saveTeams(guildId);
        console.log(`[TRANSACTION] Match créé avec succès: ${updatedTeam1.name} vs ${updatedTeam2.name}`);
        return true;
    });
}

// Ajouter cette fonction pour formater l'annonce de multiplicateur
function getMultiplierAnnouncement(multiplier) {
    if (multiplier === 333) {
        return `🔥🔥🔥 **MULTIPLICATEUR LÉGENDAIRE x${multiplier}** 🔥🔥🔥\nUne victoire dans ce match rapportera **${multiplier} FOIS** plus de points pour votre camp!`;
    } else if (multiplier === 100) {
        return `⭐⭐⭐ **SUPER MULTIPLICATEUR x${multiplier}** ⭐⭐⭐\nUne victoire dans ce match rapportera **${multiplier} FOIS** plus de points pour votre camp!`;
    } else if (multiplier === 10) {
        return `✨✨ **MULTIPLICATEUR x${multiplier}** ✨✨\nUne victoire dans ce match rapportera **${multiplier} FOIS** plus de points pour votre camp!`;
    }
    return '';
}

// Obtenir le nom d'affichage d'un camp
function getCampDisplayName(team, guildId) {
    const festival = getCurrentFestival(guildId);
    
    if (team.campDisplayName) {
        return team.campDisplayName;
    } else if (festival && team.camp.startsWith('camp')) {
        const campIndex = parseInt(team.camp.replace('camp', '')) - 1;
        return festival.campNames[campIndex];
    }
    
    return team.camp;
}

// Nettoyer la recherche d'une équipe
function cleanupSearch(teamName, guildId) {
    const searchingTeams = getSearchingTeamsForGuild(guildId);
    const index = searchingTeams.findIndex(entry => entry.team.name === teamName);
    if (index !== -1) {
        // Annuler le timeout si existant
        if (searchingTeams[index].timeoutId) {
            clearTimeout(searchingTeams[index].timeoutId);
        }
        
        // Supprimer de la liste des équipes en recherche
        searchingTeams.splice(index, 1);
        
        // Trouver l'équipe et vérifier qu'elle n'est pas en match
        const team = findTeamByName(teamName, guildId);
        if (team && !team.currentOpponent) {
            // Si elle n'est pas en match, la marquer comme non occupée
            team.busy = false;
        }
        
        return true;
    }
    return false;
}

// Complètement repenser l'intervalle de recherche de match
let searchProcessRunning = false;
let lastQueueLog = 0;
let lastQueueSize = 0;

setInterval(async () => {
    // Ne pas lancer plusieurs processus de recherche simultanément
    if (searchProcessRunning) return;
    
    try {
        searchProcessRunning = true;
        
        // Traiter chaque guilde séparément
        const guilds = searchingTeamsByGuild.keys();
        
        for (const guildId of guilds) {
            const searchingTeams = getSearchingTeamsForGuild(guildId);
            
            // Log seulement si la taille a changé ou après au moins 5 minutes
            const now = Date.now();
            const fiveMinutes = 5 * 60 * 1000;
            if (searchingTeams.length > 0 && 
                (searchingTeams.length !== lastQueueSize || now - lastQueueLog > fiveMinutes)) {
                console.log(`[Guild ${guildId}] État de la file d'attente: ${searchingTeams.length} équipes en recherche`);
                lastQueueLog = now;
                lastQueueSize = searchingTeams.length;
            }
            
            // Vérifier s'il y a au moins 2 équipes en recherche
            if (searchingTeams.length < 2) {
                continue;
            }
            
            // Prendre simplement les deux premières équipes et essayer de les mettre en match
            const entry1 = searchingTeams[0];
            const entry2 = searchingTeams[1];
            
            // Vérifier si les équipes existent toujours et ne sont pas déjà en match
            const teams = getAllTeams(guildId);
            const team1 = teams.find(t => t.name === entry1.team.name);
            const team2 = teams.find(t => t.name === entry2.team.name);
            
            if (!team1 || !team2 || team1.busy || team2.busy || 
                team1.currentOpponent || team2.currentOpponent) {
                // Si l'une des équipes n'est pas disponible, la retirer de la file d'attente
                if (!team1 || team1.busy || team1.currentOpponent) {
                    searchingTeams.splice(0, 1);
                }
                if (!team2 || team2.busy || team2.currentOpponent) {
                    const index2 = searchingTeams.indexOf(entry2);
                    if (index2 !== -1) searchingTeams.splice(index2, 1);
                }
                continue;
            }
            
            // Créer le match (avec le nouveau mécanisme de verrouillage)
            console.log(`Tentative de match entre ${team1.name} et ${team2.name}`);
            await createMatch(entry1.interaction, team1, team2);
        }
        
    } finally {
        searchProcessRunning = false;
    }
}, 3000); // Vérifier plus fréquemment (toutes les 3 secondes)

// Fonction pour terminer un match et libérer les équipes
function finishMatch(team1Name, team2Name, guildId) {
    return withTeamLock([team1Name, team2Name], 'finishMatch', guildId, async () => {
        console.log(`[TRANSACTION] Début fin de match: ${team1Name} vs ${team2Name}`);
        
        const allTeams = getAllTeams(guildId);
        const team1 = allTeams.find(t => t.name === team1Name);
        const team2 = allTeams.find(t => t.name === team2Name);
        
        // 🎯 NOUVEAU: Mettre à jour le statut du match dans la BD
        try {
            const adapter = new DataAdapter(guildId);
            const currentMatches = await adapter.getMatches();
            const match = currentMatches.find(m => 
                (m.team1Name === team1Name && m.team2Name === team2Name) ||
                (m.team1Name === team2Name && m.team2Name === team1Name)
            );
            
            if (match) {
                match.status = 'completed';
                match.completedAt = new Date();
                await adapter.saveMatch(match);
                console.log(`💾 Statut du match mis à jour: completed`);
            }
        } catch (error) {
            console.error('❌ Erreur lors de la mise à jour du match:', error);
        }
        
        // Timestamp de fin
        const now = Date.now();
        lastMatchEndTime.set(team1Name, now);
        lastMatchEndTime.set(team2Name, now);
        
        if (team1) {
            team1.busy = false;
            team1.currentOpponent = null;
            team1.currentMatchMultiplier = null;
            team1.currentMatchId = null; // Nettoyer l'ID du match
            team1.currentBO3 = null; // Nettoyer le BO3
        }
        
        if (team2) {
            team2.busy = false;
            team2.currentOpponent = null;
            team2.currentMatchMultiplier = null;
            team2.currentMatchId = null; // Nettoyer l'ID du match
            team2.currentBO3 = null; // Nettoyer le BO3
        }
        
        // Nettoyer l'historique ancien (optionnel, pour éviter l'accumulation)
        const cleanupThreshold = Date.now() - (24 * 60 * 60 * 1000); // 24 heures
        
        [team1Name, team2Name].forEach(teamName => {
            const history = matchHistoryManager.teamMatchHistory.get(teamName);
            if (history) {
                const filteredHistory = history.filter(match => match.timestamp > cleanupThreshold);
                if (filteredHistory.length !== history.length) {
                    matchHistoryManager.teamMatchHistory.set(teamName, filteredHistory);
                    console.log(`Historique nettoyé pour ${teamName}: ${history.length - filteredHistory.length} anciens matchs supprimés`);
                }
            }
        });
        
        saveTeams(guildId);
        console.log(`[TRANSACTION] Match terminé avec succès: ${team1Name} vs ${team2Name}`);
        return { team1, team2 };
    });
}

// Réinitialiser complètement la file d'attente des recherches
function resetSearchQueue(guildId) {
    if (!guildId) {
        // Si pas de guildId, réinitialiser toutes les guilds
        for (const [id, searchingTeams] of searchingTeamsByGuild.entries()) {
            searchingTeams.forEach(entry => {
                if (entry.team) {
                    entry.team.busy = false;
                    entry.team.currentOpponent = null;
                    entry.team.currentMatchMultiplier = null;
                }
            });
            searchingTeams.length = 0;
        }
        console.log('File d\'attente de recherche réinitialisée pour toutes les guilds');
        return;
    }
    
    const searchingTeams = getSearchingTeamsForGuild(guildId);
    // Libérer les équipes avant de vider la file d'attente
    searchingTeams.forEach(entry => {
        if (entry.team) {
            entry.team.busy = false;
            entry.team.currentOpponent = null;
            entry.team.currentMatchMultiplier = null;
        }
    });
    
    // Vider la file d'attente pour cette guild
    searchingTeams.length = 0;
    console.log(`File d'attente de recherche réinitialisée pour guild ${guildId}`);
}

// Fonction pour réparer les états incohérents
function repairInconsistentStates(guildId) {
    // Pré-vérification sans verrouillage pour voir si des réparations sont nécessaires
    const allTeams = getAllTeams(guildId);
    const searchingTeams = getSearchingTeamsForGuild(guildId);
    const searchingTeamNames = searchingTeams.map(entry => entry.team.name);
    
    // Rechercher les potentielles incohérences sans verrouiller
    let needsRepair = false;
    
    for (const team of allTeams) {
        // Si équipe occupée mais pas en recherche et pas d'adversaire
        if (team.busy && !team.currentOpponent && !searchingTeamNames.includes(team.name)) {
            needsRepair = true;
            break;
        }
        
        // Si équipe avec adversaire mais relation invalide
        if (team.currentOpponent) {
            const opponent = allTeams.find(t => t.name === team.currentOpponent);
            if (!opponent || opponent.currentOpponent !== team.name) {
                needsRepair = true;
                break;
            }
        }
    }
    
    // Si aucune réparation n'est nécessaire, sortir immédiatement
    if (!needsRepair) {
        return 0;
    }
    
    // Sinon, procéder avec le verrouillage et les réparations
    return withTeamLock(allTeams.map(t => t.name), 'repairInconsistentStates', guildId, (teams) => {
        let repaired = 0;
        
        for (const team of teams) {
            let teamFixed = false;
            
            // Cas 1: Équipe busy mais sans adversaire
            if (team.busy && !team.currentOpponent && !searchingTeamNames.includes(team.name)) {
                console.log(`Réparation: ${team.name} était occupée sans adversaire`);
                team.busy = false;
                teamFixed = true;
                repaired++;
            }
            
            // Cas 2: Équipe avec adversaire mais relation invalide
            if (team.currentOpponent) {
                const opponent = teams.find(t => t.name === team.currentOpponent);
                if (!opponent || opponent.currentOpponent !== team.name) {
                    console.log(`Réparation: ${team.name} avait un adversaire invalide (${team.currentOpponent})`);
                    team.busy = false;
                    team.currentOpponent = null;
                    team.currentMatchMultiplier = null;
                    teamFixed = true;
                    repaired++;
                }
            }
            
            if (teamFixed && team.matchChannelId) {
                console.log(`Réinitialisation du canal de match pour ${team.name}`);
                team.matchChannelId = null;
                repaired++;
            }
        }
        
        if (repaired > 0) {
            console.log(`${repaired} équipes avec des états incohérents ont été réparées`);
            saveTeams(guildId);
        }
        
        return repaired;
    });
}

// Supprimer la fonction initializeMatchCounters et la remplacer par :
const initializeMatchCounters = async () => {
    await matchHistoryManager.loadMatchHistory();
};

// Fonction pour vérifier et nettoyer les salons de match au démarrage
async function verifyAndCleanupMatchChannels(guild) {
    console.log('🔍 Vérification des salons de match au démarrage...');
    
    const guildId = guild.id;
    const allTeams = getAllTeams(guildId);
    let channelsFound = 0;
    let channelsDeleted = 0;
    let teamsFixed = 0;
    
    try {
        // 1. Vérifier les équipes qui ont un matchChannelId
        for (const team of allTeams) {
            if (team.matchChannelId) {
                channelsFound++;
                
                try {
                    // Vérifier si le salon existe encore
                    const channel = await guild.channels.fetch(team.matchChannelId).catch(() => null);
                    
                    if (!channel) {
                        // Le salon n'existe plus, nettoyer l'équipe
                        console.log(`❌ Salon de match ${team.matchChannelId} introuvable pour ${team.name}, nettoyage...`);
                        team.matchChannelId = null;
                        
                        // Si l'équipe est marquée comme en match mais sans adversaire valide
                        if (team.busy && team.currentOpponent) {
                            const opponent = allTeams.find(t => t.name === team.currentOpponent);
                            if (!opponent || !opponent.currentOpponent || opponent.currentOpponent !== team.name) {
                                console.log(`🔧 Réparation de l'état de match pour ${team.name}`);
                                team.busy = false;
                                team.currentOpponent = null;
                                team.currentMatchMultiplier = null;
                                teamsFixed++;
                            }
                        }
                        
                        teamsFixed++;
                    } else {
                        // Le salon existe, vérifier s'il est encore nécessaire
                        const opponent = team.currentOpponent ? allTeams.find(t => t.name === team.currentOpponent) : null;
                        
                        // Si l'équipe n'est plus en match ou relation incohérente
                        if (!team.busy || !team.currentOpponent || !opponent || opponent.currentOpponent !== team.name) {
                            console.log(`🧹 Salon de match ${channel.name} devenu obsolète, suppression...`);
                            
                            try {
                                await channel.send('⚠️ Ce salon de match va être supprimé car le match n\'est plus actif.');
                                
                                setTimeout(async () => {
                                    await channel.delete('Match non actif détecté au redémarrage').catch(console.error);
                                }, 5000);
                                
                                channelsDeleted++;
                            } catch (error) {
                                console.error(`Erreur lors de la suppression du salon ${channel.name}:`, error);
                            }
                            
                            // Nettoyer les équipes
                            team.matchChannelId = null;
                            if (opponent) {
                                opponent.matchChannelId = null;
                            }
                            teamsFixed++;
                        } else {
                            console.log(`✅ Salon de match ${channel.name} valide pour ${team.name} vs ${team.currentOpponent}`);
                        }
                    }
                } catch (error) {
                    console.error(`Erreur lors de la vérification du salon pour ${team.name}:`, error);
                    // En cas d'erreur, nettoyer par sécurité
                    team.matchChannelId = null;
                    teamsFixed++;
                }
            }
        }
        
        // 2. Chercher les salons de match orphelins (qui ne sont référencés par aucune équipe)
        const matchChannels = guild.channels.cache.filter(channel => 
            channel.name.startsWith('match-') && channel.type === 0 // GuildText
        );
        
        const referencedChannelIds = new Set(
            allTeams.filter(t => t.matchChannelId).map(t => t.matchChannelId)
        );
        
        for (const [channelId, channel] of matchChannels) {
            if (!referencedChannelIds.has(channelId)) {
                console.log(`🧹 Salon de match orphelin détecté: ${channel.name}, suppression...`);
                
                try {
                    await channel.send('⚠️ Ce salon de match orphelin va être supprimé dans 5 secondes.');
                    
                    setTimeout(async () => {
                        await channel.delete('Salon de match orphelin détecté au redémarrage').catch(console.error);
                    }, 5000);
                    
                    channelsDeleted++;
                } catch (error) {
                    console.error(`Erreur lors de la suppression du salon orphelin ${channel.name}:`, error);
                }
            }
        }
        
        // 3. Sauvegarder les modifications si nécessaire
        if (teamsFixed > 0) {
            saveTeams(guildId);
            console.log(`💾 Modifications des équipes sauvegardées`);
        }
        
        // 4. Rapport final
        console.log(`✅ Vérification des salons de match terminée:`);
        console.log(`   📊 Salons référencés trouvés: ${channelsFound}`);
        console.log(`   🗑️ Salons supprimés: ${channelsDeleted}`);
        console.log(`   🔧 Équipes réparées: ${teamsFixed}`);
        
        return {
            channelsFound,
            channelsDeleted,
            teamsFixed
        };
        
    } catch (error) {
        console.error('❌ Erreur lors de la vérification des salons de match:', error);
        return null;
    }
}

// Fonction complète de réparation de l'état des matchs
async function repairMatchStates(guild) {
    console.log('🔧 Réparation complète de l\'état des matchs...');
    
    const guildId = guild.id;
    const allTeams = getAllTeams(guildId);
    let repairs = 0;
    let issues = [];
    
    try {
        // 1. Vérifier les équipes marquées comme busy
        for (const team of allTeams) {
            if (team.busy) {
                const opponent = team.currentOpponent ? allTeams.find(t => t.name === team.currentOpponent) : null;
                
                // Cas 1: Équipe busy mais sans adversaire
                if (!team.currentOpponent) {
                    console.log(`🔧 ${team.name}: busy mais sans adversaire`);
                    team.busy = false;
                    team.currentMatchMultiplier = null;
                    team.matchChannelId = null;
                    repairs++;
                    issues.push(`${team.name} était marquée busy sans adversaire`);
                }
                // Cas 2: Adversaire inexistant
                else if (!opponent) {
                    console.log(`🔧 ${team.name}: adversaire ${team.currentOpponent} inexistant`);
                    team.busy = false;
                    team.currentOpponent = null;
                    team.currentMatchMultiplier = null;
                    team.matchChannelId = null;
                    repairs++;
                    issues.push(`${team.name} avait un adversaire inexistant (${team.currentOpponent})`);
                }
                // Cas 3: Relation non réciproque
                else if (opponent.currentOpponent !== team.name) {
                    console.log(`🔧 ${team.name}: relation non réciproque avec ${opponent.name}`);
                    team.busy = false;
                    team.currentOpponent = null;
                    team.currentMatchMultiplier = null;
                    team.matchChannelId = null;
                    repairs++;
                    issues.push(`${team.name} avait une relation non réciproque avec ${opponent.name}`);
                }
                // Cas 4: Salon de match manquant pour match actif
                else if (team.matchChannelId) {
                    const channel = await guild.channels.fetch(team.matchChannelId).catch(() => null);
                    if (!channel) {
                        console.log(`🔧 ${team.name}: salon de match manquant`);
                        team.matchChannelId = null;
                        opponent.matchChannelId = null;
                        repairs++;
                        issues.push(`${team.name} vs ${opponent.name} avaient un salon de match manquant`);
                    }
                }
            }
        }
        
        // 2. Nettoyer la file d'attente de recherche des équipes en match
        const searchingTeamNames = searchingTeams.map(entry => entry.team.name);
        const teamsInMatch = allTeams.filter(t => t.busy && t.currentOpponent);
        
        for (const team of teamsInMatch) {
            const searchIndex = searchingTeams.findIndex(entry => entry.team.name === team.name);
            if (searchIndex !== -1) {
                console.log(`🔧 Retrait de ${team.name} de la file de recherche (déjà en match)`);
                searchingTeams.splice(searchIndex, 1);
                repairs++;
                issues.push(`${team.name} était en recherche alors qu'en match`);
            }
        }
        
        // 3. Sauvegarder si des réparations ont été effectuées
        if (repairs > 0) {
            saveTeams(guildId);
            console.log(`💾 ${repairs} réparations effectuées et sauvegardées`);
        }
        
        // 4. Rapport détaillé
        if (issues.length > 0) {
            console.log('📋 Problèmes détectés et corrigés:');
            issues.forEach((issue, index) => {
                console.log(`   ${index + 1}. ${issue}`);
            });
        } else {
            console.log('✅ Aucun problème d\'état détecté');
        }
        
        return { repairs, issues };
        
    } catch (error) {
        console.error('❌ Erreur lors de la réparation des états:', error);
        return null;
    }
}

// Fonction utilitaire pour créer un ID de match unique
function createMatchId(team1Name, team2Name) {
    const timestamp = Date.now();
    const teams = [team1Name, team2Name].sort().join('_vs_');
    return `match_${teams}_${timestamp}`.toLowerCase().replace(/[^a-z0-9_]/g, '_');
}

// Fonction pour réparer les états incohérents des équipes
async function repairInconsistentTeamStates(guildId) {
    console.log(`🔧 Vérification et réparation des états incohérents pour guild ${guildId}...`);
    
    const allTeams = getAllTeams(guildId);
    let repairedCount = 0;
    
    allTeams.forEach(team => {
        let needsRepair = false;
        
        // Cas 1: busy=true mais pas d'adversaire
        if (team.busy && !team.currentOpponent) {
            console.warn(`🔧 RÉPARATION: Équipe ${team.name} busy sans adversaire`);
            team.busy = false;
            team.currentMatchMultiplier = null;
            team.currentMatchId = null;
            team.currentBO3 = null;
            needsRepair = true;
        }
        
        // Cas 2: adversaire défini mais pas busy
        if (team.currentOpponent && !team.busy) {
            console.warn(`🔧 RÉPARATION: Équipe ${team.name} a un adversaire mais n'est pas busy`);
            team.busy = true;
            needsRepair = true;
        }
        
        // Cas 3: adversaire qui n'existe plus
        if (team.currentOpponent) {
            const opponent = allTeams.find(t => t.name === team.currentOpponent);
            if (!opponent) {
                console.warn(`🔧 RÉPARATION: Équipe ${team.name} a un adversaire inexistant ${team.currentOpponent}`);
                team.busy = false;
                team.currentOpponent = null;
                team.currentMatchMultiplier = null;
                team.currentMatchId = null;
                team.currentBO3 = null;
                needsRepair = true;
            }
        }
        
        if (needsRepair) {
            repairedCount++;
        }
    });
    
    if (repairedCount > 0) {
        saveTeams(guildId);
        console.log(`✅ ${repairedCount} équipe(s) réparée(s) pour guild ${guildId}`);
    } else {
        console.log(`✅ Aucune réparation d'équipe nécessaire pour guild ${guildId}`);
    }
    
    return repairedCount;
}

// Ajouter au module.exports
module.exports = {
    startMatchSearch,
    cleanupSearch,
    createMatch,
    finishMatch,
    getSearchingTeams: (guildId) => getSearchingTeamsForGuild(guildId), // CORRIGÉ pour isolation guild
    resetSearchQueue,
    repairInconsistentStates,
    getTeamMatchHistory,
    calculateOpponentScore,
    initializeMatchCounters,
    verifyAndCleanupMatchChannels,
    repairMatchStates, // ← AJOUTER
    createMatchId, // ← AJOUTER la fonction createMatchId
    repairInconsistentTeamStates // ← NOUVELLE fonction de réparation
};