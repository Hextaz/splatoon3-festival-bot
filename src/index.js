require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client, Collection, GatewayIntentBits } = require('discord.js');
const { botToken } = require('./config');
const deployCommands = require('./deploy-commands');
const interactionCreateEvent = require('./events/interactionCreate');
const readyEvent = require('./events/ready');
// Managers seront chargés dynamiquement après la configuration du guildId
const { RobustKeepAlive } = require('./utils/robustKeepAlive');
const { HealthServer } = require('./utils/healthServer');
const { guildDataManager, connectMongoDB } = require('./utils/database');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages
    ]
});

global.client = client;

// Variable pour stocker le guild ID actuel
let currentGuildId = null;

// Initialiser le keep-alive robuste et le serveur de santé
const robustKeepAlive = new RobustKeepAlive();
const healthServer = new HealthServer();

// Rendre les instances disponibles globalement  
global.robustKeepAlive = robustKeepAlive;
global.healthServer = healthServer;
global.guildDataManager = guildDataManager;

// Créer une collection pour les commandes
client.commands = new Collection();
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

// Charger chaque fichier de commande dans la collection
for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    
    if ('data' in command && 'execute' in command) {
        client.commands.set(command.data.name, command);
    } else {
        console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
    }
}

client.once('ready', () => {
    readyEvent.execute(client);
    
    // Vérification du nombre de serveurs
    checkGuildLimits();
    
    // Démarrer la vérification périodique des festivals
    startPeriodicFestivalCheck();
});

client.on('interactionCreate', interaction => {
    interactionCreateEvent.execute(interaction);
});

client.tempTeamData = {};

