// src/utils/healthServer.js
const http = require('http');

class HealthServer {
    constructor() {
        this.server = null;
        this.port = process.env.PORT || 3000;
    }

    start() {
        this.server = http.createServer((req, res) => {
            // Configurer CORS pour éviter les erreurs
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

            if (req.method === 'OPTIONS') {
                res.writeHead(200);
                res.end();
                return;
            }

            if (req.url === '/health') {
                this.handleHealthCheck(req, res);
            } else if (req.url === '/') {
                this.handleRoot(req, res);
            } else {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Not Found' }));
            }
        });
        
        this.server.listen(this.port, () => {
            console.log(`🏥 Health server running on port ${this.port}`);
            if (process.env.RENDER_EXTERNAL_URL) {
                console.log(`🔗 Health endpoint: ${process.env.RENDER_EXTERNAL_URL}/health`);
            } else {
                console.log(`🔗 Health endpoint: http://localhost:${this.port}/health`);
            }
        });

        this.server.on('error', (err) => {
            console.error('❌ Health server error:', err);
        });
    }

    handleHealthCheck(req, res) {
        const healthData = {
            status: 'ok',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            keepAlive: {
                active: true,
                type: 'permanent',
                interval: '10 minutes'
            },
            version: require('../../package.json').version || '1.0.0'
        };

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(healthData, null, 2));
    }

    handleRoot(req, res) {
        const html = `
<!DOCTYPE html>
<html>
<head>
    <title>Splatoon 3 Festival Bot</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 40px; background: #f5f5f5; }
        .container { background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .status { padding: 15px; margin: 10px 0; border-radius: 5px; }
        .online { background: #d4edda; color: #155724; border: 1px solid #c3e6cb; }
        .info { background: #d1ecf1; color: #0c5460; border: 1px solid #bee5eb; }
        h1 { color: #333; }
        .emoji { font-size: 1.2em; }
    </style>
</head>
<body>
    <div class="container">
        <h1><span class="emoji">🎮</span> Splatoon 3 Festival Bot</h1>
        <div class="status online">
            <strong>✅ Bot Status:</strong> Online and Running
        </div>
        <div class="status info">
            <strong>📊 Health Check:</strong> <a href="/health">/health</a>
        </div>
        <div class="status info">
            <strong>🤖 Version:</strong> ${require('../../package.json').version || '1.0.0'}
        </div>
        <div class="status info">
            <strong>⏱️ Uptime:</strong> ${Math.round(process.uptime())} seconds
        </div>
        <p><em>Bot hébergé sur Render.com avec keep-alive permanent activé</em></p>
    </div>
</body>
</html>`;

        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(html);
    }

    stop() {
        if (this.server) {
            this.server.close(() => {
                console.log('🏥 Health server stopped');
            });
        }
    }
}

const healthServer = new HealthServer();

module.exports = {
    HealthServer,
    healthServer
};
