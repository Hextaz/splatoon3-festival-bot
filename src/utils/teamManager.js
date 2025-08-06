const Team = require('../models/Team');
const { createTeamChannel, updateTeamChannelPermissions, getOrCreateTeamRole } = require('./channelManager');
const { EmbedBuilder } = require('discord.js');
const fs = require('fs').promises;
const path = require('path');
// Remove direct import to avoid circular dependency
// const { getCurrentFestival } = require('./festivalManager');
const DataAdapter = require('./dataAdapter');

const teamsPath = path.join(__dirname, '../../data/teams.json');
let teams = [];
let currentGuildId = null;

// Helper pour obtenir le DataAdapter
function getDataAdapter(guildId = currentGuildId) {
    if (!guildId) {
        console.warn('Aucun guildId défini pour teamManager, utilisation JSON');
        return null;
    }
    return new DataAdapter(guildId);
}

// Définir le guildId actuel
function setCurrentGuildId(guildId) {
    currentGuildId = guildId;
}

// Fonction pour sauvegarder les équipes (MongoDB uniquement)
async function saveTeams() {
    try {
        const adapter = getDataAdapter();
        
        if (!adapter) {
            throw new Error('DataAdapter non disponible - Guild ID manquant');
        }

        // Vérifier s'il y a un festival actif - Si pas de festival, on est en cours de reset
        const { getCurrentFestival } = require('./festivalManager');
        const currentFestival = getCurrentFestival();
        
        if (!currentFestival) {
            console.log('💾 Pas de festival actif - Skip sauvegarde équipes (probablement en cours de reset)');
            return;
        }

        // Sauvegarder chaque équipe individuellement dans MongoDB
        console.log(`💾 Sauvegarde de ${teams.length} équipes avec DataAdapter`);
        for (const team of teams) {
            await adapter.saveTeam({
                name: team.name,
                leaderId: team.leader,
                members: team.members,
                camp: team.camp,
                isOpen: team.isOpen,
                accessCode: team.code,
                channelId: team.channelId,
                roleId: team.roleId,
                isSearching: team.busy || false,
                lastSearchTime: team.lastSearchTime,
                searchLockUntil: team.searchLockUntil
            });
        }
        console.log('✅ Équipes sauvegardées avec DataAdapter');
    } catch (error) {
        console.error('❌ ERREUR CRITIQUE lors de la sauvegarde des équipes:', error);
        throw error; // Propager l'erreur au lieu de faire un fallback
    }
}

// Fonction pour charger les équipes (MongoDB uniquement)
async function loadTeams() {
    try {
        if (!currentGuildId) {
            console.log('⚠️ Guild ID non défini, chargement différé des équipes');
            teams = [];
            return;
        }

        const adapter = getDataAdapter();
        
        if (!adapter) {
            throw new Error('DataAdapter non disponible - Guild ID manquant');
        }

        // Charger depuis MongoDB
        console.log('📥 Chargement des équipes avec DataAdapter');
        const teamsData = await adapter.getTeams();
        
        if (teamsData && Object.keys(teamsData).length > 0) {
            // Vérifier si on doit filtrer par festival actuel
            const { getCurrentFestival } = require('./festivalManager');
            const currentFestival = getCurrentFestival();
            
            // Convertir les données MongoDB en objets Team
            const allTeamsFromDB = Object.values(teamsData);
            let filteredTeams = allTeamsFromDB;
            
            // Si un festival est actif, ne charger que les équipes de ce festival
            if (currentFestival) {
                filteredTeams = allTeamsFromDB.filter(teamData => 
                    teamData.festivalId === currentFestival.id || 
                    !teamData.festivalId  // Garder les équipes sans festivalId pour compatibility
                );
                
                console.log(`🔍 Festival actuel: ${currentFestival.title}`);
                console.log(`📊 Équipes totales en base: ${allTeamsFromDB.length}`);
                console.log(`📊 Équipes pour ce festival: ${filteredTeams.length}`);
            }
            
            teams = filteredTeams.map(data => {
                const team = new Team(data.name, data.leaderId, data.camp, data.isOpen, data.accessCode);
                
                // Rétablir tous les membres (sauf le leader qui est déjà ajouté par le constructeur)
                data.members.forEach(memberId => {
                    if (memberId !== data.leaderId && !team.members.includes(memberId)) {
                        team.addMember(memberId);
                    }
                });
                
                // Rétablir les autres propriétés
                team.id = data.id;
                team.channelId = data.channelId;
                team.roleId = data.roleId;
                team.busy = data.isSearching || false;
                team.lastSearchTime = data.lastSearchTime;
                team.searchLockUntil = data.searchLockUntil;
                
                return team;
            });
            
            console.log(`✅ Équipes chargées avec DataAdapter. Total: ${teams.length}`);
        } else {
            teams = [];
            console.log('✅ Aucune équipe trouvée dans MongoDB');
        }
    } catch (error) {
        console.error('❌ ERREUR CRITIQUE lors du chargement des équipes:', error);
        teams = []; // Initialiser vide en cas d'erreur
        throw error; // Propager l'erreur au lieu de faire un fallback
    }
}

