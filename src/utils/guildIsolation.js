/**
 * Helper pour l'isolation des données par guild
 * Remplace les appels globaux par des appels spécifiques à la guild
 */

const DataAdapter = require('./dataAdapter');
const { getCurrentFestival } = require('./festivalManager');

/**
 * Récupère le festival actuel pour une guild spécifique
 * @param {string} guildId - ID de la guild
 * @returns {Object|null} Festival actuel ou null
 */
async function getFestivalForGuild(guildId) {
    return await getCurrentFestival(guildId);
}

/**
 * Récupère toutes les équipes pour une guild spécifique
 * @param {string} guildId - ID de la guild
 * @returns {Array} Liste des équipes
 */
async function getTeamsForGuild(guildId) {
    const adapter = new DataAdapter(guildId);
    return await adapter.getTeams();
}

/**
 * Récupère les votes pour une guild spécifique
 * @param {string} guildId - ID de la guild
 * @returns {Object} Données des votes
 */
async function getVotesForGuild(guildId) {
    const adapter = new DataAdapter(guildId);
    return await adapter.getVotes();
}

/**
 * Récupère les scores pour une guild spécifique
 * @param {string} guildId - ID de la guild
 * @returns {Object} Données des scores
 */
async function getScoresForGuild(guildId) {
    const adapter = new DataAdapter(guildId);
    return await adapter.getScores();
}

/**
 * Récupère toutes les données nécessaires pour une guild
 * @param {string} guildId - ID de la guild
 * @returns {Object} Objet contenant festival, équipes, votes, scores
 */
async function getAllDataForGuild(guildId) {
    const [festival, teams, votes, scores] = await Promise.all([
        getFestivalForGuild(guildId),
        getTeamsForGuild(guildId),
        getVotesForGuild(guildId),
        getScoresForGuild(guildId)
    ]);

    return {
        festival,
        teams,
        votes,
        scores
    };
}

module.exports = {
    getFestivalForGuild,
    getTeamsForGuild,
    getVotesForGuild,
    getScoresForGuild,
    getAllDataForGuild
};
