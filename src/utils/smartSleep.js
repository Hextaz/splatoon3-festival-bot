// src/utils/smartSleep.js

class SmartSleepManager {
    constructor() {
        this.keepAliveInterval = null;
        this.lastFestivalCheck = null;
        this.isKeepAliveActive = false;
        this.checkInterval = null;
        this.currentReason = '';
        this.currentKeepAliveType = null;
    }

    start() {
        console.log('🧠 Smart Sleep Manager démarré');
        
        // Vérifier l'état du festival toutes les minutes
        this.checkInterval = setInterval(() => {
            this.checkFestivalState();
        }, 60 * 1000); // 1 minute
        
        // Vérification initiale
        this.checkFestivalState();
    }

    checkFestivalState() {
        try {
            // Import dynamique pour éviter la dépendance circulaire
            const { getCurrentFestival } = require('./festivalManager');
            const festival = getCurrentFestival();
            const now = new Date();
            this.lastFestivalCheck = now;
        
            let shouldStayAwake = false;
            let reason = '';
            let keepAliveType = 'minimal'; // 'minimal' ou 'active'

            if (festival) {
                const startDate = new Date(festival.startDate);
                const endDate = new Date(festival.endDate);
                
                if (festival.isActive && now >= startDate && now <= endDate) {
                    shouldStayAwake = true;
                    keepAliveType = 'active';
                    reason = `Festival "${festival.title}" actif`;
                } else if (now < startDate) {
                    // Festival programmé dans moins de 30 minutes
                    const timeUntilStart = startDate.getTime() - now.getTime();
                    if (timeUntilStart <= 30 * 60 * 1000) { // 30 minutes
                        shouldStayAwake = true;
                        keepAliveType = 'active';
                        reason = `Festival démarre dans ${Math.round(timeUntilStart / 60000)} minutes`;
                    }
                } else if (now <= endDate) {
                    // Festival terminé mais nettoyage en cours
                    const timeAfterEnd = now.getTime() - endDate.getTime();
                    if (timeAfterEnd <= 10 * 60 * 1000) { // 10 minutes après la fin
                        shouldStayAwake = true;
                        keepAliveType = 'active';
                        reason = `Nettoyage post-festival en cours`;
                    }
                }
            }

            // Mode keep-alive minimal pour maintenir la connexion Discord
            if (!shouldStayAwake) {
                shouldStayAwake = true;
                keepAliveType = 'minimal';
                reason = 'Connexion Discord maintenue (keep-alive minimal)';
            }

            // Gérer les transitions
            if (shouldStayAwake && !this.isKeepAliveActive) {
                this.enableKeepAlive(reason, keepAliveType);
            } else if (shouldStayAwake && this.isKeepAliveActive && this.currentKeepAliveType !== keepAliveType) {
                // Changer le type de keep-alive
                this.disableKeepAlive();
                this.enableKeepAlive(reason, keepAliveType);
            }
        } catch (error) {
            console.error('❌ Erreur lors du chargement des données:', error);
            // En cas d'erreur, garder au minimum la connexion Discord
            if (!this.isKeepAliveActive) {
                this.enableKeepAlive('Connexion Discord maintenue (fallback)', 'minimal');
            }
        }
    }

    enableKeepAlive(reason, type = 'active') {
        if (this.isKeepAliveActive) return;

        console.log(`🔄 Activation keep-alive (${type}): ${reason}`);
        this.currentReason = reason;
        this.currentKeepAliveType = type;
        
        // Intervalle adapté selon le type
        const interval = type === 'minimal' ? 
            12 * 60 * 1000 : // 12 minutes pour minimal (juste sous la limite Render)
            10 * 60 * 1000;  // 10 minutes pour actif

        this.keepAliveInterval = setInterval(() => {
            console.log(`[KEEP-ALIVE-${type.toUpperCase()}] ${new Date().toISOString()} - ${reason}`);
            
            // Activité supplémentaire si nécessaire
            this.performKeepAliveActivity();
        }, interval);

        this.isKeepAliveActive = true;
        
        // Log initial immédiat
        console.log(`[KEEP-ALIVE-${type.toUpperCase()}] Démarrage - ${reason}`);
        this.performKeepAliveActivity();
    }

    disableKeepAlive() {
        if (!this.isKeepAliveActive) return;

        console.log(`😴 Désactivation keep-alive (${this.currentKeepAliveType || 'unknown'})`);
        
        if (this.keepAliveInterval) {
            clearInterval(this.keepAliveInterval);
            this.keepAliveInterval = null;
        }

        this.isKeepAliveActive = false;
        this.currentReason = '';
        this.currentKeepAliveType = null;
    }

    performKeepAliveActivity() {
        // Activités légères pour maintenir l'éveil
        if (process.env.RENDER_EXTERNAL_URL) {
            // Ping HTTP self (pour Render)
            const https = require('https');
            const http = require('http');
            
            const protocol = process.env.RENDER_EXTERNAL_URL.startsWith('https') ? https : http;
            
            protocol.get(`${process.env.RENDER_EXTERNAL_URL}/health`, (res) => {
                // console.log(`[PING] Health check: ${res.statusCode}`);
            }).on('error', (err) => {
                // Ignore les erreurs de ping silencieusement
            });
        }
        
        // Log d'activité minimal pour Render
        const memUsage = process.memoryUsage();
        const uptime = Math.round(process.uptime());
        // Log discret toutes les 10 minutes
    }

    // Forcer le mode keep-alive (pour événements spéciaux)
    forceKeepAlive(duration, reason) {
        console.log(`⚡ Keep-alive forcé pour ${Math.round(duration/60000)} minutes: ${reason}`);
        this.enableKeepAlive(`FORCE: ${reason}`, 'active');
        
        setTimeout(() => {
            console.log(`⏰ Fin du keep-alive forcé: ${reason}`);
            this.checkFestivalState(); // Revérifier l'état normal
        }, duration);
    }

    // Status pour debugging
    getStatus() {
        try {
            // Import dynamique pour éviter la dépendance circulaire
            const { getCurrentFestival } = require('./festivalManager');
            const festival = getCurrentFestival();
            
            return {
                isKeepAliveActive: this.isKeepAliveActive,
                currentReason: this.currentReason,
                keepAliveType: this.currentKeepAliveType,
                currentFestival: festival ? {
                    title: festival.title,
                    isActive: festival.isActive,
                    startDate: festival.startDate,
                    endDate: festival.endDate
                } : null,
                lastCheck: this.lastFestivalCheck,
                uptime: Math.round(process.uptime()),
                memoryUsage: process.memoryUsage()
            };
        } catch (error) {
            return {
                isKeepAliveActive: this.isKeepAliveActive,
                currentReason: this.currentReason,
                keepAliveType: this.currentKeepAliveType,
                currentFestival: null,
                lastCheck: this.lastFestivalCheck,
                uptime: Math.round(process.uptime()),
                memoryUsage: process.memoryUsage(),
                error: error.message
            };
        }
    }

    stop() {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
        }
        
        this.disableKeepAlive();
        console.log('🛑 Smart Sleep Manager arrêté');
    }
}

// Instance singleton
const smartSleepManager = new SmartSleepManager();

module.exports = {
    SmartSleepManager,
    smartSleepManager
};
