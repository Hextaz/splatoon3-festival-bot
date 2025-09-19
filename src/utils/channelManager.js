const { ChannelType, PermissionsBitField, EmbedBuilder } = require('discord.js');

const roleCreationLocks = new Map();

// Fonction pour créer ou récupérer la catégorie Festival
async function getFestivalCategory(guild) {
    // Chercher la catégorie existante
    let category = guild.channels.cache.find(
        channel => channel.type === ChannelType.GuildCategory && channel.name === 'Festival'
    );
    
    // Créer la catégorie si elle n'existe pas
    if (!category) {
        console.log('Création de la catégorie Festival');
        category = await guild.channels.create({
            name: 'Festival',
            type: ChannelType.GuildCategory,
            reason: 'Catégorie pour les salons du festival'
        });
    }
    
    return category;
}

// Fonction centrale pour créer ou récupérer un rôle d'équipe
async function getOrCreateTeamRole(guild, team) {
    // Vérification immédiate par nom AVANT de prendre le verrou
    const existingRoleByName = guild.roles.cache.find(role => role.name === `Team ${team.name}`);
    if (existingRoleByName) {
        // Mettre à jour l'ID si nécessaire
        if (team.roleId !== existingRoleByName.id) {
            team.roleId = existingRoleByName.id;
            const { saveTeams } = require('./teamManager');
            saveTeams(guild.id);
        }
        return existingRoleByName;
    }
    
    // Si aucun verrou n'existe pour cette équipe, le créer
    if (!roleCreationLocks.has(team.name)) {
        roleCreationLocks.set(team.name, false);
    }

    // Attendre que le verrou soit disponible (éviter les créations parallèles)
    while (roleCreationLocks.get(team.name) === true) {
        await new Promise(resolve => setTimeout(resolve, 100));
    }

    try {
        // Acquérir le verrou
        roleCreationLocks.set(team.name, true);
        
        // Faire une nouvelle vérification après avoir obtenu le verrou
        // (le rôle aurait pu être créé pendant l'attente)
        const roleByName = guild.roles.cache.find(role => role.name === `Team ${team.name}`);
        if (roleByName) {
            team.roleId = roleByName.id;
            const { saveTeams } = require('./teamManager');
            saveTeams(guild.id);
            return roleByName;
        }
        
        // Vérifier par ID
        if (team.roleId) {
            try {
                const existingRole = await guild.roles.fetch(team.roleId);
                if (existingRole) {
                    return existingRole;
                }
            } catch (error) {
                console.log(`Rôle avec ID ${team.roleId} non trouvé, création d'un nouveau rôle...`);
            }
        }
        
        // Créer un nouveau rôle
        console.log(`Création d'un nouveau rôle pour l'équipe ${team.name}`);
        const newRole = await guild.roles.create({
            name: `Team ${team.name}`,
            color: getColorForCamp(team.camp),
            reason: 'Centralisation de la création des rôles d\'équipe'
        });
        
        // Stocker l'ID du rôle et sauvegarder IMMÉDIATEMENT
        team.roleId = newRole.id;
        const { saveTeams } = require('./teamManager');
        await saveTeams(guild.id); // Utiliser await pour s'assurer que la sauvegarde est terminée
        
        return newRole;
    } catch (error) {
        console.error(`Erreur lors de la création ou de la récupération du rôle d'équipe:`, error);
        return null;
    } finally {
        // Libérer le verrou quoi qu'il arrive
        roleCreationLocks.set(team.name, false);
    }
}

