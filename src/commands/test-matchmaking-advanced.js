// src/commands/test-matchmaking-advanced.js
const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
// In src/commands/test-matchmaking-advanced.js, add this import at the top:
const { getAllTeams, saveTeams } = require('../utils/teamManager');
const { calculateOpponentScore, getTeamMatchHistory, finishMatch } = require('../utils/matchSearch');
const matchHistoryManager = require('../utils/matchHistoryManager');
const scoreTracker = require('../utils/scoreTracker');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('test-matchmaking-advanced')
        .setDescription('Test avancé du système de matchmaking avec expérimentation des temps d\'attente (Admin)')
        .addIntegerOption(option =>
            option.setName('duration')
                .setDescription('Durée du test en minutes')
                .setRequired(false)
                .setMinValue(5)
                .setMaxValue(60))
        .addBooleanOption(option =>
            option.setName('detailed-scoring')
                .setDescription('Afficher le scoring détaillé en temps réel')
                .setRequired(false))
        .addBooleanOption(option =>
            option.setName('simulate-results')
                .setDescription('Simuler automatiquement les résultats de match')
                .setRequired(false))
        .setDefaultMemberPermissions(PermissionFlagsBits.ADMINISTRATOR),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: false });
        
        const testDuration = (interaction.options.getInteger('duration') || 20) * 60 * 1000;
        const detailedScoring = interaction.options.getBoolean('detailed-scoring') ?? true;
        const simulateResults = interaction.options.getBoolean('simulate-results') ?? true;
        
        const allTeams = await (await getAllTeams()).filter(t => t.isVirtual && t.members.length >= 4);
        
        if (allTeams.length < 8) {
            return await interaction.editReply({
                content: '❌ Il faut au moins 8 équipes virtuelles complètes. Utilisez `/test-mode create-teams count:12` d\'abord.'
            });
        }
        
        // Réinitialiser l'état de toutes les équipes
        allTeams.forEach(team => {
            team.busy = false;
            team.currentOpponent = null;
            team.currentMatchMultiplier = null;
            team.matchChannelId = null;
        });
        saveTeams();
        
        // Structure pour suivre l'expérience
        const experiment = {
            startTime: Date.now(),
            endTime: Date.now() + testDuration,
            metrics: {
                totalMatchesCreated: 0,
                matchesCompleted: 0,
                averageWaitTimes: new Map(),
                scoringDistribution: {
                    excellent: 0,    // ≥130
                    good: 0,        // 80-129
                    ok: 0,          // 50-79
                    poor: 0         // <50
                },
                waitTimeExperiments: {
                    under1min: { attempts: 0, matches: 0, rejections: 0 },
                    between1and2min: { attempts: 0, matches: 0, rejections: 0 },
                    over2min: { attempts: 0, matches: 0, rejections: 0 }
                },
                rematchPatterns: {
                    neverFaced: 0,
                    over5matches: 0,
                    between3and5: 0,
                    exactly2matches: 0,
                    lastMatch: 0
                }
            },
            snapshots: [],
            realTimeEvents: []
        };
        
        await interaction.editReply({
            content: `🧪 **Test avancé du matchmaking lancé**\n` +
                     `⏱️ **Durée**: ${interaction.options.getInteger('duration')} minutes\n` +
                     `🤖 **${allTeams.length}** équipes virtuelles prêtes\n` +
                     `📊 Scoring détaillé: ${detailedScoring ? 'Activé' : 'Désactivé'}\n` +
                     `🎯 Simulation résultats: ${simulateResults ? 'Activée' : 'Désactivée'}`
        });
        
        // Créer différents scenarios d'historique pour tester
        await setupMatchHistoryScenarios(allTeams, experiment);
        
        // Démarrer toutes les équipes en recherche avec des délais étalés
        await initiateStaggeredSearches(allTeams, experiment, interaction);
        
        // Monitorer en temps réel
        const monitoringInterval = setInterval(async () => {
            await monitorMatchmakingState(experiment, allTeams, detailedScoring, interaction);
            
            if (Date.now() >= experiment.endTime) {
                clearInterval(monitoringInterval);
                await finalizeExperiment(experiment, allTeams, interaction, simulateResults);
            }
        }, 10000); // Monitoring toutes les 10 secondes
        
        // Simulator de résultats si activé
        if (simulateResults) {
            startResultSimulator(experiment, allTeams);
        }
    }
};

