const fs = require('fs').promises;
const path = require('path');
const Festival = require('../models/Festival');
// const { teams, leaveTeam } = require('./teamManager'); // Import circulaire - utiliser require() dynamique
const scoreTracker = require('./scoreTracker');
const scheduler = require('node-schedule');
const { ChannelType, EmbedBuilder } = require('discord.js');
const { loadConfig } = require('../commands/config');
const { getGuildDatabase } = require('./database');
const DataAdapter = require('./dataAdapter');

// Maps pour gérer les festivals par guild
const festivalsByGuild = new Map(); // guildId -> festival

// Helper pour obtenir le DataAdapter
function getDataAdapter(guildId) {
    if (!guildId) {
        console.error('guildId requis pour festivalManager DataAdapter');
        return null;
    }
    return new DataAdapter(guildId);
}

// Helper pour obtenir le festival d'une guild spécifique
function getCurrentFestivalSync(guildId) {
    if (!guildId) {
        console.error('guildId requis pour getCurrentFestivalSync');
        return null;
    }
    
    return festivalsByGuild.get(guildId) || null;
    if (!festival) {
        console.log(`🔄 Aucun festival en mémoire pour ${guildId}, tentative de rechargement...`);
        // Note: Rechargement asynchrone dans getCurrentFestival
    }
    
    return festival || null;
}

// Fonction pour définir le festival d'une guild
function setCurrentFestival(festival, guildId) {
    if (!guildId) return;
    if (festival) {
        console.log(`📝 setCurrentFestival: Associating festival "${festival.title}" with guild ${guildId}`);
        festivalsByGuild.set(guildId, festival);
    } else {
        festivalsByGuild.delete(guildId);
    }
}

// Fonction pour obtenir le festival actuel (async)
async function getCurrentFestival(guildId) {
    if (!guildId) {
        console.error('guildId requis pour getCurrentFestival');
        return null;
    }
    
    // Vérifier d'abord la mémoire
    let festival = festivalsByGuild.get(guildId);
    if (festival) {
        console.log(`✅ Festival trouvé en mémoire: ${festival.title}`);
        return festival;
    }
    
    // Si pas en mémoire, recharger depuis la base
    console.log(`🔄 Festival non trouvé en mémoire pour ${guildId}, rechargement depuis la base...`);
    
    try {
        const adapter = getDataAdapter(guildId);
        const festivalData = await adapter.getFestival();
        
        // Mettre à jour le cache local ET convertir l'objet MongoDB en Festival
        if (festivalData) {
            // Convertir l'objet MongoDB en vraie instance de Festival
            let festival;
            
            if (festivalData._id) {
                // C'est un objet MongoDB, récupérer la config pour les vraies valeurs
                const configData = await adapter.getConfig();
                
                // Utiliser les vraies valeurs de la config, pas les valeurs par défaut du schéma
                const realTeamSize = configData?.settings?.maxMembersPerTeam || 4;
                const realGameMode = festivalData.modes && festivalData.modes[0] ? festivalData.modes[0] : 'mixed';
                
                const festivalJson = {
                    id: festivalData._id.toString(),
                    title: festivalData.title,
                    campNames: festivalData.campNames,
                    startDate: festivalData.startTime || festivalData.startDate,
                    endDate: festivalData.endTime || festivalData.endDate,
                    announcementChannelId: festivalData.announcementChannelId,
                    isActive: festivalData.isActive,
                    teamSize: realTeamSize, // Depuis la config
                    gameMode: realGameMode, // Depuis les modes du festival
                    bannedMaps: festivalData.bannedMaps || []
                };
                
                festival = Festival.fromJSON(festivalJson);
                // Transférer le guildId depuis MongoDB
                festival.guildId = festivalData.guildId;
            } else {
                // C'est déjà au bon format
                festival = Festival.fromJSON(festivalData);
            }
            
            setCurrentFestival(festival, guildId);
            return festival;
        } else {
            setCurrentFestival(null, guildId);
            return null;
        }
    } catch (error) {
        console.error('Erreur lors de la récupération du festival:', error);
        return getCurrentFestivalSync(guildId); // Fallback vers le cache local
    }
}

let scheduledJobs = {};

// Créer le dossier data s'il n'existe pas
async function ensureDataDirExists() {
    const dataDir = path.join(__dirname, '../../data');
    try {
        await fs.mkdir(dataDir, { recursive: true });
    } catch (error) {
        if (error.code !== 'EEXIST') {
            throw error;
        }
    }
}

// Charger le festival depuis la base de données spécifique au serveur
async function loadFestival(guildId = null) {
    try {
        if (!guildId) {
            console.log('Aucun guildId fourni pour loadFestival');
            return null;
        }
        
        const adapter = getDataAdapter(guildId);
        const festivalData = await adapter.getFestival();
        
        if (!festivalData) {
            console.log('Aucun festival trouvé dans la base de données');
            return null;
        }
        
        console.log('Données du festival chargées:', festivalData);
        
        // Si c'est un objet MongoDB, convertir vers le format Festival
        let festival;
        if (festivalData._id) {
            // Format MongoDB - convertir correctement vers le nouveau format
            console.log('🔄 Conversion des données MongoDB vers Format Festival...');
            
            // Convertir modes array vers gameMode string
            let gameMode = 'mixed'; // défaut
            if (festivalData.modes && festivalData.modes.length > 0) {
                if (festivalData.modes.length === 1) {
                    gameMode = festivalData.modes[0]; // Ex: 'splat_zones'
                } else {
                    gameMode = 'mixed'; // Plusieurs modes = mixte
                }
            }
            
            // Récupérer teamSize depuis la config MongoDB
            let teamSize = 4; // défaut
            try {
                const { loadConfig } = require('../commands/config');
                const config = await loadConfig(guildId);
                console.log('🔧 DEBUG config complète:', JSON.stringify(config, null, 2));
                
                if (config && config.settings && config.settings.maxMembersPerTeam) {
                    teamSize = config.settings.maxMembersPerTeam;
                    console.log(`📐 teamSize récupéré depuis la config: ${teamSize}`);
                } else {
                    console.log('⚠️ maxMembersPerTeam non trouvé dans la config, utilisation de la valeur par défaut 4');
                    console.log('🔧 Chemin config.settings:', config?.settings);
                }
            } catch (error) {
                console.warn('Impossible de récupérer teamSize depuis la config, utilisation de la valeur par défaut');
                console.error('Erreur:', error);
            }
            
            console.log(`🔧 Conversion: modes=${JSON.stringify(festivalData.modes)} → gameMode=${gameMode}, teamSize=${teamSize}`);
            
            festival = new Festival(
                festivalData.title,
                festivalData.campNames,
                festivalData.startTime,
                festivalData.endTime,
                null, // announcementChannelId sera défini plus bas
                { 
                    teamSize: teamSize,
                    gameMode: gameMode,
                    bannedMaps: festivalData.bannedMaps || []
                }
            );
            
            // CRUCIAL: Assigner l'ID MongoDB pour que les équipes puissent s'y référer
            festival.id = festivalData._id.toString();
            
            // Définir isActive depuis MongoDB
            festival.isActive = festivalData.isActive || false;
            
            // Récupérer l'announcementChannelId depuis la configuration
            try {
                const { loadConfig } = require('../commands/config');
                const config = await loadConfig(guildId);
                if (config && config.announcementChannelId) {
                    festival.announcementChannelId = config.announcementChannelId;
                }
            } catch (error) {
                console.warn('Impossible de charger la configuration pour l\'announcementChannelId:', error);
            }
        } else {
            // Format JSON classique
            festival = Festival.fromJSON(festivalData);
        }
        
        setCurrentFestival(festival, guildId);
        
        return festival;
    } catch (error) {
        console.error('Erreur lors du chargement du festival:', error);
        return null;
    }
}

