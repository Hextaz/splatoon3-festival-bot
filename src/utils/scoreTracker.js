const fs = require('fs').promises;
const path = require('path');
// Remove direct imports to avoid circular dependencies
// const { getAllTeams } = require('./teamManager');
// const { getCurrentFestival } = require('./festivalManager');
const DataAdapter = require('./dataAdapter');

// Chemin vers le fichier de scores
const scoresPath = path.join(__dirname, '../../data/scores.json');

// Maps pour gérer les scores par guild
const scoresByGuild = new Map(); // guildId -> scoreTracker object

// Helper pour obtenir le DataAdapter
function getDataAdapter(guildId) {
    if (!guildId) {
        console.warn('Aucun guildId défini pour scoreTracker, utilisation JSON');
        return null;
    }
    return new DataAdapter(guildId);
}

// Helper pour obtenir le scoreTracker d'une guild spécifique
function getScoresForGuild(guildId) {
    if (!guildId) return createNewScoreTracker();
    if (!scoresByGuild.has(guildId)) {
        scoresByGuild.set(guildId, createNewScoreTracker());
    }
    return scoresByGuild.get(guildId);
}

// Helper pour créer un nouveau scoreTracker
function createNewScoreTracker() {
    return {
        scores: {
            camp1: 0,
            camp2: 0,
            camp3: 0
        },
        matchHistory: []
    };
}

// Sauvegarder les scores (MongoDB uniquement)
async function saveScores(guildId) {
    try {
        const adapter = getDataAdapter(guildId);
        
        if (!adapter) {
            throw new Error('DataAdapter non disponible - Guild ID manquant');
        }

        // Sauvegarder dans MongoDB
        console.log('💾 Sauvegarde des scores avec DataAdapter');
        const scoreTracker = getScoresForGuild(guildId);
        await adapter.saveScores(scoreTracker.scores);
        console.log('✅ Scores sauvegardés avec DataAdapter');
    } catch (error) {
        console.error('❌ ERREUR CRITIQUE lors de la sauvegarde des scores:', error);
        throw error; // Propager l'erreur au lieu de faire un fallback
    }
}

// Méthodes helper pour compter les matchs
function getMatchesWonByCamp(camp, guildId) {
    const scoreTracker = getScoresForGuild(guildId);
    if (!scoreTracker.matchHistory) return 0;
    return scoreTracker.matchHistory.filter(match => match.winner === camp).length;
}

function getMatchesLostByCamp(camp, guildId) {
    const scoreTracker = getScoresForGuild(guildId);
    if (!scoreTracker.matchHistory) return 0;
    return scoreTracker.matchHistory.filter(match => 
        match.winner && match.winner !== camp && 
        (match.team1Camp === camp || match.team2Camp === camp)
    ).length;
}

// Charger les scores (MongoDB uniquement)
async function loadScores(guildId) {
    try {
        const adapter = getDataAdapter(guildId);
        
        if (!adapter) {
            throw new Error('DataAdapter non disponible - Guild ID manquant');
        }

        // Charger depuis MongoDB
        console.log('📥 Chargement des scores avec DataAdapter');
        const scoresData = await adapter.getScores();
        
        const scoreTracker = getScoresForGuild(guildId);
        if (scoresData) {
            scoreTracker.scores = {
                camp1: scoresData.camp1 || 0,
                camp2: scoresData.camp2 || 0,
                camp3: scoresData.camp3 || 0
            };
            console.log(`✅ Scores chargés avec DataAdapter:`, scoreTracker.scores);
        } else {
            scoreTracker.scores = { camp1: 0, camp2: 0, camp3: 0 };
            console.log('✅ Aucun score trouvé dans MongoDB');
        }
        
        // Charger l'historique des matchs
        const matches = await adapter.getMatches();
        scoreTracker.matchHistory = matches || [];
    } catch (error) {
        console.error('❌ ERREUR CRITIQUE lors du chargement des scores:', error);
        const scoreTracker = getScoresForGuild(guildId);
        scoreTracker.scores = { camp1: 0, camp2: 0, camp3: 0 };
        scoreTracker.matchHistory = [];
        throw error; // Propager l'erreur au lieu de faire un fallback
    }
}

    // Générer un multiplicateur aléatoire pour un match
function generateMultiplier() {
    const rand = Math.random() * 100;
    if (rand < 1) return 333; // 1% de chance pour x333
    if (rand < 5) return 100; // 4% de chance pour x100
    if (rand < 15) return 10; // 10% de chance pour x10
    return 1; // 84% de chance pour x1
}

