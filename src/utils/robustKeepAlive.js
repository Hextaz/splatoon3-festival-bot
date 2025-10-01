// src/utils/robustKeepAlive.js - Version robuste du keep-alive avec auto-récupération
class RobustKeepAlive {
    constructor() {
        this.keepAliveInterval = null;
        this.healthCheckUrl = null;
        this.consecutiveFailures = 0;
        this.maxFailures = 5; // Plus tolérant
        this.baseInterval = 10 * 60 * 1000; // 10 minutes
        this.failureInterval = 3 * 60 * 1000; // 3 minutes en cas d'échec
        this.isStarted = false;
        this.lastSuccessfulPing = null;
        this.totalPings = 0;
        this.totalFailures = 0;
        this.startTime = Date.now();
        
        // Auto-surveillance : redémarrer si le système semble mort
        this.watchdogInterval = null;
        this.lastPingAttempt = null;
    }

    start() {
        if (this.isStarted) {
            console.log('⚠️ Keep-alive robuste déjà démarré');
            return;
        }

        console.log('🔄 Démarrage du keep-alive robuste avec auto-récupération');
        
        // Déterminer l'URL de santé
        this.healthCheckUrl = this.getHealthCheckUrl();
        
        if (!this.healthCheckUrl) {
            console.log('⚠️ Keep-alive désactivé - Pas d\'URL de santé disponible');
            return;
        }

        console.log(`🌐 URL de keep-alive: ${this.healthCheckUrl}`);
        
        // Premier ping après 30 secondes
        setTimeout(() => {
            this.performKeepAlive();
        }, 30 * 1000);
        
        // Programmer les pings réguliers
        this.scheduleNextPing();
        
        // Démarrer le watchdog (surveillance)
        this.startWatchdog();
        
        this.isStarted = true;
        this.startTime = Date.now();
        console.log('✅ Keep-alive robuste activé avec surveillance automatique');
    }

    getHealthCheckUrl() {
        // Même logique que EnhancedKeepAlive
        if (process.env.RENDER_EXTERNAL_URL) {
            return `${process.env.RENDER_EXTERNAL_URL}/health`;
        }
        
        if (process.env.APP_URL) {
            return `${process.env.APP_URL}/health`;
        }
        
        if (process.env.RENDER_SERVICE_NAME) {
            return `https://${process.env.RENDER_SERVICE_NAME}.onrender.com/health`;
        }
        
        return null;
    }

    scheduleNextPing() {
        if (this.keepAliveInterval) {
            clearTimeout(this.keepAliveInterval);
        }
        
        const interval = this.consecutiveFailures > 0 ? this.failureInterval : this.baseInterval;
        
        this.keepAliveInterval = setTimeout(() => {
            try {
                this.performKeepAlive();
                this.scheduleNextPing(); // Reprogrammer le suivant
            } catch (error) {
                console.error(`❌ [KEEP-ALIVE] Erreur critique dans scheduleNextPing: ${error.message}`);
                // Tenter de redémarrer le système
                setTimeout(() => {
                    console.log('🔄 Tentative de redémarrage automatique du keep-alive...');
                    this.forceRestart();
                }, 5000);
            }
        }, interval);
    }

    async performKeepAlive() {
        this.totalPings++;
        this.lastPingAttempt = Date.now();
        const startTime = Date.now();
        
        console.log(`[KEEP-ALIVE] ${new Date().toISOString()} - Ping ${this.totalPings} en cours...`);

        try {
            const response = await this.makeHealthRequest();
            const duration = Date.now() - startTime;
            
            if (response.success) {
                this.onPingSuccess(response, duration);
            } else {
                this.onPingFailure(response.error, duration);
            }
        } catch (error) {
            this.onPingFailure(`Exception: ${error.message}`, Date.now() - startTime);
        }
    }

    makeHealthRequest() {
        return new Promise((resolve) => {
            const https = require('https');
            const http = require('http');
            const { URL } = require('url');
            
            try {
                const url = new URL(this.healthCheckUrl);
                const protocol = url.protocol === 'https:' ? https : http;
                
                const options = {
                    hostname: url.hostname,
                    port: url.port,
                    path: url.pathname,
                    method: 'GET',
                    timeout: 60000, // 60 secondes (plus tolérant)
                    headers: {
                        'User-Agent': 'Splatoon3FestivalBot-Robust-KeepAlive/1.0',
                        'Accept': 'application/json',
                        'Connection': 'close',
                        'Cache-Control': 'no-cache'
                    }
                };

                const req = protocol.request(options, (res) => {
                    let data = '';
                    res.on('data', chunk => data += chunk);
                    res.on('end', () => {
                        resolve({
                            success: res.statusCode === 200,
                            statusCode: res.statusCode,
                            data: data,
                            error: res.statusCode !== 200 ? `HTTP ${res.statusCode}` : null
                        });
                    });
                });

                req.on('error', (error) => {
                    resolve({
                        success: false,
                        error: `Request error: ${error.message}`,
                        statusCode: null
                    });
                });

                req.on('timeout', () => {
                    req.destroy();
                    resolve({
                        success: false,
                        error: 'Timeout (60s)',
                        statusCode: null
                    });
                });

                req.end();
            } catch (error) {
                resolve({
                    success: false,
                    error: `URL error: ${error.message}`,
                    statusCode: null
                });
            }
        });
    }

