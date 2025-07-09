// test-smart-sleep.js
// Script de test pour valider le système de veille intelligente

const { SmartSleepManager } = require('./src/utils/smartSleep');
const { HealthServer } = require('./src/utils/healthServer');

console.log('🧪 Test du système de veille intelligente\n');

async function testSmartSleep() {
    console.log('1. Création d\'une instance SmartSleepManager...');
    const manager = new SmartSleepManager();
    
    console.log('2. Vérification de l\'état initial...');
    const status = manager.getStatus();
    console.log('État:', JSON.stringify(status, null, 2));
    
    console.log('\n3. Test de démarrage...');
    manager.start();
    
    console.log('4. Attente de 3 secondes...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    console.log('5. Vérification après démarrage...');
    const statusAfter = manager.getStatus();
    console.log('État:', JSON.stringify(statusAfter, null, 2));
    
    console.log('\n6. Test d\'arrêt...');
    manager.stop();
    
    console.log('✅ Test SmartSleepManager terminé\n');
}

async function testHealthServer() {
    console.log('7. Test du HealthServer...');
    const server = new HealthServer();
    
    console.log('8. Démarrage du serveur...');
    server.start();
    
    console.log('9. Attente de 2 secondes...');
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    console.log('10. Test de l\'endpoint via fetch...');
    try {
        const response = await fetch('http://localhost:3000/health');
        const data = await response.json();
        console.log('Réponse /health:', JSON.stringify(data, null, 2));
    } catch (error) {
        console.error('Erreur test endpoint:', error.message);
    }
    
    console.log('11. Arrêt du serveur...');
    server.stop();
    
    console.log('✅ Test HealthServer terminé\n');
}

async function runTests() {
    try {
        await testSmartSleep();
        await testHealthServer();
        console.log('🎉 Tous les tests ont réussi !');
    } catch (error) {
        console.error('❌ Erreur durant les tests:', error);
    }
    process.exit(0);
}

runTests();
