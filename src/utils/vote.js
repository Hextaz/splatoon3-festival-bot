const fs = require('fs').promises;
const path = require('path');
const Vote = require('../models/Vote');

// Chemin vers le fichier de données des votes
const votesPath = path.join(__dirname, '../../data/votes.json');

// Instance unique du modèle Vote pour l'application
const voteInstance = new Vote();

// Fonction pour sauvegarder les votes dans un fichier
async function saveVotes() {
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

// Fonction pour charger les votes depuis le fichier
async function loadVotes() {
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
    resetVotes
};