// Fonction pour supprimer toutes les équipes (utilisée lors du reset)
async function clearAllTeams() {
    try {
        console.log(`🔍 teamManager.clearAllTeams: currentGuildId = ${currentGuildId}`);
        
        const adapter = getDataAdapter();
        
        if (!adapter) {
            console.warn('❌ teamManager.clearAllTeams: DataAdapter non disponible - suppression des équipes en mémoire uniquement');
            teams.length = 0;
            return;
        }

        console.log(`🔍 teamManager.clearAllTeams: DataAdapter créé avec guildId ${currentGuildId}`);
        
        // Supprimer de la base de données
        await adapter.clearAllTeams();
        
        // Vider le tableau en mémoire
        const teamCountBefore = teams.length;
        teams.length = 0;
        
        console.log(`✅ teamManager.clearAllTeams: ${teamCountBefore} équipes supprimées en mémoire, base de données nettoyée`);
    } catch (error) {
        console.error('❌ Erreur lors de la suppression de toutes les équipes:', error);
        // En cas d'erreur, au moins vider la mémoire
        teams.length = 0;
        throw error;
    }
}

// Fonction pour créer une équipe
function createTeam(name, leaderId, camp, isOpen = true, code = null, guild = null) {
    // Vérifier si une équipe avec ce nom existe déjà
    if (teams.some(t => t.name.toLowerCase() === name.toLowerCase())) {
        throw new Error("Une équipe avec ce nom existe déjà.");
    }

    // Vérifier si l'utilisateur est déjà dans une équipe
    if (findTeamByMember(leaderId)) {
        throw new Error("Vous êtes déjà membre d'une équipe. Quittez-la d'abord.");
    }

    const team = new Team(name, leaderId, camp, isOpen, code);
    teams.push(team);
    
    // NOUVEAU : Créer les rôles et les attribuer immédiatement si guild est fourni
    if (guild) {
        // Opération asynchrone pour créer salon et rôles
        (async () => {
            try {
                // 1. Créer ou récupérer les rôles
                const teamRole = await getOrCreateTeamRole(guild, team);
                
                // 2. Créer ou récupérer le rôle Team Leader
                let leaderRole = guild.roles.cache.find(role => role.name === 'Team Leader');
                if (!leaderRole) {
                    leaderRole = await guild.roles.create({
                        name: 'Team Leader',
                        color: '#FFD700', // Or
                        permissions: [],
                        reason: 'Rôle pour les capitaines d\'équipe'
                    });
                    console.log('Rôle Team Leader créé');
                }
                
                // 3. Attribuer les rôles au leader
                const member = await guild.members.fetch(leaderId);
                if (member) {
                    if (teamRole) {
                        await member.roles.add(teamRole);
                        console.log(`Rôle d'équipe ${teamRole.name} attribué à ${member.user.username}`);
                    }
                    
                    if (leaderRole) {
                        await member.roles.add(leaderRole);
                        console.log(`Rôle Team Leader attribué à ${member.user.username}`);
                    }
                }
                
                // 4. Créer le salon d'équipe
                await createTeamChannel(guild, team);
                
                // 5. Sauvegarder avec les IDs de rôles mis à jour
                await saveTeams();
                
            } catch (error) {
                console.error(`Erreur lors de la configuration complète de l'équipe ${name}:`, error);
            }
        })();
    }
    // Note: Plus de sauvegarde automatique ici car elle se fait dans la partie async
    // Si pas de guild, l'équipe sera sauvée lors de la prochaine opération
    
    return team;
}

