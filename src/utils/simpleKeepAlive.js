// src/utils/simpleKeepAlive.js
class SimpleKeepAlive {
    constructor() {
        this.keepAliveInterval = null;
    }

    start() {
        console.log('🔄 Démarrage du keep-alive permanent');
        
        // Ping simple toutes les 10 minutes pour maintenir l'éveil
        this.keepAliveInterval = setInterval(() => {
            this.performKeepAlive();
        }, 10 * 60 * 1000); // 10 minutes

        // Ping initial
        this.performKeepAlive();
        
        console.log('✅ Keep-alive permanent activé - Bot restera actif H24');
    }

    performKeepAlive() {
        if (process.env.RENDER_EXTERNAL_URL) {
            const https = require('https');
            const http = require('http');
            
            const protocol = process.env.RENDER_EXTERNAL_URL.startsWith('https') ? https : http;
            
            protocol.get(`${process.env.RENDER_EXTERNAL_URL}/health`, (res) => {
                console.log(`[KEEP-ALIVE] ${new Date().toISOString()} - Bot maintenu actif (${res.statusCode})`);
            }).on('error', (err) => {
                // Ignore les erreurs de ping silencieusement
            });
        } else {
            // En développement local
            console.log(`[KEEP-ALIVE] ${new Date().toISOString()} - Ping local`);
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