// Créer des scenarios d'historique diversifiés
async function setupMatchHistoryScenarios(teams, experiment) {
    console.log('🎭 Configuration des scenarios d\'historique...');
    
    // Scénario 1: Équipes qui ne se sont jamais affrontées (groupes A et B)
    const groupA = teams.slice(0, 4);
    const groupB = teams.slice(4, 8);
    
    // Scénario 2: Équipes avec historique modéré (3-5 matchs d'écart)
    if (teams.length >= 10) {
        const team1 = teams[8];
        const team2 = teams[9];
        
        // Simuler 3 matchs d'historique entre eux
        for (let i = 0; i < 3; i++) {
            matchHistoryManager.addMatchToHistory(team1.name, team2.name);
            await wait(100);
        }
        
        // Ajouter d'autres matchs pour créer de la distance
        for (let i = 0; i < 5; i++) {
            matchHistoryManager.addMatchToHistory(team1.name, groupA[i % 4].name);
            await wait(100);
        }
    }
    
    // Scénario 3: Équipes qui se sont affrontées récemment (1-2 matchs d'écart)
    if (teams.length >= 12) {
        const recentTeam1 = teams[10];
        const recentTeam2 = teams[11];
        
        // Dernier match entre eux
        matchHistoryManager.addMatchToHistory(recentTeam1.name, recentTeam2.name);
        
        // Seulement 1 autre match depuis
        matchHistoryManager.addMatchToHistory(recentTeam1.name, groupA[0].name);
    }
    
    experiment.realTimeEvents.push({
        timestamp: Date.now(),
        type: 'SETUP',
        message: 'Scenarios d\'historique configurés'
    });
    
    console.log('✅ Scenarios d\'historique configurés');
}

// Lancer les recherches de manière étalée
async function initiateStaggeredSearches(teams, experiment, interaction) {
    console.log('🚀 Lancement des recherches étalées...');
    
    let searchesStarted = 0;
    
    // Hook pour compter les matchs créés
    const originalCreateMatch = require('../utils/matchSearch').createMatch;
    const { matchSearch } = require('../utils/matchSearch');
    
    // Intercepter les créations de matchs pour les compter
    let matchCreationCount = 0;
    
    for (let i = 0; i < teams.length; i++) {
        const team = teams[i];
        
        // Étaler les démarrages sur 30 secondes
        setTimeout(() => {
            const { startVirtualTeamSearch } = require('../utils/matchSearch');
            if (startVirtualTeamSearch(team, interaction.guild)) {
                searchesStarted++;
                console.log(`[STAGGER] ${team.name} a commencé sa recherche (${searchesStarted}/${teams.length})`);
                
                experiment.realTimeEvents.push({
                    timestamp: Date.now(),
                    type: 'SEARCH_START',
                    teamName: team.name,
                    waitTime: 0
                });
            }
        }, i * 2500); // 2.5 secondes entre chaque démarrage
    }
    
    // Surveiller les créations de matchs
    const matchCreationWatcher = setInterval(() => {
        const currentMatches = teams.filter(t => t.busy && t.currentOpponent).length / 2;
        const newMatches = currentMatches - (experiment.metrics.totalMatchesCreated - experiment.metrics.matchesCompleted);
        
        if (newMatches > 0) {
            experiment.metrics.totalMatchesCreated += newMatches;
            console.log(`[WATCHER] ${newMatches} nouveaux matchs détectés (total: ${experiment.metrics.totalMatchesCreated})`);
        }
        
        if (Date.now() >= experiment.endTime) {
            clearInterval(matchCreationWatcher);
        }
    }, 2000);
    
    experiment.realTimeEvents.push({
        timestamp: Date.now(),
        type: 'STAGGER_INIT',
        message: `Démarrage échelonné de ${teams.length} recherches sur 30 secondes`
    });
}