// Modifier toutes les autres fonctions pour sauvegarder après chaque modification
function joinTeam(teamName, userId, code = null, guild = null) {
    const team = findTeamByName(teamName);
    
    if (!team) {
        throw new Error("Équipe non trouvée.");
    }

    // Vérifier si l'utilisateur est déjà dans une équipe
    if (findTeamByMember(userId)) {
        throw new Error("Vous êtes déjà membre d'une équipe. Quittez-la d'abord.");
    }

    // Vérifier si l'équipe est fermée et le code est correct
    if (!team.isOpen && team.code !== code) {
        throw new Error("Code d'accès incorrect pour cette équipe.");
    }
    
    // Vérification selon le format du festival
    let maxSize = 4; // Valeur par défaut
    try {
        const { getCurrentFestival } = require('./festivalManager');
        const festival = getCurrentFestival();
        maxSize = festival?.teamSize || 4;
    } catch (error) {
        console.warn('Impossible de récupérer la taille d\'équipe du festival, utilisation de 4 par défaut');
    }
    const formatDisplay = `${maxSize}v${maxSize}`;
    
    if (team.members.length >= maxSize) {
        throw new Error(`Cette équipe est déjà complète (${maxSize} membres maximum pour le format ${formatDisplay}).`);
    }

    team.addMember(userId);
    
    // NOUVEAU : Attribuer automatiquement le rôle d'équipe si guild est fourni
    if (guild) {
        (async () => {
            try {
                // 1. Récupérer ou créer le rôle d'équipe
                const { getOrCreateTeamRole } = require('./channelManager');
                const teamRole = await getOrCreateTeamRole(guild, team);
                
                // 2. Attribuer le rôle au nouveau membre
                const member = await guild.members.fetch(userId);
                if (member && teamRole) {
                    await member.roles.add(teamRole);
                    console.log(`Rôle d'équipe ${teamRole.name} attribué à ${member.user.username}`);
                }
                
                // 3. Mettre à jour les permissions du salon d'équipe
                await updateTeamChannelPermissions(guild, team, userId);
                
            } catch (error) {
                console.error(`Erreur lors de l'attribution du rôle pour ${userId}:`, error);
            }
        })();
    }
    
    // Sauvegarder les changements
    saveTeams();
    
    return team;
}

