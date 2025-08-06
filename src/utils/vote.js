const fs = require('fs').promises;
const path = require('path');
const Vote = require('../models/Vote');
const DataAdapter = require('./dataAdapter');

// Chemin vers le fichier de données des votes
const votesPath = path.join(__dirname, '../../data/votes.json');

// Instance unique du modèle Vote pour l'application
const voteInstance = new Vote();
let currentGuildId = null;

// Helper pour obtenir le DataAdapter
function getDataAdapter(guildId = currentGuildId) {
    if (!guildId) {
        console.warn('Aucun guildId défini pour vote, utilisation JSON');
        return null;
    }
    return new DataAdapter(guildId);
}

// Définir le guildId actuel
function setCurrentGuildId(guildId) {
    currentGuildId = guildId;
}

// Fonction pour sauvegarder les votes (MongoDB uniquement)
async function saveVotes() {
    try {
        const adapter = getDataAdapter();
        
        if (!adapter) {
            throw new Error('DataAdapter non disponible - Guild ID manquant');
        }

        // Sauvegarder chaque vote individuellement dans MongoDB
        console.log('💾 Sauvegarde des votes avec DataAdapter');
        const userVotes = Object.fromEntries(voteInstance.getUserVotes());
        
        for (const [userId, camp] of Object.entries(userVotes)) {
            await adapter.saveVote(userId, camp);
        }
        console.log('✅ Votes sauvegardés avec DataAdapter');
    } catch (error) {
        console.error('❌ ERREUR CRITIQUE lors de la sauvegarde des votes:', error);
        throw error; // Propager l'erreur au lieu de faire un fallback
    }
}

// Fonction pour charger les votes (MongoDB uniquement)
async function loadVotes() {
    try {
        const adapter = getDataAdapter();
        
        if (!adapter) {
            throw new Error('DataAdapter non disponible - Guild ID manquant');
        }

        // Charger depuis MongoDB
        console.log('📥 Chargement des votes avec DataAdapter');
        const votesData = await adapter.getVotes();
        
        // Reconstituer les compteurs par camp
        const counts = { camp1: 0, camp2: 0, camp3: 0 };
        const users = {};
        
        if (votesData && typeof votesData === 'object') {
            for (const [userId, camp] of Object.entries(votesData)) {
                users[userId] = camp;
                if (counts[camp] !== undefined) {
                    counts[camp]++;
                }
            }
        }
        
        // Charger dans l'instance Vote
        voteInstance.setVotes(counts);
        voteInstance.setUserVotes(users);
        
        console.log('✅ Votes chargés avec DataAdapter');
    } catch (error) {
        console.error('❌ ERREUR CRITIQUE lors du chargement des votes:', error);
        // Réinitialiser les votes en cas d'erreur
        voteInstance.reset();
        throw error; // Propager l'erreur au lieu de faire un fallback
    }
}

// Fonction pour voter, modifiée pour sauvegarder après chaque vote
function castVote(camp, userId = null) {
    const result = voteInstance.castVote(camp, userId);
    saveVotes();
    return result;
}

function getVotes() {
    return voteInstance.getVotes();
}

function getWinningCamp() {
    return voteInstance.getWinningCamp();
}

/**
 * Réinitialise complètement les votes
 */
async function resetVotes() {
    try {
        const adapter = getDataAdapter();
        
        if (adapter) {
            // Supprimer de la base de données
            await adapter.clearAllVotes();
        }
        
        // Réinitialiser l'instance de Vote en mémoire
        voteInstance.votes = {
            camp1: 0,
            camp2: 0,
            camp3: 0
        };
        voteInstance.userVotes = new Map();
        
        console.log('✅ Votes réinitialisés (base de données + mémoire)');
    } catch (error) {
        console.error('❌ Erreur lors du reset des votes:', error);
        // En cas d'erreur, au moins réinitialiser la mémoire
        voteInstance.votes = {
            camp1: 0,
            camp2: 0,
            camp3: 0
        };
        voteInstance.userVotes = new Map();
        throw error;
    }
}

module.exports = {
    castVote,
    getVotes,
    getWinningCamp,
    loadVotes,
    saveVotes,
    resetVotes,
    setCurrentGuildId
};