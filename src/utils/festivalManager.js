const fs = require('fs').promises;
const path = require('path');
const Festival = require('../models/Festival');
const { teams, leaveTeam } = require('./teamManager');
const scoreTracker = require('./scoreTracker');
const scheduler = require('node-schedule');
const { ChannelType } = require('discord.js');
const { loadConfig } = require('../commands/config');

// Chemin vers le fichier où les données du festival sont stockées
const festivalsPath = path.join(__dirname, '../../data/festivals.json');

// Singleton pour gérer le festival actif
let currentFestival = null;
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

// Charger le festival depuis le fichier
async function loadFestival() {
    try {
        const data = await fs.readFile(festivalsPath, 'utf8');
        const festivalData = JSON.parse(data);
        
        console.log('Données du festival chargées depuis le fichier:', festivalData); // Debug
        
        const festival = Festival.fromJSON(festivalData);
        currentFestival = festival;
        
        return festival;
    } catch (error) {
        if (error.code !== 'ENOENT') {
            console.error('Erreur lors du chargement du festival:', error);
        }
        return null;
    }
}

// Sauvegarder le festival dans le fichier
async function saveFestival(festival) {
    try {
        const jsonData = JSON.stringify(festival.toJSON(), null, 2);
        
        await fs.writeFile(festivalsPath, jsonData, 'utf8');
    } catch (error) {
        console.error('Erreur lors de la sauvegarde du festival:', error);
        throw error;
    }
}

