/**
 * 🎯 FERMETURE PROGRESSIVE DU FESTIVAL
 * 
 * Ce module gère la fermeture intelligente des festivals :
 * 1. Bloquer les nouveaux matchs à l'heure de fin
 * 2. Laisser les matchs en cours se terminer
 * 3. Attendre tous les résultats avant nettoyage
 */

// Import des fonctions nécessaires (éviter les dépendances circulaires)
// const { saveFestival } = require('./festivalManager'); // Importé dynamiquement

class ProgressiveCloser {
    constructor(guildId) {
        this.guildId = guildId;
        this.checkInterval = null;
        this.maxWaitTime = 20 * 60 * 1000; // 20 minutes maximum d'attente
        this.checkFrequency = 30 * 1000; // Vérifier toutes les 30 secondes
    }

    /**
     * Démarrer la fermeture progressive d'un festival
     */
    async startProgressiveClosing(festival, client) {
        console.log(`🏁 DÉBUT DE LA FERMETURE PROGRESSIVE pour "${festival.title}"`);
        
        // 1. Marquer le festival comme "en cours de fermeture"
        festival.startClosing();
        const { saveFestival } = require('./festivalManager');
        await saveFestival(festival, this.guildId);
        
        // 2. Annoncer la fermeture aux utilisateurs
        await this.announceClosing(festival, client);
        
        // 3. Démarrer la surveillance des matchs en cours
        await this.waitForMatchesToComplete(festival, client);
    }

    /**
     * Annoncer la fermeture du festival
     */
    async announceClosing(festival, client) {
        try {
            const guild = client.guilds.cache.get(this.guildId);
            if (!guild) return;

            const channel = await guild.channels.fetch(festival.announcementChannelId);
            if (!channel) return;

            const config = await require('../commands/config').loadConfig(guild.id);
            const mentionText = config.announcementRoleId ? 
                `<@&${config.announcementRoleId}> ` : '';

            await channel.send({
                content: `${mentionText}⏳ **FERMETURE DU FESTIVAL EN COURS**`,
                embeds: [{
                    title: '🏁 Fin du Festival',
                    description: `Le festival **"${festival.title}"** touche à sa fin !\n\n` +
                        `🚫 **Plus de nouveaux matchs possibles**\n` +
                        `⚡ **Les matchs en cours peuvent continuer**\n` +
                        `⏳ **Nettoyage après tous les résultats**\n\n` +
                        `Merci à tous les participants ! 🎉`,
                    color: 0xffa500,
                    timestamp: new Date()
                }]
            });

            console.log('📢 Annonce de fermeture envoyée');
        } catch (error) {
            console.error('❌ Erreur annonce fermeture:', error);
        }
    }

    /**
     * Compter les matchs actuellement en cours
     */
    async countActiveMatches() {
        try {
            const teamManager = require('./teamManager');
            const allTeams = teamManager.getAllTeams(this.guildId);
            
            // Compter les équipes en match (busy ou avec un adversaire)
            const teamsInMatch = allTeams.filter(team => 
                team.busy || team.currentOpponent || team.isInMatch
            );
            
            // Les matchs sont comptés par paires d'équipes
            const activeMatches = Math.ceil(teamsInMatch.length / 2);
            
            console.log(`🎮 Matchs en cours: ${activeMatches} (${teamsInMatch.length} équipes occupées)`);
            
            if (teamsInMatch.length > 0) {
                teamsInMatch.forEach(team => {
                    console.log(`  • ${team.name} ${team.currentOpponent ? `vs ${team.currentOpponent}` : '(busy)'}`);
                });
            }
            
            return {
                activeMatches,
                teamsInMatch: teamsInMatch.length,
                teamNames: teamsInMatch.map(t => t.name)
            };
            
        } catch (error) {
            console.error('❌ Erreur comptage matchs:', error);
            return { activeMatches: 0, teamsInMatch: 0, teamNames: [] };
        }
    }

    /**
     * Attendre que tous les matchs se terminent
     */
    async waitForMatchesToComplete(festival, client) {
        const startTime = Date.now();
        let checksCount = 0;
        
        console.log('⏳ Attente de la fin des matchs en cours...');
        
        return new Promise((resolve) => {
            this.checkInterval = setInterval(async () => {
                checksCount++;
                const elapsed = Date.now() - startTime;
                
                console.log(`🔍 Vérification ${checksCount} (${Math.floor(elapsed / 1000)}s écoulées)`);
                
                const matchInfo = await this.countActiveMatches();
                
                // Si plus de matchs en cours, procéder au nettoyage
                if (matchInfo.activeMatches === 0) {
                    console.log('✅ Tous les matchs sont terminés !');
                    clearInterval(this.checkInterval);
                    await this.proceedToCleanup(festival, client);
                    resolve();
                    return;
                }
                
                // Si temps d'attente dépassé, forcer le nettoyage
                if (elapsed > this.maxWaitTime) {
                    console.log(`⚠️ Temps d'attente maximum atteint (${this.maxWaitTime/60000} min)`);
                    console.log(`🎮 Matchs encore en cours: ${matchInfo.activeMatches}`);
                    console.log('🧹 Procédure de nettoyage forcé...');
                    
                    clearInterval(this.checkInterval);
                    await this.proceedToCleanup(festival, client, true);
                    resolve();
                    return;
                }
                
                // Annoncer périodiquement l'attente
                if (checksCount % 10 === 0) { // Toutes les 5 minutes
                    await this.announceWaiting(festival, client, matchInfo, elapsed);
                }
                
            }, this.checkFrequency);
        });
    }

