// src/utils/simpleKeepAlive.js
class SimpleKeepAlive {
    constructor() {
        this.keepAliveInterval = null;
    }

    start() {
        console.log('🔄 Démarrage du keep-alive permanent');
        
        // Ping toutes les 10 minutes pour éviter le sleep Render (15min)
        this.keepAliveInterval = setInterval(() => {
            this.performKeepAlive();
        }, 10 * 60 * 1000); // 10 minutes (bien sous la limite de 15min de Render)

        // Ping initial après 2 minutes
        setTimeout(() => {
            this.performKeepAlive();
        }, 2 * 60 * 1000);
        
        console.log('✅ Keep-alive permanent activé - Bot restera actif H24');
    }

    performKeepAlive() {
        if (process.env.RENDER_EXTERNAL_URL) {
            const https = require('https');
            const http = require('http');
            
            const protocol = process.env.RENDER_EXTERNAL_URL.startsWith('https') ? https : http;
            
            // Requête keep-alive avec timeout
            const req = protocol.get(`${process.env.RENDER_EXTERNAL_URL}/health`, {
                timeout: 10000
            }, (res) => {
                if (res.statusCode === 200) {
                    console.log(`[KEEP-ALIVE] ${new Date().toISOString()} - Bot maintenu actif (${res.statusCode})`);
                }
            });
            
            req.on('error', (err) => {
                console.warn(`[KEEP-ALIVE] Erreur: ${err.message}`);
            });
            
            req.on('timeout', () => {
                console.warn('[KEEP-ALIVE] Timeout de la requête');
                req.destroy();
            });
        }
    }

    stop() {
        if (this.keepAliveInterval) {
            clearInterval(this.keepAliveInterval);
            this.keepAliveInterval = null;
            console.log('🛑 Keep-alive permanent arrêté');
        }
    }
}

const simpleKeepAlive = new SimpleKeepAlive();

module.exports = {
    SimpleKeepAlive,
    simpleKeepAlive
};