function leaveTeam(userId, guild = null) {
    const team = findTeamByMember(userId);
    
    if (!team) {
        throw new Error("Vous n'êtes membre d'aucune équipe.");
    }

    // Vérifier si l'utilisateur était le leader
    const wasLeader = team.isLeader(userId);
    let newLeader = null;

    // Si c'est le leader qui quitte et qu'il y a d'autres membres
    if (wasLeader && team.members.length > 1) {
        // Promouvoir le prochain membre
        newLeader = team.members.find(m => m !== userId);
        team.leader = newLeader;
    }

    // Récupérer le username de l'utilisateur avant qu'il quitte
    let username = userId;
    if (guild) {
        try {
            const userObj = guild.client.users.cache.get(userId);
            if (userObj) {
                username = userObj.username;
            }
        } catch (e) {
            console.error("Erreur lors de la récupération du nom d'utilisateur:", e);
        }
    }

    // Sauvegarder l'ID du canal avant de retirer le membre (pour référence ultérieure)
    const channelId = team.channelId;
    const teamName = team.name;

    team.removeMember(userId);

    // Si l'équipe est vide après le départ, la supprimer
    if (team.isEmpty()) {
        console.log(`L'équipe ${teamName} est maintenant vide, suppression complète...`);
        
        const index = teams.indexOf(team);
        if (index > -1) {
            teams.splice(index, 1);
            console.log(`Équipe ${teamName} retirée du tableau d'équipes`);
        }
        
        // Supprimer le salon si guild est fourni
        if (guild && team.channelId) {
            console.log(`Tentative de suppression du salon pour l'équipe vide ${teamName}...`);
            
            // Utiliser directement la fonction de suppression au lieu d'appeler deleteTeamChannel
            try {
                // Obtenir le canal directement
                guild.channels.fetch(team.channelId)
                    .then(async (channel) => {
                        if (channel) {
                            // Envoyer un message d'avertissement
                            await channel.send("⚠️ Cette équipe est maintenant vide. Ce salon sera supprimé dans 10 secondes...")
                                .catch(e => console.error("Erreur lors de l'envoi du message de suppression:", e));
                            
                            // Attendre 10 secondes
                            setTimeout(async () => {
                                await channel.delete("Équipe vide - tous les membres ont quitté")
                                    .then(() => console.log(`Salon ${channel.name} supprimé avec succès`))
                                    .catch(e => console.error(`Erreur lors de la suppression du salon ${channel.name}:`, e));
                            }, 10000);
                        }
                    })
                    .catch(error => {
                        console.error(`Impossible de récupérer le salon ${team.channelId}:`, error);
                    });
            } catch (error) {
                console.error(`Erreur lors de la tentative de suppression du salon:`, error);
            }
        }
        
        // Supprimer également le rôle d'équipe s'il existe
        if (guild && team.roleId) {
            try {
                guild.roles.fetch(team.roleId)
                    .then(async (role) => {
                        if (role) {
                            await role.delete("Équipe vide - tous les membres ont quitté")
                                .then(() => console.log(`Rôle ${role.name} supprimé avec succès`))
                                .catch(e => console.error(`Erreur lors de la suppression du rôle ${role.name}:`, e));
                        }
                    })
                    .catch(error => {
                        console.error(`Impossible de récupérer le rôle ${team.roleId}:`, error);
                    });
            } catch (error) {
                console.error(`Erreur lors de la tentative de suppression du rôle:`, error);
            }
        }
        
        // Sauvegarder les changements
        saveTeams();
        
        return { team: { name: teamName, channelId: team.channelId }, removed: true, wasLeader, newLeader };
    }

    // Supprimer explicitement le rôle d'équipe du membre
    if (guild) {
        try {
            // Récupérer le membre
            guild.members.fetch(userId).then(member => {
                // Trouver et supprimer le rôle d'équipe
                const teamRole = guild.roles.cache.find(role => role.name === `Team ${team.name}`);
                if (teamRole && member.roles.cache.has(teamRole.id)) {
                    member.roles.remove(teamRole).catch(err => 
                        console.error(`Erreur lors de la suppression du rôle d'équipe pour ${userId}:`, err)
                    );
                }
                
                // Supprimer aussi le rôle de leader si nécessaire
                if (wasLeader) {
                    const leaderRole = guild.roles.cache.find(role => role.name === 'Team Leader');
                    if (leaderRole && member.roles.cache.has(leaderRole.id)) {
                        member.roles.remove(leaderRole).catch(err => 
                            console.error(`Erreur lors de la suppression du rôle de leader pour ${userId}:`, err)
                        );
                    }
                }
            }).catch(error => {
                console.error(`Impossible de récupérer le membre ${userId}:`, error);
            });
        } catch (error) {
            console.error(`Erreur lors de la suppression des rôles pour ${userId}:`, error);
        }
        
        // Notifier l'équipe dans le salon d'équipe
        if (team.channelId) {
            try {
                const channel = guild.channels.cache.get(team.channelId);
                if (channel) {
                    const embed = new EmbedBuilder()
                        .setColor('#FF6347') // Tomate rouge
                        .setTitle('Un membre a quitté l\'équipe')
                        .setDescription(`**${username}** a quitté l'équipe ${team.name}.`)
                        .addFields(
                            { name: 'Membres restants', value: `L'équipe compte maintenant ${team.members.length} membre(s).` }
                        )
                        .setTimestamp();
                    
                    // Si un nouveau leader a été désigné
                    if (wasLeader && newLeader) {
                        const newLeaderUser = guild.client.users.cache.get(newLeader);
                        const newLeaderName = newLeaderUser ? newLeaderUser.username : newLeader;
                        
                        embed.addFields(
                            { name: 'Nouveau leader', value: `**${newLeaderName}** est maintenant le leader de l'équipe.` }
                        );
                    }
                    
                    channel.send({ embeds: [embed] });
                }
            } catch (error) {
                console.error(`Erreur lors de la notification dans le salon d'équipe:`, error);
            }
        }
    }
    
    // Mettre à jour les permissions du salon si guild est fourni
    if (guild) {
        updateTeamChannelPermissions(guild, team).catch(error => {
            console.error(`Erreur lors de la mise à jour des permissions du salon pour l'équipe ${team.name}:`, error);
        });
    }
    
    // Sauvegarder les changements
    saveTeams();
    
    return { team, removed: false, wasLeader, newLeader };
}

