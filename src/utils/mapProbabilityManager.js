// src/utils/mapProbabilityManager.js
const DataAdapter = require('./dataAdapter');
const { ALL_MAP_KEYS } = require('../data/mapsAndModes');

// Maps pour gérer les probabilités par guild
const teamMapProbabilitiesByGuild = new Map(); // guildId -> Map<teamName, Map<mapKey, probability>>
const DEFAULT_PROBABILITY = 1.0;
const PROBABILITY_DECAY = 0.3; // Réduction de proba quand une map est sélectionnée
const PROBABILITY_INCREASE = 0.1; // Augmentation par BO3 sans sélection

// Helper pour obtenir le DataAdapter
function getDataAdapter(guildId) {
    if (!guildId) {
        console.warn('Aucun guildId défini pour mapProbabilityManager');
        return null;
    }
    return new DataAdapter(guildId);
}

// Helper pour obtenir les probabilités d'une guild
function getProbabilitiesForGuild(guildId) {
    if (!guildId) return new Map();
    if (!teamMapProbabilitiesByGuild.has(guildId)) {
        teamMapProbabilitiesByGuild.set(guildId, new Map());
    }
    return teamMapProbabilitiesByGuild.get(guildId);
}

// Charger les probabilités depuis MongoDB
async function loadProbabilities(guildId) {
    try {
        const adapter = getDataAdapter(guildId);
        if (!adapter) {
            console.error('DataAdapter non disponible pour mapProbabilityManager');
            return;
        }

        const data = await adapter.getMapProbabilities();
        if (data) {
            const probabilities = new Map();
            for (const [teamName, teamData] of Object.entries(data)) {
                probabilities.set(teamName, new Map(Object.entries(teamData)));
            }
            teamMapProbabilitiesByGuild.set(guildId, probabilities);
            console.log(`Probabilités de cartes chargées pour ${probabilities.size} équipes`);
        } else {
            console.log('Aucune probabilité trouvée, initialisation par défaut');
            teamMapProbabilitiesByGuild.set(guildId, new Map());
        }
    } catch (error) {
        console.error('Erreur lors du chargement des probabilités:', error);
        teamMapProbabilitiesByGuild.set(guildId, new Map());
    }
}

// Sauvegarder les probabilités
async function saveProbabilities(guildId) {
    try {
        const adapter = getDataAdapter(guildId);
        if (!adapter) {
            console.error('DataAdapter non disponible pour mapProbabilityManager');
            return;
        }

        const probabilities = getProbabilitiesForGuild(guildId);
        const dataToSave = {};
        
        for (const [teamName, teamMaps] of probabilities.entries()) {
            dataToSave[teamName] = Object.fromEntries(teamMaps);
        }
        
        console.log(`💾 Sauvegarde probabilités pour ${Object.keys(dataToSave).length} équipes:`);
        Object.keys(dataToSave).forEach(teamName => {
            console.log(`   - ${teamName}: ${Object.keys(dataToSave[teamName]).length} maps`);
        });
        
        await adapter.saveMapProbabilities(dataToSave);
        console.log('✅ Probabilités de cartes sauvegardées');
    } catch (error) {
        console.error('Erreur lors de la sauvegarde des probabilités:', error);
    }
}

// Initialiser les probabilités par défaut pour une équipe
function initializeTeamProbabilities(teamName, guildId) {
    const probabilities = getProbabilitiesForGuild(guildId);
    
    if (!probabilities.has(teamName)) {
        const teamMaps = new Map();
        for (const mapKey of ALL_MAP_KEYS) {
            teamMaps.set(mapKey, DEFAULT_PROBABILITY);
        }
        probabilities.set(teamName, teamMaps);
        console.log(`Probabilités initialisées pour l'équipe ${teamName}`);
    }
}

// Obtenir les probabilités d'une équipe
function getTeamProbabilities(teamName, guildId) {
    const probabilities = getProbabilitiesForGuild(guildId);
    
    if (!probabilities.has(teamName)) {
        initializeTeamProbabilities(teamName, guildId);
    }
    
    return probabilities.get(teamName);
}

// Mettre à jour les probabilités après sélection de carte
function updateProbabilitiesAfterMapSelection(teamName, selectedMap, guildId) {
    const teamMaps = getTeamProbabilities(teamName, guildId);
    
    console.log(`🔍 Avant mise à jour ${teamName}: ${teamMaps.size} maps en mémoire`);
    
    // Réduire la probabilité de la carte sélectionnée
    const currentProb = teamMaps.get(selectedMap) || DEFAULT_PROBABILITY;
    teamMaps.set(selectedMap, Math.max(currentProb - PROBABILITY_DECAY, 0.1));
    
    // Augmenter légèrement les autres cartes
    for (const [mapKey, probability] of teamMaps.entries()) {
        if (mapKey !== selectedMap) {
            teamMaps.set(mapKey, Math.min(probability + PROBABILITY_INCREASE, 2.0));
        }
    }
    
    console.log(`📊 Probabilités mises à jour pour ${teamName} après sélection de ${selectedMap}`);
    console.log(`🔍 Après mise à jour ${teamName}: ${teamMaps.size} maps en mémoire`);
}

// Sélectionner une carte avec probabilités pondérées
function selectRandomMapWithProbabilities(teamName, bannedMaps = [], guildId) {
    const teamMaps = getTeamProbabilities(teamName, guildId);
    
    // Filtrer les cartes bannies
    const availableMaps = Array.from(teamMaps.entries())
        .filter(([mapKey]) => !bannedMaps.includes(mapKey));
    
    if (availableMaps.length === 0) {
        console.warn(`Aucune carte disponible pour ${teamName}, retour aux cartes par défaut`);
        return ALL_MAP_KEYS[Math.floor(Math.random() * ALL_MAP_KEYS.length)];
    }
    
    // Calculer le total des probabilités
    const totalWeight = availableMaps.reduce((sum, [, prob]) => sum + prob, 0);
    
    // Sélection pondérée
    let random = Math.random() * totalWeight;
    for (const [mapKey, probability] of availableMaps) {
        random -= probability;
        if (random <= 0) {
            return mapKey;
        }
    }
    
    // Fallback
    return availableMaps[0][0];
}

// Réinitialiser les probabilités
async function resetProbabilities(guildId) {
    teamMapProbabilitiesByGuild.set(guildId, new Map());
    await saveProbabilities(guildId);
    console.log(`Probabilités réinitialisées pour guild ${guildId}`);
}

module.exports = {
    loadProbabilities,
    saveProbabilities,
    initializeTeamProbabilities,
    getTeamProbabilities,
    updateProbabilitiesAfterMapSelection,
    selectRandomMapWithProbabilities,
    resetProbabilities,
    getProbabilitiesForGuild
};