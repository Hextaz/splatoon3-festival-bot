// Créer src/utils/mapProbabilityManager.js
const DataAdapter = require('./dataAdapter');
const { ALL_MAP_KEYS } = require('../data/mapsAndModes');

class MapProbabilityManager {
    constructor() {
        this.teamMapProbabilities = new Map(); // Map<teamName, Map<mapKey, probability>>
        this.defaultProbability = 1.0;
        this.probabilityDecay = 0.3; // Réduction de proba quand une map est sélectionnée
        this.probabilityIncrease = 0.1; // Augmentation par BO3 sans sélection
        this.currentGuildId = null;
        this.dataAdapter = null; // Will be set when guildId is available
    }

    setCurrentGuildId(guildId) {
        this.currentGuildId = guildId;
        if (guildId) {
            this.dataAdapter = new DataAdapter(guildId);
        }
    }

    async loadProbabilities() {
        try {
            if (!this.currentGuildId || !this.dataAdapter) {
                console.error('Guild ID not set for map probability manager');
                return;
            }

            const data = await this.dataAdapter.getMapProbabilities();
            if (data) {
                // Reconstituer les Maps depuis l'objet JSON
                Object.entries(data).forEach(([teamName, mapProbs]) => {
                    const teamMap = new Map();
                    Object.entries(mapProbs).forEach(([mapKey, prob]) => {
                        teamMap.set(mapKey, prob);
                    });
                    this.teamMapProbabilities.set(teamName, teamMap);
                });
                
                console.log(`Probabilités de maps chargées pour ${this.teamMapProbabilities.size} équipes`);
            }
        } catch (error) {
            console.error('Erreur lors du chargement des probabilités de maps:', error);
        }
    }

    async saveProbabilities() {
        try {
            if (!this.currentGuildId || !this.dataAdapter) {
                console.error('Guild ID not set for map probability manager');
                return;
            }

            // Convertir les Maps en objets pour la sérialisation JSON
            const dataToSave = {};
            for (const [teamName, mapProbs] of this.teamMapProbabilities) {
                if (!teamName || teamName === 'null') {
                    console.warn(`⚠️ MapProbabilityManager: teamName invalide ignoré:`, teamName);
                    continue;
                }
                if (!mapProbs) {
                    console.warn(`⚠️ MapProbabilityManager: mapProbs null pour équipe ${teamName}`);
                    continue;
                }
                const cleanMapProbs = {};
                for (const [mapKey, probability] of mapProbs) {
                    if (!mapKey || mapKey === 'null' || probability == null) {
                        console.warn(`⚠️ MapProbabilityManager: données invalides ignorées`, { teamName, mapKey, probability });
                        continue;
                    }
                    cleanMapProbs[mapKey] = probability;
                }
                if (Object.keys(cleanMapProbs).length > 0) {
                    dataToSave[teamName] = cleanMapProbs;
                }
            }
            
            await this.dataAdapter.saveMapProbabilities(dataToSave);
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