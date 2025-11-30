const moment = require('moment-timezone');

/**
 * Parse une date au format JJ/MM/AAAA HH:MM en considérant le fuseau horaire Paris (Europe/Paris)
 * Gère automatiquement le passage heure d'été (UTC+2) / heure d'hiver (UTC+1)
 * @param {string} dateStr - Date au format "JJ/MM/AAAA HH:MM"
 * @returns {Date} Objet Date correspondant au timestamp correct
 */
function parseFrenchDate(dateStr) {
    const dateRegex = /^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})$/;
    if (!dateRegex.test(dateStr)) {
        throw new Error("Format de date invalide. Utilisez JJ/MM/AAAA HH:MM");
    }
    
    // Utiliser moment-timezone pour parser la date directement dans le fuseau Paris
    // "DD/MM/YYYY HH:mm" correspond au format d'entrée
    const m = moment.tz(dateStr, "DD/MM/YYYY HH:mm", "Europe/Paris");
    
    if (!m.isValid()) {
        throw new Error("Date invalide");
    }
    
    return m.toDate();
}

module.exports = { parseFrenchDate };
