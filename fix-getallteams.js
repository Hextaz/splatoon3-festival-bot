// fix-getallteams.js - Script pour corriger getAllTeams() en await getAllTeams()
const fs = require('fs');
const path = require('path');

const filesToFix = [
    'src/commands/debug-matchmaking.js',
    'src/commands/test-matchmaking-advanced.js', 
    'src/commands/test-mode.js'
];

for (const filePath of filesToFix) {
    if (!fs.existsSync(filePath)) {
        console.log(`❌ Fichier non trouvé: ${filePath}`);
        continue;
    }
    
    let content = fs.readFileSync(filePath, 'utf8');
    
    console.log(`🔧 Correction de ${filePath}...`);
    
    // Remplacer getAllTeams() par await getAllTeams()
    const oldContent = content;
    content = content.replace(/const\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*getAllTeams\(\);/g, 'const $1 = await getAllTeams();');
    content = content.replace(/=\s*getAllTeams\(\)/g, '= await getAllTeams()');
    content = content.replace(/getAllTeams\(\)\.([a-zA-Z_$][a-zA-Z0-9_$]*)/g, '(await getAllTeams()).$1');
    
    if (content !== oldContent) {
        fs.writeFileSync(filePath, content);
        console.log(`   ✅ getAllTeams() corrigé en await getAllTeams()`);
        console.log(`   💾 ${filePath} sauvegardé`);
    } else {
        console.log(`   ⚠️  Aucun changement nécessaire`);
    }
}

console.log('\n✅ Correction terminée !');