// Fonction pour initialiser les managers avec guildId
async function initializeManagersForGuild(guildId, guild = null) {
    console.log(`🔧 Initialisation des managers pour le serveur: ${guildId}`);
    
    try {
        // Charger dynamiquement les managers pour éviter les problèmes d'ordre d'initialisation
        const festivalManager = require('./utils/festivalManager');
        const teamManager = require('./utils/teamManager');
        const scoreTracker = require('./utils/scoreTracker');
        
        // Avec l'isolation des guilds, plus besoin de setCurrentGuildId
        // Tous les managers utilisent maintenant guildId en paramètre
        
        const voteManager = require('./utils/vote');
        // Plus besoin de setCurrentGuildId pour les votes non plus
        
        const matchHistoryManager = require('./utils/matchHistoryManager');
        // matchHistoryManager utilise maintenant guildId en paramètre
        
        const mapProbabilityManager = require('./utils/mapProbabilityManager');
        // mapProbabilityManager utilise maintenant guildId en paramètre
        
        const interactionHandlers = require('./utils/interactionHandlers');
        // Initialiser interactionHandlers pour cette guilde
        await interactionHandlers.initializeForGuild(guildId);
        
        // Charger le festival EN PREMIER pour que les autres managers puissent filtrer par festivalId
        const festival = await festivalManager.loadFestival(guildId);
        
        // Load data for all managers after guildId AND festival are set
        await teamManager.loadTeams(guildId);
        await voteManager.loadVotes(guildId);
        await scoreTracker.loadScores(guildId);
        await matchHistoryManager.loadMatchHistory(guildId);
        await mapProbabilityManager.loadProbabilities(guildId);

        // VÉRIFICATION COMPLÈTE DU STATUT DU FESTIVAL AU DÉMARRAGE - AVEC NETTOYAGE AUTOMATIQUE
        if (festival) {
            const now = new Date();
            const startDate = new Date(festival.startDate);
            const endDate = new Date(festival.endDate);
            
            console.log('=== VÉRIFICATION STATUT FESTIVAL AU DÉMARRAGE ===');
            console.log('Festival:', festival.title);
            console.log('Maintenant:', now.toISOString());
            console.log('Début:', startDate.toISOString());
            console.log('Fin:', endDate.toISOString());
            console.log('Actuellement actif:', festival.isActive);
            console.log('Temps écoulé depuis la fin:', Math.round((now - endDate) / (1000 * 60 * 60 * 24)), 'jours');
            
            // Déterminer l'état exact
            let festivalState = '';
            if (endDate < now) {
                festivalState = '🏁 TERMINÉ';
            } else if (now >= startDate && now <= endDate) {
                festivalState = festival.isActive ? '🎉 ACTIF' : '⏸️ EN COURS MAIS PAS ACTIVÉ';
            } else if (startDate > now) {
                festivalState = '📅 FUTUR/PRÉPARATION';
            }
            
            console.log('État du festival:', festivalState);
            console.log('Action recommandée pour les équipes:', 
                festivalState.includes('TERMINÉ') ? 'SUPPRIMER' : 'CONSERVER');
            console.log('================================================');
            
            // CAS 1: Festival terminé (fin < maintenant) - NETTOYAGE FORCÉ SYSTÉMATIQUE
            if (endDate < now) {
                const daysExpired = Math.round((now - endDate) / (1000 * 60 * 60 * 24));
                console.log(`🏁 FESTIVAL TERMINÉ DÉTECTÉ au démarrage (expiré depuis ${daysExpired} jours)`);
                
                // FORCER la désactivation immédiatement
                if (festival.isActive) {
                    console.log('⚠️ Festival encore marqué comme actif, désactivation FORCÉE...');
                    festival.deactivate();
                    await festivalManager.saveFestival(festival, guildId);
                }
                
                // Trouver TOUS les serveurs où envoyer l'annonce de fin
                const guildsToNotify = [];
                const config = await require('./commands/config').loadConfig(guildId);
                if (config.allowedGuildId) {
                    // Serveur spécifique configuré
                    const allowedGuild = client.guilds.cache.get(config.allowedGuildId);
                    if (allowedGuild) guildsToNotify.push(allowedGuild);
                } else {
                    // Tous les serveurs
                    guildsToNotify.push(...client.guilds.cache.values());
                }
                
                // Envoyer l'annonce de fin sur tous les serveurs applicables
                for (const guild of guildsToNotify) {
                    try {
                        const channel = await guild.channels.fetch(festival.announcementChannelId).catch(() => null);
                        if (channel) {
                            const guildConfig = await require('./commands/config').loadConfig(guild.id);
                            const mentionText = guildConfig.announcementRoleId ? 
                                `<@&${guildConfig.announcementRoleId}> ` : '';
                            
                            const endEmbed = festivalManager.createEndEmbed(festival);
                            await channel.send({
                                content: `${mentionText}🏁 **LE FESTIVAL "${festival.title}" EST TERMINÉ !** 🏁\n⚠️ _Annonce automatique au redémarrage du bot (festival expiré depuis ${daysExpired} jours)_`,
                                embeds: [endEmbed]
                            });
                            
                            console.log(`✅ Annonce de fin envoyée sur ${guild.name} (rattrapage)`);
                        }
                    } catch (error) {
                        console.error(`❌ Erreur envoi annonce fin sur ${guild.name}:`, error);
                    }
                }
                
                // NETTOYAGE IMMÉDIAT ET FORCÉ (pas de délai)
                console.log('🧹 DÉBUT DU NETTOYAGE AUTOMATIQUE IMMÉDIAT (festival expiré)');
                
                // Nettoyage sur TOUS les serveurs applicables
                for (const guild of guildsToNotify) {
                    try {
                        await festivalManager.resetFestivalData(guild);
                        console.log(`✅ Données festival nettoyées sur ${guild.name}`);
                    } catch (error) {
                        console.error(`❌ Erreur nettoyage festival sur ${guild.name}:`, error);
                    }
                }
                
                // Nettoyage global des équipes et suppression du festival
                const teamManager = require('./utils/teamManager');
                await teamManager.clearAllTeams(guildId);
                await festivalManager.deleteFestival(guildId);
                
                console.log('🎯 NETTOYAGE AUTOMATIQUE TERMINÉ - Festival et données supprimés');
                
            } else if (now >= startDate && now <= endDate && !festival.isActive) {
                // Festival devrait être actif mais ne l'est pas - Activer immédiatement
                console.log('🎉 ACTIVATION IMMÉDIATE DU FESTIVAL AU REDÉMARRAGE...');
                await festivalManager.verifyFestivalStatus(guildId);
            } else if (startDate > now || (now >= startDate && now <= endDate)) {
                // Festival futur ou en cours - Reprogrammer les timeouts
                console.log('📅 REPROGRAMMATION DES TIMEOUTS D\'ACTIVATION...');
                const guild = client.guilds.cache.get(guildId);
                if (guild) {
                    festivalManager.scheduleActivation(festival, client);
                }
            }
        }
        
        // Synchroniser les rôles des équipes existantes si festival actif
        if (festival && festival.isActive) {
            console.log('🔄 Synchronisation des rôles d\'équipe au démarrage...');
            try {
                await syncAllRoles();
                console.log('✅ Rôles d\'équipe synchronisés');
            } catch (error) {
                console.error('❌ Erreur lors de la synchronisation des rôles:', error);
            }
        }
        
        console.log(`✅ Managers initialisés pour le serveur: ${guildId}`);
        
        // 🔧 NOUVEAU: VÉRIFICATION ET RÉPARATION DES ÉTATS INCOHÉRENTS AU DÉMARRAGE
        console.log('🔧 Vérification et réparation des états incohérents...');
        try {
            const matchSearch = require('./utils/matchSearch');
            
            // 1. Réparer les états des équipes
            const repairedTeams = await matchSearch.repairInconsistentTeamStates(guildId, guild);
            
            // 2. Nettoyer les salons orphelins si on a l'objet guild
            let channelsDeleted = 0;
            if (guild) {
                const cleanupResult = await matchSearch.verifyAndCleanupMatchChannels(guild);
                if (cleanupResult && cleanupResult.channelsDeleted) {
                    channelsDeleted = cleanupResult.channelsDeleted;
                }
            } else {
                console.warn(`⚠️ Objet guild non fourni, nettoyage des salons ignoré`);
            }
            
            if (repairedTeams > 0 || channelsDeleted > 0) {
                console.log(`✅ Réparation terminée pour guild ${guildId}: ${repairedTeams} équipe(s) + ${channelsDeleted} salon(s)`);
            } else {
                console.log(`✅ Aucune réparation nécessaire pour guild ${guildId}`);
            }
        } catch (error) {
            console.error('❌ Erreur lors de la réparation des états:', error);
        }
        
        // Démarrer le keep-alive permanent et le serveur de santé (une seule fois)
        if (!global.keepAliveStarted) {
            console.log('🔄 Démarrage du keep-alive robuste...');
            healthServer.start();
            robustKeepAlive.start();
            console.log('✅ Bot configuré pour rester actif H24 - Surveillance automatique');
            global.keepAliveStarted = true;
        }
        
    } catch (error) {
        console.error(`❌ Erreur lors de l'initialisation des managers pour ${guildId}:`, error);
    }
}