// Monitorer l'état du matchmaking en temps réel
async function monitorMatchmakingState(experiment, teams, detailedScoring, interaction) {
    const now = Date.now();
    const { getSearchingTeams } = require('../utils/matchSearch');
    const searchingTeams = getSearchingTeams();
    
    // Compter les matchs actuels
    const currentMatches = teams.filter(t => t.busy && t.currentOpponent).length / 2; // Diviser par 2 car chaque match compte 2 équipes
    const totalMatchesEverCreated = experiment.metrics.matchesCompleted + currentMatches;
    
    // Mettre à jour le compteur de matchs créés
    experiment.metrics.totalMatchesCreated = Math.max(experiment.metrics.totalMatchesCreated, totalMatchesEverCreated);
    
    // Prendre un snapshot de l'état actuel
    const snapshot = {
        timestamp: now,
        elapsedTime: now - experiment.startTime,
        searchingTeams: searchingTeams.length,
        busyTeams: teams.filter(t => t.busy).length,
        availableTeams: teams.filter(t => !t.busy && !searchingTeams.some(s => s.team.name === t.name)).length,
        activeMatches: currentMatches
    };
    
    experiment.snapshots.push(snapshot);
    
    // Analyser les tentatives de match en cours
    if (searchingTeams.length >= 2) {
        await analyzeCurrentMatchingAttempts(experiment, searchingTeams, detailedScoring);
    }
    
    // Log périodique
    if (experiment.snapshots.length % 6 === 0) { // Toutes les minutes
        console.log(`[MONITOR] ${Math.round(snapshot.elapsedTime/60000)}min - ` +
                   `Recherche: ${snapshot.searchingTeams}, En match: ${snapshot.busyTeams}, Libres: ${snapshot.availableTeams}`);
    }
    
    // Update périodique dans Discord
    if (experiment.snapshots.length % 12 === 0) { // Toutes les 2 minutes
        await sendProgressUpdate(experiment, interaction);
    }
}

// Analyser les tentatives de matching actuelles
async function analyzeCurrentMatchingAttempts(experiment, searchingTeams, detailedScoring) {
    for (let i = 0; i < searchingTeams.length - 1; i++) {
        for (let j = i + 1; j < searchingTeams.length; j++) {
            const team1 = searchingTeams[i].team;
            const team2 = searchingTeams[j].team;
            
            const waitTime1 = Date.now() - searchingTeams[i].startTime;
            const waitTime2 = Date.now() - searchingTeams[j].startTime;
            const avgWaitTime = (waitTime1 + waitTime2) / 2;
            
            const score1to2 = calculateOpponentScore(team1.name, { ...team2, waitTime: waitTime2 });
            const score2to1 = calculateOpponentScore(team2.name, { ...team1, waitTime: waitTime1 });
            
            // Analyser le pattern de rematch
            const rematchPattern = analyzeRematchPattern(team1.name, team2.name);
            experiment.metrics.rematchPatterns[rematchPattern]++;
            
            // Analyser le seuil de temps d'attente
            const waitTimeCategory = categorizeWaitTime(avgWaitTime);
            const wouldMatch = wouldTeamsMatch(score1to2, score2to1, avgWaitTime);
            
            experiment.metrics.waitTimeExperiments[waitTimeCategory].attempts++;
            if (wouldMatch) {
                experiment.metrics.waitTimeExperiments[waitTimeCategory].matches++;
            } else {
                experiment.metrics.waitTimeExperiments[waitTimeCategory].rejections++;
            }
            
            // Categoriser le score
            const avgScore = (score1to2 + score2to1) / 2;
            if (avgScore >= 130) experiment.metrics.scoringDistribution.excellent++;
            else if (avgScore >= 80) experiment.metrics.scoringDistribution.good++;
            else if (avgScore >= 50) experiment.metrics.scoringDistribution.ok++;
            else experiment.metrics.scoringDistribution.poor++;
            
            if (detailedScoring) {
                console.log(`[ANALYSIS] ${team1.name} vs ${team2.name}: ` +
                           `Scores(${score1to2}/${score2to1}), Attente(${Math.round(avgWaitTime/1000)}s), ` +
                           `Pattern(${rematchPattern}), Match(${wouldMatch})`);
            }
        }
    }
}