// Sauvegarder le festival dans la base de données spécifique au serveur
async function saveFestival(festival, guildId = null) {
    try {
        console.log(`🔍 saveFestival appelé avec guildId: ${guildId}`);
        if (!guildId) {
            console.warn('❌ Aucun guildId fourni pour saveFestival');
            return;
        }
        
        console.log(`🔍 Récupération DataAdapter pour guildId: ${guildId}`);
        const adapter = getDataAdapter(guildId);
        console.log(`🔍 DataAdapter récupéré:`, adapter ? 'OUI' : 'NON');
        
        // Convertir l'objet Festival vers le format DataAdapter COMPLET
        const festivalData = {
            title: festival.title,
            campNames: festival.campNames,
            startTime: festival.startDate,
            endTime: festival.endDate,
            modes: festival.gameMode ? [festival.gameMode] : ['splat_zones'],
            isActive: festival.isActive || false,
            teamSize: festival.teamSize || 4,
            gameMode: festival.gameMode || 'mixed',
            bannedMaps: festival.bannedMaps || [],
            announcementChannelId: festival.announcementChannelId
        };
        
        const savedFestival = await adapter.saveFestival(festivalData);
        
        // CRUCIAL: Assigner l'ID MongoDB au festival
        console.log(`🔍 saveFestival Debug: savedFestival =`, savedFestival);
        console.log(`🔍 saveFestival Debug: savedFestival._id =`, savedFestival?._id);
        
        if (savedFestival && savedFestival._id) {
            festival.id = savedFestival._id.toString();
            console.log(`✅ Festival sauvegardé avec DataAdapter (ID: ${festival.id})`);
        } else {
            console.log('⚠️ Festival sauvegardé mais aucun ID retourné par adapter.saveFestival()');
            console.log('✅ Festival sauvegardé avec DataAdapter');
        }
    } catch (error) {
        console.error('Erreur lors de la sauvegarde du festival:', error);
        throw error;
    }
}

// Créer un nouveau festival
async function createFestival(title, campNames, startDate, endDate, announcementChannelId, guild = null, options = {}) {
    console.log('🏗️ ===== CRÉATION D\'UN NOUVEAU FESTIVAL =====');
    console.log(`🔍 Guild: ${guild ? guild.name : 'NON FOURNIE'} (${guild ? guild.id : 'N/A'})`);
    
    // IMPORTANT: Nettoyage complet de toutes les données avant création du nouveau festival
    console.log('🧹 Nettoyage complet des données avant création du nouveau festival...');
    await resetFestivalData(guild);
    console.log('✅ Toutes les données réinitialisées pour le nouveau festival');
    
    // Récupérer la config de la guild pour avoir le bon teamSize
    let finalOptions = { ...options };
    if (guild?.id) {
        try {
            const { loadConfig } = require('../commands/config');
            const config = await loadConfig(guild.id);
            
            // Utiliser le teamSize depuis la config si pas fourni dans options
            if (!finalOptions.teamSize && config?.settings?.maxMembersPerTeam) {
                finalOptions.teamSize = config.settings.maxMembersPerTeam;
                console.log(`📐 teamSize récupéré depuis la config de la guild: ${finalOptions.teamSize}`);
            }
        } catch (error) {
            console.warn('Impossible de récupérer la config de la guild, utilisation des options par défaut');
        }
    }
    
    // Ajouter le guildId aux options si disponible
    if (guild?.id) {
        finalOptions.guildId = guild.id;
    }
    
    const festival = new Festival(title, campNames, startDate, endDate, announcementChannelId, finalOptions);
    
    setCurrentFestival(festival, guild?.id);
    
    // Sauvegarder avec le système unifié
    try {
        await saveFestival(festival, guild?.id);
        
        // Mettre à jour la configuration pour correspondre à la taille d'équipe
        if (guild?.id) {
            const teamSize = options.teamSize || festival.teamSize || 4;
            console.log(`🔧 Mise à jour maxMembersPerTeam à ${teamSize} pour correspondre au festival`);
            
            // Utiliser MongoDB directement pour mettre à jour les settings
            const { GuildConfig } = require('../models/mongodb');
            await GuildConfig.findOneAndUpdate(
                { guildId: guild.id },
                { 
                    'settings.maxMembersPerTeam': teamSize 
                },
                { upsert: true }
            );
            console.log(`✅ Configuration mise à jour: maxMembersPerTeam = ${teamSize}`);
        }
        
        console.log('✅ Festival sauvegardé avec succès');
    } catch (error) {
        console.error('❌ Erreur lors de la sauvegarde du festival:', error.message);
        throw error;
    }
    
    console.log('Festival reconstruit:', {
        teamSize: festival.teamSize,
        gameMode: festival.gameMode,
        bannedMaps: festival.bannedMaps
    });
    
    // PROGRAMMER L'ACTIVATION AUTOMATIQUE
    if (guild && guild.client) {
        console.log('📅 Programmation de l\'activation automatique...');
        scheduleActivation(festival, guild.client);
    }
    
    // Envoyer l'annonce de préparation (pas de début)
    if (announcementChannelId && guild) {
        try {
            const channel = await guild.channels.fetch(announcementChannelId);
            const embed = createPrepEmbed(festival);
            await channel.send({ embeds: [embed] });
            console.log('✅ Annonce de préparation envoyée');
        } catch (error) {
            console.error('Erreur lors de l\'envoi de l\'annonce de préparation:', error);
        }
    }
    
    return festival;
}

