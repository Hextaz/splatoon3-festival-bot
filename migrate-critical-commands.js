#!/usr/bin/env node

/**
 * Script de migration pour toutes les commandes critiques
 */

const fs = require('fs');
const path = require('path');

// Fichiers critiques à traiter (excluant test-mode et debug qui ne sont pas critiques)
const criticalFiles = [
    'src/commands/start-festival.js',
    'src/commands/end-festival.js', 
    'src/commands/config.js',
    'src/commands/bot-status.js',
    'src/commands/documentation.js'
];

// Mappings des remplacements
const replacements = [
    {
        pattern: /await interaction\.reply\(/g,
        replacement: 'await safeReply(interaction, '
    },
    {
        pattern: /return await interaction\.reply\(/g,
        replacement: 'return await safeReply(interaction, '
    },
    {
        pattern: /await interaction\.followUp\(/g,
        replacement: 'await safeFollowUp(interaction, '
    },
    {
        pattern: /return await interaction\.followUp\(/g,
        replacement: 'return await safeFollowUp(interaction, '
    },
    {
        pattern: /await interaction\.editReply\(/g,
        replacement: 'await safeEdit(interaction, '
    },
    {
        pattern: /return await interaction\.editReply\(/g,
        replacement: 'return await safeEdit(interaction, '
    }
];

function addSafeImports(content) {
    // Vérifier si les imports safeReply/safeEdit existent
    if (!content.includes('safeReply') || !content.includes('safeEdit') || !content.includes('safeFollowUp')) {
        // Chercher une ligne d'import existante de responseUtils
        const importMatch = content.match(/const\s*{\s*([^}]*)\s*}\s*=\s*require\(['"`][^'"`]*responseUtils['"`]\);?/);
        
        if (importMatch) {
            const existingImports = importMatch[1].split(',').map(s => s.trim()).filter(s => s);
            
            // Ajouter les imports manquants
            const requiredImports = ['safeReply', 'safeEdit', 'safeFollowUp'];
            for (const imp of requiredImports) {
                if (!existingImports.includes(imp)) {
                    existingImports.push(imp);
                }
            }
            
            const newImportLine = `const { ${existingImports.join(', ')} } = require('../utils/responseUtils');`;
            content = content.replace(importMatch[0], newImportLine);
        } else {
            // Ajouter un nouvel import après les autres requires
            const lines = content.split('\n');
            let insertIndex = 0;
            
            for (let i = 0; i < lines.length; i++) {
                if (lines[i].includes('require(') && !lines[i].includes('//')) {
                    insertIndex = i + 1;
                }
            }
            
            lines.splice(insertIndex, 0, "const { safeReply, safeEdit, safeFollowUp } = require('../utils/responseUtils');");
            content = lines.join('\n');
        }
    }
    
    return content;
}

function migrateFile(filePath) {
    console.log(`🔧 Migration de ${filePath}...`);
    
    let content = fs.readFileSync(filePath, 'utf8');
    let modified = false;
    
    // 1. Ajouter les imports nécessaires
    const originalContent = content;
    content = addSafeImports(content);
    if (content !== originalContent) {
        console.log(`  ✅ Imports safeReply/safeEdit/safeFollowUp ajoutés`);
        modified = true;
    }
    
    // 2. Appliquer les remplacements
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
console.log('🚀 Démarrage de la migration des commandes critiques...');

let totalModified = 0;

for (const file of criticalFiles) {
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
    console.log('1. Tester les commandes critiques (start-festival, config, etc.)');
    console.log('2. Vérifier les logs pour les "Interaction expired"');
    console.log('3. Effectuer une régression complète');
}