// Analyser le pattern de rematch
function analyzeRematchPattern(team1Name, team2Name) {
    const history1 = getTeamMatchHistory(team1Name);
    const lastFaceOff = history1.recentHistory.find(h => h.opponent === team2Name);
    
    if (!lastFaceOff) {
        return 'neverFaced';
    } else if (lastFaceOff.matchesAgo > 5) {
        return 'over5matches';
    } else if (lastFaceOff.matchesAgo >= 3) {
        return 'between3and5';
    } else if (lastFaceOff.matchesAgo === 2) {
        return 'exactly2matches';
    } else {
        return 'lastMatch';
    }
}

// Catégoriser le temps d'attente
function categorizeWaitTime(waitTimeMs) {
    const minutes = waitTimeMs / (60 * 1000);
    if (minutes < 1) return 'under1min';
    if (minutes < 2) return 'between1and2min';
    return 'over2min';
}

// Déterminer si les équipes seraient matchées selon les règles actuelles
function wouldTeamsMatch(score1, score2, avgWaitTime) {
    const avgScore = (score1 + score2) / 2;
    const waitTimeMinutes = avgWaitTime / (60 * 1000);
    
    // Reproduction de la logique de selectOpponentWithWeighting
    if (waitTimeMinutes < 1) {
        return avgScore >= 130; // Seulement excellent
    } else if (waitTimeMinutes < 2) {
        return avgScore >= 80;  // Excellent + bon
    } else {
        return avgScore >= 1;   // Tous (dernier recours)
    }
}

// Simulateur de résultats automatique
function startResultSimulator(experiment, teams) {
    console.log('🎮 Démarrage du simulateur de résultats...');
    
    const simulator = setInterval(() => {
        if (Date.now() >= experiment.endTime) {
            clearInterval(simulator);
            console.log('🏁 Simulateur de résultats arrêté (fin du test)');
            return;
        }
        
        // Trouver toutes les équipes en match
        const busyTeams = teams.filter(t => t.busy && t.currentOpponent);
        const matchPairs = [];
        
        // Créer les paires de matchs (éviter les doublons)
        for (const team of busyTeams) {
            const opponent = teams.find(t => t.name === team.currentOpponent);
            if (opponent && !matchPairs.some(pair => 
                (pair.team1.name === team.name && pair.team2.name === opponent.name) ||
                (pair.team1.name === opponent.name && pair.team2.name === team.name)
            )) {
                matchPairs.push({ team1: team, team2: opponent });
            }
        }
        
        console.log(`[SIMULATOR] ${matchPairs.length} matchs en cours`);
        
        // Simuler la fin de certains matchs (20% de chance par cycle)
        for (const pair of matchPairs) {
            if (Math.random() < 0.2) { // 20% de chance de finir ce match
                console.log(`[SIMULATOR] Simulation fin de match : ${pair.team1.name} vs ${pair.team2.name}`);
                const result = simulateMatchResult(pair.team1, pair.team2, experiment);
                if (result) {
                    console.log(`[SIMULATOR] ✅ ${result.winner} bat ${result.loser} (x${result.multiplier})`);
                } else {
                    console.log(`[SIMULATOR] ❌ Échec simulation`);
                }
            }
        }
        
    }, 3000); // Vérifier toutes les 3 secondes
    
    return simulator;
}

