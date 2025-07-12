#!/usr/bin/env node

/**
 * Script de migration pour remplacer les appels dangereux à interaction.update()
 * par la version sécurisée safeUpdate()
 */

const fs = require('fs');
const path = require('path');

// Fichiers à traiter
const filesToProcess = [
    'src/utils/interactionHandlers.js',
    'src/utils/matchSearch.js',
    'src/events/interactionCreate.js'
];

function migrateFile(filePath) {
    console.log(`🔧 Migration de ${filePath}...`);
    
    let content = fs.readFileSync(filePath, 'utf8');
    let modified = false;
    
    // 1. Ajouter l'import safeUpdate si pas présent
    if (!content.includes('safeUpdate')) {
        // Chercher une ligne d'import existante de responseUtils
        const importMatch = content.match(/const\s*{\s*([^}]+)\s*}\s*=\s*require\(['"`]\.\.\/utils\/responseUtils['"`]\);?/);
        
        if (importMatch) {
            const existingImports = importMatch[1].split(',').map(s => s.trim());
            if (!existingImports.includes('safeUpdate')) {
                existingImports.push('safeUpdate');
                const newImportLine = `const { ${existingImports.join(', ')} } = require('../utils/responseUtils');`;
                content = content.replace(importMatch[0], newImportLine);
                modified = true;
                console.log(`  ✅ Ajout import safeUpdate`);
            }
        } else {
            // Ajouter un nouvel import en haut
            const lines = content.split('\n');
            let insertIndex = 0;
            
            // Trouver après les autres imports
            for (let i = 0; i < lines.length; i++) {
                if (lines[i].includes('require(') && !lines[i].includes('//')) {
                    insertIndex = i + 1;
                }
            }
            
            lines.splice(insertIndex, 0, "const { safeUpdate } = require('../utils/responseUtils');");
            content = lines.join('\n');
            modified = true;
            console.log(`  ✅ Nouvel import safeUpdate ajouté`);
        }
    }
    
    // 2. Remplacer interaction.update( par safeUpdate(interaction,
    const updatePattern = /await\s+interaction\.update\(/g;
    const matches = content.match(updatePattern);
    
    if (matches) {
        content = content.replace(updatePattern, 'await safeUpdate(interaction, ');
        modified = true;
        console.log(`  ✅ ${matches.length} appels interaction.update() remplacés`);
    }
    
    // 3. Remplacer return await interaction.update( par return await safeUpdate(interaction,
    const returnUpdatePattern = /return\s+await\s+interaction\.update\(/g;
    const returnMatches = content.match(returnUpdatePattern);
    
    if (returnMatches) {
        content = content.replace(returnUpdatePattern, 'return await safeUpdate(interaction, ');
        modified = true;
        console.log(`  ✅ ${returnMatches.length} return interaction.update() remplacés`);
    }
    
    if (modified) {
        fs.writeFileSync(filePath, content);
        console.log(`✅ ${filePath} migré avec succès`);
    } else {
        console.log(`ℹ️ ${filePath} déjà à jour`);
    }
    
    return modified;
}

function main() {
    console.log('🚀 Démarrage de la migration des interactions...\n');
    
    let totalFilesModified = 0;
    
    for (const file of filesToProcess) {
        try {
            if (fs.existsSync(file)) {
                const wasModified = migrateFile(file);
                if (wasModified) totalFilesModified++;
            } else {
                console.log(`⚠️ Fichier non trouvé: ${file}`);
            }
        } catch (error) {
            console.error(`❌ Erreur lors de la migration de ${file}:`, error.message);
        }
        console.log('');
    }
    
    console.log(`\n🎉 Migration terminée !`);
    console.log(`📊 ${totalFilesModified} fichier(s) modifié(s)`);
    console.log(`\n📋 Prochaines étapes:`);
    console.log(`1. Tester les interactions (votes, matchmaking, équipes)`);
    console.log(`2. Vérifier les logs pour les "Interaction expired"`);
    console.log(`3. Appliquer la migration aux autres fichiers si nécessaire`);
}

main();