function updateScores(camp1Result, camp2Result, camp1Name, camp2Name, guildId, multiplier = 1) {
    if (camp1Result === camp2Result) {
        throw new Error("Both teams cannot have the same result. Please enter different results.");
    }
    
    // Récupérer les équipes avec lazy loading pour éviter la dépendance circulaire
    let allTeams = [];
    try {
        const { getAllTeams } = require('./teamManager');
        allTeams = getAllTeams(guildId);
    } catch (error) {
        console.error('Impossible de récupérer les équipes:', error);
        throw new Error("Unable to retrieve teams");
    }
    
    const team1 = allTeams.find(t => t.name === camp1Name);
    const team2 = allTeams.find(t => t.name === camp2Name);
    
    if (!team1 || !team2) {
        console.error('❌ Debug scoreTracker - Team not found:', {
            guildId,
            camp1Name,
            camp2Name,
            availableTeams: allTeams.map(t => t.name),
            totalTeams: allTeams.length,
            team1Found: !!team1,
            team2Found: !!team2
        });
        throw new Error(`Team not found: ${!team1 ? camp1Name : ''} ${!team2 ? camp2Name : ''} - Available teams: ${allTeams.map(t => t.name).join(', ')}`);
    }

    const basePoints = 1; // Points de base par victoire
    const pointsToAward = basePoints * multiplier;

    const scoreTracker = getScoresForGuild(guildId);
    
    // Enregistrer ce match dans l'historique
    scoreTracker.matchHistory.push({
        timestamp: Date.now(),
        team1: {
            name: camp1Name,
            camp: team1.camp,
            result: camp1Result
        },
        team2: {
            name: camp2Name,
            camp: team2.camp,
            result: camp2Result
        },
        winner: camp1Result === 'win' ? team1.camp : team2.camp,
        team1Camp: team1.camp,
        team2Camp: team2.camp,
        multiplier: multiplier
    });

    // Attribuer les points au camp gagnant
    if (camp1Result === 'win') {
        scoreTracker.scores[team1.camp] += pointsToAward;
    } else if (camp2Result === 'win') {
        scoreTracker.scores[team2.camp] += pointsToAward;
    }

    // Sauvegarder les scores
    saveScores(guildId);
    
    return scoreTracker.scores;
}

// Helper functions pour l'interface de l'ancien objet
function getCurrentScores(guildId) {
    const scoreTracker = getScoresForGuild(guildId);
    return scoreTracker.scores;
}

function getScoresAsPercentages(guildId) {
    const scoreTracker = getScoresForGuild(guildId);
    const totalPoints = scoreTracker.scores.camp1 + scoreTracker.scores.camp2 + scoreTracker.scores.camp3;
    if (totalPoints === 0) return { camp1: 0, camp2: 0, camp3: 0 };
    
    return {
        camp1: parseFloat(((scoreTracker.scores.camp1 / totalPoints) * 100).toFixed(2)),
        camp2: parseFloat(((scoreTracker.scores.camp2 / totalPoints) * 100).toFixed(2)),
        camp3: parseFloat(((scoreTracker.scores.camp3 / totalPoints) * 100).toFixed(2))
    };
}

function getWinningCamp(guildId) {
    const scoreTracker = getScoresForGuild(guildId);
    const maxScore = Math.max(...Object.values(scoreTracker.scores));
    if (maxScore === 0) return 'camp1'; // Par défaut si pas de score
    
    const winningCamps = Object.keys(scoreTracker.scores).filter(camp => scoreTracker.scores[camp] === maxScore);
    return winningCamps.length === 1 ? winningCamps[0] : 'Tie';
}

// Vérifier si on est à mi-parcours du festival
function isHalfwayPoint(guildId) {
    let festival = null;
    try {
        const { getCurrentFestival } = require('./festivalManager');
        festival = getCurrentFestival(guildId);
    } catch (error) {
        console.error('Impossible de récupérer le festival actuel:', error);
        return false;
        }
        
        if (!festival) return false;
        
        const startTime = new Date(festival.startDate).getTime();
        const endTime = new Date(festival.endDate).getTime();
        const currentTime = Date.now();
        
        const totalDuration = endTime - startTime;
        const halfwayPoint = startTime + (totalDuration / 2);
        
        // Vérifier si nous sommes proches du point médian (±1 heure)
        const oneHour = 60 * 60 * 1000;
        return Math.abs(currentTime - halfwayPoint) < oneHour;
}

// Récupérer l'historique des matchs
function getMatchHistory(guildId) {
    const scoreTracker = getScoresForGuild(guildId);
    return scoreTracker.matchHistory;
}

// Récupérer l'historique récent (derniers 10 matchs)
function getRecentMatches(guildId, count = 10) {
    const scoreTracker = getScoresForGuild(guildId);
    return scoreTracker.matchHistory.slice(-count);
}

// Réinitialiser complètement les scores et l'historique
async function resetScores(guildId) {
    try {
        const adapter = getDataAdapter(guildId);
        
        if (adapter) {
            // Supprimer de la base de données
            await adapter.clearAllScores();
            await adapter.clearAllMatches();
        }
        
        // Réinitialiser en mémoire
        const scoreTracker = getScoresForGuild(guildId);
        scoreTracker.scores = {
            camp1: 0,
            camp2: 0,
            camp3: 0
        };
        scoreTracker.matchHistory = [];
        
        console.log('✅ Scores et historique des matchs réinitialisés (base de données + mémoire)');
    } catch (error) {
        console.error('❌ Erreur lors du reset des scores:', error);
        // En cas d'erreur, au moins réinitialiser la mémoire
        const scoreTracker = getScoresForGuild(guildId);
        scoreTracker.scores = {
            camp1: 0,
            camp2: 0,
            camp3: 0
        };
        scoreTracker.matchHistory = [];
        throw error;
    }
}

module.exports = {
    saveScores,
    loadScores,
    updateScores,
    getCurrentScores,
    getScoresAsPercentages,
    getWinningCamp,
    isHalfwayPoint,
    getMatchHistory,
    getRecentMatches,
    resetScores,
    generateMultiplier,
    getMatchesWonByCamp,
    getMatchesLostByCamp,
    getScoresForGuild,
    createNewScoreTracker
};