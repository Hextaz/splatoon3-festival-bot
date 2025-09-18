const { EmbedBuilder } = require('discord.js');
const teamManager = require('./teamManager');
const { finishMatch } = require('./matchSearch');

// Récupérer un matchup pour une équipe
function getMatchup(teamName) {
    // Trouver l'équipe dans la liste
    const teams = teamManager.getAllTeams();
    const team = teams.find(t => t.name === teamName);
    
    if (!team) {
        throw new Error(`Team "${teamName}" not found.`);
    }
    
    // Vérifier si l'équipe est déjà en match
    if (team.currentOpponent) {
        const opponent = teams.find(t => t.name === team.currentOpponent);
        return { team, opponent, alreadyMatched: true };
    }
    
    // Trouver un adversaire disponible
    const availableOpponents = teams.filter(t => 
        t.name !== teamName && 
        !t.busy
    );
    
    if (availableOpponents.length === 0) {
        throw new Error("No available opponents found.");
    }
    
    // Sélectionner un adversaire au hasard
    const opponent = availableOpponents[Math.floor(Math.random() * availableOpponents.length)];
    
    // Marquer les deux équipes comme étant en match
    team.busy = true;
    team.currentOpponent = opponent.name;
    opponent.busy = true;
    opponent.currentOpponent = team.name;
    
    return { team, opponent, alreadyMatched: false };
}

// Valider les résultats d'un match
function validateResults(team1Result, team2Result) {
    if (!(team1Result === 'V' || team1Result === 'D')) {
        throw new Error("Team 1 result must be 'V' (Victory) or 'D' (Defeat)");
    }
    
    if (!(team2Result === 'V' || team2Result === 'D')) {
        throw new Error("Team 2 result must be 'V' (Victory) or 'D' (Defeat)");
    }
    
    if ((team1Result === 'V' && team2Result === 'V') || (team1Result === 'D' && team2Result === 'D')) {
        throw new Error("Both teams cannot have the same result. One must win and one must lose.");
    }
}

// Rediriger vers finishMatch dans matchSearch.js
function clearMatchup(team1Name, team2Name, guildId) {
    return finishMatch(team1Name, team2Name, guildId);
}

module.exports = {
    getMatchup,
    validateResults,
    clearMatchup
};