// Créer src/utils/mapProbabilityManager.js
const fs = require('fs').promises;
const path = require('path');
const { ALL_MAP_KEYS } = require('../../data/mapsAndModes');

const MAP_PROBABILITIES_FILE = path.join(__dirname, '../../data/mapProbabilities.json');

class MapProbabilityManager {
    constructor() {
        this.teamMapProbabilities = new Map(); // Map<teamName, Map<mapKey, probability>>
        this.defaultProbability = 1.0;
        this.probabilityDecay = 0.3; // Réduction de proba quand une map est sélectionnée
        this.probabilityIncrease = 0.1; // Augmentation par BO3 sans sélection
    }

    async loadProbabilities() {
        try {
            const data = await fs.readFile(MAP_PROBABILITIES_FILE, 'utf8');
            const parsed = JSON.parse(data);
            
            // Reconstituer les Maps depuis l'objet JSON
            Object.entries(parsed).forEach(([teamName, mapProbs]) => {
                const teamMap = new Map();
                Object.entries(mapProbs).forEach(([mapKey, prob]) => {
                    teamMap.set(mapKey, prob);
                });
                this.teamMapProbabilities.set(teamName, teamMap);
            });
            
            console.log(`Probabilités de maps chargées pour ${this.teamMapProbabilities.size} équipes`);
        } catch (error) {
            if (error.code !== 'ENOENT') {
                console.error('Erreur lors du chargement des probabilités de maps:', error);
            }
            // Fichier inexistant = normal au premier démarrage
        }
    }

    async saveProbabilities() {
        try {
            // Convertir les Maps en objets pour la sérialisation JSON
            const dataToSave = {};
            for (const [teamName, mapProbs] of this.teamMapProbabilities) {
                dataToSave[teamName] = Object.fromEntries(mapProbs);
            }
            
            await fs.writeFile(MAP_PROBABILITIES_FILE, JSON.stringify(dataToSave, null, 2), 'utf8');
        } catch (error) {
            console.error('Erreur lors de la sauvegarde des probabilités de maps:', error);
        }
    }

    // Initialiser les probabilités pour une équipe si elles n'existent pas
    initializeTeamProbabilities(teamName) {
        if (!this.teamMapProbabilities.has(teamName)) {
            const teamProbs = new Map();
            ALL_MAP_KEYS.forEach(mapKey => {
                teamProbs.set(mapKey, this.defaultProbability);
            });
            this.teamMapProbabilities.set(teamName, teamProbs);
        }
    }

    // Obtenir les probabilités combinées de deux équipes pour une map
    getCombinedProbability(team1Name, team2Name, mapKey) {
        this.initializeTeamProbabilities(team1Name);
        this.initializeTeamProbabilities(team2Name);
        
        const team1Prob = this.teamMapProbabilities.get(team1Name).get(mapKey) || this.defaultProbability;
        const team2Prob = this.teamMapProbabilities.get(team2Name).get(mapKey) || this.defaultProbability;
        
        // Probabilité combinée = moyenne des deux équipes
        return (team1Prob + team2Prob) / 2;
    }

    // Sélectionner une map basée sur les probabilités combinées
    selectRandomMap(team1Name, team2Name, excludedMaps = []) {
        const availableMaps = ALL_MAP_KEYS.filter(mapKey => !excludedMaps.includes(mapKey));
        
        if (availableMaps.length === 0) {
            throw new Error('Aucune map disponible pour la sélection');
        }

        // Calculer les probabilités combinées pour toutes les maps disponibles
        const mapProbabilities = availableMaps.map(mapKey => ({
            mapKey,
            probability: this.getCombinedProbability(team1Name, team2Name, mapKey)
        }));

        // Sélection pondérée
        const totalWeight = mapProbabilities.reduce((sum, map) => sum + map.probability, 0);
        let random = Math.random() * totalWeight;
        
        for (const map of mapProbabilities) {
            random -= map.probability;
            if (random <= 0) {
                return map.mapKey;
            }
        }
        
        // Fallback si algo de sélection échoue
        return mapProbabilities[0].mapKey;
    }

    // Mettre à jour les probabilités après un BO3
    async updateProbabilitiesAfterBO3(team1Name, team2Name, selectedMaps) {
        this.initializeTeamProbabilities(team1Name);
        this.initializeTeamProbabilities(team2Name);
        
        const team1Probs = this.teamMapProbabilities.get(team1Name);
        const team2Probs = this.teamMapProbabilities.get(team2Name);
        
        ALL_MAP_KEYS.forEach(mapKey => {
            if (selectedMaps.includes(mapKey)) {
                // Maps sélectionnées : réduire la probabilité et reset proche de la base
                team1Probs.set(mapKey, Math.max(0.1, this.defaultProbability * this.probabilityDecay));
                team2Probs.set(mapKey, Math.max(0.1, this.defaultProbability * this.probabilityDecay));
            } else {
                // Maps non sélectionnées : augmenter légèrement la probabilité
                const currentProb1 = team1Probs.get(mapKey);
                const currentProb2 = team2Probs.get(mapKey);
                
                team1Probs.set(mapKey, Math.min(2.0, currentProb1 + this.probabilityIncrease));
                team2Probs.set(mapKey, Math.min(2.0, currentProb2 + this.probabilityIncrease));
            }
        });
        
        await this.saveProbabilities();
        console.log(`Probabilités mises à jour pour ${team1Name} et ${team2Name} après BO3`);
    }

    // Obtenir les statistiques de probabilité pour une équipe
    getTeamProbabilityStats(teamName) {
        this.initializeTeamProbabilities(teamName);
        const teamProbs = this.teamMapProbabilities.get(teamName);
        
        const stats = {
            teamName,
            mapProbabilities: {},
            mostLikely: [],
            leastLikely: []
        };
        
        // Convertir en objet et trier
        const probArray = Array.from(teamProbs.entries()).map(([mapKey, prob]) => ({
            mapKey,
            probability: prob
        }));
        
        probArray.sort((a, b) => b.probability - a.probability);
        
        stats.mapProbabilities = Object.fromEntries(probArray.map(item => [item.mapKey, item.probability]));
        stats.mostLikely = probArray.slice(0, 5);
        stats.leastLikely = probArray.slice(-5).reverse();
        
        return stats;
    }
}

// Instance singleton
const mapProbabilityManager = new MapProbabilityManager();

module.exports = mapProbabilityManager;