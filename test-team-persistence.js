/**
 * Script de test pour vérifier que les équipes ne persistent plus après un reset de festival
 */

const { Client, GatewayIntentBits } = require('discord.js');
const config = require('./data/config.json');

// Test des managers
async function testTeamPersistence() {
    console.log('=== TEST PERSISTANCE ÉQUIPES APRÈS RESET ===');
    
    try {
        // Simuler l'initialisation
        const guildId = 'test-guild-123';
        
        // 1. Initialiser les managers
        const teamManager = require('./src/utils/teamManager');
        const festivalManager = require('./src/utils/festivalManager');
        
        teamManager.setCurrentGuildId(guildId);
        
        console.log('1. Chargement du festival...');
        const festival = await festivalManager.loadFestival(guildId);
        console.log(`   Festival trouvé: ${festival ? festival.title : 'AUCUN'}`);
        
        console.log('2. Chargement des équipes...');
        await teamManager.loadTeams();
        const { teams } = require('./src/utils/teamManager');
        console.log(`   Équipes chargées: ${teams.length}`);
        
        // 3. Simuler un reset (si festival existe)
        if (festival) {
            console.log('3. Test reset festival...');
            await festivalManager.resetFestivalData();
            
            console.log('4. Vérification après reset...');
            console.log(`   Équipes en mémoire: ${teams.length}`);
            
            // 5. Test rechargement après reset
            console.log('5. Rechargement après reset...');
            await teamManager.loadTeams();
            console.log(`   Équipes après rechargement: ${teams.length}`);
            
            if (teams.length === 0) {
                console.log('✅ TEST RÉUSSI: Aucune équipe persistante après reset');
            } else {
                console.log('❌ TEST ÉCHOUÉ: Des équipes persistent après reset');
                teams.forEach(team => {
                    console.log(`   - ${team.name} (${team.members.length} membres)`);
                });
            }
        } else {
            console.log('⚠️ Aucun festival actif pour tester le reset');
        }
        
    } catch (error) {
        console.error('❌ Erreur pendant le test:', error);
    }
}

testTeamPersistence().then(() => {
    console.log('=== FIN DU TEST ===');
    process.exit(0);
}).catch(console.error);