function kickMember(leaderId, memberId, guild = null) {
    const team = findTeamByMember(leaderId);
    
    if (!team) {
        throw new Error("Vous n'êtes membre d'aucune équipe.");
    }

    if (!team.isLeader(leaderId)) {
        throw new Error("Seul le chef d'équipe peut expulser des membres.");
    }

    if (!team.isMember(memberId)) {
        throw new Error("Cette personne n'est pas membre de votre équipe.");
    }

    if (memberId === leaderId) {
        throw new Error("Vous ne pouvez pas vous expulser vous-même. Utilisez la commande /leave-team.");
    }

    // Récupérer le username du membre avant de l'expulser
    let kickedUsername = memberId;
    if (guild) {
        try {
            const kickedUser = guild.client.users.cache.get(memberId);
            if (kickedUser) {
                kickedUsername = kickedUser.username;
            }
        } catch (e) {
            console.error("Erreur lors de la récupération du nom d'utilisateur:", e);
        }
    }

    team.removeMember(memberId);
    
    // Mettre à jour les permissions du salon si guild est fourni
    if (guild) {
        updateTeamChannelPermissions(guild, team).catch(error => {
            console.error(`Erreur lors de la mise à jour des permissions du salon pour l'équipe ${team.name}:`, error);
        });
        
        // Ajouter la notification dans le salon d'équipe
        if (team.channelId) {
            try {
                const channel = guild.channels.cache.get(team.channelId);
                if (channel) {
                    const embed = new EmbedBuilder()
                        .setColor('#FF0000') // Rouge plus vif pour expulsion
                        .setTitle('Un membre a été expulsé')
                        .setDescription(`**${kickedUsername}** a été expulsé de l'équipe ${team.name}.`)
                        .addFields(
                            { name: 'Membres restants', value: `L'équipe compte maintenant ${team.members.length} membre(s).` }
                        )
                        .setTimestamp();
                    
                    channel.send({ embeds: [embed] });
                }
            } catch (error) {
                console.error(`Erreur lors de la notification d'expulsion dans le salon d'équipe:`, error);
            }
        }
    }
    
    // Sauvegarder les changements
    saveTeams();
    
    return team;
}

// Fonction pour trouver une équipe par son nom
function findTeamByName(name) {
    if (!name) return null;
    return teams.find(team => team.name.toLowerCase() === name.toLowerCase());
}

// Fonction pour trouver une équipe dont un utilisateur est membre
function findTeamByMember(userId) {
    if (!userId) return null;
    return teams.find(team => team.members.includes(userId));
}

// Fonction pour obtenir toutes les équipes
function getAllTeams() {
    return teams;
}

// Fonction pour générer un code d'équipe aléatoire
function generateTeamCode() {
    return Math.floor(1000 + Math.random() * 9000).toString(); // Code à 4 chiffres
}

// Fonction pour vider complètement toutes les équipes
async function clearAllTeams() {
    teams.length = 0;
    await saveTeams();
    console.log('Toutes les équipes ont été supprimées');
    return true;
}

// Dans src/utils/teamManager.js, modifiez la fonction isTeamComplete:

function isTeamComplete(team) {
    if (!team || !team.members || !Array.isArray(team.members)) {
        return false;
    }
    
    try {
        const { getCurrentFestival } = require('./festivalManager');
        const festival = getCurrentFestival();
        const requiredSize = festival?.teamSize || 4;
        return team.members.length >= requiredSize;
    } catch (error) {
        return team.members.length >= 4;
    }
}

// Ajouter cette fonction dans teamManager.js

function cleanupCorruptedTeams() {
    const originalLength = teams.length;
    
    // Filtrer les équipes corrompues
    teams = teams.filter(team => {
        if (!team) {
            console.error('Équipe undefined supprimée');
            return false;
        }
        
        if (!team.name) {
            console.error('Équipe sans nom supprimée:', team);
            return false;
        }
        
        if (!team.members) {
            console.error(`Équipe ${team.name} sans membres supprimée`);
            return false;
        }
        
        if (!Array.isArray(team.members)) {
            console.error(`Équipe ${team.name} avec members non-array supprimée:`, typeof team.members);
            return false;
        }
        
        return true;
    });
    
    if (teams.length !== originalLength) {
        console.log(`${originalLength - teams.length} équipes corrompues supprimées`);
        saveTeams(); // Sauvegarder après nettoyage
    }
    
    return teams.length !== originalLength;
}

// Ajouter à l'export
module.exports = {
    createTeam,
    joinTeam,
    leaveTeam,
    kickMember,
    findTeamByName,
    findTeamByMember,
    getAllTeams,
    generateTeamCode,
    loadTeams,
    saveTeams,
    clearAllTeams,
    isTeamComplete,
    cleanupCorruptedTeams,
    setCurrentGuildId,
    teams
};