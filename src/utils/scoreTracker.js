const fs = require('fs').promises;
const path = require('path');
const { getAllTeams } = require('./teamManager');
const { getCurrentFestival } = require('./festivalManager');

// Chemin vers le fichier de scores
const scoresPath = path.join(__dirname, '../../data/scores.json');

const scoreTracker = {
    scores: {
        camp1: 0,
        camp2: 0,
        camp3: 0
    },
    
    // Pour stocker les matchs et leurs multiplicateurs
    matchHistory: [],

    // Sauvegarder les scores
    async saveScores() {
        try {
            // Créer le dossier data s'il n'existe pas
            const dataDir = path.join(__dirname, '../../data');
            await fs.mkdir(dataDir, { recursive: true });
            
            const dataToSave = {
                scores: this.scores,
                matchHistory: this.matchHistory || [] // S'assurer que matchHistory est toujours un tableau
            };
            
            await fs.writeFile(scoresPath, JSON.stringify(dataToSave, null, 2));
            console.log('Scores et historique des matchs sauvegardés avec succès');
        } catch (error) {
            console.error('Erreur lors de la sauvegarde des scores:', error);
        }
    },

    // Charger les scores
    async loadScores() {
        try {
            const data = await fs.readFile(scoresPath, 'utf8');
            const scoresData = JSON.parse(data);
            
            // Compatibilité avec l'ancien format
            if (typeof scoresData === 'object' && !scoresData.scores) {
                this.scores = {
                    camp1: scoresData.camp1 || 0,
                    camp2: scoresData.camp2 || 0,
                    camp3: scoresData.camp3 || 0
                };
                this.matchHistory = [];
            } else {
                // Nouveau format
                this.scores = scoresData.scores || {
                    camp1: 0,
                    camp2: 0,
                    camp3: 0
                };
                this.matchHistory = scoresData.matchHistory || [];
            }
            
            console.log('Scores chargés avec succès');
        } catch (error) {
            if (error.code === 'ENOENT') {
                console.log('Aucun fichier de scores trouvé. Utilisation des valeurs par défaut.');
            } else {
                console.error('Erreur lors du chargement des scores:', error);
            }
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
        
        // Récupérer les équipes directement depuis teamManager
        const allTeams = getAllTeams();
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
        const festival = getCurrentFestival();
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
    }
};

module.exports = scoreTracker;