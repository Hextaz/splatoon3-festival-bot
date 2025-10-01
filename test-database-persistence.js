console.log("=== TEST PERSISTANCE DATABASE ===");

// Test without circular dependency by checking via DataAdapter
const DataAdapter = require('./src/utils/dataAdapter');
const scoreTracker = require('./src/utils/scoreTracker');
const matchHistoryManager = require('./src/utils/matchHistoryManager');

async function testDatabasePersistence() {
    const guildId = 'test-guild-123';
    
    console.log('\n🔍 1. Vérification disponibilité MongoDB...');
    // On testera via les opérations réelles
    
    console.log('\n🔍 2. Test DataAdapter...');
    const adapter = new DataAdapter(guildId);
    
    // Test des scores
    console.log('\n📊 Test des scores...');
    const testScores = { camp1: 5, camp2: 3, camp3: 2 };
    
    try {
        await adapter.saveScores(testScores);
        console.log('✅ Scores sauvegardés');
        
        const loadedScores = await adapter.getScores();
        console.log('📥 Scores chargés:', loadedScores);
        
        // Vérifier si la structure est correcte
        if (loadedScores && loadedScores.camp1 !== undefined) {
            console.log('✅ Structure des scores correcte');
        } else {
            console.log('❌ Structure des scores incorrecte');
        }
    } catch (error) {
        console.error('❌ Erreur test scores:', error.message);
    }
    
    // Test de l'historique des matchs
    console.log('\n📝 Test historique des matchs...');
    try {
        // Simuler l'ajout d'un match
        matchHistoryManager.addMatchToHistory('Team Alpha', 'Team Beta', guildId);
        matchHistoryManager.addMatchToHistory('Team Gamma', 'Team Alpha', guildId);
        
        console.log('✅ Matchs ajoutés à l\'historique');
        
        // Vérifier les données en mémoire
        const history = matchHistoryManager.getHistoryForGuild(guildId);
        const counters = matchHistoryManager.getCountersForGuild(guildId);
        
        console.log('📊 Historique en mémoire:');
        console.log(`- Équipes avec historique: ${history.size}`);
        console.log(`- Équipes avec compteurs: ${counters.size}`);
        
        for (const [teamName, matches] of history.entries()) {
            const counter = counters.get(teamName) || 0;
            console.log(`  • ${teamName}: ${matches.length} matchs, compteur: ${counter}`);
        }
        
    } catch (error) {
        console.error('❌ Erreur test historique:', error.message);
    }
    
    // Test sauvegarde d'un match complet
    console.log('\n🏁 Test sauvegarde match complet...');
    try {
        // D'abord vérifier le type de données retourné par getMatches
        const existingMatches = await adapter.getMatches();
        console.log('🔍 Type de données getMatches():', typeof existingMatches, Array.isArray(existingMatches));
        console.log('🔍 Valeur de getMatches():', existingMatches);
        
        const matchData = {
            team1: { name: 'Team Alpha', camp: 'camp1' },
            team2: { name: 'Team Beta', camp: 'camp2' },
            winner: 'Team Alpha',
            multiplier: 1,
            pointsAwarded: 1,
            status: 'completed',
            completedAt: new Date()
        };
        
        const savedMatch = await adapter.saveMatch(matchData);
        console.log('✅ Match complet sauvegardé avec ID:', savedMatch._id || savedMatch.id);
        
        // Vérifier que le match est bien sauvegardé
        const matches = await adapter.getMatches();
        console.log(`📊 Nombre total de matchs en BD: ${matches ? matches.length : 'matches is null'}`);
        
    } catch (error) {
        console.error('❌ Erreur test match complet:', error.message);
        console.error('Stack trace:', error.stack);
    }
    
    console.log('\n✅ Tests terminés');
}

testDatabasePersistence().catch(error => {
    console.error('❌ Erreur générale:', error);
    process.exit(1);
});