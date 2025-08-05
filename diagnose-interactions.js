// Script de diagnostic pour les interactions de festival
const { ButtonBuilder, ButtonStyle, ActionRowBuilder, EmbedBuilder } = require('discord.js');

console.log('=== DIAGNOSTIC DES INTERACTIONS DE FESTIVAL ===');

// 1. Vérifier que tous les gestionnaires d'interaction existent
try {
    const {
        handleFestivalSetup,
        handleMapBanSelection, 
        handleFinalFestivalSetup,
        handleFestivalDuration
    } = require('./src/utils/interactionHandlers');
    
    console.log('✅ Tous les gestionnaires sont importables');
    
    // 2. Vérifier les custom IDs que nous utilisons dans start-festival.js
    const customIdsUsed = [
        'teamsize_2', 'teamsize_3', 'teamsize_4',
        'gamemode_turf', 'gamemode_ranked', 'gamemode_splat_zones', 'gamemode_mixed',
        'mapban_none', 'mapban_select', 'mapban_confirm',
        'mapban_selection',
        'festivalduration_1', 'festivalduration_3', 'festivalduration_7', 
        'festivalduration_14', 'festivalduration_custom'
    ];
    
    console.log('✅ Custom IDs attendus:', customIdsUsed);
    
    // 3. Vérifier la logique de routage dans interactionCreate.js
    const fs = require('fs');
    const interactionCreateContent = fs.readFileSync('./src/events/interactionCreate.js', 'utf8');
    
    const hasTeamSizeRouting = interactionCreateContent.includes('teamsize_');
    const hasGameModeRouting = interactionCreateContent.includes('gamemode_');
    const hasMapBanRouting = interactionCreateContent.includes('mapban_');
    const hasDurationRouting = interactionCreateContent.includes('festivalduration_');
    
    console.log('📋 Routage des interactions:');
    console.log('  - teamsize_*:', hasTeamSizeRouting ? '✅' : '❌');
    console.log('  - gamemode_*:', hasGameModeRouting ? '✅' : '❌');
    console.log('  - mapban_*:', hasMapBanRouting ? '✅' : '❌');
    console.log('  - festivalduration_*:', hasDurationRouting ? '✅' : '❌');
    
    if (!hasTeamSizeRouting || !hasGameModeRouting || !hasMapBanRouting || !hasDurationRouting) {
        console.log('❌ PROBLÈME: Certains custom IDs ne sont pas routés correctement');
    } else {
        console.log('✅ Tous les custom IDs sont routés');
    }
    
    console.log('🎯 Diagnostic terminé - vérifiez les logs du bot sur Render pour plus de détails');
    
} catch (error) {
    console.error('❌ Erreur lors du diagnostic:', error.message);
    console.error('Stack:', error.stack);
}
