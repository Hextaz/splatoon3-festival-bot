const Team = require('../models/Team');
const { createTeamChannel, updateTeamChannelPermissions, getOrCreateTeamRole } = require('./channelManager');
const { EmbedBuilder } = require('discord.js');
const fs = require('fs').promises;
const path = require('path');
// Remove direct import to avoid circular dependency
// const { getCurrentFestival } = require('./festivalManager');
const DataAdapter = require('./dataAdapter');

const teamsPath = path.join(__dirname, '../../data/teams.json');

// Maps pour gÃ©rer les Ã©quipes par guild
const teamsByGuild = new Map(); // guildId -> teams[]

// Helper pour obtenir le DataAdapter
function getDataAdapter(guildId) {
    if (!guildId) {
        console.warn('Aucun guildId dÃ©fini pour teamManager, utilisation JSON');
        return null;
    }
    return new DataAdapter(guildId);
}

// Helper pour obtenir les Ã©quipes d'une guild spÃ©cifique
function getTeamsForGuild(guildId) {
    if (!guildId) return [];
    return teamsByGuild.get(guildId) || [];
}

// Helper pour dÃ©finir les Ã©quipes d'une guild
function setTeamsForGuild(teams, guildId) {
    if (!guildId) return;
    if (Array.isArray(teams)) {
        teamsByGuild.set(guildId, teams);
    } else {
        teamsByGuild.delete(guildId);
    }
}

// Fonction pour sauvegarder les Ã©quipes (MongoDB uniquement)
async function saveTeams(guildId) {
    try {
        const adapter = getDataAdapter(guildId);
        
        if (!adapter) {
            throw new Error('DataAdapter non disponible - Guild ID manquant');
        }

        // VÃ©rifier s'il y a un festival actif - Si pas de festival, on est en cours de reset
        const { getCurrentFestival } = require('./festivalManager');
        const currentFestival = getCurrentFestival(guildId);
        
        if (!currentFestival) {
            console.log('ðŸ’¾ Pas de festival actif - Skip sauvegarde Ã©quipes (probablement en cours de reset)');
            return;
        }

        // Sauvegarder chaque Ã©quipe individuellement dans MongoDB
        const teams = getTeamsForGuild(guildId);
        console.log(`ðŸ’¾ Sauvegarde de ${teams.length} Ã©quipes avec DataAdapter`);
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
                searchLockUntil: team.searchLockUntil,
                festivalId: team.festivalId
            });
        }
        console.log('âœ… Ã‰quipes sauvegardÃ©es avec DataAdapter');
    } catch (error) {
        console.error('âŒ ERREUR CRITIQUE lors de la sauvegarde des Ã©quipes:', error);
        throw error; // Propager l'erreur au lieu de faire un fallback
    }
}

// Fonction pour charger les Ã©quipes (MongoDB uniquement)
async function loadTeams(guildId) {
    try {
        if (!guildId) {
            console.log('âš ï¸ Guild ID non dÃ©fini, chargement diffÃ©rÃ© des Ã©quipes');
            setTeamsForGuild([], guildId || 'default');
            return;
        }

        const adapter = getDataAdapter(guildId);
        
        if (!adapter) {
            throw new Error('DataAdapter non disponible - Guild ID manquant');
        }

        // Charger depuis MongoDB
        console.log('ðŸ“¥ Chargement des Ã©quipes avec DataAdapter');
        const teamsData = await adapter.getTeams();
        
        if (teamsData && Object.keys(teamsData).length > 0) {
            // VÃ©rifier si on doit filtrer par festival actuel
            const { getCurrentFestival } = require('./festivalManager');
            const currentFestival = getCurrentFestival();
            
            // Convertir les donnÃ©es MongoDB en objets Team
            const allTeamsFromDB = Object.values(teamsData);
            
            console.log(`ðŸ” loadTeams: currentFestival = ${currentFestival ? currentFestival.title : 'null'}`);
            console.log(`ðŸ” loadTeams: Ã‰quipes totales en base avant filtrage: ${allTeamsFromDB.length}`);
            
            let filteredTeams = allTeamsFromDB;
            
            // Si un festival est actif, ne charger que les Ã©quipes de ce festival
            if (currentFestival) {
                filteredTeams = allTeamsFromDB.filter(teamData => 
                    teamData.festivalId === currentFestival.id || 
                    !teamData.festivalId  // Garder les Ã©quipes sans festivalId pour compatibility
                );
                
                console.log(`ðŸ” Festival actuel: ${currentFestival.title}`);
                console.log(`ðŸ“Š Ã‰quipes totales en base: ${allTeamsFromDB.length}`);
                console.log(`ðŸ“Š Ã‰quipes pour ce festival: ${filteredTeams.length}`);
            } else {
                console.log('âš ï¸ Pas de festival actif - chargement de toutes les Ã©quipes');
            }
            
            const loadedTeams = filteredTeams.map(data => {
                const team = new Team(data.name, data.leaderId, data.camp, data.isOpen, data.accessCode);
                
                // RÃ©tablir tous les membres (sauf le leader qui est dÃ©jÃ  ajoutÃ© par le constructeur)
                data.members.forEach(memberId => {
                    if (memberId !== data.leaderId && !team.members.includes(memberId)) {
                        team.addMember(memberId);
                    }
                });
                
                // RÃ©tablir les autres propriÃ©tÃ©s
                team.id = data.id;
                team.channelId = data.channelId;
                team.roleId = data.roleId;
                team.busy = data.isSearching || false;
                team.lastSearchTime = data.lastSearchTime;
                team.searchLockUntil = data.searchLockUntil;
                team.festivalId = data.festivalId; // Restaurer le festivalId
                
                return team;
            });
            
            setTeamsForGuild(loadedTeams, currentGuildId);
            console.log(`âœ… Ã‰quipes chargÃ©es avec DataAdapter. Total: ${loadedTeams.length}`);
        } else {
            setTeamsForGuild([], currentGuildId);
            console.log('âœ… Aucune Ã©quipe trouvÃ©e dans MongoDB');
        }
    } catch (error) {
        console.error('âŒ ERREUR CRITIQUE lors du chargement des Ã©quipes:', error);
        setTeamsForGuild([], currentGuildId); // Initialiser vide en cas d'erreur
        throw error; // Propager l'erreur au lieu de faire un fallback
    }
}