// Exposer la fonction globalement AVANT l'événement ready
global.initializeManagersForGuild = initializeManagersForGuild;

// Deploy slash commands
deployCommands();

// Vérification des limites de serveurs
function checkGuildLimits() {
    const config = require('./config');
    const guilds = client.guilds.cache;
    
    console.log(`🏰 Bot connecté à ${guilds.size} serveur(s) Discord`);
    
    // Vérifier la limite de serveurs
    if (config.maxGuilds && guilds.size > config.maxGuilds) {
        console.error(`❌ LIMITE DÉPASSÉE: Le bot est connecté à ${guilds.size} serveurs mais la limite est de ${config.maxGuilds}.`);
        console.error('⚠️  Ce bot est conçu pour un seul serveur à la fois pour éviter les conflits de données.');
        console.error('📋 Serveurs connectés:');
        guilds.forEach(guild => {
            console.error(`   - ${guild.name} (${guild.id})`);
        });
        console.error('🔧 Solution: Retirez le bot des serveurs supplémentaires ou configurez ALLOWED_GUILD_ID');
        
        // Optionnel: Quitter automatiquement les serveurs supplémentaires
        if (config.allowedGuildId) {
            guilds.forEach(async (guild) => {
                if (guild.id !== config.allowedGuildId) {
                    console.log(`🚪 Quittant automatiquement le serveur: ${guild.name} (${guild.id})`);
                    try {
                        await guild.leave();
                    } catch (error) {
                        console.error(`❌ Erreur en quittant ${guild.name}:`, error);
                    }
                }
            });
        }
    }
    
    // Vérifier le serveur autorisé spécifique
    if (config.allowedGuildId) {
        const allowedGuild = guilds.get(config.allowedGuildId);
        if (!allowedGuild) {
            console.error(`❌ ERREUR: Le bot n'est pas connecté au serveur autorisé (${config.allowedGuildId})`);
        } else {
            console.log(`✅ Bot correctement connecté au serveur autorisé: ${allowedGuild.name}`);
        }
    }
    
    // Afficher les serveurs actuels
    if (guilds.size > 0) {
        console.log('📋 Serveurs Discord connectés:');
        guilds.forEach(guild => {
            const isAllowed = !config.allowedGuildId || guild.id === config.allowedGuildId;
            const status = isAllowed ? '✅' : '⚠️';
            console.log(`   ${status} ${guild.name} (${guild.id}) - ${guild.memberCount} membres`);
        });
    }
}