// Simuler un résultat de match
function simulateMatchResult(team1, team2, experiment) {
    try {
        // Vérifier que les équipes sont bien en match
        if (!team1.busy || !team2.busy || team1.currentOpponent !== team2.name || team2.currentOpponent !== team1.name) {
            console.log(`❌ État incohérent pour ${team1.name} vs ${team2.name}`);
            return null;
        }
        
        // Choisir un gagnant aléatoire
        const isTeam1Winner = Math.random() < 0.5;
        const winner = isTeam1Winner ? team1 : team2;
        const loser = isTeam1Winner ? team2 : team1;
        
        // Récupérer le multiplicateur
        const multiplier = team1.currentMatchMultiplier || team2.currentMatchMultiplier || 1;
        
        // Terminer le match proprement sans mettre à jour les scores
        const { finishMatch } = require('../utils/matchSearch');
        finishMatch(team1.name, team2.name, interaction.guild.id);
        
        experiment.metrics.matchesCompleted++;
        experiment.realTimeEvents.push({
            timestamp: Date.now(),
            type: 'MATCH_COMPLETED',
            winner: winner.name,
            loser: loser.name,
            multiplier: multiplier
        });
        
        console.log(`[RESULT] ${winner.name} bat ${loser.name} (x${multiplier})`);
        
        return {
            winner: winner.name,
            loser: loser.name,
            multiplier: multiplier
        };
        
    } catch (error) {
        console.error('Erreur simulation résultat:', error);
        
        // En cas d'erreur, libérer les équipes manuellement
        try {
            team1.busy = false;
            team1.currentOpponent = null;
            team1.currentMatchMultiplier = null;
            
            team2.busy = false;
            team2.currentOpponent = null;
            team2.currentMatchMultiplier = null;
            
            const { saveTeams } = require('../utils/teamManager');
            saveTeams();
        } catch (cleanupError) {
            console.error('Erreur nettoyage équipes:', cleanupError);
        }
        
        return null;
    }
}

// Envoyer une mise à jour de progression
async function sendProgressUpdate(experiment, interaction) {
    const elapsed = Date.now() - experiment.startTime;
    const remaining = experiment.endTime - Date.now();
    
    const embed = new EmbedBuilder()
        .setColor('#FF9900')
        .setTitle('🧪 Test de matchmaking en cours')
        .setDescription(`Progression du test avancé`)
        .addFields(
            {
                name: '⏱️ Temps',
                value: `Écoulé: ${Math.round(elapsed/60000)}min\nRestant: ${Math.round(remaining/60000)}min`,
                inline: true
            },
            {
                name: '🎯 Matchs',
                value: `Créés: ${experiment.metrics.totalMatchesCreated}\nTerminés: ${experiment.metrics.matchesCompleted}`,
                inline: true
            },
            {
                name: '📊 Distribution scores',
                value: `🏆 Excellent: ${experiment.metrics.scoringDistribution.excellent}\n` +
                       `⭐ Bon: ${experiment.metrics.scoringDistribution.good}\n` +
                       `⚠️ OK: ${experiment.metrics.scoringDistribution.ok}\n` +
                       `🚨 Faible: ${experiment.metrics.scoringDistribution.poor}`,
                inline: false
            }
        );
    
    await interaction.followUp({
        embeds: [embed],
        ephemeral: false
    });
}

// Finaliser l'expérience et générer le rapport
async function finalizeExperiment(experiment, teams, interaction, simulateResults) {
    console.log('📊 Finalisation de l\'expérience...');
    
    // Libérer toutes les équipes encore en match
    teams.forEach(team => {
        if (team.busy) {
            team.busy = false;
            team.currentOpponent = null;
            team.currentMatchMultiplier = null;
        }
    });
    saveTeams();
    
    // Calculer les métriques finales
    const totalDuration = experiment.endTime - experiment.startTime;
    const finalReport = generateFinalReport(experiment, totalDuration);
    
    // Envoyer le rapport complet
    await sendFinalReport(finalReport, interaction);
    
    // Générer et envoyer les graphiques de données
    await sendDataVisualization(experiment, interaction);
}

