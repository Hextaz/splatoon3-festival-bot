const fs = require('fs').promises;
const path = require('path');
// Remove direct imports to avoid circular dependencies
// const { getAllTeams } = require('./teamManager');
// const { getCurrentFestival } = require('./festivalManager');
const DataAdapter = require('./dataAdapter');

// Chemin vers le fichier de scores
const scoresPath = path.join(__dirname, '../../data/scores.json');
let currentGuildId = null;

// Helper pour obtenir le DataAdapter
function getDataAdapter(guildId = currentGuildId) {
    if (!guildId) {
        console.warn('Aucun guildId défini pour scoreTracker, utilisation JSON');
        return null;
    }
    return new DataAdapter(guildId);
}

// Définir le guildId actuel
function setCurrentGuildId(guildId) {
    currentGuildId = guildId;
}

const scoreTracker = {
    scores: {
        camp1: 0,
        camp2: 0,
        camp3: 0
    },
    
    // Pour stocker les matchs et leurs multiplicateurs
    matchHistory: [],

    // Sauvegarder les scores (MongoDB uniquement)
    async saveScores() {
        try {
            const adapter = getDataAdapter();
            
            if (!adapter) {
                throw new Error('DataAdapter non disponible - Guild ID manquant');
            }

            // Sauvegarder dans MongoDB
            console.log('💾 Sauvegarde des scores avec DataAdapter');
            await adapter.saveScores(this.scores);
            console.log('✅ Scores sauvegardés avec DataAdapter');
        } catch (error) {
            console.error('❌ ERREUR CRITIQUE lors de la sauvegarde des scores:', error);
            throw error; // Propager l'erreur au lieu de faire un fallback
        }
    },

    // Méthodes helper pour compter les matchs
    getMatchesWonByCamp(camp) {
        if (!this.matchHistory) return 0;
        return this.matchHistory.filter(match => match.winner === camp).length;
    },

    getMatchesLostByCamp(camp) {
        if (!this.matchHistory) return 0;
        return this.matchHistory.filter(match => 
            match.winner && match.winner !== camp && 
            (match.team1Camp === camp || match.team2Camp === camp)
        ).length;
    },

        // Charger les scores (MongoDB uniquement)
    async loadScores() {
        try {
            const adapter = getDataAdapter();
            
            if (!adapter) {
                throw new Error('DataAdapter non disponible - Guild ID manquant');
            }

            // Charger depuis MongoDB
            console.log('📥 Chargement des scores avec DataAdapter');
            const scoresData = await adapter.getScores();
            
            if (scoresData) {
                this.scores = {
                    camp1: scoresData.camp1 || 0,
                    camp2: scoresData.camp2 || 0,
                    camp3: scoresData.camp3 || 0
                };
                console.log(`✅ Scores chargés avec DataAdapter:`, this.scores);
            } else {
                this.scores = { camp1: 0, camp2: 0, camp3: 0 };
                console.log('✅ Aucun score trouvé dans MongoDB');
            }
            
            // Charger l'historique des matchs
            const matches = await adapter.getMatches();
            this.matchHistory = matches || [];
        } catch (error) {
            console.error('❌ ERREUR CRITIQUE lors du chargement des scores:', error);
            this.scores = { camp1: 0, camp2: 0, camp3: 0 };
            this.matchHistory = [];
            throw error; // Propager l'erreur au lieu de faire un fallback
        }
    },

    // Générer un multiplicateur aléatoire pour un match
    generateMultiplier() {
        const rand = Math.random() * 100;
        if (rand < 1) return 333; // 1% de chance pour x333
        if (rand < 5) return 100; // 4% de chance pour x100
        if (rand < 15) return 10; // 10% de chance pour x10
        return 1; // 85% de chance pour x1 (normal)
    },

    updateScores: function(camp1Result, camp2Result, camp1Name, camp2Name, multiplier = 1) {
        if (camp1Result === camp2Result) {
            throw new Error("Both teams cannot have the same result. Please enter different results.");
        }
        
        // Récupérer les équipes avec lazy loading pour éviter la dépendance circulaire
        let allTeams = [];
        try {
            const { getAllTeams } = require('./teamManager');
            allTeams = getAllTeams();
        } catch (error) {
            console.error('Impossible de récupérer les équipes:', error);
            throw new Error("Unable to retrieve teams");
        }
        
        const team1 = allTeams.find(t => t.name === camp1Name);
        const team2 = allTeams.find(t => t.name === camp2Name);
        
        if (!team1 || !team2) {
            throw new Error("Team not found");
        }

        const basePoints = 1; // Points de base par victoire
        const pointsToAward = basePoints * multiplier;

        // Enregistrer ce match dans l'historique
        this.matchHistory.push({
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
            multiplier: multiplier,
            pointsAwarded: pointsToAward
        });

        // CORRECTION : N'attribuer les points qu'UNE SEULE FOIS
        if (camp1Result === 'V') {
            // Team1 gagne
            this.scores[team1.camp] += pointsToAward;
        } else {
            // Team2 gagne (car camp1Result === 'D' et camp2Result === 'V')
            this.scores[team2.camp] += pointsToAward;
        }
        
        // Sauvegarder les scores après mise à jour
        this.saveScores();
    },

    getCurrentScores: function() {
        return this.scores;
    },
    
    getScoresAsPercentages: function() {
        const totalPoints = this.scores.camp1 + this.scores.camp2 + this.scores.camp3;
        if (totalPoints === 0) return { camp1: 0, camp2: 0, camp3: 0 };
        
        return {
            camp1: parseFloat(((this.scores.camp1 / totalPoints) * 100).toFixed(2)),
            camp2: parseFloat(((this.scores.camp2 / totalPoints) * 100).toFixed(2)),
            camp3: parseFloat(((this.scores.camp3 / totalPoints) * 100).toFixed(2))
        };
    },

    getWinningCamp: function() {
        const maxScore = Math.max(...Object.values(this.scores));
        if (maxScore === 0) return 'camp1'; // Par défaut si pas de score
        
        const winningCamps = Object.keys(this.scores).filter(camp => this.scores[camp] === maxScore);
        return winningCamps.length === 1 ? winningCamps[0] : 'Tie';
    },
    
    // Vérifier si on est à mi-parcours du festival
    isHalfwayPoint: function() {
        let festival = null;
        try {
            const { getCurrentFestival } = require('./festivalManager');
            festival = getCurrentFestival();
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
    },
    
    // Récupérer l'historique des matchs
    getMatchHistory: function() {
        return this.matchHistory;
    },
    
    // Récupérer l'historique récent (derniers 10 matchs)
    getRecentMatches: function(count = 10) {
        return this.matchHistory.slice(-count);
    },

    // Réinitialiser complètement les scores et l'historique
    async resetScores() {
        try {
            const adapter = getDataAdapter();
            
            if (adapter) {
                // Supprimer de la base de données
                await adapter.clearAllScores();
                await adapter.clearAllMatches();
            }
            
            // Réinitialiser en mémoire
            this.scores = {
                camp1: 0,
                camp2: 0,
                camp3: 0
            };
            this.matchHistory = [];
            
            console.log('✅ Scores et historique des matchs réinitialisés (base de données + mémoire)');
        } catch (error) {
            console.error('❌ Erreur lors du reset des scores:', error);
            // En cas d'erreur, au moins réinitialiser la mémoire
            this.scores = {
                camp1: 0,
                camp2: 0,
                camp3: 0
            };
            this.matchHistory = [];
            throw error;
        }
    }
};

// Ajouter setCurrentGuildId pour l'export
scoreTracker.setCurrentGuildId = setCurrentGuildId;

module.exports = scoreTracker;