async function syncAllRoles() {
    console.log('🔄 DÉBUT DE LA SYNCHRONISATION DES RÔLES');
    
    if (client.guilds.cache.size === 0) {
        console.log('Aucune guild disponible pour la synchronisation');
        return;
    }
    
    const guild = client.guilds.cache.first();
    const teamManager = require('./utils/teamManager');
    const teams = teamManager.getAllTeams(guild.id);
    
    if (teams.length === 0) {
        console.log('Aucune équipe à synchroniser');
        return;
    }
    
    console.log(`Synchronisation de ${teams.length} équipes...`);
    
    // Utiliser le gestionnaire centralisé pour le rôle Team Leader
    const { ensureTeamLeaderRole } = require('./utils/teamLeaderRoleManager');
    let leaderRole;
    try {
        leaderRole = await ensureTeamLeaderRole(guild);
    } catch (error) {
        console.error('❌ Erreur récupération rôle Team Leader:', error);
        return;
    }
    
    // Synchroniser chaque équipe
    for (const team of teams) {
        try {
            console.log(`Synchronisation équipe: ${team.name}`);
            
            // 1. Récupérer ou créer le rôle d'équipe
            const { getOrCreateTeamRole } = require('./utils/channelManager');
            const teamRole = await getOrCreateTeamRole(guild, team);
            
            if (!teamRole) {
                console.error(`❌ Impossible de créer/récupérer le rôle pour ${team.name}`);
                continue;
            }
            
            // 2. Synchroniser tous les membres de l'équipe
            for (const memberId of team.members) {
                try {
                    const member = await guild.members.fetch(memberId);
                    if (member) {
                        // Ajouter le rôle d'équipe s'il ne l'a pas
                        if (!member.roles.cache.has(teamRole.id)) {
                            await member.roles.add(teamRole);
                            console.log(`➕ Rôle d'équipe ajouté à ${member.user.username}`);
                        }
                        
                        // Gestion du rôle Team Leader avec le gestionnaire centralisé
                        const { assignTeamLeaderRole, removeTeamLeaderRole } = require('./utils/teamLeaderRoleManager');
                        
                        if (team.isLeader(memberId)) {
                            await assignTeamLeaderRole(member, guild);
                        } else if (member.roles.cache.has(leaderRole.id)) {
                            await removeTeamLeaderRole(member, guild);
                        }
                    }
                } catch (memberError) {
                    console.error(`❌ Erreur pour le membre ${memberId}:`, memberError);
                }
                
                // Pause pour éviter le rate limiting
                await new Promise(resolve => setTimeout(resolve, 200));
            }
            
            console.log(`✅ Équipe ${team.name} synchronisée`);
        } catch (error) {
            console.error(`❌ Erreur lors de la synchronisation de l'équipe ${team.name}:`, error);
        }
    }
    
    console.log('✅ Synchronisation des rôles terminée');
}

// Le chargement des données se fait maintenant dans initializeManagersForGuild()
// après que le guildId soit défini dans l'événement 'ready'

// VÉRIFICATION PÉRIODIQUE AUTOMATIQUE DES FESTIVALS EXPIRÉS
function startPeriodicFestivalCheck() {
    // Vérifier toutes les heures
    setInterval(async () => {
        try {
            if (!currentGuildId) return;
            
            const festival = await festivalManager.loadFestival(currentGuildId);
            if (!festival) return;
            
            // Utiliser la nouvelle fonction de nettoyage automatique
            const wasExpired = await festivalManager.checkAndCleanExpiredFestival(festival, client);
            
            if (wasExpired) {
                console.log('✅ Festival expiré détecté et nettoyé par vérification périodique');
            }
        } catch (error) {
            console.error('❌ Erreur lors de la vérification périodique du festival:', error);
        }
    }, 60 * 60 * 1000); // Toutes les heures
    
    console.log('✅ Vérification périodique des festivals activée (toutes les heures)');
}

// Gestionnaire d'arrêt propre
process.on('SIGINT', () => {
    console.log('🛑 Arrêt du bot détecté...');
    if (global.robustKeepAlive) {
        global.robustKeepAlive.stop();
    }
    if (global.healthServer) {
        global.healthServer.stop();
    }
    console.log('✅ Ressources nettoyées');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('🛑 Arrêt du bot détecté (SIGTERM)...');
    if (global.robustKeepAlive) {
        global.robustKeepAlive.stop();
    }
    if (global.healthServer) {
        global.healthServer.stop();
    }
    console.log('✅ Ressources nettoyées');
    process.exit(0);
});

// Fonction d'initialisation asynchrone
async function startBot() {
    console.log('🚀 Démarrage du bot Splat Festival...');
    
    // Tentative de connexion MongoDB
    console.log('🔗 Tentative de connexion à MongoDB...');
    const mongoConnected = await connectMongoDB();
    
    if (mongoConnected) {
        console.log('✅ MongoDB connecté - Persistance des données activée');
    } else {
        console.log('⚠️  MongoDB non disponible - Utilisation des fichiers JSON locaux');
        console.log('   Les données seront perdues à chaque redéploiement.');
    }
    
    // Connexion du client Discord
    await client.login(botToken);
}

// Démarrer le bot
startBot().catch(error => {
    console.error('❌ Erreur lors du démarrage du bot:', error);
    process.exit(1);
});