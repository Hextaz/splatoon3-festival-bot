// fix-defer-commands.js - Script pour corriger automatiquement les commands avec defer
const fs = require('fs');
const path = require('path');

const commandsDir = path.join(__dirname, 'src', 'commands');
const commandFiles = fs.readdirSync(commandsDir).filter(file => file.endsWith('.js'));

const filesToFix = [
    'results.js',
    'search-match.js', 
    'view-scores.js',
    'force-vote-change.js'
];

for (const fileName of filesToFix) {
    if (!commandFiles.includes(fileName)) continue;
    
    const filePath = path.join(commandsDir, fileName);
    let content = fs.readFileSync(filePath, 'utf8');
    
    console.log(`🔧 Correction de ${fileName}...`);
    
    // Si le fichier n'a pas de defer, l'ajouter
    if (!content.includes('deferReply') && !content.includes('safeDefer')) {
        content = content.replace(
            'async execute(interaction) {',
            'async execute(interaction) {\n        await interaction.deferReply({ ephemeral: true });\n        '
        );
        console.log(`   ✅ Defer ajouté`);
    }
    
    // Remplacer safeReply par editReply pour les commandes avec defer
    if (content.includes('deferReply') || content.includes('safeDefer')) {
        // Remplacer return await safeReply par return await interaction.editReply
        content = content.replace(
            /return await safeReply\(interaction, \{([^}]+)\}\);/g,
            'return await interaction.editReply({$1});'
        );
        
        // Remplacer await safeReply par await interaction.editReply
        content = content.replace(
            /await safeReply\(interaction, \{([^}]+)\}\);/g,
            'await interaction.editReply({$1});'
        );
        
        // Supprimer ephemeral: true car defer l'a déjà défini
        content = content.replace(/,\s*ephemeral:\s*true/g, '');
        content = content.replace(/ephemeral:\s*true,\s*/g, '');
        content = content.replace(/ephemeral:\s*true\s*,?\s*/g, '');
        
        console.log(`   ✅ safeReply remplacé par editReply`);
    }
    
    fs.writeFileSync(filePath, content);
    console.log(`   💾 ${fileName} sauvegardé`);
}

console.log('\n✅ Correction terminée !');