// Générer le rapport final
function generateFinalReport(experiment, totalDuration) {
    const waitTimeExp = experiment.metrics.waitTimeExperiments;
    const rematchPatterns = experiment.metrics.rematchPatterns;
    const scoring = experiment.metrics.scoringDistribution;
    
    return {
        duration: totalDuration,
        totalEvents: experiment.realTimeEvents.length,
        snapshots: experiment.snapshots.length,
        
        // Efficacité du système
        matchCreationRate: (experiment.metrics.totalMatchesCreated / (totalDuration / 60000)).toFixed(2), // matches/min
        matchCompletionRate: (experiment.metrics.matchesCompleted / Math.max(experiment.metrics.totalMatchesCreated, 1) * 100).toFixed(1), // %
        
        // Analyse des temps d'attente
        waitTimeEffectiveness: {
            under1min: {
                ...waitTimeExp.under1min,
                successRate: waitTimeExp.under1min.attempts > 0 ? 
                    (waitTimeExp.under1min.matches / waitTimeExp.under1min.attempts * 100).toFixed(1) : '0'
            },
            between1and2min: {
                ...waitTimeExp.between1and2min,
                successRate: waitTimeExp.between1and2min.attempts > 0 ? 
                    (waitTimeExp.between1and2min.matches / waitTimeExp.between1and2min.attempts * 100).toFixed(1) : '0'
            },
            over2min: {
                ...waitTimeExp.over2min,
                successRate: waitTimeExp.over2min.attempts > 0 ? 
                    (waitTimeExp.over2min.matches / waitTimeExp.over2min.attempts * 100).toFixed(1) : '0'
            }
        },
        
        // Analyse des patterns de rematch
        rematchAnalysis: {
            diversityScore: calculateDiversityScore(rematchPatterns),
            neverFacedRatio: (rematchPatterns.neverFaced / Object.values(rematchPatterns).reduce((a, b) => a + b, 1) * 100).toFixed(1),
            recentRematchRatio: (rematchPatterns.lastMatch / Object.values(rematchPatterns).reduce((a, b) => a + b, 1) * 100).toFixed(1)
        },
        
        // Distribution des scores
        scoringAnalysis: {
            averageScore: calculateAverageScore(scoring),
            qualityDistribution: scoring
        }
    };
}

// Calculer le score de diversité
function calculateDiversityScore(patterns) {
    const total = Object.values(patterns).reduce((a, b) => a + b, 1);
    const ideal = total / Object.keys(patterns).length;
    
    const variance = Object.values(patterns).reduce((sum, count) => {
        return sum + Math.pow(count - ideal, 2);
    }, 0) / Object.keys(patterns).length;
    
    // Score de 0 (mauvais) à 100 (parfait)
    return Math.max(0, (100 - Math.sqrt(variance) * 10)).toFixed(1);
}

// Calculer le score moyen pondéré
function calculateAverageScore(scoring) {
    const total = scoring.excellent + scoring.good + scoring.ok + scoring.poor;
    if (total === 0) return 0;
    
    return ((scoring.excellent * 150 + scoring.good * 105 + scoring.ok * 65 + scoring.poor * 25) / total).toFixed(1);
}