function getCorrectGameModeDisplay(gameMode) {
    const modes = {
        'turf': 'Guerre de Territoire uniquement',
        'ranked': 'Modes Pro uniquement',
        'splat_zones': 'Défense de Zone uniquement',
        'mixed': 'Modes mixtes (BO3 varié)'
    };
    return modes[gameMode] || 'Modes mixtes';
}

async function verifyFestivalStatus(guildId) {
    if (!guildId) {
        console.error('guildId requis pour verifyFestivalStatus');
        return;
    }
    
    const festival = getCurrentFestivalSync(guildId);
    if (!festival) return;
    
    const now = new Date();
    const startDate = new Date(festival.startDate);
    const endDate = new Date(festival.endDate);
    
    // Si le festival devrait être actif mais ne l'est pas
    if (now >= startDate && now <= endDate && !festival.isActive) {
        console.log('🔧 Festival détecté comme devant être actif, activation...');
        festival.activate();
        await saveFestival(festival, guildId);
    }
    
    // Si le festival est actif mais devrait être terminé
    if (now > endDate && festival.isActive) {
        festival.deactivate();
        await saveFestival(festival, guildId);
    }
}

// Réinitialiser les données (équipes, scores, etc.)
async function resetFestivalData(guild) {
    console.log('🧹 ===== DÉBUT DU RESET FESTIVAL DATA =====');
    console.log(`🔍 Guild fournie: ${guild ? guild.name : 'NON'}`);
    
    // Vérifier si la guild est fournie
    if (!guild) {
        console.error('Guild requise pour resetFestivalData');
        return;
    }
    
    const { getTeamsForGuild, saveTeams } = require('./teamManager');
    const scoreTracker = require('./scoreTracker');
    const guildId = guild.id;

    const teams = getTeamsForGuild(guildId) || [];
    console.log(`🔍 Nombre d'équipes en mémoire avant reset: ${teams.length}`);

    // Réinitialiser l'historique des matchs
    console.log('🗑️ Reset de l\'historique des matchs...');
    const matchHistoryManager = require('./matchHistoryManager');
    await matchHistoryManager.resetMatchHistory(guildId);
    console.log('Historique des matchs réinitialisé');
    
    // Réinitialiser les probabilités de cartes
    console.log('🗑️ Reset des probabilités de cartes...');
    const mapProbabilityManager = require('./mapProbabilityManager');
    await mapProbabilityManager.resetProbabilities(guildId);
    console.log('Probabilités de cartes réinitialisées');
    
    // Vérification des équipes disponibles
    console.log(`Nombre d'équipes à nettoyer: ${teams.length}`);
    
    // Faire quitter tous les membres de leurs équipes actuelles
    const allTeams = [...teams]; // Copie du tableau pour éviter les problèmes d'itération
    
    if (allTeams.length > 0 && guild) {
        
        // Utiliser le gestionnaire centralisé pour le rôle Team Leader
        const { ensureTeamLeaderRole } = require('./teamLeaderRoleManager');
        let leaderRole = null;
        try {
            leaderRole = await ensureTeamLeaderRole(guild);
        } catch (error) {
            console.error('❌ Erreur récupération rôle Team Leader:', error);
        }
        
        for (const team of allTeams) {
            console.log(`Traitement de l'équipe: ${team.name}, Membres: ${team.members.length}`);
            
            // Récupérer le rôle d'équipe
            const teamRole = guild.roles.cache.find(role => role.name === `Team ${team.name}`);
            
            // Copier la liste des membres pour éviter les problèmes d'itération
            const teamMembers = [...team.members];
            
            // Traiter chaque membre
            for (const memberId of teamMembers) {
                try {
                    console.log(`Traitement du membre ${memberId} de l'équipe ${team.name}`);
                    
                    // Récupérer le membre de la guild
                    try {
                        const guildMember = await guild.members.fetch(memberId);
                        if (guildMember) {
                            console.log(`Membre ${memberId} trouvé dans la guild`);
                            
                            // Retirer le rôle d'équipe
                            if (teamRole) {
                                await guildMember.roles.remove(teamRole);
                                console.log(`Rôle d'équipe retiré du membre ${memberId}`);
                            }
                            
                            // Retirer le rôle de leader si le membre est le leader
                            if (leaderRole && team.isLeader(memberId)) {
                                await guildMember.roles.remove(leaderRole);
                                console.log(`Rôle de leader retiré du membre ${memberId}`);
                            }
                        }
                    } catch (memberError) {
                        console.error(`Impossible de récupérer le membre ${memberId} dans la guild:`, memberError);
                    }
                    
                    // On ne va PAS utiliser leaveTeam car cela modifierait le tableau en cours d'itération
                    // et pourrait causer des problèmes. On va juste vider l'équipe à la fin.
                    
                } catch (error) {
                    console.error(`Erreur lors du traitement du membre ${memberId}:`, error);
                }
            }
            
            // Supprimer le rôle d'équipe, qu'elle soit vide ou non
            if (teamRole) {
                try {
                    await teamRole.delete('Équipe dissoute en fin de festival');
                    console.log(`Rôle de l'équipe ${team.name} supprimé`);
                } catch (roleError) {
                    console.error(`Erreur lors de la suppression du rôle d'équipe ${team.name}:`, roleError);
                }
            }
        }
    } else {
        console.log('Aucune équipe à nettoyer ou pas de guild fournie');
    }
    
    // Supprimer TOUTES les équipes (base de données + mémoire)
    console.log('🗑️ Suppression de toutes les équipes...');
    try {
        // FORCER la suppression directe en base de données
        if (guildId) {
            const DataAdapter = require('./dataAdapter');
            const adapter = new DataAdapter(guildId);
            await adapter.clearAllTeams();
            console.log('✅ Toutes les équipes supprimées directement en base de données');
        }
        
        // Utiliser teamManager.clearAllTeams() pour nettoyer la mémoire
        const teamManager = require('./teamManager');
        await teamManager.clearAllTeams(guildId);
        console.log('✅ Toutes les équipes supprimées via teamManager.clearAllTeams()');
    } catch (error) {
        console.error('❌ Erreur lors de la suppression des équipes:', error);
    }

    // Réinitialiser également la file d'attente de recherche de match
    const matchSearch = require('./matchSearch');
    matchSearch.resetSearchQueue(guildId);
    console.log('File d\'attente de recherche réinitialisée');

    // Réinitialiser les résultats en attente
    try {
        const { pendingResults } = require('./interactionHandlers');
        if (pendingResults && pendingResults.clear) {
            pendingResults.clear();
            console.log('Résultats en attente réinitialisés');
        }
    } catch (error) {
        console.warn('Impossible de réinitialiser les résultats en attente:', error.message);
    }

    // Réinitialiser les scores et l'historique des matchs
    console.log('🗑️ Réinitialisation des scores et historique des matchs...');
    try {
        await scoreTracker.resetScores(guildId);
        console.log('✅ Scores et historique des matchs réinitialisés');
    } catch (error) {
        console.error('❌ Erreur lors du reset des scores:', error);
    }

    // Réinitialiser les votes
    console.log('🗑️ Réinitialisation des votes...');
    const { resetVotes } = require('./vote');
    try {
        await resetVotes(guildId);
        console.log('✅ Votes réinitialisés');
    } catch (error) {
        console.error('❌ Erreur lors du reset des votes:', error);
    }

    // Réinitialiser les probabilités de cartes
    console.log('🗑️ Réinitialisation des probabilités de cartes...');
    try {
        const adapter = getDataAdapter(guildId);
        if (adapter) {
            await adapter.clearAllMapProbabilities();
            console.log('✅ Probabilités de cartes réinitialisées');
        }
    } catch (error) {
        console.error('❌ Erreur lors du reset des probabilités de cartes:', error);
    }

    // Réinitialiser les résultats en attente
    console.log('🗑️ Réinitialisation des résultats en attente...');
    try {
        const adapter = getDataAdapter(guildId);
        if (adapter) {
            await adapter.clearAllPendingResults();
            console.log('✅ Résultats en attente réinitialisés');
        }
    } catch (error) {
        console.error('❌ Erreur lors du reset des résultats en attente:', error);
    }

    // Réinitialiser l'historique des matchs
    console.log('🗑️ Réinitialisation de l\'historique des matchs...');
    try {
        const adapter = getDataAdapter(guildId);
        if (adapter) {
            await adapter.clearAllMatchHistory();
            console.log('✅ Historique des matchs réinitialisé');
        }
    } catch (error) {
        console.error('❌ Erreur lors du reset de l\'historique:', error);
    }

    // Réinitialiser les compteurs de matchs
    console.log('🗑️ Réinitialisation des compteurs de matchs...');
    try {
        const adapter = getDataAdapter(guildId);
        if (adapter) {
            await adapter.clearAllMatchCounters();
            console.log('✅ Compteurs de matchs réinitialisés');
        }
    } catch (error) {
        console.error('❌ Erreur lors du reset des compteurs:', error);
    }
    
    // Supprimer TOUS les rôles d'équipe, même ceux qui n'étaient pas dans le tableau d'équipes
    if (guild) {
        try {
            console.log('Nettoyage forcé de tous les rôles d\'équipe...');
            const teamRolePattern = /^Team /;
            const teamRolesToDelete = guild.roles.cache.filter(role => 
                teamRolePattern.test(role.name) && role.name !== 'Team Leader'
            );
            
            console.log(`Rôles d'équipe trouvés: ${teamRolesToDelete.size}`);
            
            for (const [id, role] of teamRolesToDelete) {
                try {
                    await role.delete('Nettoyage des rôles d\'équipe en fin de festival');
                    console.log(`Rôle ${role.name} supprimé avec succès`);
                } catch (e) {
                    console.error(`Erreur lors de la suppression du rôle ${role.name}:`, e);
                }
                
                // Petite pause pour éviter de surcharger l'API
                await new Promise(resolve => setTimeout(resolve, 300));
            }
        } catch (error) {
            console.error('Erreur générale lors de la suppression des rôles d\'équipe:', error);
        }

        // Utiliser le gestionnaire centralisé pour nettoyer le rôle Team Leader
        const { cleanupTeamLeaderRole } = require('./teamLeaderRoleManager');
        await cleanupTeamLeaderRole(guild);
    }
    
    // Supprimer UNIQUEMENT les rôles de camp si une guild est fournie
    if (guild) {
        try {
            console.log(`Guild fournie, ID: ${guild.id}`);
            
            // Récupérer tous les rôles de camp
            const campRolePattern = /^Camp /;
            const rolesToDelete = guild.roles.cache.filter(role => 
                campRolePattern.test(role.name)
            );
            
            console.log(`Rôles de camp trouvés: ${rolesToDelete.size}`);
            
            if (rolesToDelete.size > 0) {
                console.log(`Préparation à la suppression de ${rolesToDelete.size} rôles de camp...`);
                
                // Supprimer les rôles
                for (const [id, role] of rolesToDelete) {
                    try {
                        console.log(`Suppression du rôle ${role.name} (${id})...`);
                        await role.delete(`Nettoyage des rôles de camp pour le nouveau festival`);
                        console.log(`Rôle ${role.name} supprimé avec succès`);
                    } catch (e) {
                        console.error(`Erreur lors de la suppression du rôle ${role.name}:`, e);
                    }
                    
                    // Petite pause pour éviter de surcharger l'API
                    await new Promise(resolve => setTimeout(resolve, 500));
                }
                
                console.log(`Suppression des rôles de camp terminée.`);
            } else {
                console.log('Aucun rôle de camp à supprimer');
            }
        } catch (error) {
            console.error('Erreur générale lors de la suppression des rôles de camp:', error);
        }
    } else {
        console.warn('Aucune guild fournie, impossible de supprimer les rôles de camp');
    }
    
    console.log('=== FIN RESET FESTIVAL DATA ===');

    // Supprimer les salons d'équipe
    if (guild) {
        try {
            console.log(`Suppression des salons d'équipe...`);
            
            // Trouver les salons d'équipe
            const teamChannels = guild.channels.cache.filter(channel => 
                channel.type === ChannelType.GuildText && 
                channel.name.startsWith('team-')
            );
            
            console.log(`Salons d'équipe trouvés: ${teamChannels.size}`);
            
            // Supprimer chaque salon
            for (const [id, channel] of teamChannels) {
                try {
                    await channel.delete('Nettoyage des salons d\'équipe en fin de festival');
                    console.log(`Salon ${channel.name} supprimé`);
                } catch (e) {
                    console.error(`Erreur lors de la suppression du salon ${channel.name}:`, e);
                }
                
                // Petite pause pour éviter de surcharger l'API
                await new Promise(resolve => setTimeout(resolve, 500));
            }
            
            // Trouver les salons de match
            const matchChannels = guild.channels.cache.filter(channel => 
                channel.type === ChannelType.GuildText && 
                channel.name.startsWith('match-')
            );
            
            console.log(`Salons de match trouvés: ${matchChannels.size}`);
            
            // Supprimer chaque salon
            for (const [id, channel] of matchChannels) {
                try {
                    await channel.delete('Nettoyage des salons de match en fin de festival');
                    console.log(`Salon ${channel.name} supprimé`);
                } catch (e) {
                    console.error(`Erreur lors de la suppression du salon ${channel.name}:`, e);
                }
                
                // Petite pause pour éviter de surcharger l'API
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        } catch (error) {
            console.error('Erreur générale lors de la suppression des salons:', error);
        }
    }
}

// Créer l'embed d'annonce de début
function createStartEmbed(festival) {
    const { EmbedBuilder } = require('discord.js');
    
    return new EmbedBuilder()
        .setColor('#FF9900')
        .setTitle(`🎉 Le Festival "${festival.title}" commence maintenant! 🎉`)
        .setDescription(`Que la compétition entre les camps commence!`)
        .addFields(
            { name: festival.campNames[0], value: 'Rejoignez ce camp avec `/create-team` ou `/join-team`', inline: true },
            { name: festival.campNames[1], value: 'Rejoignez ce camp avec `/create-team` ou `/join-team`', inline: true },
            { name: festival.campNames[2], value: 'Rejoignez ce camp avec `/create-team` ou `/join-team`', inline: true },
            { name: '🎮 Configuration', value: 
                `**Taille d'équipe**: ${festival.getTeamSizeDisplay()}\n` +
                `**Mode de jeu**: ${festival.getGameModeDisplay()}\n` +
                `**Maps bannies**: ${festival.bannedMaps?.length || 0}`,
                inline: false 
            },
            { name: '🏁 Date de fin', value: `<t:${Math.floor(new Date(festival.endDate).getTime() / 1000)}:F>` }
        )
        .setTimestamp();
}

// Créer l'embed d'annonce de fin
function createEndEmbed(festival, guildId) {
    const { EmbedBuilder } = require('discord.js');
    
    // Récupérer les scores finaux
    const scoreTracker = require('./scoreTracker');
    const scores = scoreTracker.getCurrentScores(guildId);
    const percentages = scoreTracker.getScoresAsPercentages(guildId);
    const totalPoints = scores.camp1 + scores.camp2 + scores.camp3;
    const totalMatches = scoreTracker.getMatchHistory(guildId).length;
    
    // Déterminer le gagnant
    const winningCamp = scoreTracker.getWinningCamp(guildId);
    let resultText = '';
    let winnerText = '';
    
    if (winningCamp === 'Tie') {
        winnerText = '🤝 **ÉGALITÉ PARFAITE !**';
        resultText = 'Aucun camp n\'a réussi à prendre l\'avantage !';
    } else {
        const campIndex = winningCamp === 'camp1' ? 0 : winningCamp === 'camp2' ? 1 : 2;
        const winnerName = festival.campNames[campIndex];
        winnerText = `🏆 **${winnerName.toUpperCase()} REMPORTE LE FESTIVAL !** 🏆`;
        resultText = `Félicitations à tous les participants du camp ${winnerName} !`;
    }
    
    return new EmbedBuilder()
        .setColor('#FF0000')
        .setTitle(`🏁 Festival "${festival.title}" terminé !`)
        .setDescription(`${winnerText}\n\n${resultText}`)
        .addFields(
            {
                name: '📊 Résultats finaux',
                value: 
                    `🥇 **${festival.campNames[0]}**: ${scores.camp1} points (${percentages.camp1}%)\n` +
                    `🥈 **${festival.campNames[1]}**: ${scores.camp2} points (${percentages.camp2}%)\n` +
                    `🥉 **${festival.campNames[2]}**: ${scores.camp3} points (${percentages.camp3}%)`,
                inline: false
            },
            {
                name: '📈 Statistiques du festival',
                value: `**${totalPoints}** points marqués au total\n**${totalMatches}** matchs disputés`,
                inline: false
            },
            {
                name: '🎉 Merci à tous !',
                value: 'Merci à tous les participants pour ce festival extraordinaire !\nUn nouveau festival sera annoncé prochainement.',
                inline: false
            }
        )
        .setTimestamp()
        .setFooter({ text: 'Festival terminé' });
}

/**
 * Supprime complètement le festival actuel
 */
async function deleteFestival(guildId) {
    try {
        if (!guildId) {
            console.error('❌ guildId requis pour deleteFestival');
            return false;
        }
        
        console.log(`🗑️ === DÉBUT SUPPRESSION FESTIVAL pour guildId: ${guildId} ===`);
        
        // Annuler les timers programmés
        cancelAllScheduledEvents();
        
        // Suppression du festival dans MongoDB via DataAdapter (toujours, même si pas en mémoire)
        const adapter = getDataAdapter(guildId);
        if (adapter) {
            console.log(`🔄 Appel adapter.deleteFestival...`);
            const result = await adapter.deleteFestival(guildId);
            console.log('✅ Festival supprimé de la base de données:', result);
        } else {
            console.error('❌ Aucun adapter trouvé pour guildId:', guildId);
        }
        
        // Vidage de la variable festival pour cette guild
        console.log(`🔄 Mise à null du festival en mémoire...`);
        setCurrentFestival(null, guildId);
        
        console.log('✅ === Festival supprimé avec succès ===');
        return true;
    } catch (error) {
        console.error('❌ === Erreur lors de la suppression du festival ===', error);
        return false;
    }
}

let activationTimeout = null;
let deactivationTimeout = null;
let halfwayTimeout = null;

// Fonction pour annuler tous les timers programmés
function cancelAllScheduledEvents() {
    console.log('🛑 Annulation de tous les événements programmés (Start, End, Halfway)...');
    if (activationTimeout) {
        clearTimeout(activationTimeout);
        activationTimeout = null;
        console.log('✅ Timer d\'activation annulé');
    }
    if (deactivationTimeout) {
        clearTimeout(deactivationTimeout);
        deactivationTimeout = null;
        console.log('✅ Timer de désactivation annulé');
    }
    if (halfwayTimeout) {
        clearTimeout(halfwayTimeout);
        halfwayTimeout = null;
        console.log('✅ Timer de mi-parcours annulé');
    }
}

function scheduleActivation(festival, client) {
    const now = new Date();
    const startDate = new Date(festival.startDate);
    const endDate = new Date(festival.endDate);
    
    console.log('=== PROGRAMMATION ACTIVATION FESTIVAL ===');
    console.log('Festival:', festival.title);
    console.log('Maintenant:', now.toISOString());
    console.log('Début programmé:', startDate.toISOString());
    console.log('Fin programmée:', endDate.toISOString());
    
    // Annuler les timers existants
    if (activationTimeout) {
        clearTimeout(activationTimeout);
        activationTimeout = null;
    }
    if (deactivationTimeout) {
        clearTimeout(deactivationTimeout);
        deactivationTimeout = null;
    }
    if (halfwayTimeout) {
        clearTimeout(halfwayTimeout);
        halfwayTimeout = null;
    }
    
    // Si le festival devrait déjà être actif
    if (now >= startDate && now <= endDate && !festival.isActive) {
        console.log('🎉 Festival devrait déjà être actif, activation immédiate');
        activateFestivalNow(festival, client);
    }
    // Si le festival commence dans le futur
    else if (startDate > now) {
        const timeUntilStart = startDate.getTime() - now.getTime();
        console.log(`⏰ Festival programmé pour dans ${Math.round(timeUntilStart / 1000 / 60)} minutes`);
        
        activationTimeout = setTimeout(() => {
            console.log('🎉 HEURE D\'ACTIVATION ATTEINTE !');
            activateFestivalNow(festival, client);
        }, timeUntilStart);
    }
    
    // AMÉLIORATION: Programmer l'annonce de mi-parcours plus intelligemment
    const halfwayTime = new Date((startDate.getTime() + endDate.getTime()) / 2);
    console.log('Mi-parcours calculé:', halfwayTime.toISOString());
    
    if (halfwayTime > now) {
        const timeUntilHalfway = halfwayTime.getTime() - now.getTime();
        console.log(`📊 Annonce de mi-parcours programmée pour dans ${Math.round(timeUntilHalfway / 1000 / 60)} minutes`);
        
        halfwayTimeout = setTimeout(() => {
            console.log('📊 HEURE D\'ANNONCE MI-PARCOURS ATTEINTE !');
            sendHalfwayAnnouncement(festival, client);
        }, timeUntilHalfway);
    } else {
        // NOUVEAU: Vérifier si on vient de passer la mi-parcours
        const timeSinceHalfway = now.getTime() - halfwayTime.getTime();
        const fiveMinutes = 5 * 60 * 1000;
        
        if (timeSinceHalfway < fiveMinutes && festival.isActive) {
            console.log('📊 Mi-parcours récemment passé, envoi immédiat de l\'annonce');
            // Envoyer l'annonce avec un petit délai pour éviter les conflits
            setTimeout(() => {
                sendHalfwayAnnouncement(festival, client);
            }, 2000);
        } else {
            console.log('📊 Mi-parcours déjà passé depuis longtemps, pas d\'annonce');
        }
    }
    
    // Programmer la désactivation si le festival est ou sera actif
    if (endDate > now) {
        const timeUntilEnd = endDate.getTime() - now.getTime();
        console.log(`⏰ Fin programmée pour dans ${Math.round(timeUntilEnd / 1000 / 60)} minutes`);
        
        deactivationTimeout = setTimeout(() => {
            console.log('🏁 HEURE DE FIN ATTEINTE !');
            deactivateFestivalNow(festival, client);
        }, timeUntilEnd);
    } else if (endDate <= now && festival.isActive) {
        console.log('🏁 Festival devrait déjà être terminé, déclenchement immédiat du nettoyage...');
        console.log(`⚠️ ATTENTION: Festival expiré depuis ${Math.round((now - endDate) / (1000 * 60 * 60 * 24))} jours!`);
        
        // Déclencher la fin immédiatement avec nettoyage forcé
        setTimeout(async () => {
            console.log('🧹 NETTOYAGE FORCÉ D\'UN FESTIVAL EXPIRÉ');
            
            // Force la désactivation
            festival.deactivate();
            const guild = client.guilds.cache.first();
            const guildId = guild ? guild.id : festival.guildId;
            await saveFestival(festival, guildId);
            
            // Envoyer l'annonce avec indication que c'est un nettoyage automatique
            if (guild) {
                try {
                    const channel = await guild.channels.fetch(festival.announcementChannelId);
                    if (channel) {
                        const config = await require('../commands/config').loadConfig(guild.id);
                        const mentionText = config.announcementRoleId ? 
                            `<@&${config.announcementRoleId}> ` : '';
                        
                        const endEmbed = createEndEmbed(festival, guild.id);
                        await channel.send({
                            content: `${mentionText}🏁 **LE FESTIVAL "${festival.title}" EST TERMINÉ !** 🏁\n⚠️ _Nettoyage automatique d'un festival expiré (détecté au redémarrage)_`,
                            embeds: [endEmbed]
                        });
                        
                        await channel.send("🧹 **Nettoyage automatique en cours...**");
                    }
                } catch (error) {
                    console.error('❌ Erreur envoi annonce nettoyage forcé:', error);
                }
                
                // 🎯 NOUVEAU: Nettoyage immédiat et forcé ROBUSTE
                const RobustCleaner = require('./robustCleaner');
                const cleaner = new RobustCleaner(guild.id);
                
                console.log('🔄 Nettoyage robuste forcé en cours...');
                const results = await cleaner.cleanupGuild();
                console.log('✅ Nettoyage robuste forcé terminé:', results);
                
                // Nettoyage traditionnel complémentaire
                await resetFestivalData(guild);
                const teamManager = require('./teamManager');
                await teamManager.clearAllTeams(guild.id);
                
                console.log('✅ Festival expiré nettoyé avec succès');
            }
        }, 1000); // Petit délai pour éviter les conflits
    }
    
    console.log('=== FIN PROGRAMMATION ACTIVATION FESTIVAL ===');
}

async function activateFestivalNow(festival, client) {
    try {
        console.log('🎉 ACTIVATION DU FESTIVAL EN COURS...');
        
        // VÉRIFICATION DE SÉCURITÉ : Le festival est-il toujours d'actualité ?
        if (festival.guildId) {
            const current = getCurrentFestivalSync(festival.guildId);
            if (!current) {
                console.log('⚠️ Activation annulée: Aucun festival actif trouvé en mémoire pour cette guild.');
                console.log('   Cela signifie probablement que le festival a été supprimé entre temps.');
                return;
            }
            // Si les IDs sont différents (et qu'on a des IDs)
            if (current.id && festival.id && current.id !== festival.id) {
                console.log(`⚠️ Activation annulée: ID mismatch (Attendu: ${current.id}, Reçu: ${festival.id})`);
                return;
            }
        }
        
        // Activer le festival
        festival.activate();
        
        // Récupérer la bonne guild pour ce festival
        let guild = null;
        let guildId = festival.guildId;
        
        console.log(`🔍 Festival guildId: ${guildId}`);
        console.log(`🔍 Client guilds: ${client.guilds.cache.map(g => `${g.name} (${g.id})`).join(', ')}`);
        
        if (guildId) {
            guild = client.guilds.cache.get(guildId);
            console.log(`🔍 Guild trouvée: ${guild ? guild.name : 'AUCUNE'}`);
        } else {
            // Si pas de guildId, essayer de trouver la guild par le canal d'annonce
            console.log(`🔍 Recherche de la guild par canal d'annonce: ${festival.announcementChannelId}`);
            for (const g of client.guilds.cache.values()) {
                try {
                    const channel = await g.channels.fetch(festival.announcementChannelId);
                    if (channel) {
                        guild = g;
                        guildId = g.id;
                        festival.guildId = g.id; // Assigner le guildId au festival
                        console.log(`✅ Guild trouvée par canal: ${g.name} (${g.id})`);
                        break;
                    }
                } catch (error) {
                    // Canal pas dans cette guild, continuer
                }
            }
            
            // Fallback : prendre la première guild si aucune trouvée
            if (!guild) {
                guild = client.guilds.cache.first();
                guildId = guild ? guild.id : null;
                console.log(`🔍 Fallback vers première guild: ${guild ? guild.name : 'AUCUNE'}`);
            }
        }
        
        if (!guild) {
            console.error('❌ Impossible de trouver la guild pour le festival');
            return;
        }
        
        await saveFestival(festival, guildId);
        
        // Envoyer l'annonce de début dans la bonne guild
        try {
            console.log(`🔍 Tentative récupération canal ${festival.announcementChannelId} dans guild ${guild.name} (${guild.id})`);
            const channel = await guild.channels.fetch(festival.announcementChannelId);
            if (channel) {
                console.log(`✅ Canal trouvé: ${channel.name} dans guild ${channel.guild.name}`);
                const config = await require('../commands/config').loadConfig(guild.id);
                const mentionText = config.announcementRoleId ? 
                    `<@&${config.announcementRoleId}> ` : '';
                
                const startEmbed = createStartEmbed(festival);
                await channel.send({
                    content: `${mentionText}🎉 **LE FESTIVAL "${festival.title}" COMMENCE MAINTENANT !** 🎉`,
                    embeds: [startEmbed]
                });
                
                console.log('✅ Annonce de début du festival envoyée !');
            } else {
                console.error('❌ Canal d\'annonce introuvable');
            }
        } catch (error) {
            console.error('❌ Erreur envoi annonce début:', error);
        }
        
    } catch (error) {
        console.error('❌ Erreur lors de l\'activation du festival:', error);
    }
}

async function deactivateFestivalNow(festival, client) {
    try {
        console.log('🏁 DÉBUT DE LA FERMETURE PROGRESSIVE DU FESTIVAL...');
        
        // 🎯 NOUVEAU: Utiliser la fermeture progressive au lieu de la désactivation immédiate
        const guild = client.guilds.cache.first();
        const guildId = guild ? guild.id : festival.guildId;
        
        // Démarrer la fermeture progressive
        const ProgressiveCloser = require('./progressiveCloser');
        const closer = new ProgressiveCloser(guildId);
        
        await closer.startProgressiveClosing(festival, client);
        
        // 🎯 La suite (nettoyage) est maintenant gérée par ProgressiveCloser
        return;
        
        // 🎯 DÉSACTIVÉ: L'ancien système immédiat est remplacé par la fermeture progressive
        /*
        // Envoyer l'annonce de fin
        if (client.guilds.cache.size > 0) {
            try {
                const channel = await guild.channels.fetch(festival.announcementChannelId);
                if (channel) {
                    const config = await require('../commands/config').loadConfig(guild.id);
                    const mentionText = config.announcementRoleId ? 
                        `<@&${config.announcementRoleId}> ` : '';
                    
                    const endEmbed = createEndEmbed(festival, guild.id);
                    await channel.send({
                        content: `${mentionText}🏁 **LE FESTIVAL "${festival.title}" EST TERMINÉ !** 🏁`,
                        embeds: [endEmbed]
                    });
                    
                    // NOUVEAU : Annoncer le nettoyage imminent
                    await channel.send("🧹 **Toutes les équipes et données du festival seront supprimées dans 30 secondes.**");
                    
                    console.log('✅ Annonce de fin du festival envoyée !');
                }
            } catch (error) {
                console.error('❌ Erreur envoi annonce fin:', error);
            // 🎯 Tout l'ancien système de nettoyage immédiat est désormais remplacé par ProgressiveCloser
            */
        
    } catch (error) {
        console.error('❌ Erreur lors de la fermeture progressive du festival:', error);
    }
}

// Créer l'embed d'annonce de préparation (avant le début)
function createPrepEmbed(festival) {
    const { EmbedBuilder } = require('discord.js');
    
    return new EmbedBuilder()
        .setColor('#FF9900')
        .setTitle(`🎮 Le Festival "${festival.title}" a été créé! 🎮`)
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
            },
            { name: '📊 Consulter le festival', value: 'Utilisez `/current-festival` pour voir les statistiques actuelles du festival' }
        )
        .setTimestamp();
}