// Créer un nouveau festival
async function createFestival(title, campNames, startDate, endDate, announcementChannelId, guild = null, options = {}) {
    const festival = new Festival(title, campNames, startDate, endDate, announcementChannelId, options);
    
    currentFestival = festival;
    await saveFestival(festival);
    
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

async function verifyFestivalStatus() {
    const festival = getCurrentFestival();
    if (!festival) return;
    
    const now = new Date();
    const startDate = new Date(festival.startDate);
    const endDate = new Date(festival.endDate);
    
    // Si le festival devrait être actif mais ne l'est pas
    if (now >= startDate && now <= endDate && !festival.isActive) {
        console.log('Festival devrait être actif, activation...');
        festival.activate();
        await saveFestival(festival);
    }
    
    // Si le festival est actif mais devrait être terminé
    if (now > endDate && festival.isActive) {
        festival.deactivate();
        await saveFestival(festival);
    }
}

// Réinitialiser les données (équipes, scores, etc.)
async function resetFestivalData(guild = null) {
    
    // Vérifier si la guild est fournie
    if (!guild) {
        console.warn('Aucune guild fournie, impossible de gérer les rôles des membres');
    }
    
    const { teams, saveTeams } = require('./teamManager');
    const scoreTracker = require('./scoreTracker');

    // Réinitialiser l'historique des matchs
    const matchHistoryManager = require('./matchHistoryManager');
    await matchHistoryManager.resetHistory();
    console.log('Historique des matchs réinitialisé');
    
    // Vérification des équipes disponibles
    console.log(`Nombre d'équipes à nettoyer: ${teams.length}`);
    
    // Faire quitter tous les membres de leurs équipes actuelles
    const allTeams = [...teams]; // Copie du tableau pour éviter les problèmes d'itération
    
    if (allTeams.length > 0 && guild) {
        
        // Récupérer le rôle de leader une fois pour toute
        const leaderRole = guild.roles.cache.find(role => role.name === 'Team Leader');
        
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
    
    // Vider le tableau d'équipes
    teams.length = 0;
    // Sauvegarder l'état vide dans le fichier
    await saveTeams();
    console.log(`Équipes complètement vidées et sauvegardées`);

    // Réinitialiser également la file d'attente de recherche de match
    const matchSearch = require('./matchSearch');
    matchSearch.resetSearchQueue();
    console.log('File d\'attente de recherche réinitialisée');

    // Réinitialiser les scores
    scoreTracker.scores = {
        camp1: 0,
        camp2: 0,
        camp3: 0
    };
    // Réinitialiser également l'historique des matchs
    scoreTracker.matchHistory = [];
    await scoreTracker.saveScores();
    console.log('Scores et historique des matchs réinitialisés et sauvegardés');

    // Réinitialiser les votes
    const { resetVotes } = require('./vote');
    await resetVotes();
    console.log('Votes réinitialisés et sauvegardés');
    
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

        // NOUVEAU : Nettoyer le rôle Team Leader de tous les membres
        try {
            console.log('Nettoyage du rôle Team Leader...');
            const leaderRole = guild.roles.cache.find(role => role.name === 'Team Leader');
            
            if (leaderRole) {
                // Retirer le rôle de tous les membres qui l'ont
                const membersWithLeaderRole = guild.members.cache.filter(member => 
                    member.roles.cache.has(leaderRole.id)
                );
                
                console.log(`Membres avec le rôle Team Leader trouvés: ${membersWithLeaderRole.size}`);
                
                for (const [memberId, member] of membersWithLeaderRole) {
                    try {
                        await member.roles.remove(leaderRole);
                        console.log(`Rôle Team Leader retiré du membre ${member.user.username} (${memberId})`);
                    } catch (e) {
                        console.error(`Erreur lors du retrait du rôle Team Leader pour ${memberId}:`, e);
                    }
                    
                    // Petite pause
                    await new Promise(resolve => setTimeout(resolve, 200));
                }
                
                // Option 1: Supprimer complètement le rôle Team Leader
                try {
                    await leaderRole.delete('Fin du festival - suppression du rôle Team Leader');
                    console.log('Rôle Team Leader supprimé complètement');
                } catch (e) {
                    console.error('Erreur lors de la suppression du rôle Team Leader:', e);
                }
            } else {
                console.log('Aucun rôle Team Leader trouvé');
            }
        } catch (error) {
            console.error('Erreur lors du nettoyage du rôle Team Leader:', error);
        }
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
function createEndEmbed(festival) {
    const { EmbedBuilder } = require('discord.js');
    
    // Récupérer les scores finaux
    const scoreTracker = require('./scoreTracker');
    const scores = scoreTracker.getCurrentScores();
    const percentages = scoreTracker.getScoresAsPercentages();
    const totalPoints = scores.camp1 + scores.camp2 + scores.camp3;
    const totalMatches = scoreTracker.getMatchHistory().length;
    
    // Déterminer le gagnant
    const winningCamp = scoreTracker.getWinningCamp();
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
async function deleteFestival() {
    try {
        // Vidage de la variable festival
        currentFestival = null;
        
        // Si le fichier existe, le supprimer
        await fs.unlink(festivalsPath).catch((err) => {
            // Ignorer l'erreur si le fichier n'existe pas
            if (err.code !== 'ENOENT') {
                throw err;
            }
        });
        
        // 🛡️ Déclencher une vérification immédiate du système de veille intelligente
        if (global.smartSleepManager) {
            console.log('🛡️ Déclenchement vérification veille intelligente (suppression festival)...');
            global.smartSleepManager.checkFestivalState();
        }
        
        console.log('Festival supprimé avec succès');
        return true;
    } catch (error) {
        console.error('Erreur lors de la suppression du festival:', error);
        return false;
    }
}

let activationTimeout = null;
let deactivationTimeout = null;
let halfwayTimeout = null;

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
        // Déclencher la fin immédiatement
        setTimeout(() => {
            deactivateFestivalNow(festival, client);
        }, 1000); // Petit délai pour éviter les conflits
    }
    
    console.log('=== FIN PROGRAMMATION ACTIVATION FESTIVAL ===');
}

async function activateFestivalNow(festival, client) {
    try {
        console.log('🎉 ACTIVATION DU FESTIVAL EN COURS...');
        
        // Activer le festival
        festival.activate();
        await saveFestival(festival);
        
        // 🛡️ Déclencher une vérification immédiate du système de veille intelligente
        if (global.smartSleepManager) {
            console.log('🛡️ Déclenchement vérification veille intelligente (activation festival)...');
            global.smartSleepManager.checkFestivalState();
        }
        
        // Envoyer l'annonce de début
        if (client.guilds.cache.size > 0) {
            const guild = client.guilds.cache.first();
            try {
                const channel = await guild.channels.fetch(festival.announcementChannelId);
                if (channel) {
                    const config = await require('../commands/config').loadConfig();
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
        }
        
    } catch (error) {
        console.error('❌ Erreur lors de l\'activation du festival:', error);
    }
}

async function deactivateFestivalNow(festival, client) {
    try {
        console.log('🏁 DÉSACTIVATION DU FESTIVAL EN COURS...');
        
        // Désactiver le festival
        festival.deactivate();
        await saveFestival(festival);
        
        // 🛡️ Déclencher une vérification immédiate du système de veille intelligente
        if (global.smartSleepManager) {
            console.log('🛡️ Déclenchement vérification veille intelligente (désactivation festival)...');
            global.smartSleepManager.checkFestivalState();
        }
        
        // Envoyer l'annonce de fin
        if (client.guilds.cache.size > 0) {
            const guild = client.guilds.cache.first();
            try {
                const channel = await guild.channels.fetch(festival.announcementChannelId);
                if (channel) {
                    const config = await require('../commands/config').loadConfig();
                    const mentionText = config.announcementRoleId ? 
                        `<@&${config.announcementRoleId}> ` : '';
                    
                    const endEmbed = createEndEmbed(festival);
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
            }
            
            // NOUVEAU : Programmer le nettoyage automatique dans 30 secondes
            console.log('⏰ Programmation du nettoyage automatique dans 30 secondes...');
            setTimeout(async () => {
                console.log('🧹 DÉBUT DU NETTOYAGE AUTOMATIQUE DE FIN DE FESTIVAL');
                
                try {
                    // Nettoyage complet
                    await resetFestivalData(guild);
                    
                    // S'assurer que le système d'équipes est bien nettoyé
                    const teamManager = require('./teamManager');
                    await teamManager.clearAllTeams();
                    
                    // Supprimer complètement le festival
                    await deleteFestival();
                    
                    console.log('✅ Festival automatiquement nettoyé avec succès');
                    
                    // Optionnel : Envoyer une confirmation finale
                    try {
                        const channel = await guild.channels.fetch(festival.announcementChannelId);
                        if (channel) {
                            await channel.send("✅ **Nettoyage terminé.** Toutes les équipes et données du festival ont été supprimées. Merci à tous les participants !");
                        }
                    } catch (error) {
                        console.error('Erreur envoi confirmation finale:', error);
                    }
                    
                } catch (error) {
                    console.error('❌ ERREUR lors du nettoyage automatique:', error);
                    
                    // En cas d'erreur, essayer de notifier
                    try {
                        const channel = await guild.channels.fetch(festival.announcementChannelId);
                        if (channel) {
                            await channel.send("❌ **Erreur lors du nettoyage automatique.** Un administrateur doit utiliser `/end-festival` pour nettoyer manuellement.");
                        }
                    } catch (notifyError) {
                        console.error('Erreur notification échec:', notifyError);
                    }
                }
            }, 30000); // 30 secondes
        }
        
    } catch (error) {
        console.error('❌ Erreur lors de la désactivation du festival:', error);
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
                const config = await require('../commands/config').loadConfig();
                const mentionText = config.announcementRoleId ? 
                    `<@&${config.announcementRoleId}> ` : '';
                
                // Récupérer les scores actuels
                const scoreTracker = require('./scoreTracker');
                const scores = scoreTracker.getCurrentScores();
                const percentages = scoreTracker.getScoresAsPercentages();
                const totalPoints = scores.camp1 + scores.camp2 + scores.camp3;
                const totalMatches = scoreTracker.getMatchHistory().length;
                
                // Déterminer le camp en tête
                const winningCamp = scoreTracker.getWinningCamp();
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
    getCurrentFestival: () => currentFestival,
    loadFestival,
    createFestival,
    resetFestivalData,
    saveFestival,
    deleteFestival,
    createStartEmbed,
    createEndEmbed,
    createPrepEmbed,
    scheduleActivation,
    activateFestivalNow,
    deactivateFestivalNow,
    sendHalfwayAnnouncement,
    getFestivalStatus  // ← AJOUTER
};