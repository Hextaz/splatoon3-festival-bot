// src/utils/matchHistoryManager.js
const DataAdapter = require('./dataAdapter');

// Maps pour gérer l'historique des matchs par guild
const teamMatchHistoryByGuild = new Map(); // guildId -> Map<teamName, Array<opponentNames>>
const teamMatchCountersByGuild = new Map(); // guildId -> Map<teamName, number>

// Helper pour obtenir le DataAdapter
function getDataAdapter(guildId) {
    if (!guildId) {
        console.warn('Aucun guildId défini pour matchHistoryManager');
        return null;
    }
    return new DataAdapter(guildId);
}

// Helper pour obtenir l'historique d'une guild
function getHistoryForGuild(guildId) {
    if (!guildId) return new Map();
    if (!teamMatchHistoryByGuild.has(guildId)) {
        teamMatchHistoryByGuild.set(guildId, new Map());
    }
    return teamMatchHistoryByGuild.get(guildId);
}

// Helper pour obtenir les compteurs d'une guild
function getCountersForGuild(guildId) {
    if (!guildId) return new Map();
    if (!teamMatchCountersByGuild.has(guildId)) {
        teamMatchCountersByGuild.set(guildId, new Map());
    }
    return teamMatchCountersByGuild.get(guildId);
}

// Charger l'historique depuis MongoDB
async function loadMatchHistory(guildId) {
    try {
        const adapter = getDataAdapter(guildId);
        if (!adapter) {
            console.error('DataAdapter non disponible pour matchHistoryManager');
            return;
        }

        const data = await adapter.getMatchHistory();
        if (data) {
            // Convertir les données en Maps
            const history = new Map();
            const counters = new Map();
            
            for (const [teamName, teamData] of Object.entries(data)) {
                if (teamData.opponents) {
                    history.set(teamName, teamData.opponents);
                }
                if (typeof teamData.matchCounter === 'number') {
                    counters.set(teamName, teamData.matchCounter);
                }
            }
            
            teamMatchHistoryByGuild.set(guildId, history);
            teamMatchCountersByGuild.set(guildId, counters);
            console.log(`Historique des matchs chargé pour ${history.size} équipes`);
        } else {
            console.log('Aucun historique trouvé, initialisation par défaut');
            teamMatchHistoryByGuild.set(guildId, new Map());
            teamMatchCountersByGuild.set(guildId, new Map());
        }
    } catch (error) {
        console.error('Erreur lors du chargement de l\'historique:', error);
        teamMatchHistoryByGuild.set(guildId, new Map());
        teamMatchCountersByGuild.set(guildId, new Map());
    }
}

// Sauvegarder l'historique
async function saveMatchHistory(guildId) {
    try {
        const adapter = getDataAdapter(guildId);
        if (!adapter) {
            console.error('DataAdapter non disponible pour matchHistoryManager');
            return;
        }

        const history = getHistoryForGuild(guildId);
        const counters = getCountersForGuild(guildId);
        const dataToSave = {};
        
        // Combiner historique et compteurs
        for (const [teamName, opponents] of history.entries()) {
            dataToSave[teamName] = {
                opponents: opponents,
                matchCounter: counters.get(teamName) || 0
            };
        }
        
        // Ajouter les équipes qui ont seulement des compteurs
        for (const [teamName, counter] of counters.entries()) {
            if (!dataToSave[teamName]) {
                dataToSave[teamName] = {
                    opponents: [],
                    matchCounter: counter
                };
            }
        }
        
        await adapter.saveMatchHistory(dataToSave);
        console.log('Historique des matchs sauvegardé');
    } catch (error) {
        console.error('Erreur lors de la sauvegarde de l\'historique:', error);
    }
}

// Ajouter un match à l'historique
function addMatchToHistory(team1Name, team2Name, guildId) {
    const history = getHistoryForGuild(guildId);
    const counters = getCountersForGuild(guildId);
    
    // Initialiser les historiques si nécessaire
    if (!history.has(team1Name)) {
        history.set(team1Name, []);
    }
    if (!history.has(team2Name)) {
        history.set(team2Name, []);
    }
    
    // Obtenir les numéros de match actuels AVANT l'incrémentation
    const team1MatchNumber = (counters.get(team1Name) || 0) + 1;
    const team2MatchNumber = (counters.get(team2Name) || 0) + 1;
    
    // CORRECTION: Ajouter les adversaires avec le FORMAT CORRECT (objet avec opponent et matchNumber)
    history.get(team1Name).push({
        opponent: team2Name,
        matchNumber: team1MatchNumber
    });
    history.get(team2Name).push({
        opponent: team1Name,
        matchNumber: team2MatchNumber
    });
    
    // Incrémenter les compteurs APRÈS avoir utilisé les valeurs
    counters.set(team1Name, team1MatchNumber);
    counters.set(team2Name, team2MatchNumber);
    
    // Limiter l'historique pour éviter qu'il devienne trop grand
    const MAX_HISTORY = 10;
    if (history.get(team1Name).length > MAX_HISTORY) {
        history.get(team1Name).shift();
    }
    if (history.get(team2Name).length > MAX_HISTORY) {
        history.get(team2Name).shift();
    }
    
    console.log(`Match ajouté à l'historique: ${team1Name} vs ${team2Name}`);
}

// Vérifier si deux équipes ont joué récemment
function havePlayedRecently(team1Name, team2Name, guildId, recentThreshold = 3) {
    const history = getHistoryForGuild(guildId);
    
    if (!history.has(team1Name)) return false;
    
    const team1History = history.get(team1Name);
    const recentOpponents = team1History.slice(-recentThreshold);
    
    return recentOpponents.includes(team2Name);
}

