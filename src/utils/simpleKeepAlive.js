// src/utils/simpleKeepAlive.js
class SimpleKeepAlive {
    constructor() {
        this.keepAliveInterval = null;
    }

    start() {
        console.log('🔄 Démarrage du keep-alive discret');
        
        // Ping plus espacé (25 minutes) pour éviter la détection
        this.keepAliveInterval = setInterval(() => {
            this.performKeepAlive();
        }, 25 * 60 * 1000); // 25 minutes (sous la limite de 30min de Render)

        // Ping initial après 5 minutes pour éviter le spam au démarrage
        setTimeout(() => {
            this.performKeepAlive();
        }, 5 * 60 * 1000);
        
        console.log('✅ Keep-alive discret activé - Intervalle de 25 minutes');
    }

    performKeepAlive() {
        if (process.env.RENDER_EXTERNAL_URL) {
            const https = require('https');
            const http = require('http');
            
            const protocol = process.env.RENDER_EXTERNAL_URL.startsWith('https') ? https : http;
            
            // Requête plus discrète avec timeout
            const req = protocol.get(`${process.env.RENDER_EXTERNAL_URL}/health`, {
                timeout: 5000
            }, (res) => {
                // Log moins verbeux
                if (res.statusCode === 200) {
                    console.log(`[HEALTH] ${new Date().toISOString().substring(11, 19)} - Service actif`);
                }
            });
            
            req.on('error', () => {
                // Ignore silencieusement les erreurs
            });
            
            req.on('timeout', () => {
                req.destroy();
            });
        }
    }

    stop() {
        if (this.keepAliveInterval) {
            clearInterval(this.keepAliveInterval);
            this.keepAliveInterval = null;
            console.log('🛑 Keep-alive discret arrêté');
        }
    }
}

const simpleKeepAlive = new SimpleKeepAlive();

module.exports = {
    SimpleKeepAlive,
    simpleKeepAlive
};