    /**
     * Annoncer l'attente en cours
     */
    async announceWaiting(festival, client, matchInfo, elapsed) {
        try {
            const guild = client.guilds.cache.get(this.guildId);
            if (!guild) return;

            const channel = await guild.channels.fetch(festival.announcementChannelId);
            if (!channel) return;

            const minutes = Math.floor(elapsed / 60000);
            const remainingWait = Math.floor((this.maxWaitTime - elapsed) / 60000);

            await channel.send({
                embeds: [{
                    title: '⏳ Attente en cours...',
                    description: `**${matchInfo.activeMatches} match(s) encore en cours**\n\n` +
                        `⏱️ Attente: ${minutes} min\n` +
                        `⏰ Maximum: ${remainingWait} min restantes\n\n` +
                        `Équipes en match: ${matchInfo.teamNames.join(', ')}`,
                    color: 0x3498db,
                    timestamp: new Date()
                }]
            });

        } catch (error) {
            console.error('❌ Erreur annonce attente:', error);
        }
    }

    /**
     * Procéder au nettoyage final
     */
    async proceedToCleanup(festival, client, forced = false) {
        console.log(`🧹 DÉBUT DU NETTOYAGE ${forced ? 'FORCÉ' : 'NORMAL'}`);
        
        try {
            const guild = client.guilds.cache.get(this.guildId);
            if (!guild) return;

            // 🎯 IMPORTANT: Envoyer l'annonce de fin avec les résultats AVANT le nettoyage
            const channel = await guild.channels.fetch(festival.announcementChannelId);
            if (channel) {
                const statusText = forced ? 
                    '⚠️ **Nettoyage forcé** (temps d\'attente dépassé)' : 
                    '✅ **Tous les matchs terminés**';
                    
                await channel.send(statusText);
                
                // 🏆 ANNONCE OFFICIELLE DE FIN AVEC RÉSULTATS
                const config = await require('../commands/config').loadConfig(guild.id);
                const mentionText = config.announcementRoleId ? 
                    `<@&${config.announcementRoleId}> ` : '';
                
                const festivalManager = require('./festivalManager');
                const endEmbed = festivalManager.createEndEmbed(festival, guild.id);
                
                await channel.send({
                    content: `${mentionText}🏁 **LE FESTIVAL "${festival.title}" EST TERMINÉ !** 🏁`,
                    embeds: [endEmbed]
                });
                
                console.log('🏆 Annonce officielle de fin avec résultats envoyée');
                
                // Petit délai pour laisser le temps de voir les résultats
                await new Promise(resolve => setTimeout(resolve, 3000));
                
                await channel.send("🧹 **Nettoyage des données en cours...**");
            }

            // Utiliser le nettoyage robuste
            const RobustCleaner = require('./robustCleaner');
            const cleaner = new RobustCleaner(this.guildId);
            
            console.log('🔄 Nettoyage robuste progressif en cours...');
            const results = await cleaner.cleanupGuild();
            console.log('✅ Nettoyage robuste progressif terminé:', results);

            // Nettoyage traditionnel complémentaire
            const festivalManager = require('./festivalManager');
            await festivalManager.resetFestivalData(guild);
            
            const teamManager = require('./teamManager');
            await teamManager.clearAllTeams(guild.id);
            
            // Désactiver et supprimer le festival
            festival.deactivate();
            await festivalManager.deleteFestival(guild.id);

            // Confirmation finale
            if (channel) {
                await channel.send({
                    embeds: [{
                        title: '🎉 Festival Terminé !',
                        description: `Le festival **"${festival.title}"** s'est achevé avec succès !\n\n` +
                            `✅ Toutes les données ont été nettoyées\n` +
                            `🏆 Merci à tous les participants !\n\n` +
                            `À bientôt pour le prochain festival ! 🎊`,
                        color: 0x27ae60,
                        timestamp: new Date()
                    }]
                });
            }

            console.log('🎉 FERMETURE PROGRESSIVE TERMINÉE AVEC SUCCÈS');

        } catch (error) {
            console.error('❌ ERREUR lors du nettoyage progressif:', error);
            
            // Notification d'erreur
            try {
                const guild = client.guilds.cache.get(this.guildId);
                const channel = await guild.channels.fetch(festival.announcementChannelId);
                if (channel) {
                    await channel.send('❌ **Erreur lors du nettoyage.** Un administrateur doit intervenir avec `/diagnostic-cleanup full-cleanup`.');
                }
            } catch (notifyError) {
                console.error('❌ Erreur notification:', notifyError);
            }
        }
    }

    /**
     * Annuler la fermeture progressive (en cas d'urgence)
     */
    cancelClosing() {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
            console.log('🚫 Fermeture progressive annulée');
        }
    }
}

module.exports = ProgressiveCloser;