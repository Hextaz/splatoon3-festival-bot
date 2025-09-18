// audit-commands.js - Script pour auditer toutes les commandes
const fs = require('fs');
const path = require('path');

const commandsDir = path.join(__dirname, 'src', 'commands');
const commandFiles = fs.readdirSync(commandsDir).filter(file => file.endsWith('.js'));

console.log('🔍 AUDIT DES COMMANDES - Vérification defer et MongoDB');
console.log('='.repeat(70));

const issues = [];

for (const file of commandFiles) {
    const filePath = path.join(commandsDir, file);
    const content = fs.readFileSync(filePath, 'utf8');
    
    const commandName = file.replace('.js', '');
    const hasExecute = content.includes('async execute(interaction)');
    const hasDefer = content.includes('deferReply') || content.includes('safeDefer');
    const hasAsyncOps = content.includes('await') && 
                       (content.includes('MongoDB') || 
                        content.includes('getVotes') || 
                        content.includes('getScores') || 
                        content.includes('getAllTeams') ||
                        content.includes('findTeamBy') ||
                        content.includes('loadProbabilities') ||
                        content.includes('adapter.'));
    
    const usesOldData = content.includes('teams.json') || 
                       content.includes('scores.json') ||
                       content.includes('votes.json');
    
    // Exception pour reset-system qui nettoie intentionnellement les anciens fichiers
    const isResetSystem = commandName === 'reset-system';
    
    const hasLongOps = content.includes('getAllTeams()') || 
                      content.includes('calculateOpponentScore') ||
                      content.includes('loadProbabilities') ||
                      content.includes('Team.find') ||
                      content.includes('Vote.find');
    
    let status = '✅';
    let notes = [];
    
    if (!hasExecute) {
        // Pas de fonction execute, probablement un fichier utilitaire
        continue;
    }
    
    // Vérifications
    if (hasLongOps && !hasDefer) {
        status = '❌';
        notes.push('BESOIN DE DEFER - Opérations longues sans defer');
        issues.push(`${commandName}: Besoin de defer`);
    }
    
    if (usesOldData && !isResetSystem) {
        status = '⚠️';
        notes.push('DONNÉES OBSOLÈTES - Utilise encore JSON');
        issues.push(`${commandName}: Utilise encore les anciens fichiers JSON`);
    }
    
    if (hasAsyncOps && !hasDefer) {
        status = '⚠️';
        notes.push('TIMEOUT POSSIBLE - Async sans defer');
    }
    
    if (content.includes('getAllTeams()') && !content.includes('await getAllTeams()')) {
        status = '⚠️';
        notes.push('MONGODB SYNC - getAllTeams() devrait être await getAllTeams()');
        issues.push(`${commandName}: getAllTeams() sans await`);
    }
    
    console.log(`${status} ${commandName.padEnd(25)} ${notes.join(' | ') || 'OK'}`);
}

console.log('\n' + '='.repeat(70));
console.log('📋 RÉSUMÉ DES PROBLÈMES:');

if (issues.length === 0) {
    console.log('✅ Toutes les commandes semblent correctes !');
} else {
    console.log(`❌ ${issues.length} problème(s) détecté(s):`);
    issues.forEach((issue, index) => {
        console.log(`   ${index + 1}. ${issue}`);
    });
}

console.log('\n🔧 RECOMMANDATIONS:');
console.log('1. Toutes les commandes avec opérations MongoDB doivent utiliser defer');
console.log('2. Remplacer getAllTeams() par await getAllTeams()');
console.log('3. Supprimer toute référence aux anciens fichiers JSON');
console.log('4. Utiliser interaction.editReply() après defer au lieu de safeReply()');
