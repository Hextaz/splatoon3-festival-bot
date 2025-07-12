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

// Fonction pour sauvegarder les votes (hybride JSON/MongoDB)
async function saveVotes() {
    try {
        const adapter = getDataAdapter();
        
        if (adapter) {
            // Sauvegarder chaque vote individuellement dans MongoDB
            console.log('💾 Sauvegarde des votes avec DataAdapter');
            const userVotes = Object.fromEntries(voteInstance.getUserVotes());
            
            for (const [userId, camp] of Object.entries(userVotes)) {
                await adapter.saveVote(userId, camp);
            }
            console.log('✅ Votes sauvegardés avec DataAdapter');
        } else {
            // Fallback JSON
            await saveVotesJSON();
        }
    } catch (error) {
        console.error('Erreur lors de la sauvegarde des votes:', error);
        // Fallback vers JSON en cas d'erreur MongoDB
        await saveVotesJSON();
    }
}

// Fonction JSON de sauvegarde (fallback)
async function saveVotesJSON() {
    try {
        const dataDir = path.join(__dirname, '../../data');
        await fs.mkdir(dataDir, { recursive: true });
        
        // Sauvegarder à la fois les compteurs et les associations utilisateur-vote
        const dataToSave = {
            counts: voteInstance.getVotes(),
            users: Object.fromEntries(voteInstance.getUserVotes())
        };
        
        await fs.writeFile(votesPath, JSON.stringify(dataToSave, null, 2));
        console.log('Votes sauvegardés avec succès');
    } catch (error) {
        console.error('Erreur lors de la sauvegarde des votes:', error);
    }
}

// Fonction pour charger les votes (hybride JSON/MongoDB)
async function loadVotes() {
    try {
        const adapter = getDataAdapter();
        
        if (adapter) {
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
        } else {
            // Fallback JSON
            await loadVotesJSON();
        }
    } catch (error) {
        console.error('Erreur lors du chargement des votes:', error);
        // Fallback vers JSON en cas d'erreur MongoDB
        await loadVotesJSON();
    }
}

// Fonction JSON de chargement (fallback)
async function loadVotesJSON() {
    try {
        const data = await fs.readFile(votesPath, 'utf8');
        const votesData = JSON.parse(data);
        
        // Charger les compteurs
        if (votesData.counts) {
            voteInstance.setVotes(votesData.counts);
        }
        
        // Charger les associations utilisateur-vote
        if (votesData.users) {
            voteInstance.setUserVotes(votesData.users);
        }
        
        console.log('Votes chargés avec succès');
    } catch (error) {
        if (error.code === 'ENOENT') {
            console.log('Aucun fichier de votes trouvé. Utilisation des valeurs par défaut.');
        } else {
            console.error('Erreur lors du chargement des votes:', error);
        }
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
    // Réinitialiser l'instance de Vote
    voteInstance.votes = {
        camp1: 0,
        camp2: 0,
        camp3: 0
    };
    voteInstance.userVotes = new Map();
    
    // Sauvegarder l'état réinitialisé
    await saveVotes();
    console.log('Votes réinitialisés avec succès');
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