    onPingSuccess(response, duration) {
        this.consecutiveFailures = 0;
        this.lastSuccessfulPing = new Date();
        
        const durationMs = Math.round(duration);
        console.log(`[KEEP-ALIVE] ✅ Ping ${this.totalPings} réussi (${response.statusCode}) en ${durationMs}ms`);
        
        // Stats périodiques
        if (this.totalPings % 6 === 0) { // Toutes les heures (6 pings de 10min)
            this.logStats();
        }
    }

    onPingFailure(error, duration) {
        this.consecutiveFailures++;
        this.totalFailures++;
        const durationMs = Math.round(duration);
        
        console.error(`[KEEP-ALIVE] ❌ Ping ${this.totalPings} échoué en ${durationMs}ms: ${error}`);
        console.error(`[KEEP-ALIVE] 📊 Échecs consécutifs: ${this.consecutiveFailures}/${this.maxFailures}`);
        
        if (this.consecutiveFailures >= this.maxFailures) {
            console.error(`[KEEP-ALIVE] 🚨 ALERTE CRITIQUE: ${this.maxFailures} échecs consécutifs!`);
            console.error(`[KEEP-ALIVE] 🚨 Dernier succès: ${this.lastSuccessfulPing || 'Jamais'}`);
            console.error(`[KEEP-ALIVE] 🚨 Le bot est probablement HORS LIGNE!`);
            
            // Tentative de récupération d'urgence
            this.attemptEmergencyRecovery();
        }
    }

    attemptEmergencyRecovery() {
        console.log('[KEEP-ALIVE] 🔄 Tentative de récupération d\'urgence...');
        
        // Arrêter complètement le système actuel
        this.stop();
        
        // Attendre 30 secondes puis redémarrer
        setTimeout(() => {
            console.log('[KEEP-ALIVE] 🔄 Redémarrage d\'urgence du keep-alive...');
            this.start();
        }, 30000);
    }

    forceRestart() {
        console.log('[KEEP-ALIVE] 🔄 Redémarrage forcé du système...');
        this.stop();
        setTimeout(() => {
            this.start();
        }, 5000);
    }

    startWatchdog() {
        // Surveillance toutes les 15 minutes
        this.watchdogInterval = setInterval(() => {
            const now = Date.now();
            
            // Si aucun ping depuis plus de 20 minutes, quelque chose ne va pas
            if (this.lastPingAttempt && (now - this.lastPingAttempt) > 20 * 60 * 1000) {
                console.error('[WATCHDOG] 🚨 Aucun ping depuis plus de 20 minutes!');
                console.error('[WATCHDOG] 🔄 Redémarrage automatique du keep-alive...');
                this.forceRestart();
            }
            
            // Si aucun succès depuis plus d'1 heure, problème critique
            if (this.lastSuccessfulPing && (now - this.lastSuccessfulPing.getTime()) > 60 * 60 * 1000) {
                console.error('[WATCHDOG] 🚨 Aucun succès depuis plus d\'1 heure!');
                console.error('[WATCHDOG] 🔄 Redémarrage d\'urgence du keep-alive...');
                this.attemptEmergencyRecovery();
            }
            
        }, 15 * 60 * 1000); // Toutes les 15 minutes
    }

    logStats() {
        const runtime = Math.round((Date.now() - this.startTime) / (1000 * 60 * 60));
        const successRate = this.totalPings > 0 ? Math.round(((this.totalPings - this.totalFailures) / this.totalPings) * 100) : 0;
        
        console.log(`[KEEP-ALIVE] 📊 STATS (${runtime}h): ${this.totalPings} pings, ${successRate}% succès, ${this.consecutiveFailures} échecs consécutifs`);
    }

    getStatus() {
        return {
            isActive: this.isStarted,
            healthCheckUrl: this.healthCheckUrl,
            consecutiveFailures: this.consecutiveFailures,
            totalPings: this.totalPings,
            totalFailures: this.totalFailures,
            lastSuccessfulPing: this.lastSuccessfulPing,
            uptime: Math.round((Date.now() - this.startTime) / 1000),
            nextPingInterval: this.consecutiveFailures > 0 ? this.failureInterval : this.baseInterval
        };
    }

    stop() {
        if (this.keepAliveInterval) {
            clearTimeout(this.keepAliveInterval);
            this.keepAliveInterval = null;
        }
        
        if (this.watchdogInterval) {
            clearInterval(this.watchdogInterval);
            this.watchdogInterval = null;
        }
        
        this.isStarted = false;
        console.log('🛑 Keep-alive robuste arrêté (watchdog inclus)');
    }
}

module.exports = { RobustKeepAlive };