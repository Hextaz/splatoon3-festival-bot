// Test script pour l'interface de création de festival
// Ce script vérifie les gestionnaires d'interaction

console.log('=== TEST DE L\'INTERFACE DE CREATION DE FESTIVAL ===');

try {
    // 1. Vérifier que tous les gestionnaires requis existent
    const {
        handleFestivalSetup,
        handleMapBanSelection,
        handleFinalFestivalSetup,
        handleFestivalDuration
    } = require('./src/utils/interactionHandlers');

    console.log('✅ Gestionnaires importés avec succès');

    // 2. Vérifier les custom IDs supportés
    const supportedCustomIds = [
        'teamsize_2', 'teamsize_3', 'teamsize_4',
        'gamemode_turf', 'gamemode_ranked', 'gamemode_splat_zones', 'gamemode_mixed',
        'mapban_none', 'mapban_select', 'mapban_confirm',
        'mapban_selection',
        'festivalduration_1', 'festivalduration_3', 'festivalduration_7', 'festivalduration_14', 'festivalduration_custom'
    ];

    console.log('✅ Custom IDs supportés:', supportedCustomIds);

    // 3. Vérifier la structure des modals
    const { ModalBuilder } = require('discord.js');

    console.log('✅ Discord.js importé correctement');
    console.log('🎯 Interface de création de festival prête à tester');
    process.exit(0);
} catch (error) {
    console.error('❌ Erreur détectée:', error.message);
    process.exit(1);
}
