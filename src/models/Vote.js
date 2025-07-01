class Vote {
    constructor() {
        this.votes = {
            camp1: 0,
            camp2: 0,
            camp3: 0
        };
        
        // Nouveau: Map pour stocker les votes par utilisateur
        this.userVotes = new Map();
    }

    castVote(camp, userId = null) {
        if (this.votes.hasOwnProperty(camp)) {
            // Si l'ID de l'utilisateur est fourni, vérifier s'il a déjà voté
            if (userId && this.userVotes.has(userId)) {
                const previousCamp = this.userVotes.get(userId);
                // Si l'utilisateur a voté pour un camp différent, décrémenter son vote précédent
                if (previousCamp !== camp) {
                    this.votes[previousCamp]--;
                } else {
                    // L'utilisateur vote pour le même camp, pas de changement
                    return this.votes;
                }
            }
            
            this.votes[camp]++;
            
            // Si l'ID de l'utilisateur est fourni, enregistrer son vote
            if (userId) {
                this.userVotes.set(userId, camp);
            }
            
            return this.votes; // Retourne les votes mis à jour
        } else {
            throw new Error("Invalid camp name");
        }
    }

    getVotes() {
        return this.votes;
    }
    
    // Nouvelle méthode pour définir les votes (utilisée lors du chargement)
    setVotes(votes) {
        if (votes && typeof votes === 'object') {
            this.votes = {
                camp1: votes.camp1 || 0,
                camp2: votes.camp2 || 0,
                camp3: votes.camp3 || 0
            };
        }
    }

    getWinningCamp() {
        return Object.keys(this.votes).reduce((a, b) => this.votes[a] > this.votes[b] ? a : b);
    }
    
    // Nouvelle méthode pour savoir si un utilisateur a voté
    hasVoted(userId) {
        return this.userVotes.has(userId);
    }
    
    // Nouvelle méthode pour obtenir le camp d'un utilisateur
    getUserCamp(userId) {
        return this.userVotes.get(userId) || null;
    }

    // Récupérer les votes par utilisateur
    getUserVotes() {
        return this.userVotes;
    }

    // Restaurer les votes par utilisateur à partir d'un objet
    setUserVotes(userVotesObj) {
        this.userVotes = new Map(Object.entries(userVotesObj));
    }
}

module.exports = Vote;