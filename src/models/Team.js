class Team {
    constructor(name, leader, camp, isOpen = true, code = null) {
        this.name = name;
        this.leader = leader; // ID Discord du leader
        this.members = [leader]; // Array of Discord IDs
        this.camp = camp; // Identifiant technique (camp1, camp2, camp3)
        this.campDisplayName = null; // Nom d'affichage du camp
        this.isOpen = isOpen;
        this.code = code; // Code à 4 chiffres pour équipes fermées
        this.busy = false;
        this.currentOpponent = null;
        this.channelId = null; // ID du salon d'équipe
        this.matchChannelId = null; // ID du salon de match en cours
        this.roleId = null; // Nouvel attribut pour stocker l'ID du rôle d'équipe
        this.currentBO3 = null; // Données du BO3 actuel
    }

    addMember(memberId) {
        if (!this.members.includes(memberId)) {
            this.members.push(memberId);
            return true;
        }
        return false;
    }

    removeMember(memberId) {
        const index = this.members.indexOf(memberId);
        if (index > -1) {
            this.members.splice(index, 1);
            return true;
        }
        return false;
    }

    isEmpty() {
        return this.members.length === 0;
    }

    isMember(memberId) {
        return this.members.includes(memberId);
    }

    isLeader(memberId) {
        return this.leader === memberId;
    }
}

module.exports = Team;