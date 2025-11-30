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
    
    const [, day, month, year, hours, minutes] = dateStr.match(dateRegex);
    const d = parseInt(day);
    const m = parseInt(month);
    const y = parseInt(year);
    const h = parseInt(hours);
    const min = parseInt(minutes);

    // Créer une base en UTC
    const utcBase = Date.UTC(y, m - 1, d, h, min);
    
    // Essai 1 : Hypothèse Heure d'Hiver (UTC+1)
    // On retire 1 heure à la base UTC pour obtenir le timestamp potentiel
    const winterDate = new Date(utcBase - (1 * 60 * 60 * 1000));
    
    // On vérifie quelle heure il est à Paris pour ce timestamp
    const parisHour = parseInt(new Intl.DateTimeFormat('en-US', {
        timeZone: 'Europe/Paris',
        hour: 'numeric',
        hour12: false
    }).format(winterDate));
    
    // Si l'heure de Paris correspond à l'heure demandée, c'est qu'on est bien en hiver (UTC+1)
    // Sinon, c'est qu'on est en été (UTC+2)
    if (parisHour === h) {
        return winterDate;
    } else {
        return new Date(utcBase - (2 * 60 * 60 * 1000));
    }
}

module.exports = { parseFrenchDate };