// Fonction pour créer un salon d'équipe
async function createTeamChannel(guild, team) {
    try {
        const category = await getFestivalCategory(guild);
        
        // Vérifier si un salon existe déjà pour cette équipe
        const existingChannel = guild.channels.cache.find(
            channel => channel.name === `team-${team.name.toLowerCase().replace(/\s+/g, '-')}`
        );
        
        if (existingChannel) {
            console.log(`Le salon pour l'équipe ${team.name} existe déjà`);
            team.channelId = existingChannel.id;
            return existingChannel;
        }
        
        // Utiliser la fonction centralisée pour obtenir le rôle d'équipe
        const teamRole = await getOrCreateTeamRole(guild, team);
        
        // Préparer les permissions avec le rôle d'équipe plutôt que les IDs individuels
        const permissionOverwrites = [
            {
                id: guild.roles.everyone.id,
                deny: [PermissionsBitField.Flags.ViewChannel]
            },
            {
                id: teamRole.id,
                allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages]
            }
        ];
        
        // Créer le salon
        const channel = await guild.channels.create({
            name: `team-${team.name.toLowerCase().replace(/\s+/g, '-')}`,
            type: ChannelType.GuildText,
            parent: category,
            permissionOverwrites: permissionOverwrites,
            reason: `Salon privé pour l'équipe ${team.name}`
        });
        
        // Récupérer les noms des membres pour le message de bienvenue
        const memberNames = await Promise.all(team.members.map(async (memberId) => {
            try {
                const user = await guild.client.users.fetch(memberId);
                return memberId === team.leader ? `**${user.username}** (Leader)` : user.username;
            } catch (error) {
                return `<@${memberId}>`;
            }
        }));
        
        // Récupérer le festival pour obtenir le nom du camp
        const { getCurrentFestival } = require('./festivalManager');
        const festival = getCurrentFestival(guild.id);
        
        // Déterminer le nom d'affichage du camp
        let campName;
        if (team.campDisplayName) {
            campName = team.campDisplayName;
        } else if (festival && team.camp.startsWith('camp')) {
            const campIndex = parseInt(team.camp.replace('camp', '')) - 1;
            campName = festival.campNames[campIndex];
        } else {
            campName = team.camp;
        }

        // Envoyer un message de bienvenue
        const embed = new EmbedBuilder()
            .setColor(getColorForCamp(team.camp))
            .setTitle(`Équipe ${team.name}`)
            .setDescription(`Bienvenue dans le salon privé de votre équipe!`)
            .addFields(
                { name: 'Camp', value: campName },
                { name: 'Type', value: team.isOpen ? 'Équipe ouverte' : 'Équipe fermée' },
                { name: `Membres (${team.members.length})`, value: memberNames.join('\n') }
            )
            .setFooter({ text: 'Bon festival à tous!' });
            
        // Ajouter le code d'accès si l'équipe est fermée
        if (!team.isOpen && team.code) {
            embed.addFields({ 
                name: '🔑 Code d\'accès', 
                value: `\`${team.code}\` *(Conservez ce code pour permettre à d'autres joueurs de rejoindre votre équipe)*` 
            });
        }
        
        // Ajouter des informations sur les commandes
        embed.addFields({ 
            name: 'Commandes utiles', 
            value: 
                '`/search-match` - Rechercher un match contre une autre équipe\n' +
                '`/results` - Soumettre les résultats d\'un match\n' +
                '`/my-team` - Voir les informations de votre équipe\n' +
                '`/leave-team` - Quitter l\'équipe'
        });
        
        await channel.send({ embeds: [embed] });
        
        // Faire une annonce initiale avec mention de rôle
        await channel.send(`🎉 L'équipe ${teamRole} a été créée ! Ce salon est réservé aux membres de votre équipe pour communiquer et organiser vos matchs.`);
        
        // Stocker l'ID du canal dans l'équipe
        team.channelId = channel.id;
        team.roleId = teamRole.id; // Stocker l'ID du rôle d'équipe
        
        return channel;
    } catch (error) {
        console.error(`Erreur lors de la création du salon d'équipe:`, error);
        return null;
    }
}