// Fonction pour supprimer toutes les Ã©quipes (utilisÃ©e lors du reset)
async function clearAllTeams() {
    try {
        console.log(`ðŸ” teamManager.clearAllTeams: currentGuildId = ${currentGuildId}`);
        
        const adapter = getDataAdapter();
        
        if (!adapter) {
            console.warn('âŒ teamManager.clearAllTeams: DataAdapter non disponible - suppression des Ã©quipes en mÃ©moire uniquement');
            setTeamsForGuild([], currentGuildId);
            return;
        }

        console.log(`ðŸ” teamManager.clearAllTeams: DataAdapter crÃ©Ã© avec guildId ${currentGuildId}`);
        
        // Supprimer de la base de donnÃ©es
        await adapter.clearAllTeams();
        
        // Vider le tableau en mÃ©moire pour cette guild
        const teamCountBefore = getTeamsForGuild(currentGuildId).length;
        setTeamsForGuild([], currentGuildId);
        
        console.log(`âœ… teamManager.clearAllTeams: ${teamCountBefore} Ã©quipes supprimÃ©es en mÃ©moire, base de donnÃ©es nettoyÃ©e`);
    } catch (error) {
        console.error('âŒ Erreur lors de la suppression de toutes les Ã©quipes:', error);
        // En cas d'erreur, au moins vider la mÃ©moire
        setTeamsForGuild([], currentGuildId);
        throw error;
    }
}