async function sendHalfwayAnnouncement(festival, client) {
    try {
        console.log('📊 ENVOI ANNONCE MI-PARCOURS');
        
        if (client.guilds.cache.size > 0) {
            const guild = client.guilds.cache.first();
            const channel = await guild.channels.fetch(festival.announcementChannelId);
            
            if (channel) {
                const config = await require('../commands/config').loadConfig(guild.id);
                const mentionText = config.announcementRoleId ? 
                    `<@&${config.announcementRoleId}> ` : '';
                
                // Récupérer les scores actuels
                const scoreTracker = require('./scoreTracker');
                const scores = scoreTracker.getCurrentScores(guild.id);
                const percentages = scoreTracker.getScoresAsPercentages(guild.id);
                const totalPoints = scores.camp1 + scores.camp2 + scores.camp3;
                const totalMatches = scoreTracker.getMatchHistory(guild.id).length;
                
                // Déterminer le camp en tête
                const winningCamp = scoreTracker.getWinningCamp(guild.id);
                let leaderText = '';
                if (winningCamp === 'Tie') {
                    leaderText = '🤝 **Égalité parfaite !** La course est encore très serrée !';
                } else {
                    const campIndex = winningCamp === 'camp1' ? 0 : winningCamp === 'camp2' ? 1 : 2;
                    const leaderName = festival.campNames[campIndex];
                    leaderText = `🏆 **${leaderName}** mène la course !`;
                }
                
                const embed = new EmbedBuilder()
                    .setColor('#FF9900')
                    .setTitle(`📊 Scores à mi-parcours - Festival "${festival.title}"`)
                    .setDescription(`Nous sommes à la moitié du festival ! Voici où en sont les camps :\n\n${leaderText}`)
                    .addFields(
                        { 
                            name: `🥇 ${festival.campNames[0]}`, 
                            value: `**${scores.camp1}** points (${percentages.camp1}%)`,
                            inline: true 
                        },
                        { 
                            name: `🥈 ${festival.campNames[1]}`, 
                            value: `**${scores.camp2}** points (${percentages.camp2}%)`,
                            inline: true 
                        },
                        { 
                            name: `🥉 ${festival.campNames[2]}`, 
                            value: `**${scores.camp3}** points (${percentages.camp3}%)`,
                            inline: true 
                        },
                        {
                            name: '📈 Statistiques',
                            value: `**${totalPoints}** points au total\n**${totalMatches}** matchs joués`,
                            inline: false
                        },
                        {
                            name: '🔥 Il reste encore la moitié !',
                            value: 'La course n\'est pas terminée ! Continuez à jouer pour faire gagner votre camp !\n\n🎮 Utilisez `/search-match` pour lancer un nouveau match\n📊 Utilisez `/my-team` pour voir votre équipe',
                            inline: false
                        }
                    )
                    .setTimestamp()
                    .setFooter({ text: `Festival se termine dans quelques heures !` });
                
                await channel.send({
                    content: `${mentionText}📊 **SCORES À MI-PARCOURS DU FESTIVAL !** 📊`,
                    embeds: [embed]
                });
                
                console.log('✅ Annonce de mi-parcours envoyée avec succès');
            } else {
                console.error('❌ Canal d\'annonce introuvable pour l\'annonce mi-parcours');
            }
        }
    } catch (error) {
        console.error('❌ Erreur lors de l\'annonce de mi-parcours:', error);
    }
}

