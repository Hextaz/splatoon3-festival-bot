// monitor-keepalive-stability.js - Monitoring avancé du keep-alive
require('dotenv').config();

class KeepAliveMonitor {
    constructor() {
        this.startTime = Date.now();
        this.successCount = 0;
        this.failureCount = 0;
        this.lastFailureTime = null;
        this.consecutiveFailures = 0;
        this.maxConsecutiveFailures = 0;
        this.uptimeAtLastCheck = 0;
        this.memoryLeakDetected = false;
        this.performanceIssues = [];
    }

    async runDiagnostic() {
        console.log('🔍 MONITORING AVANCÉ DU KEEP-ALIVE');
        console.log('===================================');
        console.log(`Démarré le: ${new Date().toLocaleString()}`);
        
        // Test initial
        await this.performHealthCheck();
        
        // Surveillance continue
        this.startContinuousMonitoring();
    }

    async performHealthCheck() {
        const startTime = Date.now();
        
        try {
            const response = await this.makeHealthRequest();
            const duration = Date.now() - startTime;
            
            if (response.success) {
                this.onSuccess(response, duration);
            } else {
                this.onFailure(response.error, duration);
            }
            
            // Analyser la réponse pour détecter des problèmes
            if (response.data) {
                await this.analyzeHealthData(response.data);
            }
            
        } catch (error) {
            this.onFailure(error.message, Date.now() - startTime);
        }
    }

