#!/usr/bin/env node

/**
 * Script de migration complet pour remplacer tous les appels dangereux 
 * aux méthodes d'interaction par les versions sécurisées
 */

const fs = require('fs');
const path = require('path');

// Mappings des remplacements
const replacements = [
    // interaction.reply() -> safeReply()
    {
        pattern: /await interaction\.reply\(/g,
        replacement: 'await safeReply(interaction, '
    },
    {
        pattern: /return await interaction\.reply\(/g,
        replacement: 'return await safeReply(interaction, '
    },
    // interaction.followUp() -> safeFollowUp()
    {
        pattern: /await interaction\.followUp\(/g,
        replacement: 'await safeFollowUp(interaction, '
    },
    {
        pattern: /return await interaction\.followUp\(/g,
        replacement: 'return await safeFollowUp(interaction, '
    },
    // interaction.editReply() -> safeEdit()
    {
        pattern: /await interaction\.editReply\(/g,
        replacement: 'await safeEdit(interaction, '
    },
    {
        pattern: /return await interaction\.editReply\(/g,
        replacement: 'return await safeEdit(interaction, '
    }
];

// Fichiers à traiter
const filesToProcess = [
    'src/utils/interactionHandlers.js'
];

function migrateFile(filePath) {
    console.log(`🔧 Migration de ${filePath}...`);
    
    let content = fs.readFileSync(filePath, 'utf8');
    let modified = false;
    
    // Appliquer tous les remplacements
    for (const replacement of replacements) {
        const matches = content.match(replacement.pattern);
        if (matches) {
            content = content.replace(replacement.pattern, replacement.replacement);
            console.log(`  ✅ ${matches.length} occurrences de ${replacement.pattern.source} remplacées`);
            modified = true;
        }
    }
    
    if (modified) {
        fs.writeFileSync(filePath, content);
        console.log(`✅ ${filePath} migré avec succès`);
        return true;
    } else {
        console.log(`ℹ️  Aucune modification nécessaire pour ${filePath}`);
        return false;
    }
}

// Exécuter la migration
console.log('🚀 Démarrage de la migration complète des interactions...');

let totalModified = 0;

for (const file of filesToProcess) {
    if (fs.existsSync(file)) {
        if (migrateFile(file)) {
            totalModified++;
        }
    } else {
        console.error(`❌ Fichier non trouvé: ${file}`);
    }
}

console.log('\n🎉 Migration terminée !');
console.log(`📊 ${totalModified} fichier(s) modifié(s)`);

if (totalModified > 0) {
    console.log('\n📋 Prochaines étapes:');
    console.log('1. Tester toutes les interactions (votes, matchmaking, équipes, résultats)');
    console.log('2. Vérifier les logs pour les "Interaction expired"');
    console.log('3. Effectuer une régression complète des fonctionnalités');
}
