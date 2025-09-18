const fs = require('fs').promises;
const path = require('path');
const Vote = require('../models/Vote');
const DataAdapter = require('./dataAdapter');

// Chemin vers le fichier de données des votes
const votesPath = path.join(__dirname, '../../data/votes.json');

// Maps pour gérer les votes par guild
const votesByGuild = new Map(); // guildId -> Vote instance

// Helper pour obtenir le DataAdapter
function getDataAdapter(guildId) {
    if (!guildId) {
        console.warn('Aucun guildId défini pour vote, utilisation JSON');
        return null;
    }
    return new DataAdapter(guildId);
}

// Helper pour obtenir les votes d'une guild spécifique
function getVotesForGuild(guildId) {
    if (!guildId) return new Vote();
    if (!votesByGuild.has(guildId)) {
        votesByGuild.set(guildId, new Vote());
    }
    return votesByGuild.get(guildId);
}

// Helper pour définir les votes d'une guild
function setVotesForGuild(voteInstance, guildId) {
    if (!guildId) return;
    votesByGuild.set(guildId, voteInstance);
}

// Fonction pour sauvegarder les votes (MongoDB uniquement)
async function saveVotes(guildId) {
    try {
        const adapter = getDataAdapter(guildId);
        
        if (!adapter) {
            throw new Error('DataAdapter non disponible - Guild ID manquant');
        }

        // Sauvegarder chaque vote individuellement dans MongoDB
        console.log('💾 Sauvegarde des votes avec DataAdapter');
        const voteInstance = getVotesForGuild(guildId);
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
async function loadVotes(guildId) {
    try {
        const adapter = getDataAdapter(guildId);
        
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
        
        // Charger dans l'instance Vote pour cette guild
        const voteInstance = getVotesForGuild(guildId);
        voteInstance.setVotes(counts);
        voteInstance.setUserVotes(users);
        
        console.log('✅ Votes chargés avec DataAdapter');
    } catch (error) {
        console.error('❌ ERREUR CRITIQUE lors du chargement des votes:', error);
        // Réinitialiser les votes en cas d'erreur en créant une nouvelle instance
        votesByGuild.set(guildId, new Vote());
        throw error; // Propager l'erreur au lieu de faire un fallback
    }
}

// Fonction pour voter, modifiée pour sauvegarder après chaque vote
function castVote(camp, userId = null, guildId) {
    const voteInstance = getVotesForGuild(guildId);
    const result = voteInstance.castVote(camp, userId);
    saveVotes(guildId);
    return result;
}

function getVotes(guildId) {
    const voteInstance = getVotesForGuild(guildId);
    return voteInstance.getVotes();
}

function getWinningCamp(guildId) {
    const voteInstance = getVotesForGuild(guildId);
    return voteInstance.getWinningCamp();
}

/**
 * Réinitialise complètement les votes
 */
async function resetVotes(guildId) {
    try {
        const adapter = getDataAdapter(guildId);
        
        if (adapter) {
            // Supprimer de la base de données
            await adapter.clearAllVotes();
        }
        
        // Réinitialiser l'instance de Vote en mémoire pour cette guild
        const voteInstance = getVotesForGuild(guildId);
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
        const voteInstance = getVotesForGuild(guildId);
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
    getVotesForGuild,
    setVotesForGuild
};