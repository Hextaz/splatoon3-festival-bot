// Script pour corriger l'erreur MapProbability MongoDB
// Utilise mongoose comme le reste du projet

require('dotenv').config();
const mongoose = require('mongoose');

async function fixMapProbabilityIndex() {
    try {
        // Utiliser la même connexion que l'application
        const mongoUri = process.env.DATABASE_URL;
        console.log('🔗 Connexion à MongoDB via mongoose...');
        
        await mongoose.connect(mongoUri);
        console.log('✅ Connecté à MongoDB');
        
        const db = mongoose.connection.db;
        const collection = db.collection('mapprobabilities');
        
        // 1. Lister les indexes existants
        const indexes = await collection.indexes();
        console.log('📋 Indexes existants:', indexes.map(idx => `${idx.name}: ${JSON.stringify(idx.key)}`));
        
        // 2. Supprimer l'ancien index problématique s'il existe
        try {
            await collection.dropIndex('guildId_1_festivalId_1_teamId_1_mapMode_1');
            console.log('🗑️ Ancien index supprimé');
        } catch (error) {
            console.log('ℹ️ Ancien index non trouvé:', error.message);
        }
        
        // 3. Supprimer tous les documents de probabilités existants pour éviter les conflits
        const deleteResult = await collection.deleteMany({});
        console.log(`�️ ${deleteResult.deletedCount} documents de probabilités supprimés`);
        
        // 4. Créer le nouvel index correct
        await collection.createIndex(
            { guildId: 1, festivalId: 1, teamName: 1, mapKey: 1 }, 
            { unique: true, name: 'guildId_1_festivalId_1_teamName_1_mapKey_1' }
        );
        console.log('✅ Nouvel index créé avec les bons champs');
        
        // 5. Vérifier les nouveaux indexes
        const newIndexes = await collection.indexes();
        console.log('📋 Nouveaux indexes:', newIndexes.map(idx => `${idx.name}: ${JSON.stringify(idx.key)}`));
        
        console.log('✅ Correction de MapProbability terminée !');
        
    } catch (error) {
        console.error('❌ Erreur lors de la correction:', error.message);
    } finally {
        await mongoose.disconnect();
    }
}
    
    try {
        await client.connect();
        console.log('✅ Connecté à MongoDB');
        
        const db = client.db();
        const collection = db.collection('mapprobabilities');
        
        // 1. Lister les indexes existants
        const indexes = await collection.indexes();
        console.log('📋 Indexes existants:', indexes.map(idx => idx.name));
        
        // 2. Supprimer l'ancien index problématique s'il existe
        try {
            await collection.dropIndex('guildId_1_festivalId_1_teamId_1_mapMode_1');
            console.log('🗑️ Ancien index supprimé');
        } catch (error) {
            console.log('ℹ️ Ancien index non trouvé ou déjà supprimé');
        }
        
        // 3. Supprimer tous les documents de probabilités existants pour éviter les conflits
        const deleteResult = await collection.deleteMany({});
        console.log(`🗑️ ${deleteResult.deletedCount} documents de probabilités supprimés`);
        
        // 4. Créer le nouvel index correct
        await collection.createIndex(
            { guildId: 1, festivalId: 1, teamName: 1, mapKey: 1 }, 
            { unique: true, name: 'guildId_1_festivalId_1_teamName_1_mapKey_1' }
        );
        console.log('✅ Nouvel index créé avec les bons champs');
        
        // 5. Vérifier les nouveaux indexes
        const newIndexes = await collection.indexes();
        console.log('📋 Nouveaux indexes:', newIndexes.map(idx => idx.name));
        
        console.log('✅ Correction de MapProbability terminée !');
        
    } catch (error) {
        console.error('❌ Erreur lors de la correction:', error.message);
    } finally {
        await mongoose.disconnect();
    }
}

// Exécuter le script si appelé directement
if (require.main === module) {
    fixMapProbabilityIndex()
        .then(() => process.exit(0))
        .catch(error => {
            console.error(error);
            process.exit(1);
        });
}

module.exports = { fixMapProbabilityIndex };