// Fonction pour mettre à jour les permissions d'un salon d'équipe
async function updateTeamChannelPermissions(guild, team, newMemberId = null) {
    try {
        if (!team.channelId) return;
        
        const channel = await guild.channels.fetch(team.channelId).catch(() => null);
        if (!channel) return;
        
        // REMPLACER ce bloc par l'utilisation de la fonction centralisée
        const teamRole = await getOrCreateTeamRole(guild, team);
        
        // Ajouter le rôle au nouveau membre s'il y en a un
        if (newMemberId) {
            try {
                const newMember = await guild.members.fetch(newMemberId);
                if (newMember) {
                    await newMember.roles.add(teamRole);
                }
            } catch (error) {
                console.error(`Erreur lors de l'ajout du rôle au nouveau membre:`, error);
            }
        }
        
        // Mettre à jour les permissions du salon pour utiliser le rôle d'équipe
        await channel.permissionOverwrites.set([
            {
                id: guild.roles.everyone.id,
                deny: [PermissionsBitField.Flags.ViewChannel]
            },
            {
                id: teamRole.id,
                allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages]
            }
        ]);
        
        // Notifier l'arrivée d'un nouveau membre si fourni
        if (newMemberId) {
            try {
                const newMember = await guild.client.users.fetch(newMemberId);
                
                const embed = new EmbedBuilder()
                    .setColor('#00FF00')
                    .setTitle('Nouveau membre!')
                    .setDescription(`**${newMember.username}** a rejoint l'équipe!`)
                    .addFields(
                        { name: 'Membres', value: `L'équipe compte maintenant ${team.members.length} membres.` }
                    );
                
                await channel.send({ 
                    content: `🎉 Bienvenue <@${newMemberId}> dans l'équipe ${teamRole} !`,
                    embeds: [embed] 
                });
            } catch (error) {
                console.error('Erreur lors de la notification du nouveau membre:', error);
            }
        }
        
        // Informer quand l'équipe est complète
        const { isTeamComplete } = require('./teamManager');
        if (isTeamComplete(team)) {
            const { getCurrentFestival } = require('./festivalManager');
            const festival = getCurrentFestival(guild.id);
            const requiredSize = festival?.teamSize || 4;
            
            const embed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('Équipe complète!')
                .setDescription(`Votre équipe a maintenant ${team.members.length}/${requiredSize} membres et est prête pour les matchs.`)
                .addFields(
                    { name: 'Que faire maintenant?', value: 'Utilisez la commande `/search-match` pour trouver un adversaire!' }
                );
            
            await channel.send({ 
                content: `🎮 Attention ${teamRole} ! Votre équipe est maintenant complète !`,
                embeds: [embed] 
            });
        }
        
        return channel;
    } catch (error) {
        console.error(`Erreur lors de la mise à jour des permissions du salon d'équipe:`, error);
        return null;
    }
}

// Fonction pour supprimer un salon d'équipe
async function deleteTeamChannel(guild, team) {
    try {
        console.log(`Tentative de suppression du salon pour l'équipe ${team.name}...`);
        
        if (!team.channelId) {
            console.log(`Aucun channelId défini pour l'équipe ${team.name}, impossible de supprimer le salon`);
            return false;
        }
        
        console.log(`Recherche du salon ${team.channelId} pour l'équipe ${team.name}...`);
        const channel = await guild.channels.fetch(team.channelId).catch(error => {
            console.error(`Erreur lors de la récupération du salon ${team.channelId}:`, error);
            return null;
        });
        
        if (!channel) {
            console.log(`Salon introuvable pour l'équipe ${team.name} (ID: ${team.channelId})`);
            return false;
        }
        
        console.log(`Salon trouvé: ${channel.name} (${channel.id}), suppression...`);
        
        // Envoyer un message d'avertissement avant de supprimer
        try {
            await channel.send({
                content: `⚠️ Cette équipe est maintenant vide. Ce salon sera supprimé dans 10 secondes...`
            });
        } catch (msgError) {
            console.error(`Impossible d'envoyer le message d'avertissement:`, msgError);
        }
        
        // Attendre 10 secondes pour que le message soit visible
        await new Promise(resolve => setTimeout(resolve, 10000));
        
        // Supprimer le salon
        await channel.delete('Équipe dissoute - plus aucun membre').catch(error => {
            console.error(`Erreur lors de la suppression du salon ${channel.name}:`, error);
            throw error; // Relancer l'erreur pour qu'elle soit gérée par le bloc catch externe
        });
        
        console.log(`Salon ${channel.name} supprimé avec succès`);
        return true;
    } catch (error) {
        console.error(`Erreur lors de la suppression du salon d'équipe pour ${team.name}:`, error);
        return false;
    }
}

