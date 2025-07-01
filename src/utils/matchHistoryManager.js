// src/utils/matchHistoryManager.js
const fs = require('fs').promises;
const path = require('path');

const MATCH_HISTORY_FILE = path.join(__dirname, '../../data/matchHistory.json');
const MATCH_COUNTERS_FILE = path.join(__dirname, '../../data/matchCounters.json');

class MatchHistoryManager {
    constructor() {
        this.teamMatchHistory = new Map();
        this.teamMatchCounters = new Map();
        this.MATCH_HISTORY_LIMIT = 20;
    }

    // Sauvegarder l'historique des matchs
    async saveMatchHistory() {
        try {
            // Convertir Map en objet pour JSON
            const historyObj = Object.fromEntries(this.teamMatchHistory);
            const countersObj = Object.fromEntries(this.teamMatchCounters);
            
            await fs.writeFile(MATCH_HISTORY_FILE, JSON.stringify(historyObj, null, 2));
            await fs.writeFile(MATCH_COUNTERS_FILE, JSON.stringify(countersObj, null, 2));
            
            console.log('Historique des matchs sauvegardé');
        } catch (error) {
            console.error('Erreur lors de la sauvegarde de l\'historique:', error);
        }
    }

    // Charger l'historique des matchs
    async loadMatchHistory() {
        try {
            // Charger l'historique
            try {
                const historyData = await fs.readFile(MATCH_HISTORY_FILE, 'utf8');
                const historyObj = JSON.parse(historyData);
                this.teamMatchHistory = new Map(Object.entries(historyObj));
                console.log(`Historique des matchs chargé: ${this.teamMatchHistory.size} équipes`);
            } catch (error) {
                console.log('Aucun historique de matchs trouvé, démarrage avec historique vide');
                this.teamMatchHistory = new Map();
            }

            // Charger les compteurs
            try {
                const countersData = await fs.readFile(MATCH_COUNTERS_FILE, 'utf8');
                const countersObj = JSON.parse(countersData);
                this.teamMatchCounters = new Map(Object.entries(countersObj).map(([k, v]) => [k, parseInt(v)]));
                console.log(`Compteurs de matchs chargés: ${this.teamMatchCounters.size} équipes`);
            } catch (error) {
                console.log('Aucun compteur de matchs trouvé, initialisation depuis l\'historique des scores');
                await this.initializeFromScoreHistory();
            }
        } catch (error) {
            console.error('Erreur lors du chargement de l\'historique:', error);
        }
    }

    // Initialiser les compteurs depuis l'historique des scores (comme actuellement)
    async initializeFromScoreHistory() {
        try {
            const scoreTracker = require('./scoreTracker');
            const matchHistory = scoreTracker.getMatchHistory();
            
            console.log('Initialisation des compteurs depuis l\'historique des scores...');
            
            matchHistory.forEach((match) => {
                const team1Name = match.team1.name;
                const team2Name = match.team2.name;
                
                this.teamMatchCounters.set(team1Name, (this.teamMatchCounters.get(team1Name) || 0) + 1);
                this.teamMatchCounters.set(team2Name, (this.teamMatchCounters.get(team2Name) || 0) + 1);
            });
            
            // Sauvegarder les compteurs initialisés
            await this.saveMatchHistory();
            
        } catch (error) {
            console.error('Erreur lors de l\'initialisation depuis l\'historique des scores:', error);
        }
    }

    // Ajouter un match à l'historique
    addMatchToHistory(team1Name, team2Name) {
        const now = Date.now();
        const matchId = `${Math.min(team1Name, team2Name)}_vs_${Math.max(team1Name, team2Name)}_${now}`;
        
        // Incrémenter les compteurs
        const team1MatchCount = (this.teamMatchCounters.get(team1Name) || 0) + 1;
        const team2MatchCount = (this.teamMatchCounters.get(team2Name) || 0) + 1;
        
        this.teamMatchCounters.set(team1Name, team1MatchCount);
        this.teamMatchCounters.set(team2Name, team2MatchCount);
        
        // Ajouter à l'historique
        this.addToTeamHistory(team1Name, team2Name, now, matchId, team1MatchCount);
        this.addToTeamHistory(team2Name, team1Name, now, matchId, team2MatchCount);
        
        console.log(`Historique mis à jour: ${team1Name} (match #${team1MatchCount}) vs ${team2Name} (match #${team2MatchCount})`);
        
        // Sauvegarder automatiquement
        this.saveMatchHistory().catch(console.error);
    }

