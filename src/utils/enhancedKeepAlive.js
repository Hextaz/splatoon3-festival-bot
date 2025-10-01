// src/utils/enhancedKeepAlive.js - Version améliorée du système keep-alive
class EnhancedKeepAlive {
    constructor() {
        this.keepAliveInterval = null;
        this.healthCheckUrl = null;
        this.consecutiveFailures = 0;
        this.maxFailures = 3;
        this.baseInterval = 10 * 60 * 1000; // 10 minutes
        this.failureInterval = 5 * 60 * 1000; // 5 minutes en cas d'échec
        this.isStarted = false;
        this.lastSuccessfulPing = null;
    }

    start() {
        if (this.isStarted) {
            console.log('⚠️ Keep-alive déjà démarré');
            return;
        }

        console.log('🔄 Démarrage du keep-alive amélioré');
        
        // Déterminer l'URL de santé
        this.healthCheckUrl = this.getHealthCheckUrl();
        
        if (!this.healthCheckUrl) {
            console.log('⚠️ Keep-alive désactivé - Pas d\'URL de santé disponible');
            return;
        }

        console.log(`🌐 URL de keep-alive: ${this.healthCheckUrl}`);
        
        // Premier ping après 2 minutes
        setTimeout(() => {
            this.performKeepAlive();
        }, 2 * 60 * 1000);
        
        // Programmer les pings réguliers
        this.scheduleNextPing();
        
        this.isStarted = true;
        console.log('✅ Keep-alive amélioré activé - Surveillance H24');
    }

    getHealthCheckUrl() {
        // Priorité 1: Variable d'environnement Render
        if (process.env.RENDER_EXTERNAL_URL) {
            return `${process.env.RENDER_EXTERNAL_URL}/health`;
        }
        
        // Priorité 2: Variable générique
        if (process.env.APP_URL) {
            return `${process.env.APP_URL}/health`;
        }
        
        // Priorité 3: Construction automatique pour Render
        if (process.env.RENDER_SERVICE_NAME) {
            return `https://${process.env.RENDER_SERVICE_NAME}.onrender.com/health`;
        }
        
        // Aucune URL trouvée
        return null;
    }

    scheduleNextPing() {
        const interval = this.consecutiveFailures > 0 ? this.failureInterval : this.baseInterval;
        
        this.keepAliveInterval = setTimeout(() => {
            this.performKeepAlive();
            this.scheduleNextPing(); // Reprogrammer le suivant
        }, interval);
    }

    async performKeepAlive() {
        const startTime = Date.now();
        console.log(`[KEEP-ALIVE] ${new Date().toISOString()} - Ping en cours...`);

        try {
            const response = await this.makeHealthRequest();
            
            if (response.success) {
                this.onPingSuccess(response, Date.now() - startTime);
            } else {
                this.onPingFailure(response.error, Date.now() - startTime);
            }
        } catch (error) {
            this.onPingFailure(error, Date.now() - startTime);
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
                    timeout: 45000, // 45 secondes (plus long pour Render)
                    headers: {
                        'User-Agent': 'Splatoon3FestivalBot-Enhanced-KeepAlive/2.0',
                        'Accept': 'application/json',
                        'Connection': 'close'
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
                            error: res.statusCode !== 200 ? `Status ${res.statusCode}` : null
                        });
                    });
                });

                req.on('error', (error) => {
                    resolve({
                        success: false,
                        error: error.message,
                        statusCode: null
                    });
                });

                req.on('timeout', () => {
                    req.destroy();
                    resolve({
                        success: false,
                        error: 'Timeout (45s)',
                        statusCode: null
                    });
                });

                req.end();
            } catch (error) {
                resolve({
                    success: false,
                    error: error.message,
                    statusCode: null
                });
            }
        });
    }

    onPingSuccess(response, duration) {
        this.consecutiveFailures = 0;
        this.lastSuccessfulPing = new Date();
        
        const durationMs = Math.round(duration);
        console.log(`[KEEP-ALIVE] ✅ Succès (${response.statusCode}) en ${durationMs}ms`);
        
        // Log détaillé si nécessaire
        if (response.data) {
            try {
                const healthData = JSON.parse(response.data);
                if (healthData.uptime) {
                    console.log(`[KEEP-ALIVE] 📊 Uptime: ${Math.round(healthData.uptime / 3600)}h`);
                }
            } catch (e) {
                // Ignore les erreurs de parsing JSON
            }
        }
    }

    onPingFailure(error, duration) {
        this.consecutiveFailures++;
        const durationMs = Math.round(duration);
        
        console.warn(`[KEEP-ALIVE] ❌ Échec ${this.consecutiveFailures}/${this.maxFailures} en ${durationMs}ms: ${error}`);
        
        if (this.consecutiveFailures >= this.maxFailures) {
            console.error(`[KEEP-ALIVE] 🚨 ALERTE: ${this.maxFailures} échecs consécutifs!`);
            console.error(`[KEEP-ALIVE] 🚨 Dernier succès: ${this.lastSuccessfulPing || 'Jamais'}`);
            console.error(`[KEEP-ALIVE] 🚨 Le bot pourrait être hors ligne!`);
        }
    }

    getStatus() {
        return {
            isActive: this.isStarted,
            healthCheckUrl: this.healthCheckUrl,
            consecutiveFailures: this.consecutiveFailures,
            lastSuccessfulPing: this.lastSuccessfulPing,
            nextPingInterval: this.consecutiveFailures > 0 ? this.failureInterval : this.baseInterval
        };
    }

    stop() {
        if (this.keepAliveInterval) {
            clearTimeout(this.keepAliveInterval);
            this.keepAliveInterval = null;
        }
        
        this.isStarted = false;
        console.log('🛑 Keep-alive amélioré arrêté');
    }
}

module.exports = { EnhancedKeepAlive };