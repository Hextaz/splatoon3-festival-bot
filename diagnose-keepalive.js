// diagnose-keepalive.js - Script de diagnostic du système keep-alive
require('dotenv').config();

console.log('🔍 DIAGNOSTIC DU SYSTÈME KEEP-ALIVE');
console.log('====================================');

// 1. Vérifier l'environnement Render
console.log('\n📋 VARIABLES D\'ENVIRONNEMENT:');
console.log('RENDER_EXTERNAL_URL:', process.env.RENDER_EXTERNAL_URL);
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('PORT:', process.env.PORT);

// 2. Tester la disponibilité du serveur de santé
const { HealthServer } = require('./src/utils/healthServer');

async function testHealthServer() {
    console.log('\n🏥 TEST DU SERVEUR DE SANTÉ:');
    
    const healthServer = new HealthServer();
    
    try {
        await healthServer.start();
        console.log('✅ Serveur de santé démarré avec succès');
        
        const port = process.env.PORT || 3000;
        console.log(`🌐 Serveur disponible sur le port ${port}`);
        
        // Test de l'endpoint local
        const http = require('http');
        const testReq = http.get(`http://localhost:${port}/health`, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                console.log(`✅ Endpoint /health répond: ${res.statusCode}`);
                console.log('📊 Réponse:', JSON.parse(data));
            });
        });
        
        testReq.on('error', (err) => {
            console.error('❌ Erreur lors du test local:', err.message);
        });
        
        // Arrêter le serveur après le test
        setTimeout(() => {
            healthServer.stop();
            console.log('🛑 Serveur de santé arrêté');
        }, 3000);
        
    } catch (error) {
        console.error('❌ Erreur lors du démarrage du serveur de santé:', error.message);
    }
}

// 3. Tester le système SimpleKeepAlive
function testKeepAlive() {
    console.log('\n🔄 TEST DU SYSTÈME KEEP-ALIVE:');
    
    const { SimpleKeepAlive } = require('./src/utils/simpleKeepAlive');
    const keepAlive = new SimpleKeepAlive();
    
    if (process.env.RENDER_EXTERNAL_URL) {
        console.log(`🌐 URL de keep-alive: ${process.env.RENDER_EXTERNAL_URL}/health`);
        console.log('🔄 Test d\'un ping manuel...');
        
        keepAlive.performKeepAlive();
        
        setTimeout(() => {
            console.log('⏰ Ping de test terminé');
        }, 5000);
    } else {
        console.log('⚠️ RENDER_EXTERNAL_URL non défini - Keep-alive désactivé');
        console.log('💡 En mode local, le keep-alive n\'est pas nécessaire');
    }
}

// 4. Analyser les problèmes potentiels
function analyzeIssues() {
    console.log('\n🔍 ANALYSE DES PROBLÈMES POTENTIELS:');
    
    const issues = [];
    
    if (!process.env.RENDER_EXTERNAL_URL) {
        issues.push('❌ RENDER_EXTERNAL_URL non défini - Keep-alive inactif');
    }
    
    if (!process.env.PORT) {
        issues.push('⚠️ PORT non défini - Utilise le port par défaut 3000');
    }
    
    if (process.env.NODE_ENV !== 'production') {
        issues.push('ℹ️ NODE_ENV n\'est pas "production"');
    }
    
    if (issues.length === 0) {
        console.log('✅ Aucun problème évident détecté');
    } else {
        issues.forEach(issue => console.log(issue));
    }
    
    console.log('\n💡 RECOMMANDATIONS:');
    console.log('1. Vérifier que RENDER_EXTERNAL_URL est défini dans Render');
    console.log('2. S\'assurer que l\'URL correspond à votre service Render');
    console.log('3. Vérifier les logs Render pour des erreurs de timeout');
    console.log('4. Considérer l\'ajout d\'un service externe (UptimeRobot, etc.)');
}

// Exécuter tous les tests
async function runDiagnostic() {
    await testHealthServer();
    
    setTimeout(() => {
        testKeepAlive();
        
        setTimeout(() => {
            analyzeIssues();
            console.log('\n✅ Diagnostic terminé');
            process.exit(0);
        }, 6000);
    }, 4000);
}

runDiagnostic().catch(console.error);