// Obtenir le nombre de matchs d'une équipe
function getTeamMatchCount(teamName, guildId) {
    const counters = getCountersForGuild(guildId);
    return counters.get(teamName) || 0;
}

// Obtenir l'historique d'une équipe
function getTeamHistory(teamName, guildId) {
    const history = getHistoryForGuild(guildId);
    return history.get(teamName) || [];
}

// Calculer le score d'un adversaire pour le matchmaking
function calculateOpponentScore(teamName, potentialOpponent, guildId) {
    const history = getHistoryForGuild(guildId);
    const counters = getCountersForGuild(guildId);
    
    const teamHistory = history.get(teamName) || [];
    const currentMatchNumber = counters.get(teamName) || 0;
    
    let score = 100; // Score de base
    
    // Bonus pour les équipes d'un autre camp (avec lazy loading)
    try {
        const { getAllTeams } = require('./teamManager');
        const allTeams = getAllTeams(guildId);
        const team = allTeams.find(t => t.name === teamName);
        const opponent = allTeams.find(t => t.name === potentialOpponent.name);
        
        if (team && opponent && team.camp !== opponent.camp) {
            score += 50;
        }
    } catch (error) {
        console.warn('Impossible de récupérer les équipes pour le calcul du score adversaire');
    }
    
    // Pénalités basées sur la distance en nombre de matchs
    const matchesAgainstOpponent = teamHistory.filter(match => match.opponent === potentialOpponent.name);
    
    if (matchesAgainstOpponent.length > 0) {
        const lastMatchAgainst = matchesAgainstOpponent[matchesAgainstOpponent.length - 1];
        const matchesSinceLastFaceOff = currentMatchNumber - lastMatchAgainst.matchNumber;
        
        // DEBUG: Afficher les détails du calcul anti-répétition
        console.log(`🔍 Anti-répétition ${teamName} vs ${potentialOpponent.name}:`);
        console.log(`   📊 Matchs historiques: ${matchesAgainstOpponent.length}`);
        console.log(`   🎯 Dernier affrontement au match #${lastMatchAgainst.matchNumber}`);
        console.log(`   📈 Match actuel: #${currentMatchNumber}`);
        console.log(`   📏 Distance: ${matchesSinceLastFaceOff} matchs`);
        
        if (matchesSinceLastFaceOff === 0) {
            score -= 100;
            console.log(`   ❌ Pénalité: -100 (affrontement immédiat)`);
        } else if (matchesSinceLastFaceOff === 1) {
            score -= 80;
            console.log(`   ❌ Pénalité: -80 (1 match d'écart)`);
        } else if (matchesSinceLastFaceOff === 2) {
            score -= 50;
            console.log(`   ⚠️ Pénalité: -50 (2 matchs d'écart)`);
        } else if (matchesSinceLastFaceOff >= 3 && matchesSinceLastFaceOff <= 5) {
            score -= 20;
            console.log(`   ⚠️ Pénalité: -20 (3-5 matchs d'écart)`);
        } else {
            console.log(`   ✅ Aucune pénalité (${matchesSinceLastFaceOff} matchs d'écart)`);
        }
    } else {
        score += 30; // Bonus pour jamais affronté
        console.log(`🔍 Anti-répétition ${teamName} vs ${potentialOpponent.name}: ✅ Jamais affrontés (+30)`);
    }
    
    // Bonus temps d'attente
    if (potentialOpponent.waitTime) {
        const waitMinutes = potentialOpponent.waitTime / (60 * 1000);
        const waitBonus = Math.min(waitMinutes * 2, 20);
        score += waitBonus;
    }
    
    return Math.max(score, 1);
}

async function resetMatchHistory(guildId) {
    // Vider la mémoire
    teamMatchHistoryByGuild.set(guildId, new Map());
    teamMatchCountersByGuild.set(guildId, new Map());
    
    // Supprimer directement de la base de données
    const adapter = getDataAdapter(guildId);
    if (adapter) {
        try {
            await adapter.clearAllMatchHistory();
            console.log(`✅ Historique des matchs réinitialisé pour guild ${guildId} (mémoire + DB)`);
        } catch (error) {
            console.error('❌ Erreur lors du nettoyage DB de l\'historique:', error);
            console.log(`⚠️ Historique des matchs réinitialisé pour guild ${guildId} (mémoire uniquement)`);
        }
    } else {
        console.log(`⚠️ Pas d'adapter disponible - Historique des matchs réinitialisé pour guild ${guildId} (mémoire uniquement)`);
    }
}

// Nettoyer l'historique des équipes qui n'existent plus
function cleanupHistory(existingTeamNames, guildId) {
    const history = getHistoryForGuild(guildId);
    const counters = getCountersForGuild(guildId);
    
    // Supprimer les équipes qui n'existent plus
    for (const teamName of history.keys()) {
        if (!existingTeamNames.includes(teamName)) {
            history.delete(teamName);
            counters.delete(teamName);
        }
    }
    
    for (const teamName of counters.keys()) {
        if (!existingTeamNames.includes(teamName)) {
            counters.delete(teamName);
        }
    }
    
    console.log(`Historique nettoyé, ${history.size} équipes conservées`);
}

module.exports = {
    loadMatchHistory,
    saveMatchHistory,
    addMatchToHistory,
    havePlayedRecently,
    getTeamMatchCount,
    getTeamHistory,
    resetMatchHistory,
    cleanupHistory,
    getHistoryForGuild,
    getCountersForGuild,
    calculateOpponentScore
};
