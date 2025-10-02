# 🚀 Test de déploiement - Matchmaking Intelligent & Nettoyage Robuste

echo "🎯 === DÉPLOIEMENT DES NOUVELLES FONCTIONNALITÉS ==="
echo ""

# 1. Vérification des fichiers
echo "📋 Vérification des nouveaux fichiers..."
if (Test-Path "src/utils/robustCleaner.js") {
    echo "✅ robustCleaner.js trouvé"
} else {
    echo "❌ robustCleaner.js manquant"
    exit 1
}

if (Test-Path "src/commands/diagnostic-cleanup.js") {
    echo "✅ diagnostic-cleanup.js trouvé"
} else {
    echo "❌ diagnostic-cleanup.js manquant"
    exit 1
}

if (Test-Path "src/commands/test-matchmaking-intelligent.js") {
    echo "✅ test-matchmaking-intelligent.js trouvé"
} else {
    echo "❌ test-matchmaking-intelligent.js manquant"
    exit 1
}

echo ""

# 2. Déploiement des commandes
echo "⚡ Déploiement des nouvelles commandes..."
node src/deploy-commands.js

echo ""

# 3. Test de démarrage
echo "🔄 Test de démarrage du bot..."
echo "CTRL+C pour arrêter le test"
echo ""

# Démarrer le bot en mode test
timeout 10 node src/index.js

echo ""
echo "🎉 === DÉPLOIEMENT TERMINÉ ==="
echo ""
echo "📋 NOUVELLES FONCTIONNALITÉS DISPONIBLES:"
echo "🧹 /diagnostic-cleanup - Système de nettoyage robuste"
echo "   • check - Diagnostiquer les duplications"
echo "   • cleanup-duplicates - Nettoyer les duplications"
echo "   • full-cleanup - Nettoyage complet"
echo ""
echo "🧠 /test-matchmaking-intelligent - Tests du matchmaking"
echo "   • status - État du système intelligent"
echo "   • simulate - Simulation de matchmaking"
echo "   • config - Configuration système"
echo ""
echo "⚡ AMÉLIORATIONS AUTOMATIQUES:"
echo "✅ Matchmaking avec période d'observation (15s minimum)"
echo "✅ Évitement des matchs miroirs immédiats"
echo "✅ Nettoyage robuste à la fin des festivals"
echo "✅ Gestion améliorée des erreurs leave-team"
echo ""
echo "🚀 Le bot est prêt sur Railway !"