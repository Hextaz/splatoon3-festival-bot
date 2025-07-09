require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client, Collection, GatewayIntentBits } = require('discord.js');
const { botToken } = require('./config');
const deployCommands = require('./deploy-commands');
const interactionCreateEvent = require('./events/interactionCreate');
const readyEvent = require('./events/ready');
const festivalManager = require('./utils/festivalManager');
const teamManager = require('./utils/teamManager');
const scoreTracker = require('./utils/scoreTracker');
const { SmartSleepManager } = require('./utils/smartSleep');
const { HealthServer } = require('./utils/healthServer');

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

// Initialiser le système de veille intelligente et le serveur de santé
const smartSleepManager = new SmartSleepManager();
const healthServer = new HealthServer();

// Rendre les instances disponibles globalement
global.smartSleepManager = smartSleepManager;
global.healthServer = healthServer;

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
});

client.on('interactionCreate', interaction => {
    interactionCreateEvent.execute(interaction);
});

client.tempTeamData = {};

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

// Chargement des données au démarrage
async function loadAllData() {
    try {
        // Charger les données du festival
        const festival = await festivalManager.loadFestival();

        // NOUVELLE VÉRIFICATION COMPLÈTE DU STATUT DU FESTIVAL
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
            
            // NOUVEAU : Déterminer l'état exact
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
            
            // CAS 1: Festival terminé (fin < maintenant)
            if (endDate < now) {
                console.log('🏁 FESTIVAL TERMINÉ DÉTECTÉ au démarrage');
                
                if (festival.isActive) {
                    console.log('⚠️ Festival encore marqué comme actif, désactivation...');
                    festival.deactivate();
                    await festivalManager.saveFestival(festival);
                }
                
                // Envoyer l'annonce de fin si le bot était éteint pendant la fin
                if (client.guilds.cache.size > 0) {
                    const guild = client.guilds.cache.first();
                    try {
                        const channel = await guild.channels.fetch(festival.announcementChannelId);
                        if (channel) {
                            const config = await require('./commands/config').loadConfig();
                            const mentionText = config.announcementRoleId ? 
                                `<@&${config.announcementRoleId}> ` : '';
                            

                            const endEmbed = festivalManager.createEndEmbed(festival);
                            await channel.send({
                                content: `${mentionText}🏁 **LE FESTIVAL "${festival.title}" EST TERMINÉ !** 🏁`,
                                embeds: [endEmbed]
                            });
                            
                            console.log('✅ Annonce de fin envoyée (rattrapage)');
                        }
                    } catch (error) {
                        console.error('❌ Erreur envoi annonce fin rattrapage:', error);
                    }
                }
                
                // Programmer le nettoyage complet dans 30 secondes
                console.log('⏰ Programmation du nettoyage dans 30 secondes...');
                setTimeout(async () => {
                    console.log('🧹 DÉBUT DU NETTOYAGE AUTOMATIQUE');
                    const guild = client.guilds.cache.size > 0 ? client.guilds.cache.first() : null;
                    
                    await festivalManager.resetFestivalData(guild);
                    const teamManager = require('./utils/teamManager');
                    await teamManager.clearAllTeams();
                    await festivalManager.deleteFestival();
                    
                    console.log('✅ Festival terminé nettoyé automatiquement');
                }, 30000);
            }
            // CAS 2: Festival en cours (début < maintenant < fin)
            else if (now >= startDate && now <= endDate) {
                if (!festival.isActive) {
                    console.log('🎉 AUTO-ACTIVATION du festival en cours');
                    festival.activate();
                    await festivalManager.saveFestival(festival);
                    
                    // Envoyer l'annonce de début si le bot était éteint pendant le début
                    if (client.guilds.cache.size > 0) {
                        const guild = client.guilds.cache.first();
                        try {
                            const channel = await guild.channels.fetch(festival.announcementChannelId);
                            if (channel) {
                                const config = await require('./commands/config').loadConfig();
                                const mentionText = config.announcementRoleId ? 
                                    `<@&${config.announcementRoleId}> ` : '';
                                
                                const startEmbed = festivalManager.createStartEmbed(festival);
                                await channel.send({
                                    content: `${mentionText}🎉 **LE FESTIVAL COMMENCE MAINTENANT !** 🎉`,
                                    embeds: [startEmbed]
                                });
                                
                                console.log('✅ Annonce de début envoyée (rattrapage)');
                            }
                        } catch (error) {
                            console.error('❌ Erreur envoi annonce début rattrapage:', error);
                        }
                    }
                }
                
                // Programmer la désactivation pour la fin
                festivalManager.scheduleActivation(festival, client);
            }
            // CAS 3: Festival futur (début > maintenant)
            else if (startDate > now) {
                console.log('📅 Festival futur, programmation normale');
                festivalManager.scheduleActivation(festival, client);
            }
            
            console.log('=== FIN VÉRIFICATION STATUT FESTIVAL ===');
        }

        // Charger les autres données
        await teamManager.loadTeams();
        teamManager.cleanupCorruptedTeams();

        // Charger l'historique des matchs
        const matchHistoryManager = require('./utils/matchHistoryManager');
        await matchHistoryManager.loadMatchHistory();
        console.log('✅ Historique des matchs chargé');
        
        // Vérifier et nettoyer les salons de match
        const { verifyAndCleanupMatchChannels } = require('./utils/matchSearch');
        if (client.guilds.cache.size > 0) {
            const guild = client.guilds.cache.first();
            try {
                const cleanupResult = await verifyAndCleanupMatchChannels(guild);
                if (cleanupResult) {
                    console.log('✅ Vérification des salons de match terminée');
                }
            } catch (error) {
                console.error('❌ Erreur lors de la vérification des salons de match:', error);
            }
        }
        
        const { loadVotes } = require('./utils/vote');
        await loadVotes();
        await scoreTracker.loadScores();

        // Vérification et synchronisation des équipes existantes
        const verifyTeamsAndRoles = async (guild) => {
            try {
                const teams = teamManager.getAllTeams();
                
                if (teams.length > 0) {
                    console.log(`${teams.length} équipes trouvées au démarrage, vérification...`);
                    
                    const festival = festivalManager.getCurrentFestival();
                    
                    if (festival) {
                        // FESTIVAL EXISTE (peu importe s'il est actif ou non)
                        if (festival.isActive) {
                            console.log('✅ Festival actif trouvé, synchronisation des rôles...');
                            await syncAllRoles();
                        } else {
                            const now = new Date();
                            const startDate = new Date(festival.startDate);
                            const endDate = new Date(festival.endDate);
                            
                            if (endDate < now) {
                                // Festival réellement terminé
                                console.log('❌ Festival terminé détecté, nettoyage des équipes...');
                                await festivalManager.resetFestivalData(guild);
                                await teamManager.clearAllTeams();
                                console.log('✅ Nettoyage forcé terminé');
                            } else if (startDate > now) {
                                // Festival futur - GARDER LES ÉQUIPES
                                console.log('📅 Festival futur détecté, conservation des équipes existantes');
                                console.log('🔄 Synchronisation des rôles pour les équipes existantes...');
                                await syncAllRoles();
                                console.log('✅ Équipes conservées et rôles synchronisés');
                            } else {
                                // Festival en cours mais pas activé
                                console.log('🎉 Festival en cours mais pas activé, synchronisation...');
                                await syncAllRoles();
                            }
                        }
                    } else {
                        // AUCUN FESTIVAL N'EXISTE
                        console.log('❌ Aucun festival trouvé mais des équipes existent');
                        
                        // Vérifier si les équipes ont encore leurs membres avec les bons rôles
                        let teamsWithValidMembers = 0;
                        let emptyTeams = 0;
                        
                        for (const team of teams) {
                            if (team.members && team.members.length > 0) {
                                const teamRole = guild.roles.cache.find(role => role.name === `Team ${team.name}`);
                                let membersWithRole = 0;
                                
                                if (teamRole) {
                                    for (const memberId of team.members) {
                                        try {
                                            const member = await guild.members.fetch(memberId);
                                            if (member && member.roles.cache.has(teamRole.id)) {
                                                membersWithRole++;
                                            }
                                        } catch (error) {
                                            console.log(`Membre ${memberId} non trouvé dans la guild`);
                                        }
                                    }
                                }
                                
                                if (membersWithRole > 0) {
                                    teamsWithValidMembers++;
                                } else {
                                    emptyTeams++;
                                }
                            } else {
                                emptyTeams++;
                            }
                        }
                        
                        if (teamsWithValidMembers === 0) {
                            console.log('🧹 Aucun festival et aucune équipe valide, nettoyage complet...');
                            await festivalManager.resetFestivalData(guild);
                            await teamManager.clearAllTeams();
                            console.log('✅ Nettoyage forcé terminé');
                        } else {
                            console.log('⚠️ Équipes valides trouvées sans festival, conservation temporaire...');
                            console.log('🔄 Synchronisation des rôles...');
                            await syncAllRoles();
                            console.log('✅ Équipes conservées temporairement');
                        }
                    }
                } else {
                    console.log('📝 Aucune équipe trouvée au démarrage');
                }
            } catch (error) {
                console.error('❌ Erreur lors de la vérification des équipes au démarrage:', error);
            }
        };

        if (client.guilds.cache.size > 0) {
            const guild = client.guilds.cache.first();
            await verifyTeamsAndRoles(guild);
        }
        
        console.log('✅ Toutes les données chargées avec succès');
        
        // Démarrer le système de veille intelligente
        console.log('🛡️ Démarrage du système de veille intelligente...');
        healthServer.start();
        smartSleepManager.start();
        console.log('✅ Système de veille intelligente démarré');
        
    } catch (error) {
        console.error('❌ Erreur lors du chargement des données:', error);
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
    const teams = teamManager.getAllTeams();
    
    if (teams.length === 0) {
        console.log('Aucune équipe à synchroniser');
        return;
    }
    
    console.log(`Synchronisation de ${teams.length} équipes...`);
    
    // Récupérer ou créer le rôle Team Leader
    let leaderRole = guild.roles.cache.find(role => role.name === 'Team Leader');
    if (!leaderRole) {
        try {
            leaderRole = await guild.roles.create({
                name: 'Team Leader',
                color: '#FFD700',
                permissions: [],
                reason: 'Création du rôle Team Leader au redémarrage'
            });
            console.log('✅ Rôle Team Leader créé');
        } catch (error) {
            console.error('❌ Erreur création rôle Team Leader:', error);
        }
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
                        
                        // Ajouter le rôle de leader si c'est le capitaine
                        if (team.isLeader(memberId) && leaderRole && !member.roles.cache.has(leaderRole.id)) {
                            await member.roles.add(leaderRole);
                            console.log(`👑 Rôle Team Leader ajouté à ${member.user.username}`);
                        }
                        
                        // Retirer le rôle de leader si ce n'est plus le capitaine
                        if (!team.isLeader(memberId) && leaderRole && member.roles.cache.has(leaderRole.id)) {
                            await member.roles.remove(leaderRole);
                            console.log(`👑 Rôle Team Leader retiré de ${member.user.username}`);
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

// Démarrer le chargement des données
loadAllData();

// Gestionnaire d'arrêt propre
process.on('SIGINT', () => {
    console.log('🛑 Arrêt du bot détecté...');
    if (global.smartSleepManager) {
        global.smartSleepManager.stop();
    }
    if (global.healthServer) {
        global.healthServer.stop();
    }
    console.log('✅ Ressources nettoyées');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('🛑 Arrêt du bot détecté (SIGTERM)...');
    if (global.smartSleepManager) {
        global.smartSleepManager.stop();
    }
    if (global.healthServer) {
        global.healthServer.stop();
    }
    console.log('✅ Ressources nettoyées');
    process.exit(0);
});

// Connexion du client Discord
client.login(botToken);