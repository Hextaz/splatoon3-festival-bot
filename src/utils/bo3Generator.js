// Créer src/utils/bo3Generator.js
const { GAME_MODES, RANKED_MODES, MAPS, ALL_MAP_KEYS } = require('../data/mapsAndModes');
const mapProbabilityManager = require('./mapProbabilityManager');

class BO3Generator {
    constructor(festival = null) {
        this.festival = festival;
        this.usedModes = [];
        this.usedMaps = [];
    }

    // Sélectionner les modes selon les paramètres du festival
    selectModes() {
        if (!this.festival) {
            // Fallback vers l'ancien comportement
            return this.selectRandomModes();
        }

        const gameMode = this.festival.gameMode;
        
        switch (gameMode) {
            case 'turf':
                // Pour Turf War, on fait quand même un BO3 mais avec le même mode
                return ['turf_war', 'turf_war', 'turf_war'];
            
            case 'splat_zones':
                // Pour Défense de Zone, BO3 avec le même mode
                return ['splat_zones', 'splat_zones', 'splat_zones'];
            
            case 'ranked':
                // Pour Modes Pro, BO3 avec des modes différents (ancien comportement)
                return this.selectRandomRankedModes();
            
            case 'mixed':
            default:
                // Pour Mixte, BO3 avec des modes différents
                return this.selectRandomModes();
        }
    }

    selectRandomModes() {
        const availableModes = [...RANKED_MODES];
        const selectedModes = [];
        
        for (let i = 0; i < 3; i++) {
            if (availableModes.length === 0) {
                // Si on n'a plus de modes, recommencer avec tous les modes
                availableModes.push(...RANKED_MODES.filter(mode => !selectedModes.includes(mode)));
            }
            
            const randomIndex = Math.floor(Math.random() * availableModes.length);
            const selectedMode = availableModes.splice(randomIndex, 1)[0];
            selectedModes.push(selectedMode);
        }
        
        return selectedModes;
    }

    selectRandomRankedModes() {
        const availableModes = [...RANKED_MODES];
        const selectedModes = [];
        
        for (let i = 0; i < 3; i++) {
            if (availableModes.length === 0) {
                availableModes.push(...RANKED_MODES.filter(mode => !selectedModes.includes(mode)));
            }
            
            const randomIndex = Math.floor(Math.random() * availableModes.length);
            const selectedMode = availableModes.splice(randomIndex, 1)[0];
            selectedModes.push(selectedMode);
        }
        
        return selectedModes;
    }

    // Obtenir les maps disponibles (en excluant les bannies)
    getAvailableMaps() {
        if (!this.festival || !this.festival.bannedMaps) {
            return [...ALL_MAP_KEYS]; // ← ALL_MAP_KEYS est maintenant importé
        }
        
        return ALL_MAP_KEYS.filter(mapKey => !this.festival.bannedMaps.includes(mapKey));
    }

    // Générer un BO3 complet pour deux équipes
    async generateBO3(team1Name, team2Name) {
        try {
            // Charger les probabilités si pas encore fait
            await mapProbabilityManager.loadProbabilities();
            
            const modes = this.selectModes();
            const selectedMaps = [];
            const bo3 = [];
            const availableMaps = this.getAvailableMaps();
            
            if (availableMaps.length < 3) {
                throw new Error('Pas assez de maps disponibles pour générer un BO3 (minimum 3 maps requises)');
            }
            
            for (let i = 0; i < 3; i++) {
                // Sélectionner une map en excluant celles déjà utilisées ET les bannies
                const excludedMaps = [...selectedMaps, ...this.festival?.bannedMaps || []];
                const mapKey = mapProbabilityManager.selectRandomMap(team1Name, team2Name, excludedMaps, availableMaps);
                selectedMaps.push(mapKey);
                
                bo3.push({
                    game: i + 1,
                    mode: modes[i],
                    modeDisplayName: GAME_MODES[modes[i]],
                    map: mapKey,
                    mapDisplayName: MAPS[mapKey],
                    result: null // À remplir plus tard
                });
            }
            
            // Mettre à jour les probabilités après sélection
            await mapProbabilityManager.updateProbabilitiesAfterBO3(team1Name, team2Name, selectedMaps);
            
            return {
                team1: team1Name,
                team2: team2Name,
                games: bo3,
                overallResult: null,
                timestamp: Date.now(),
                festivalConfig: {
                    teamSize: this.festival?.teamSize || 4,
                    gameMode: this.festival?.gameMode || 'mixed'
                }
            };
            
        } catch (error) {
            console.error('Erreur lors de la génération du BO3:', error);
            throw error;
        }
    }

    // Créer un embed Discord pour afficher le BO3
    createBO3Embed(bo3Data, multiplier = 1) {
        const { EmbedBuilder } = require('discord.js');
        
        const teamSizeDisplay = bo3Data.festivalConfig?.teamSize ? 
            `${bo3Data.festivalConfig.teamSize}v${bo3Data.festivalConfig.teamSize}` : '4v4';
        
        const gameMode = bo3Data.festivalConfig?.gameMode || 'mixed';
        let modeDescription = 'Match généré avec les paramètres du festival!';
        
        if (gameMode === 'turf') {
            modeDescription = 'BO3 en Guerre de Territoire sur 3 maps différentes!';
        } else if (gameMode === 'splat_zones') {
            modeDescription = 'BO3 en Défense de Zone sur 3 maps différentes!';
        } else if (gameMode === 'ranked') {
            modeDescription = 'BO3 avec 3 modes Pro différents!';
        } else {
            modeDescription = 'BO3 avec 3 modes et maps différents!';
        }
        
        const embed = new EmbedBuilder()
            .setColor('#00FF00')
            .setTitle(`🎮 BEST OF 3 (${teamSizeDisplay}) - ${bo3Data.team1} vs ${bo3Data.team2}`)
            .setDescription(modeDescription)
            .setTimestamp();
        
        // Ajouter chaque game du BO3
        bo3Data.games.forEach((game, index) => {
            embed.addFields({
                name: `🎯 Game ${game.game}`,
                value: `**Mode**: ${game.modeDisplayName}\n**Map**: ${game.mapDisplayName}`,
                inline: true
            });
        });
        
        // Ajouter le multiplicateur si > 1
        if (multiplier > 1) {
            let mulColor;
            if (multiplier === 333) mulColor = '🔥 **MULTIPLICATEUR LÉGENDAIRE** 🔥';
            else if (multiplier === 100) mulColor = '⭐ **SUPER MULTIPLICATEUR** ⭐';
            else mulColor = '✨ **MULTIPLICATEUR** ✨';
            
            embed.addFields({ 
                name: `${mulColor}`, 
                value: `Ce BO3 vaut **x${multiplier}** points! Chaque victoire est cruciale!` 
            });
        }
        
        embed.addFields({
            name: '📊 Résultats',
            value: `À la fin du BO3, un des capitaines devra utiliser la commande \`/results\` pour signaler qui a remporté le match (victoire = 2 games gagnés sur 3).`
        });
        
        return embed;
    }
}

module.exports = BO3Generator;