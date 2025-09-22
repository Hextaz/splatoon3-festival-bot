const mongoose = require('mongoose');

// Script pour corriger l'index MapProbability erroné
async function fixMapProbabilityIndex() {
    try {
        // Connexion à MongoDB
        const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/splatoon3-festival';
        await mongoose.connect(mongoUri);
        console.log('✅ Connexion MongoDB établie');

        const db = mongoose.connection.db;
        const collection = db.collection('mapprobabilities');

        // 1. Lister les index actuels
        console.log('📋 Index actuels sur mapprobabilities:');
        const indexes = await collection.indexes();
        indexes.forEach(index => {
            console.log(`  - ${index.name}: ${JSON.stringify(index.key)}`);
        });

        // 2. Supprimer l'ancien index problématique s'il existe
        const problematicIndexName = 'guildId_1_festivalId_1_teamId_1_mapMode_1';
        try {
            await collection.dropIndex(problematicIndexName);
            console.log(`✅ Ancien index "${problematicIndexName}" supprimé`);
        } catch (error) {
            if (error.code === 27) {
                console.log(`ℹ️ Index "${problematicIndexName}" n'existe pas (normal)`);
            } else {
                console.error(`❌ Erreur lors de la suppression de l'index:`, error.message);
            }
        }

        // 3. Supprimer tous les documents avec teamName ou mapKey null/undefined
        console.log('🧹 Nettoyage des documents invalides...');
        const deleteResult = await collection.deleteMany({
            $or: [
                { teamName: null },
                { teamName: { $exists: false } },
                { mapKey: null },
                { mapKey: { $exists: false } },
                { teamName: '' },
                { mapKey: '' }
            ]
        });
        console.log(`🗑️ ${deleteResult.deletedCount} document(s) invalide(s) supprimé(s)`);

        // 4. Créer le bon index
        console.log('🔧 Création du nouvel index...');
        await collection.createIndex(
            { guildId: 1, festivalId: 1, teamName: 1, mapKey: 1 },
            { unique: true, name: 'guildId_1_festivalId_1_teamName_1_mapKey_1' }
        );
        console.log('✅ Nouvel index créé avec succès');

        // 5. Vérifier les nouveaux index
        console.log('📋 Index finaux sur mapprobabilities:');
        const finalIndexes = await collection.indexes();
        finalIndexes.forEach(index => {
            console.log(`  - ${index.name}: ${JSON.stringify(index.key)}`);
        });

        console.log('🎉 Migration des index terminée avec succès !');

    } catch (error) {
        console.error('❌ Erreur lors de la migration:', error);
    } finally {
        await mongoose.disconnect();
        console.log('🔌 Connexion MongoDB fermée');
    }
}

// Exécuter le script si appelé directement
if (require.main === module) {
    fixMapProbabilityIndex();
}

module.exports = { fixMapProbabilityIndex };