/**
 * Vérifie et nettoie automatiquement un festival expiré
 * @param {Object} festival - Le festival à vérifier
 * @param {Client} client - Le client Discord
 * @returns {boolean} - True si un nettoyage a été effectué
 */
async function checkAndCleanExpiredFestival(festival, client) {
    if (!festival) return false;
    
    const now = new Date();
    const endDate = new Date(festival.endDate);
    
    // Vérifier si le festival est expiré
    if (endDate < now && festival.isActive) {
        const daysExpired = Math.round((now - endDate) / (1000 * 60 * 60 * 24));
        console.log(`🧹 FESTIVAL EXPIRÉ DÉTECTÉ: "${festival.title}" (${daysExpired} jours)`);
        
        // Forcer la désactivation
        festival.deactivate();
        const guild = client.guilds.cache.first();
        const guildId = guild ? guild.id : festival.guildId;
        
        if (guildId) {
            await saveFestival(festival, guildId);
        }
        
        // Nettoyage sur tous les serveurs applicables
        const guildsToClean = [];
        if (guild) guildsToClean.push(guild);
        
        for (const guildToClean of guildsToClean) {
            try {
                // Envoyer notification de nettoyage
                const channel = await guildToClean.channels.fetch(festival.announcementChannelId).catch(() => null);
                if (channel) {
                    const config = await require('../commands/config').loadConfig(guildToClean.id);
                    const mentionText = config.announcementRoleId ? 
                        `<@&${config.announcementRoleId}> ` : '';
                    
                    const endEmbed = createEndEmbed(festival, guildToClean.id);
                    await channel.send({
                        content: `${mentionText}🏁 **LE FESTIVAL "${festival.title}" EST TERMINÉ !** 🏁\n⚠️ _Nettoyage automatique (festival expiré depuis ${daysExpired} jours)_`,
                        embeds: [endEmbed]
                    });
                }
                
                // 🎯 NOUVEAU: Nettoyer les données avec le système robuste
                const RobustCleaner = require('./robustCleaner');
                const cleaner = new RobustCleaner(guildToClean.id);
                
                console.log(`🔄 Nettoyage robuste expiré pour ${guildToClean.name}...`);
                const results = await cleaner.cleanupGuild();
                console.log(`✅ Nettoyage robuste expiré terminé pour ${guildToClean.name}:`, results);
                
                // Nettoyage traditionnel complémentaire
                await resetFestivalData(guildToClean);
            } catch (error) {
                console.error(`❌ Erreur nettoyage sur ${guildToClean.name}:`, error);
            }
        }
        
        // Nettoyage global des équipes et suppression du festival
        const teamManager = require('./teamManager');
        await teamManager.clearAllTeams(guildId);
        await deleteFestival(guildId);
        
        console.log('✅ Festival expiré nettoyé automatiquement');
        return true;
    }
    
    return false;
}