// Fonction pour crÃ©er une Ã©quipe
async function createTeam(name, leaderId, camp, isOpen = true, code = null, guild = null) {
    // VÃ©rifier si une Ã©quipe avec ce nom existe dÃ©jÃ 
    const teams = getTeamsForGuild(currentGuildId);
    if (teams.some(t => t.name.toLowerCase() === name.toLowerCase())) {
        throw new Error("Une Ã©quipe avec ce nom existe dÃ©jÃ .");
    }

    // VÃ©rifier si l'utilisateur est dÃ©jÃ  dans une Ã©quipe
    if (findTeamByMember(leaderId)) {
        throw new Error("Vous Ãªtes dÃ©jÃ  membre d'une Ã©quipe. Quittez-la d'abord.");
    }

    const team = new Team(name, leaderId, camp, isOpen, code);
    
    // Assigner le festivalId du festival actuel
    const { getCurrentFestivalAsync } = require('./festivalManager');
    let currentFestival = null;
    
    try {
        // RÃ©cupÃ©rer le festival actif depuis MongoDB pour avoir l'ID correct
        const DataAdapter = require('./dataAdapter');
        if (guild) {
            const adapter = new DataAdapter(guild.id);
            const festivalData = await adapter.getFestival();
            if (festivalData && festivalData._id) {
                currentFestival = {
                    title: festivalData.title,
                    id: festivalData._id.toString()
                };
            }
        }
    } catch (error) {
        console.error('Erreur lors de la rÃ©cupÃ©ration du festival pour l\'Ã©quipe:', error);
        // Fallback vers la version sync
        const { getCurrentFestival } = require('./festivalManager');
        currentFestival = getCurrentFestival();
    }
    
    console.log(`ðŸ” createTeam Debug:`);
    console.log(`  - currentFestival: ${currentFestival ? 'trouvÃ©' : 'null'}`);
    if (currentFestival) {
        console.log(`  - festival.title: ${currentFestival.title}`);
        console.log(`  - festival.id: ${currentFestival.id}`);
        console.log(`  - typeof festival.id: ${typeof currentFestival.id}`);
    }
    
    if (currentFestival && currentFestival.id) {
        team.festivalId = currentFestival.id;
        console.log(`ðŸ” Ã‰quipe ${name} assignÃ©e au festival ${currentFestival.title} (ID: ${currentFestival.id})`);
    } else {
        console.log(`âš ï¸ Ã‰quipe ${name} crÃ©Ã©e sans festival actif ou sans ID valide`);
        // Pour Ã©viter les Ã©quipes orphelines, on peut lever une erreur
        throw new Error('Aucun festival actif trouvÃ©. Veuillez dÃ©marrer un festival avant de crÃ©er une Ã©quipe.');
    }
    
    const teams = getTeamsForGuild(currentGuildId);
    teams.push(team);
    setTeamsForGuild(teams, currentGuildId);
    
    // NOUVEAU : CrÃ©er les rÃ´les et les attribuer immÃ©diatement si guild est fourni
    if (guild) {
        // OpÃ©ration asynchrone pour crÃ©er salon et rÃ´les
        (async () => {
            try {
                // 1. CrÃ©er ou rÃ©cupÃ©rer les rÃ´les
                const teamRole = await getOrCreateTeamRole(guild, team);
                
                // 2. CrÃ©er ou rÃ©cupÃ©rer le rÃ´le Team Leader
                let leaderRole = guild.roles.cache.find(role => role.name === 'Team Leader');
                if (!leaderRole) {
                    leaderRole = await guild.roles.create({
                        name: 'Team Leader',
                        color: '#FFD700', // Or
                        permissions: [],
                        reason: 'RÃ´le pour les capitaines d\'Ã©quipe'
                    });
                    console.log('RÃ´le Team Leader crÃ©Ã©');
                }
                
                // 3. Attribuer les rÃ´les au leader
                const member = await guild.members.fetch(leaderId);
                if (member) {
                    if (teamRole) {
                        await member.roles.add(teamRole);
                        console.log(`RÃ´le d'Ã©quipe ${teamRole.name} attribuÃ© Ã  ${member.user.username}`);
                    }
                    
                    if (leaderRole) {
                        await member.roles.add(leaderRole);
                        console.log(`RÃ´le Team Leader attribuÃ© Ã  ${member.user.username}`);
                    }
                }
                
                // 4. CrÃ©er le salon d'Ã©quipe
                await createTeamChannel(guild, team);
                
                // 5. Sauvegarder avec les IDs de rÃ´les mis Ã  jour
                await saveTeams();
                
            } catch (error) {
                console.error(`Erreur lors de la configuration complÃ¨te de l'Ã©quipe ${name}:`, error);
            }
        })();
    }
    // Note: Plus de sauvegarde automatique ici car elle se fait dans la partie async
    // Si pas de guild, l'Ã©quipe sera sauvÃ©e lors de la prochaine opÃ©ration
    
    return team;
}

// Modifier toutes les autres fonctions pour sauvegarder aprÃ¨s chaque modification
function joinTeam(teamName, userId, code = null, guild = null) {
    const team = findTeamByName(teamName);
    
    if (!team) {
        throw new Error("Ã‰quipe non trouvÃ©e.");
    }

    // VÃ©rifier si l'utilisateur est dÃ©jÃ  dans une Ã©quipe
    if (findTeamByMember(userId)) {
        throw new Error("Vous Ãªtes dÃ©jÃ  membre d'une Ã©quipe. Quittez-la d'abord.");
    }

    // VÃ©rifier si l'Ã©quipe est fermÃ©e et le code est correct
    if (!team.isOpen && team.code !== code) {
        throw new Error("Code d'accÃ¨s incorrect pour cette Ã©quipe.");
    }
    
    // VÃ©rification selon le format du festival
    let maxSize = 4; // Valeur par dÃ©faut
    try {
        const { getCurrentFestival } = require('./festivalManager');
        const festival = getCurrentFestival();
        maxSize = festival?.teamSize || 4;
    } catch (error) {
        console.warn('Impossible de rÃ©cupÃ©rer la taille d\'Ã©quipe du festival, utilisation de 4 par dÃ©faut');
    }
    const formatDisplay = `${maxSize}v${maxSize}`;
    
    if (team.members.length >= maxSize) {
        throw new Error(`Cette Ã©quipe est dÃ©jÃ  complÃ¨te (${maxSize} membres maximum pour le format ${formatDisplay}).`);
    }

    team.addMember(userId);
    
    // NOUVEAU : Attribuer automatiquement le rÃ´le d'Ã©quipe si guild est fourni
    if (guild) {
        (async () => {
            try {
                // 1. RÃ©cupÃ©rer ou crÃ©er le rÃ´le d'Ã©quipe
                const { getOrCreateTeamRole } = require('./channelManager');
                const teamRole = await getOrCreateTeamRole(guild, team);
                
                // 2. Attribuer le rÃ´le au nouveau membre
                const member = await guild.members.fetch(userId);
                if (member && teamRole) {
                    await member.roles.add(teamRole);
                    console.log(`RÃ´le d'Ã©quipe ${teamRole.name} attribuÃ© Ã  ${member.user.username}`);
                }
                
                // 3. Mettre Ã  jour les permissions du salon d'Ã©quipe
                await updateTeamChannelPermissions(guild, team, userId);
                
            } catch (error) {
                console.error(`Erreur lors de l'attribution du rÃ´le pour ${userId}:`, error);
            }
