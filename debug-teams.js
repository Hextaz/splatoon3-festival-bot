// Script de debug pour vérifier les équipes en base de données
const { Team } = require('./src/models/mongodb');
const DataAdapter = require('./src/utils/dataAdapter');

async function debugTeams() {
    try {
        console.log('🔍 Vérification des équipes en base de données...');
        
        // Supposons que votre guildId est celui de votre serveur de test
        const guildId = process.argv[2] || 'YOUR_GUILD_ID_HERE';
        
        console.log(`Guild ID utilisé: ${guildId}`);
        
        // Compter toutes les équipes
        const allTeams = await Team.find({});
        console.log(`📊 Total équipes en base (tous serveurs): ${allTeams.length}`);
        
        if (allTeams.length > 0) {
            console.log('Équipes trouvées:');
            allTeams.forEach(team => {
                console.log(`  - ${team.name} (Guild: ${team.guildId}, Festival: ${team.festivalId})`);
            });
        }
        
        // Compter les équipes pour ce serveur spécifique
        const guildTeams = await Team.find({ guildId });
        console.log(`📊 Équipes pour le serveur ${guildId}: ${guildTeams.length}`);
        
        if (guildTeams.length > 0) {
            console.log('Équipes de ce serveur:');
            guildTeams.forEach(team => {
                console.log(`  - ${team.name} (Festival: ${team.festivalId})`);
            });
        }
        
        // Test de suppression
        console.log('\n🧪 Test de suppression...');
        const adapter = new DataAdapter(guildId);
        const result = await adapter.clearAllTeams();
        console.log('Résultat de la suppression:', result);
        
        // Revérifier après suppression
        const teamsAfter = await Team.find({ guildId });
        console.log(`📊 Équipes restantes après suppression: ${teamsAfter.length}`);
        
    } catch (error) {
        console.error('❌ Erreur:', error);
    }
    
    process.exit(0);
}

debugTeams();