/**
 * Vérifie le statut d'un festival et retourne des informations sur son état
 */
function getFestivalStatus(festival) {
    if (!festival) return { status: 'none' };
    
    const now = new Date();
    const startDate = new Date(festival.startDate);
    const endDate = new Date(festival.endDate);
    
    if (endDate < now) {
        return { 
            status: 'ended', 
            shouldBeActive: false,
            timeInfo: `Terminé depuis ${Math.round((now - endDate) / (1000 * 60))} minutes`
        };
    } else if (now >= startDate && now <= endDate) {
        return { 
            status: 'active', 
            shouldBeActive: true,
            timeInfo: `En cours, se termine dans ${Math.round((endDate - now) / (1000 * 60))} minutes`
        };
    } else if (startDate > now) {
        return { 
            status: 'future', 
            shouldBeActive: false,
            timeInfo: `Commence dans ${Math.round((startDate - now) / (1000 * 60))} minutes`
        };
    }
}

// Exporter les fonctions
module.exports = {
    // Version sync pour compatibilité (cache local)
    getCurrentFestival: getCurrentFestivalSync,
    // Version async pour persistence
    getCurrentFestivalAsync: getCurrentFestival,
    getCurrentFestivalSync: getCurrentFestivalSync,
    setCurrentFestival,
    loadFestival,
    createFestival,
    resetFestivalData,
    saveFestival,
    deleteFestival,
    createStartEmbed,
    createEndEmbed,
    createPrepEmbed,
    scheduleActivation,
    verifyFestivalStatus,
    activateFestivalNow,
    deactivateFestivalNow,
    sendHalfwayAnnouncement,
    getFestivalStatus,
    checkAndCleanExpiredFestival
};