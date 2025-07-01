class Festival {
    constructor(title, campNames, startDate, endDate, announcementChannelId, options = {}) {
        this.title = title;
        this.campNames = campNames; // Array de 3 noms de camps
        this.startDate = startDate; // Date en format ISO
        this.endDate = endDate; // Date en format ISO
        this.announcementChannelId = announcementChannelId;
        this.isActive = false;
        this.scheduledStartJobId = null;
        this.scheduledEndJobId = null;
        
        // NOUVELLES OPTIONS
        this.teamSize = options.teamSize || 4; // 2v2, 3v3 ou 4v4
        this.gameMode = options.gameMode || 'mixed'; // 'turf', 'ranked', 'splat_zones', 'mixed'
        this.bannedMaps = options.bannedMaps || []; // Array des maps bannies
    }

    activate() {
        this.isActive = true;
    }

    deactivate() {
        this.isActive = false;
    }

    toJSON() {
        return {
            title: this.title,
            campNames: this.campNames,
            startDate: this.startDate,
            endDate: this.endDate,
            announcementChannelId: this.announcementChannelId,
            isActive: this.isActive,
            teamSize: this.teamSize || 4,        // Valeur par défaut
            gameMode: this.gameMode || 'mixed',  // Valeur par défaut
            bannedMaps: this.bannedMaps || []    // Valeur par défaut
        };
    }

    // Dans fromJSON(), assurez-vous de bien récupérer toutes les propriétés:
    static fromJSON(json) {
        const festival = new Festival(
            json.title,
            json.campNames,
            json.startDate,
            json.endDate,
            json.announcementChannelId,
            {
                teamSize: json.teamSize || 4,
                gameMode: json.gameMode || 'mixed',
                bannedMaps: json.bannedMaps || []
            }
        );
        festival.isActive = json.isActive || false;
        return festival;
    }

    // Méthodes utilitaires
    getTeamSizeDisplay() {
        return `${this.teamSize}v${this.teamSize}`;
    }

    getGameModeDisplay() {
        console.log('DEBUG Festival.getGameModeDisplay - gameMode:', this.gameMode); // Debug
        
        const modes = {
            'turf': 'Guerre de Territoire uniquement',
            'ranked': 'Modes Pro uniquement',
            'splat_zones': 'Défense de Zone uniquement',
            'mixed': 'Modes mixtes (BO3 varié)'
        };
        
        const result = modes[this.gameMode] || 'Modes mixtes';
        console.log('DEBUG Festival.getGameModeDisplay - result:', result); // Debug
        
        return result;
    }

    isMapBanned(mapKey) {
        return this.bannedMaps.includes(mapKey);
    }
}

module.exports = Festival;