// Envoyer le rapport final
async function sendFinalReport(report, interaction) {
    const embed = new EmbedBuilder()
        .setColor('#00FF00')
        .setTitle('📊 Rapport final - Test avancé du matchmaking')
        .setDescription(`Analyse complète des performances sur ${Math.round(report.duration/60000)} minutes`)
        .addFields(
            {
                name: '🎯 Performance générale',
                value: `**Taux de création**: ${report.matchCreationRate} matchs/min\n` +
                       `**Taux de completion**: ${report.matchCompletionRate}%\n` +
                       `**Score moyen**: ${report.scoringAnalysis.averageScore} points`,
                inline: false
            },
            {
                name: '⏱️ Efficacité des temps d\'attente',
                value: `**<1min**: ${report.waitTimeEffectiveness.under1min.successRate}% (${report.waitTimeEffectiveness.under1min.matches}/${report.waitTimeEffectiveness.under1min.attempts})\n` +
                       `**1-2min**: ${report.waitTimeEffectiveness.between1and2min.successRate}% (${report.waitTimeEffectiveness.between1and2min.matches}/${report.waitTimeEffectiveness.between1and2min.attempts})\n` +
                       `**>2min**: ${report.waitTimeEffectiveness.over2min.successRate}% (${report.waitTimeEffectiveness.over2min.matches}/${report.waitTimeEffectiveness.over2min.attempts})`,
                inline: false
            },
            {
                name: '🔄 Analyse des rematches',
                value: `**Score de diversité**: ${report.rematchAnalysis.diversityScore}/100\n` +
                       `**Nouveaux matchs**: ${report.rematchAnalysis.neverFacedRatio}%\n` +
                       `**Rematches récents**: ${report.rematchAnalysis.recentRematchRatio}%`,
                inline: false
            },
            {
                name: '📈 Distribution qualité',
                value: `🏆 **${report.scoringAnalysis.qualityDistribution.excellent}** Excellent (≥130)\n` +
                       `⭐ **${report.scoringAnalysis.qualityDistribution.good}** Bon (80-129)\n` +
                       `⚠️ **${report.scoringAnalysis.qualityDistribution.ok}** OK (50-79)\n` +
                       `🚨 **${report.scoringAnalysis.qualityDistribution.poor}** Faible (<50)`,
                inline: false
            }
        )
        .setTimestamp();
    
    await interaction.followUp({
        embeds: [embed],
        ephemeral: false
    });
}

// Envoyer la visualisation des données
async function sendDataVisualization(experiment, interaction) {
    const timelineEmbed = new EmbedBuilder()
        .setColor('#0099FF')
        .setTitle('📈 Timeline des événements')
        .setDescription('Chronologie des événements marquants du test');
    
    // Événements marquants
    const keyEvents = experiment.realTimeEvents
        .filter(event => ['MATCH_COMPLETED', 'SEARCH_START'].includes(event.type))
        .slice(-10); // Derniers 10 événements
    
    if (keyEvents.length > 0) {
        const timeline = keyEvents.map(event => {
            const elapsed = Math.round((event.timestamp - experiment.startTime) / 1000);
            if (event.type === 'MATCH_COMPLETED') {
                return `\`${elapsed}s\` 🏆 ${event.winner} bat ${event.loser} (x${event.multiplier})`;
            } else {
                return `\`${elapsed}s\` 🔍 ${event.teamName} démarre sa recherche`;
            }
        }).join('\n');
        
        timelineEmbed.addFields({
            name: 'Derniers événements',
            value: timeline,
            inline: false
        });
    }
    
    // Graphique d'activité (ASCII simple)
    const activityGraph = generateASCIIActivityGraph(experiment.snapshots);
    if (activityGraph) {
        timelineEmbed.addFields({
            name: '📊 Activité de recherche dans le temps',
            value: '```\n' + activityGraph + '\n```',
            inline: false
        });
    }
    
    await interaction.followUp({
        embeds: [timelineEmbed],
        ephemeral: false
    });
}

// Générer un graphique ASCII simple
function generateASCIIActivityGraph(snapshots) {
    if (snapshots.length < 5) return null;
    
    const samples = snapshots.filter((_, index) => index % Math.ceil(snapshots.length / 20) === 0);
    const maxSearching = Math.max(...samples.map(s => s.searchingTeams));
    
    if (maxSearching === 0) return null;
    
    let graph = 'Équipes en recherche │\n';
    
    for (let level = maxSearching; level > 0; level--) {
        graph += `${level.toString().padStart(2)} `;
        graph += samples.map(s => s.searchingTeams >= level ? '█' : ' ').join('');
        graph += '\n';
    }
    
    graph += '   └' + '─'.repeat(samples.length) + '\n';
    graph += '    0' + ' '.repeat(Math.max(0, samples.length - 10)) + 'Temps →';
    
    return graph;
}

// Fonction utilitaire d'attente
function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}