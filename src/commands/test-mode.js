const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { getCurrentFestival } = require('../utils/festivalManager');
const { createTeam, getAllTeams, saveTeams, findTeamByName, findTeamByMember } = require('../utils/teamManager');
const { castVote } = require('../utils/vote');
const { startMatchSearch, cleanupSearch, getSearchingTeams } = require('../utils/matchSearch');
const scoreTracker = require('../utils/scoreTracker');
const { createTeamChannel } = require('../utils/channelManager');
const { createTeamRole } = require('../utils/interactionHandlers');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('test-mode')
        .setDescription('Gestion des utilisateurs virtuels pour les tests (Admin uniquement)')
        .setDefaultMemberPermissions(PermissionFlagsBits.ADMINISTRATOR)
        .addSubcommand(subcommand =>
            subcommand
                .setName('create-teams')
                .setDescription('Créer plusieurs équipes virtuelles pour les tests')
                .addIntegerOption(option =>
                    option.setName('count')
                        .setDescription('Nombre d\'équipes à créer')
                        .setRequired(true)
                        .setMinValue(1)
                        .setMaxValue(30))
                .addStringOption(option =>
                    option.setName('camp')
                        .setDescription('Camp spécifique pour les équipes (laissez vide pour répartition aléatoire)')
                        .setRequired(false)
                        .addChoices(
                            { name: 'Camp 1', value: 'camp1' },
                            { name: 'Camp 2', value: 'camp2' },
                            { name: 'Camp 3', value: 'camp3' }
                        )))
        .addSubcommand(subcommand =>
            subcommand
                .setName('simulate-matches')
                .setDescription('Simuler des recherches de match et des résultats')
                .addIntegerOption(option =>
                    option.setName('count')
                        .setDescription('Nombre de matchs à simuler')
                        .setRequired(true)
                        .setMinValue(1)
                        .setMaxValue(20)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('cleanup')
                .setDescription('Supprimer toutes les équipes virtuelles de test'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('status')
                .setDescription('Afficher le statut des équipes virtuelles et des matchs en cours'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('fill-my-team')
                .setDescription('Remplir votre équipe avec des joueurs virtuels')
                .addIntegerOption(option =>
                    option
                        .setName('count')
                        .setDescription('Nombre de joueurs virtuels à ajouter (max 3)')
                        .setRequired(false)
                        .setMinValue(1)
                        .setMaxValue(3))),
    
    // Ajouter ce cas dans la fonction execute
    async execute(interaction) {
        try {
            await interaction.deferReply({ ephemeral: true });
                        
            const subcommand = interaction.options.getSubcommand();
                        
            // Vérifier si un festival est actif
            const festival = getCurrentFestival(interaction.guild.id);
            if (!festival && subcommand !== 'cleanup') {
                return await interaction.editReply({
                    content: 'Aucun festival actif. Veuillez d\'abord créer un festival avec `/start-festival`.',
                    ephemeral: true
                });
            }
                        
            if (subcommand === 'create-teams') {
                await handleCreateTeams(interaction, festival);
            } else if (subcommand === 'simulate-matches') {
                await handleSimulateMatches(interaction, festival);
            } else if (subcommand === 'cleanup') {
                await handleCleanup(interaction);
            } else if (subcommand === 'status') {
                await handleStatus(interaction, festival);
            } else if (subcommand === 'fill-my-team') {
                await handleFillMyTeam(interaction, festival);
            }
        } catch (error) {
            console.error('Erreur dans la commande test-mode:', error);
                        
            // S'assurer que l'erreur est renvoyée à l'utilisateur
            try {
                if (interaction.deferred) {
                    await interaction.editReply({
                        content: `Une erreur s'est produite: ${error.message}`,
                        ephemeral: true
                    });
                } else {
                    await interaction.reply({
                        content: `Une erreur s'est produite: ${error.message}`,
                        ephemeral: true
                    });
                }
            } catch (replyError) {
                console.error('Erreur lors de la réponse d\'erreur:', replyError);
            }
        }
    }
};

// Fonction pour afficher le statut des équipes virtuelles
async function handleStatus(interaction, festival) {
    const guildId = interaction.guild.id;
    const allTeams = getAllTeams(guildId);
    const virtualTeams = allTeams.filter(team => team.isVirtual);
    
    if (virtualTeams.length === 0) {
        return await interaction.editReply({
            content: 'Aucune équipe virtuelle n\'a été créée. Utilisez `/test-mode create-teams` pour en créer.',
            ephemeral: true
        });
    }
    
    // Récupérer les équipes en recherche
    const searchingTeamsArray = require('../utils/matchSearch').getSearchingTeams(guildId);
    
    // Analyse des équipes
    const campCounts = {
        camp1: virtualTeams.filter(t => t.camp === 'camp1').length,
        camp2: virtualTeams.filter(t => t.camp === 'camp2').length,
        camp3: virtualTeams.filter(t => t.camp === 'camp3').length
    };
    
    const sizeDistribution = {
        complete: virtualTeams.filter(t => t.members.length === 4).length,
        incomplete: virtualTeams.filter(t => t.members.length < 4).length,
        bySize: {
            4: virtualTeams.filter(t => t.members.length === 4).length,
            3: virtualTeams.filter(t => t.members.length === 3).length,
            2: virtualTeams.filter(t => t.members.length === 2).length,
            1: virtualTeams.filter(t => t.members.length === 1).length
        }
    };
    
    // Statut des matchs
    const busyTeams = virtualTeams.filter(t => t.busy);
    const searchingTeams = searchingTeamsArray.filter(entry => 
        virtualTeams.some(vt => vt.name === entry.team.name)
    );
    
    // Créer un tableau détaillé du statut de chaque équipe
    const teamStatusMap = new Map();
    
    virtualTeams.forEach(team => {
        let status = "Inactive";
        let details = "";
        
        if (team.busy && team.currentOpponent) {
            status = "En match";
            details = `vs ${team.currentOpponent}`;
            if (team.currentMatchMultiplier > 1) {
                details += ` (x${team.currentMatchMultiplier})`;
            }
        } else if (searchingTeams.some(entry => entry.team.name === team.name)) {
            const entry = searchingTeams.find(e => e.team.name === team.name);
            const waitTime = Math.round((Date.now() - entry.startTime) / 1000);
            status = "En recherche";
            details = `depuis ${waitTime} secondes`;
        }
        
        teamStatusMap.set(team.name, {
            name: team.name,
            camp: team.camp,
            members: team.members.length,
            matchesPlayed: team.matchesPlayed || 0,
            status: status,
            details: details
        });
    });
    
    // Calcul des statistiques de matchs joués
    const matchStats = virtualTeams
        .filter(t => t.matchesPlayed && t.matchesPlayed > 0)
        .sort((a, b) => (b.matchesPlayed || 0) - (a.matchesPlayed || 0));
    
    const topTeams = matchStats.slice(0, 5);
    
    // Créer embed principal
    const embed = new EmbedBuilder()
        .setColor('#00FFFF')
        .setTitle('Statut des équipes virtuelles de test')
        .setDescription(`Il y a actuellement **${virtualTeams.length}** équipes virtuelles.`)
        .addFields(
            { name: 'Répartition par camp', value: 
                `Camp 1: **${campCounts.camp1}** équipes\n` +
                `Camp 2: **${campCounts.camp2}** équipes\n` +
                `Camp 3: **${campCounts.camp3}** équipes`
            },
            { name: 'Répartition par taille', value:
                `Équipes complètes (4 membres): **${sizeDistribution.complete}**\n` +
                `Équipes incomplètes: **${sizeDistribution.incomplete}**\n` +
                `Détail: 4 membres: ${sizeDistribution.bySize[4]}, ` +
                `3 membres: ${sizeDistribution.bySize[3]}, ` +
                `2 membres: ${sizeDistribution.bySize[2]}, ` +
                `1 membre: ${sizeDistribution.bySize[1]}`
            },
            { name: 'Statut des matchs', value:
                `**${busyTeams.length}** équipes en match\n` +
                `**${searchingTeams.length}** équipes en recherche de match`
            }
        );
    
    // Ajouter des équipes en match si disponibles
    if (busyTeams.length > 0) {
        const matchList = busyTeams.map(team => {
            const opponent = allTeams.find(t => t.name === team.currentOpponent);
            return `${team.name} (${team.camp.replace('camp', 'Camp ')}) vs ${opponent ? opponent.name : 'Équipe inconnue'} ${team.currentMatchMultiplier > 1 ? `(x${team.currentMatchMultiplier})` : ''}`;
        }).join('\n');
        
        embed.addFields({ name: 'Matchs en cours', value: matchList });
    }
    
    // Ajouter les équipes en recherche
    if (searchingTeams.length > 0) {
        const searchList = searchingTeams.map(entry => {
            const waitTime = Math.round((Date.now() - entry.startTime) / 1000);
            return `${entry.team.name} (${entry.team.camp.replace('camp', 'Camp ')}): ${waitTime} secondes`;
        }).join('\n');
        
        embed.addFields({ name: 'Équipes en recherche', value: searchList });
    }
    
    // Ajouter les équipes ayant joué le plus
    if (topTeams.length > 0) {
        const topTeamsList = topTeams.map(team => 
            `${team.name} (${team.camp.replace('camp', 'Camp ')}): **${team.matchesPlayed}** match(s)`
        ).join('\n');
        
        embed.addFields({ name: 'Top équipes (matchs joués)', value: topTeamsList });
    }
    
    // Créer les embeds pour le détail des équipes (on les divise en groupes de 10)
    const detailEmbeds = [];
    const TEAMS_PER_EMBED = 10;
    
    // Trier les équipes par statut
    const sortedTeams = Array.from(teamStatusMap.values()).sort((a, b) => {
        // Priorité: En match > En recherche > Inactive
        const statusPriority = {
            "En match": 0,
            "En recherche": 1,
            "Inactive": 2
        };
        
        return statusPriority[a.status] - statusPriority[b.status];
    });
    
    for (let i = 0; i < sortedTeams.length; i += TEAMS_PER_EMBED) {
        const teamsChunk = sortedTeams.slice(i, i + TEAMS_PER_EMBED);
        
        const detailEmbed = new EmbedBuilder()
            .setColor('#00FFFF')
            .setTitle(`Détail des équipes (${i+1}-${Math.min(i+TEAMS_PER_EMBED, sortedTeams.length)}/${sortedTeams.length})`);
        
        teamsChunk.forEach(teamInfo => {
            detailEmbed.addFields({
                name: `${teamInfo.name} (${teamInfo.camp.replace('camp', 'Camp ')})`,
                value: `**Statut**: ${teamInfo.status} ${teamInfo.details ? `- ${teamInfo.details}` : ''}\n` +
                       `**Membres**: ${teamInfo.members}/4\n` +
                       `**Matchs joués**: ${teamInfo.matchesPlayed}`
            });
        });
        
        detailEmbeds.push(detailEmbed);
    }
    
    // Envoyer tous les embeds
    await interaction.editReply({ embeds: [embed] });
    
    for (const detailEmbed of detailEmbeds) {
        await interaction.followUp({ embeds: [detailEmbed], ephemeral: true });
    }
}

// Fonction pour créer des équipes virtuelles
async function handleCreateTeams(interaction, festival) {
    // Répondre immédiatement pour éviter le timeout
    console.log("Début de la création d'équipes virtuelles...");
    
    const count = interaction.options.getInteger('count');
    const specificCamp = interaction.options.getString('camp');
    
    console.log(`Paramètres: count=${count}, specificCamp=${specificCamp}`);
    
    const createdTeams = [];
    const campCounts = { camp1: 0, camp2: 0, camp3: 0 };
    
    for (let i = 0; i < count; i++) {
        try {
            // Décider du camp (aléatoire ou spécifié)
            let camp;
            if (specificCamp) {
                camp = specificCamp;
            } else {
                // Distribution égale entre les camps si possible
                const camps = ['camp1', 'camp2', 'camp3'];
                camp = camps[i % 3];
            }
            
            // Créer un ID utilisateur virtuel unique avec timeStamp différent
            const timestamp = Date.now() + i;
            const virtualUserId = `virtual_${timestamp}_${i}`;
            
            // Enregistrer un vote pour ce camp
            try {
                castVote(camp, virtualUserId, interaction.guild.id);
                console.log(`Vote enregistré pour ${camp}`);
            } catch (voteError) {
                console.error(`Erreur de vote:`, voteError);
            }
            
            // Créer un nom d'équipe unique
            const teamName = `TestTeam_${camp.replace('camp', '')}_${timestamp % 10000}_${i}`;
            console.log(`Création de l'équipe ${teamName}...`);
            
            // Créer l'équipe
            const guildId = interaction.guild.id;
            const team = await createTeam(teamName, virtualUserId, camp, guildId, true);
            
            // Marquer l'équipe comme virtuelle
            team.isVirtual = true;
            
            // Ajouter quelques membres virtuels (généralement 4, parfois 2-3)
            let memberCount;
            if (i < Math.floor(count * 0.8)) {  // 80% des équipes ont 4 membres
                memberCount = 4;
            } else {
                // Les 20% restants ont 2 ou 3 membres
                memberCount = 2 + Math.floor(Math.random() * 2);
            }

            for (let j = 1; j < memberCount; j++) {
                const memberId = `virtual_member_${timestamp}_${i}_${j}`;
                team.addMember(memberId);
            }

            // Ajouter un log pour la taille de l'équipe
            console.log(`Équipe ${teamName} créée avec ${memberCount} membres (${memberCount === 4 ? 'complète' : 'incomplète'})`);
            
            // Ajouter le campDisplayName
            const campIndex = parseInt(camp.replace('camp', '')) - 1;
            team.campDisplayName = festival.campNames[campIndex];
            
            // Créer un rôle pour l'équipe
            try {
                await createTeamRole(interaction, team);
                console.log(`Rôle créé pour ${teamName}`);
            } catch (roleError) {
                console.error(`Erreur lors de la création du rôle:`, roleError);
            }
            
            // Créer un salon pour l'équipe
            try {
                const channel = await createTeamChannel(interaction.guild, team);
                if (channel) {
                    team.channelId = channel.id;
                    console.log(`Salon créé pour l'équipe ${teamName}: ${channel.name}`);
                } else {
                    console.log(`Pas de salon créé pour ${teamName}`);
                }
            } catch (channelError) {
                console.error(`Erreur lors de la création du salon:`, channelError);
            }
            
            createdTeams.push(team);
            campCounts[camp]++;
            console.log(`Équipe ${teamName} créée avec succès pour le camp ${camp}`);
        } catch (error) {
            console.error(`Erreur lors de la création de l'équipe virtuelle ${i}:`, error);
        }
    }
    
    // Sauvegarder toutes les équipes
    saveTeams();
    console.log(`${createdTeams.length} équipes créées avec succès`);
    
    // Filtrer uniquement les équipes complètes (avec 4 membres)
    const completeTeams = createdTeams.filter(team => team.members.length >= 4);
    console.log(`[TEST] ${completeTeams.length} équipes complètes vont chercher un match`);
    
    // Démarrer la recherche pour toutes les équipes complètes, avec un léger délai entre chaque
    let searchesStarted = 0;
    for (let i = 0; i < completeTeams.length; i++) {
        const team = completeTeams[i];
        try {
            // Ajouter un petit délai entre chaque démarrage de recherche
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // Utiliser la fonction spéciale et passer la guild
            if (startVirtualTeamSearch(team, interaction.guild)) {
                searchesStarted++;
            }
        } catch (error) {
            console.error(`[TEST] Erreur lors du démarrage de la recherche pour ${team.name}:`, error);
        }
    }

    console.log(`[TEST] ${searchesStarted} équipes virtuelles ont commencé à chercher un match`);
    
    // Modifier l'embed pour inclure l'information sur la recherche de matchs
    const embed = new EmbedBuilder()
        .setColor('#00FF00')
        .setTitle('Équipes virtuelles créées')
        .setDescription(`**${createdTeams.length}** équipes virtuelles ont été créées avec succès.`)
        .addFields(
            { name: 'Répartition par camp', value: 
                `Camp 1: **${campCounts.camp1}** équipes\n` +
                `Camp 2: **${campCounts.camp2}** équipes\n` +
                `Camp 3: **${campCounts.camp3}** équipes`
            },
            { name: 'Répartition par taille', value:
                `Équipes complètes (4 membres): **${completeTeams.length}**\n` +
                `Équipes incomplètes: **${createdTeams.length - completeTeams.length}**`
            },
            { name: 'Recherche de matchs', value: `**${completeTeams.length}** équipes complètes ont automatiquement commencé à chercher un match.` },
            { name: 'Salons et rôles', value: 'Les salons et rôles d\'équipe ont été créés pour chaque équipe virtuelle.' }
        );
    
    await interaction.editReply({
        content: 'Équipes virtuelles créées et recherches de match démarrées!',
        embeds: [embed],
        ephemeral: true
    });
}

// Fonction pour simuler des matchs
async function handleSimulateMatches(interaction, festival) {
    const count = interaction.options.getInteger('count');
    const guildId = interaction.guild.id;
    const allTeams = getAllTeams(guildId).filter(team => team.isVirtual);
    
    console.log(`[TEST] Répartition des équipes par taille:`);
    console.log(`[TEST] - Équipes complètes (4 membres): ${allTeams.filter(t => t.members.length === 4).length}`);
    console.log(`[TEST] - Équipes avec 3 membres: ${allTeams.filter(t => t.members.length === 3).length}`);
    console.log(`[TEST] - Équipes avec 2 membres: ${allTeams.filter(t => t.members.length === 2).length}`);
    
    if (allTeams.length < 2) {
        return await interaction.editReply({
            content: 'Pas assez d\'équipes virtuelles disponibles.',
            ephemeral: true
        });
    }
    
    // Reset toutes les équipes
    allTeams.forEach(team => {
        team.busy = false;
        team.currentOpponent = null;
        team.currentMatchMultiplier = null;
        team.matchesPlayed = 0; // Pour les statistiques
    });
    saveTeams();
    
    const results = {
        succeeded: 0,
        failed: 0,
        matchResults: []
    };
    
    const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
    
    // Simuler le nombre de matchs demandés
    for (let i = 0; i < count; i++) {
        try {
            console.log(`[TEST] === DÉBUT SIMULATION MATCH ${i+1}/${count} ===`);
            
            // 1. Sélectionner aléatoirement une équipe disponible et complète
            const availableTeams = allTeams.filter(t => !t.busy && t.members.length >= 4);
            if (availableTeams.length < 2) {
                console.log(`[TEST] Pas assez d'équipes complètes disponibles pour le match ${i+1}`);
                results.failed++;
                continue;
            }
            
            // Sélection aléatoire d'une équipe
            const randomIndex = Math.floor(Math.random() * availableTeams.length);
            const team1 = availableTeams[randomIndex];
            
            console.log(`[TEST] Équipe sélectionnée pour recherche: ${team1.name}`);
            
            // 2. Lancer la recherche avec le vrai système
            await startMatchSearch(interaction, team1, true); // isTestMode = true
            
            // 3. Vérifier si un match a été trouvé
            if (team1.busy && team1.currentOpponent) {
                const team2 = allTeams.find(t => t.name === team1.currentOpponent);
                
                if (team2) {
                    console.log(`[TEST] Match trouvé: ${team1.name} vs ${team2.name}`);
                    
                    // Incrémenter compteurs pour statistiques
                    team1.matchesPlayed = (team1.matchesPlayed || 0) + 1;
                    team2.matchesPlayed = (team2.matchesPlayed || 0) + 1;
                    
                    // Simuler le résultat
                    const matchResult = await simulateMatchResult(interaction, team1, team2);
                    
                    if (matchResult) {
                        results.succeeded++;
                        results.matchResults.push(matchResult);
                        console.log(`[TEST] Match simulé avec succès: ${matchResult.winner} a gagné contre ${matchResult.loser}`);
                    } else {
                        results.failed++;
                        console.log(`[TEST] Échec de la simulation de résultat`);
                    }
                }
            } else {
                console.log(`[TEST] Aucun match trouvé pour ${team1.name}`);
                results.failed++;
            }
            
            // Vérifier la cohérence
            checkTeamsConsistency(guildId);
            
            // 4. Afficher un résumé des matchs par équipe
            if ((i+1) % 5 === 0 || i === count-1) { // Tous les 5 matchs ou à la fin
                console.log(`[TEST] === MATCHS JOUÉS PAR ÉQUIPE APRÈS ${i+1} TOURS ===`);
                allTeams
                    .filter(t => t.members.length >= 4)
                    .sort((a, b) => (b.matchesPlayed || 0) - (a.matchesPlayed || 0))
                    .forEach(t => {
                        console.log(`[TEST] - ${t.name}: ${t.matchesPlayed || 0} match(s)`);
                    });
            }
            
            // Pause entre les matchs
            await wait(500);
            
        } catch (error) {
            console.error(`[TEST] Erreur lors de la simulation du match:`, error);
            results.failed++;
        }
    }
    
    // Afficher les résultats
    const embed = new EmbedBuilder()
        .setColor('#00FF00')
        .setTitle('Simulation de matchs terminée')
        .setDescription(`**${results.succeeded}** matchs ont été simulés avec succès.\n**${results.failed}** matchs ont échoué.`)
        .addFields(
            { name: 'Derniers résultats', value: 
                results.matchResults.slice(-5).map(r => 
                    `${r.winner} (${r.winnerCamp}) vs ${r.loser} (${r.loserCamp}) - x${r.multiplier}`
                ).join('\n') || 'Aucun résultat'
            },
            { name: 'Distribution des matchs', value:
                allTeams
                    .filter(t => t.members.length >= 4 && (t.matchesPlayed || 0) > 0)
                    .sort((a, b) => (b.matchesPlayed || 0) - (a.matchesPlayed || 0))
                    .slice(0, 8)
                    .map(t => `${t.name}: ${t.matchesPlayed || 0} match(s)`)
                    .join('\n') || 'Aucune donnée'
            }
        );

    await interaction.editReply({
        content: 'Simulation de matchs terminée!',
        embeds: [embed],
        ephemeral: true
    });
}

async function checkTeamsConsistency(guildId) {
    const allTeams = getAllTeams(guildId);
    const busyTeams = allTeams.filter(t => t.busy);
    
    console.log(`[TEST] Vérification de cohérence: ${busyTeams.length} équipes occupées sur ${allTeams.length}`);
    
    const errors = [];
    
    // Vérifier les équipes occupées
    busyTeams.forEach(team => {
        if (!team.currentOpponent) {
            errors.push(`Équipe ${team.name} est marquée comme occupée mais n'a pas d'adversaire`);
        } else {
            const opponent = allTeams.find(t => t.name === team.currentOpponent);
            if (!opponent) {
                errors.push(`Équipe ${team.name} a un adversaire inexistant: ${team.currentOpponent}`);
            } else if (!opponent.busy) {
                errors.push(`Équipe ${team.name} a un adversaire (${opponent.name}) qui n'est pas marqué comme occupé`);
            } else if (opponent.currentOpponent !== team.name) {
                errors.push(`Équipe ${team.name} a un adversaire (${opponent.name}) qui ne la reconnaît pas comme adversaire`);
            }
        }
    });
    
    // Vérifier les équipes non-occupées
    allTeams.filter(t => !t.busy).forEach(team => {
        if (team.currentOpponent) {
            errors.push(`Équipe ${team.name} n'est pas marquée comme occupée mais a un adversaire: ${team.currentOpponent}`);
        }
    });
    
    if (errors.length > 0) {
        console.error('[TEST] ERREURS DE COHÉRENCE:');
        errors.forEach(err => console.error(`- ${err}`));
        return false;
    }
    
    console.log('[TEST] Vérification de cohérence réussie!');
    return true;
}

// Fonction pour nettoyer les équipes virtuelles
async function handleCleanup(interaction) {
    const guild = interaction.guild;
    const guildId = guild.id;
    const allTeams = getAllTeams(guildId);
    const virtualTeams = allTeams.filter(team => team.isVirtual);
    
    if (virtualTeams.length === 0) {
        return await interaction.editReply({
            content: 'Aucune équipe virtuelle à supprimer.',
            ephemeral: true
        });
    }
    
    await interaction.editReply({
        content: `Suppression de **${virtualTeams.length}** équipes virtuelles en cours...`,
        ephemeral: true
    });
    
    let channelsDeleted = 0;
    let rolesDeleted = 0;
    let matchesTerminated = 0;
    let searchesCanceled = 0;
    
    // 1. Nettoyer les recherches de match en cours
    const { getSearchingTeams, cleanupSearch } = require('../utils/matchSearch');
    const searchingTeams = getSearchingTeams(guildId);
    
    for (const team of virtualTeams) {
        const inSearch = searchingTeams.some(entry => entry.team.name === team.name);
        if (inSearch) {
            cleanupSearch(team.name);
            searchesCanceled++;
        }
        
        // Terminer les matchs en cours
        if (team.currentOpponent) {
            const opponentTeam = allTeams.find(t => t.name === team.currentOpponent);
            if (opponentTeam) {
                require('../utils/matchSearch').finishMatch(team.name, opponentTeam.name, interaction.guild.id);
                matchesTerminated++;
            }
        }
        
        // Supprimer le salon d'équipe
        if (team.channelId) {
            try {
                const channel = await guild.channels.fetch(team.channelId);
                if (channel) {
                    await channel.delete('Nettoyage équipe virtuelle de test');
                    channelsDeleted++;
                }
            } catch (error) {
                console.error(`Erreur lors de la suppression du salon de l'équipe ${team.name}:`, error);
            }
        }
        
        // Supprimer le salon de match
        if (team.matchChannelId) {
            try {
                const matchChannel = await guild.channels.fetch(team.matchChannelId);
                if (matchChannel) {
                    await matchChannel.delete('Nettoyage équipe virtuelle de test');
                    channelsDeleted++;
                }
            } catch (error) {
                console.error(`Erreur lors de la suppression du salon de match:`, error);
            }
        }
        
        // Supprimer le rôle d'équipe
        if (team.roleId) {
            try {
                const role = await guild.roles.fetch(team.roleId);
                if (role) {
                    await role.delete('Nettoyage équipe virtuelle de test');
                    rolesDeleted++;
                }
            } catch (error) {
                console.error(`Erreur lors de la suppression du rôle de l'équipe ${team.name}:`, error);
            }
        }
    }
    
    // Filtrer les équipes non virtuelles et mettre à jour la liste
    const remainingTeams = allTeams.filter(team => !team.isVirtual);
    
    // Remplacer l'array d'équipes
    const teamManager = require('../utils/teamManager');
    teamManager.teams.length = 0; // Vider l'array
    remainingTeams.forEach(team => teamManager.teams.push(team)); // Remplir avec les équipes non virtuelles
    
    // Sauvegarder les changements
    await teamManager.saveTeams(interaction.guild.id);
    
    // Nettoyer les salons de match qui n'ont pas été supprimés
    const matchChannels = guild.channels.cache.filter(channel => 
        channel.name.startsWith('match-') && 
        channel.name.includes('testteam')
    );
    
    for (const [id, channel] of matchChannels) {
        try {
            await channel.delete('Nettoyage des matchs de test');
            channelsDeleted++;
        } catch (error) {
            console.error(`Erreur lors de la suppression du salon de match ${channel.name}:`, error);
        }
    }
    
    await interaction.editReply({
        content: `Nettoyage terminé avec succès:\n` +
                 `- **${virtualTeams.length}** équipes virtuelles supprimées\n` +
                 `- **${channelsDeleted}** salons supprimés\n` +
                 `- **${rolesDeleted}** rôles supprimés\n` +
                 `- **${matchesTerminated}** matchs en cours terminés\n` +
                 `- **${searchesCanceled}** recherches de match annulées`,
        ephemeral: true
    });
}

// Simuler un résultat de match
async function simulateMatchResult(interaction, team1, team2) {
    try {
        console.log(`[TEST] Simulation de résultat entre ${team1.name} et ${team2.name}`);
        console.log(`[TEST] Statut team1: busy=${team1.busy}, opponent=${team1.currentOpponent || 'none'}`);
        console.log(`[TEST] Statut team2: busy=${team2.busy}, opponent=${team2.currentOpponent || 'none'}`);
        
        // Vérification de la cohérence
        if (!team1.busy || !team2.busy) {
            console.warn(`[TEST] ALERTE: Une des équipes n'est pas marquée comme occupée! team1.busy=${team1.busy}, team2.busy=${team2.busy}`);
            return null;
        }
        
        if (team1.currentOpponent !== team2.name) {
            console.warn(`[TEST] ALERTE: team1.currentOpponent (${team1.currentOpponent}) != team2.name (${team2.name})`);
            return null;
        }
        
        if (team2.currentOpponent !== team1.name) {
            console.warn(`[TEST] ALERTE: team2.currentOpponent (${team2.currentOpponent}) != team1.name (${team1.name})`);
            return null;
        }
        
        // Choisir aléatoirement un gagnant
        const isTeam1Winner = Math.random() < 0.5;
        const winnerTeam = isTeam1Winner ? team1 : team2;
        const loserTeam = isTeam1Winner ? team2 : team1;
        
        // Récupérer le multiplicateur
        const multiplier = team1.currentMatchMultiplier || team2.currentMatchMultiplier || scoreTracker.generateMultiplier();
        console.log(`[TEST] Multiplicateur: x${multiplier}`);
        
        // Mise à jour des scores
        scoreTracker.updateScores(
            isTeam1Winner ? 'V' : 'D', 
            isTeam1Winner ? 'D' : 'V', 
            team1.name, 
            team2.name, 
            multiplier
        );
        
        console.log(`[TEST] Résultat: ${winnerTeam.name} gagne contre ${loserTeam.name}`);
        
        // Libérer les équipes
        team1.busy = false;
        team1.currentOpponent = null;
        team1.currentMatchMultiplier = null;
        
        team2.busy = false;
        team2.currentOpponent = null;
        team2.currentMatchMultiplier = null;
        
        console.log(`[TEST] Équipes libérées: team1.busy=${team1.busy}, team2.busy=${team2.busy}`);
        
        // Enregistrer les changements
        saveTeams();
        
        return {
            winner: winnerTeam.name,
            loser: loserTeam.name,
            winnerCamp: winnerTeam.camp.replace('camp', 'Camp '),
            loserCamp: loserTeam.camp.replace('camp', 'Camp '),
            multiplier: multiplier
        };
    } catch (error) {
        console.error(`[TEST] ERREUR lors de la simulation de résultat entre ${team1.name} et ${team2.name}:`, error);
        
        // Tenter de libérer les équipes même en cas d'erreur
        if (team1) {
            team1.busy = false;
            team1.currentOpponent = null;
            team1.currentMatchMultiplier = null;
        }
        if (team2) {
            team2.busy = false;
            team2.currentOpponent = null;
            team2.currentMatchMultiplier = null;
        }
        saveTeams();
        
        return null;
    }
}

async function handleFillMyTeam(interaction, festival) {
    
    // Get admin's team
    const adminTeam = findTeamByMember(interaction.user.id, interaction.guild.id);
    if (!adminTeam) {
        return await interaction.editReply({
            content: "Vous n'êtes membre d'aucune équipe. Créez ou rejoignez une équipe d'abord.",
            ephemeral: true
        });
    }
    
    // Check if team is already full
    if (adminTeam.members.length >= 4) {
        return await interaction.editReply({
            content: "Votre équipe est déjà complète (4 membres).",
            ephemeral: true
        });
    }
    
    // Determine how many virtual players to add
    const requestedCount = interaction.options.getInteger('count') || (4 - adminTeam.members.length);
    const actualCount = Math.min(requestedCount, 4 - adminTeam.members.length);
    
    const timestamp = Date.now();
    const addedMembers = [];
    
    // Add virtual members to the team
    for (let i = 0; i < actualCount; i++) {
        const virtualMemberId = `virtual_member_${timestamp}_${i}`;
        adminTeam.addMember(virtualMemberId);
        addedMembers.push(`👤 Joueur Virtuel #${i+1}`);
    }
    
    // Persist changes
    saveTeams();
    
    // Create embed response
    const embed = new EmbedBuilder()
        .setColor('#00FF00')
        .setTitle('Équipe remplie avec des joueurs virtuels')
        .setDescription(`**${actualCount}** joueurs virtuels ont été ajoutés à votre équipe "${adminTeam.name}".`)
        .addFields(
            { name: 'Membres actuels', value: `${adminTeam.members.length}/4` },
            { name: 'Membres ajoutés', value: addedMembers.join('\n') },
            { name: 'Prochaines étapes', value: 'Vous pouvez maintenant utiliser `/search-match` pour rechercher un adversaire.' }
        );
    
    await interaction.editReply({
        embeds: [embed],
        ephemeral: true
    });
    
    // If team is now complete, update team channel
    if (adminTeam.members.length >= 4 && adminTeam.channelId) {
        try {
            const channel = await interaction.guild.channels.fetch(adminTeam.channelId);
            if (channel) {
                const notificationEmbed = new EmbedBuilder()
                    .setColor('#00FF00')
                    .setTitle('Équipe complète!')
                    .setDescription(`Votre équipe a maintenant ${adminTeam.members.length} membres et est prête pour les matchs.`)
                    .addFields(
                        { name: 'Membres virtuels ajoutés', value: `${actualCount} joueurs virtuels ont rejoint l'équipe.` },
                        { name: 'Que faire maintenant?', value: 'Utilisez la commande `/search-match` pour trouver un adversaire!' }
                    );
                
                await channel.send({ 
                    content: `🎮 Attention! Votre équipe est maintenant complète avec des joueurs virtuels!`,
                    embeds: [notificationEmbed] 
                });
            }
        } catch (error) {
            console.error('Erreur lors de la notification du canal d\'équipe:', error);
        }
    }
}