    makeHealthRequest() {
        return new Promise((resolve) => {
            const https = require('https');
            const http = require('http');
            
            // Utiliser localhost d'abord pour test local
            const testUrl = process.env.RENDER_EXTERNAL_URL 
                ? `${process.env.RENDER_EXTERNAL_URL}/health`
                : 'http://localhost:3000/health';
            
            console.log(`🌐 Test sur: ${testUrl}`);
            
            try {
                const { URL } = require('url');
                const url = new URL(testUrl);
                const protocol = url.protocol === 'https:' ? https : http;
                
                const options = {
                    hostname: url.hostname,
                    port: url.port || (url.protocol === 'https:' ? 443 : 80),
                    path: url.pathname,
                    method: 'GET',
                    timeout: 45000,
                    headers: {
                        'User-Agent': 'KeepAlive-Monitor/1.0',
                        'Accept': 'application/json'
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

    onSuccess(response, duration) {
        this.successCount++;
        this.consecutiveFailures = 0;
        
        const timestamp = new Date().toISOString();
        console.log(`✅ [${timestamp}] Succès (${response.statusCode}) en ${duration}ms`);
        
        // Détecter les ralentissements
        if (duration > 10000) { // Plus de 10 secondes
            console.warn(`⚠️ RALENTISSEMENT: Réponse en ${duration}ms (> 10s)`);
            this.performanceIssues.push({
                timestamp,
                type: 'slow_response',
                duration,
                threshold: 10000
            });
        }
    }

    onFailure(error, duration) {
        this.failureCount++;
        this.consecutiveFailures++;
        this.lastFailureTime = Date.now();
        
        if (this.consecutiveFailures > this.maxConsecutiveFailures) {
            this.maxConsecutiveFailures = this.consecutiveFailures;
        }
        
        const timestamp = new Date().toISOString();
        console.error(`❌ [${timestamp}] Échec: ${error} (en ${duration}ms)`);
        
        // Alertes critiques
        if (this.consecutiveFailures >= 3) {
            console.error(`🚨 ALERTE: ${this.consecutiveFailures} échecs consécutifs!`);
        }
        
        if (this.consecutiveFailures >= 5) {
            console.error(`🔥 CRITIQUE: Système keep-alive probablement défaillant!`);
            this.analyzeFailurePattern();
        }
    }

    async analyzeHealthData(data) {
        try {
            const healthData = JSON.parse(data);
            
            // Analyser l'uptime pour détecter les redémarrages
            if (healthData.uptime !== undefined) {
                const currentUptime = healthData.uptime;
                
                if (this.uptimeAtLastCheck > 0 && currentUptime < this.uptimeAtLastCheck) {
                    console.warn(`🔄 REDÉMARRAGE DÉTECTÉ: Uptime passé de ${Math.round(this.uptimeAtLastCheck/3600)}h à ${Math.round(currentUptime/3600)}h`);
                }
                
                this.uptimeAtLastCheck = currentUptime;
                
                // Log périodique de l'uptime
                if (currentUptime > 0) {
                    const hours = Math.round(currentUptime / 3600);
                    console.log(`📊 Uptime bot: ${hours}h`);
                }
            }
            
            // Analyser la mémoire pour détecter les fuites
            if (healthData.memory) {
                const memoryMB = Math.round(healthData.memory.rss / 1024 / 1024);
                console.log(`💾 Mémoire: ${memoryMB}MB`);
                
                // Alerter si mémoire > 512MB (peut indiquer une fuite)
                if (memoryMB > 512) {
                    console.warn(`⚠️ MÉMOIRE ÉLEVÉE: ${memoryMB}MB (> 512MB)`);
                    if (!this.memoryLeakDetected) {
                        this.memoryLeakDetected = true;
                        console.error(`🚨 FUITE MÉMOIRE POSSIBLE détectée!`);
                    }
                }
            }
            
        } catch (error) {
            console.warn(`⚠️ Impossible d'analyser les données de santé: ${error.message}`);
        }
    }

    analyzeFailurePattern() {
        const now = Date.now();
        const runTime = now - this.startTime;
        const runTimeHours = Math.round(runTime / (1000 * 60 * 60));
        
        console.log(`\n🔍 ANALYSE DES PANNES:`);
        console.log(`📊 Temps de fonctionnement: ${runTimeHours}h`);
        console.log(`✅ Succès: ${this.successCount}`);
        console.log(`❌ Échecs: ${this.failureCount}`);
        console.log(`🔥 Max échecs consécutifs: ${this.maxConsecutiveFailures}`);
        
        // Analyser si la panne arrive après un certain temps
        if (runTimeHours >= 20) {
            console.error(`🚨 PATTERN DÉTECTÉ: Panne après ${runTimeHours}h de fonctionnement`);
            console.error(`💡 Cause probable: Dégradation progressive (mémoire, performance, etc.)`);
        }
        
        if (this.performanceIssues.length > 0) {
            console.warn(`⚠️ ${this.performanceIssues.length} problèmes de performance détectés`);
        }
        
        if (this.memoryLeakDetected) {
            console.error(`🚨 Fuite mémoire détectée - Redémarrage recommandé`);
        }
    }

    startContinuousMonitoring() {
        console.log(`\n🔄 Début du monitoring continu (checks toutes les 2 minutes)`);
        console.log(`⏹️ Arrêtez avec Ctrl+C\n`);
        
        // Check toutes les 2 minutes
        setInterval(() => {
            this.performHealthCheck();
        }, 2 * 60 * 1000);
        
        // Rapport horaire
        setInterval(() => {
            this.generateHourlyReport();
        }, 60 * 60 * 1000);
        
        // Nettoyage automatique des vieux logs de performance
        setInterval(() => {
            const oneHourAgo = Date.now() - (60 * 60 * 1000);
            this.performanceIssues = this.performanceIssues.filter(
                issue => new Date(issue.timestamp).getTime() > oneHourAgo
            );
        }, 30 * 60 * 1000);
    }

    generateHourlyReport() {
        const now = Date.now();
        const runTime = now - this.startTime;
        const runTimeHours = Math.round(runTime / (1000 * 60 * 60));
        
        console.log(`\n📊 RAPPORT HORAIRE (${runTimeHours}h de monitoring):`);
        console.log(`✅ Succès: ${this.successCount}`);
        console.log(`❌ Échecs: ${this.failureCount}`);
        console.log(`🔥 Échecs consécutifs actuels: ${this.consecutiveFailures}`);
        
        const successRate = this.successCount + this.failureCount > 0 
            ? Math.round((this.successCount / (this.successCount + this.failureCount)) * 100)
            : 0;
        console.log(`📈 Taux de succès: ${successRate}%`);
        
        if (this.lastFailureTime) {
            const timeSinceLastFailure = Math.round((now - this.lastFailureTime) / (1000 * 60));
            console.log(`⏰ Dernier échec: il y a ${timeSinceLastFailure} minutes`);
        }
        
        if (runTimeHours >= 24) {
            console.log(`🎯 MILESTONE: ${runTimeHours}h de monitoring - Keep-alive encore actif!`);
        }
        
        console.log('');
    }
}

// Exécuter le monitoring
const monitor = new KeepAliveMonitor();
monitor.runDiagnostic().catch(console.error);

// Gestion propre de l'arrêt
process.on('SIGINT', () => {
    console.log('\n🛑 Arrêt du monitoring...');
    monitor.generateHourlyReport();
    console.log('✅ Monitoring terminé');
    process.exit(0);
});