    addToTeamHistory(teamName, opponentName, timestamp, matchId, matchNumber) {
        if (!this.teamMatchHistory.has(teamName)) {
            this.teamMatchHistory.set(teamName, []);
        }
        
        const history = this.teamMatchHistory.get(teamName);
        history.push({
            opponent: opponentName,
            timestamp,
            matchId,
            matchNumber
        });
        
        // Garder seulement les N derniers matchs
        if (history.length > this.MATCH_HISTORY_LIMIT) {
            history.shift();
        }
    }

    // Calculer le score d'un adversaire (comme dans matchSearch.js)
    calculateOpponentScore(teamName, potentialOpponent) {
        const history = this.teamMatchHistory.get(teamName) || [];
        const currentMatchNumber = this.teamMatchCounters.get(teamName) || 0;
        
        let score = 100; // Score de base
        
        // Bonus pour les équipes d'un autre camp
        const allTeams = require('./teamManager').getAllTeams();
        const team = allTeams.find(t => t.name === teamName);
        const opponent = allTeams.find(t => t.name === potentialOpponent.name);
        
        if (team && opponent && team.camp !== opponent.camp) {
            score += 50;
        }
        
        // Pénalités basées sur la distance en nombre de matchs
        const matchesAgainstOpponent = history.filter(match => match.opponent === potentialOpponent.name);
        
        if (matchesAgainstOpponent.length > 0) {
            const lastMatchAgainst = matchesAgainstOpponent[matchesAgainstOpponent.length - 1];
            const matchesSinceLastFaceOff = currentMatchNumber - lastMatchAgainst.matchNumber;
            
            if (matchesSinceLastFaceOff === 0) {
                score -= 100;
            } else if (matchesSinceLastFaceOff === 1) {
                score -= 80;
            } else if (matchesSinceLastFaceOff === 2) {
                score -= 50;
            } else if (matchesSinceLastFaceOff >= 3 && matchesSinceLastFaceOff <= 5) {
                score -= 20;
            }
        } else {
            score += 30; // Bonus pour jamais affronté
        }
        
        // Bonus temps d'attente
        if (potentialOpponent.waitTime) {
            const waitMinutes = potentialOpponent.waitTime / (60 * 1000);
            const waitBonus = Math.min(waitMinutes * 2, 20);
            score += waitBonus;
        }
        
        return Math.max(score, 1);
    }

    // Obtenir l'historique d'une équipe
    getTeamMatchHistory(teamName) {
        const history = this.teamMatchHistory.get(teamName) || [];
        const currentMatchNumber = this.teamMatchCounters.get(teamName) || 0;
        
        return {
            teamName,
            totalMatches: currentMatchNumber,
            recentHistory: history.slice(-10).map(match => ({
                opponent: match.opponent,
                matchNumber: match.matchNumber,
                matchesAgo: currentMatchNumber - match.matchNumber,
                timestamp: new Date(match.timestamp).toLocaleTimeString()
            }))
        };
    }

    // Nettoyer l'historique ancien
    cleanupOldHistory() {
        const cleanupThreshold = Date.now() - (24 * 60 * 60 * 1000); // 24 heures
        
        for (const [teamName, history] of this.teamMatchHistory.entries()) {
            const filteredHistory = history.filter(match => match.timestamp > cleanupThreshold);
            if (filteredHistory.length !== history.length) {
                this.teamMatchHistory.set(teamName, filteredHistory);
                console.log(`Historique nettoyé pour ${teamName}: ${history.length - filteredHistory.length} anciens matchs supprimés`);
            }
        }
        
        this.saveMatchHistory().catch(console.error);
    }

    // Réinitialiser complètement l'historique
    async resetHistory() {
        this.teamMatchHistory.clear();
        this.teamMatchCounters.clear();
        await this.saveMatchHistory();
        console.log('Historique des matchs réinitialisé');
    }
}

// Instance singleton
const matchHistoryManager = new MatchHistoryManager();

module.exports = matchHistoryManager;