// Fonction pour créer un salon de match
async function createMatchChannel(guild, team1, team2) {
    try {
        const category = await getFestivalCategory(guild);
        
        // Générer un nom unique pour le salon
        const channelName = `match-${team1.name.toLowerCase().replace(/\s+/g, '-')}-vs-${team2.name.toLowerCase().replace(/\s+/g, '-')}`;
        
        // REMPLACER toute la logique de recherche/création de rôles par:
        const team1Role = await getOrCreateTeamRole(guild, team1);
        const team2Role = await getOrCreateTeamRole(guild, team2);

        // Utiliser le rôle existant ou obtenir depuis roleId au lieu d'en créer un nouveau
        if (!team1Role && team1.roleId) {
            try {
                team1Role = await guild.roles.fetch(team1.roleId);
            } catch (error) {
                console.log(`Impossible de récupérer le rôle par ID pour ${team1.name}, création en cours...`);
            }
        }

        if (!team2Role && team2.roleId) {
            try {
                team2Role = await guild.roles.fetch(team2.roleId);
            } catch (error) {
                console.log(`Impossible de récupérer le rôle par ID pour ${team2.name}, création en cours...`);
            }
        }
        
        // Préparer les permissions avec les rôles d'équipe plutôt que les IDs individuels
        const permissionOverwrites = [
            {
                id: guild.roles.everyone.id,
                deny: [PermissionsBitField.Flags.ViewChannel]
            },
            {
                id: team1Role.id,
                allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages]
            },
            {
                id: team2Role.id,
                allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages]
            }
        ];
        
        // Créer le salon
        const channel = await guild.channels.create({
            name: channelName,
            type: ChannelType.GuildText,
            parent: category,
            permissionOverwrites: permissionOverwrites,
            reason: `Salon temporaire pour le match entre ${team1.name} et ${team2.name}`
        });
        
        return channel;
    } catch (error) {
        console.error(`Erreur lors de la création du salon de match:`, error);
        return null;
    }
}

// Fonction pour supprimer un salon de match avec délai
async function scheduleMatchChannelDeletion(guild, channelId, delayMs = 120000) { // 2 minutes par défaut
    setTimeout(async () => {
        try {
            const channel = await guild.channels.fetch(channelId).catch(() => null);
            if (channel) {
                await channel.send({
                    content: '⚠️ Ce salon sera supprimé dans 10 secondes...'
                });
                
                // Attendre 10 secondes de plus pour l'avertissement
                setTimeout(async () => {
                    try {
                        await channel.delete('Match terminé');
                    } catch (error) {
                        console.error(`Erreur lors de la suppression du salon de match:`, error);
                    }
                }, 10000);
            }
        } catch (error) {
            console.error(`Erreur lors de la suppression du salon de match:`, error);
        }
    }, delayMs);
}

// Fonction utilitaire pour obtenir une couleur par camp
function getColorForCamp(camp) {
    switch (camp) {
        case 'camp1': return '#FF0000'; // Rouge
        case 'camp2': return '#00FF00'; // Vert
        case 'camp3': return '#0000FF'; // Bleu
        default: return '#FFFF00'; // Jaune par défaut
    }
}

module.exports = {
    getFestivalCategory,
    getOrCreateTeamRole,
    createTeamChannel,
    updateTeamChannelPermissions,
    deleteTeamChannel,
    createMatchChannel,
    scheduleMatchChannelDeletion,
    getColorForCamp
};