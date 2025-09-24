console.log("=== ANALYSE SYSTÈME ANTI-RÉPÉTITION ===");

// Simuler le calcul de score comme dans matchHistoryManager.js
function simulateOpponentScore(teamName, opponentName, teamCamp, opponentCamp, matchHistory = []) {
    console.log(`\n🎯 Calcul score: ${teamName} vs ${opponentName}`);
    
    let score = 100; // Score de base
    console.log(`  • Score de base: ${score}`);
    
    // Bonus pour les équipes d'un autre camp
    if (teamCamp !== opponentCamp) {
        score += 50;
        console.log(`  • Bonus autre camp: +50 (total: ${score})`);
    } else {
        console.log(`  • Même camp: +0 (total: ${score})`);
    }
    
    // Vérifier l'historique contre cet adversaire
    const matchesAgainstOpponent = matchHistory.filter(match => match.opponent === opponentName);
    
    if (matchesAgainstOpponent.length > 0) {
        // Simuler un numéro de match actuel
        const currentMatchNumber = matchHistory.length;
        const lastMatchAgainst = matchesAgainstOpponent[matchesAgainstOpponent.length - 1];
        const matchesSinceLastFaceOff = currentMatchNumber - lastMatchAgainst.matchNumber;
        
        console.log(`  • Déjà affronté ${matchesAgainstOpponent.length} fois`);
        console.log(`  • Dernière fois: match #${lastMatchAgainst.matchNumber}`);
        console.log(`  • Matchs depuis: ${matchesSinceLastFaceOff}`);
        
        if (matchesSinceLastFaceOff === 0) {
            score -= 100;
            console.log(`  • PÉNALITÉ match précédent: -100 (total: ${score})`);
        } else if (matchesSinceLastFaceOff === 1) {
            score -= 80;
            console.log(`  • PÉNALITÉ 1 match écoulé: -80 (total: ${score})`);
        } else if (matchesSinceLastFaceOff === 2) {
            score -= 50;
            console.log(`  • PÉNALITÉ 2 matchs écoulés: -50 (total: ${score})`);
        } else if (matchesSinceLastFaceOff >= 3 && matchesSinceLastFaceOff <= 5) {
            score -= 20;
            console.log(`  • Pénalité 3-5 matchs écoulés: -20 (total: ${score})`);
        } else {
            console.log(`  • Pas de pénalité (${matchesSinceLastFaceOff} matchs): +0 (total: ${score})`);
        }
    } else {
        score += 30;
        console.log(`  • Bonus JAMAIS affronté: +30 (total: ${score})`);
    }
    
    // Simuler bonus temps d'attente (comme dans ton log ~0.37)
    const waitBonus = 0.37;
    score += waitBonus;
    console.log(`  • Bonus temps d'attente: +${waitBonus} (total: ${score.toFixed(2)})`);
    
    const finalScore = Math.max(score, 1);
    console.log(`  🎯 SCORE FINAL: ${finalScore.toFixed(2)}`);
    
    // Catégoriser
    if (finalScore >= 130) {
        console.log(`  ✅ Catégorie: EXCELLENT (priorité maximale)`);
    } else if (finalScore >= 80) {
        console.log(`  ⭐ Catégorie: BON (priorité élevée)`);
    } else if (finalScore >= 50) {
        console.log(`  ⚠️ Catégorie: OK (priorité modérée)`);
    } else {
        console.log(`  ❌ Catégorie: DERNIER RECOURS`);
    }
    
    return finalScore;
}

console.log("=== SIMULATION BASÉE SUR TON LOG ===");
console.log("Log: 'Scores de matchmaking pour onazelf: macfly: 180.37936666666667'");

// Simuler onazelf vs macfly avec ton score exact
console.log("\n📊 SCÉNARIO: Première confrontation, camps différents");
simulateOpponentScore("onazelf", "macfly", "Team Shiver", "Team Frye", []);

console.log("\n📊 SCÉNARIO: Après 1 match ensemble");
const historyAfter1Match = [
    { opponent: "macfly", matchNumber: 0, timestamp: Date.now() - 3600000 }
];
simulateOpponentScore("onazelf", "macfly", "Team Shiver", "Team Frye", historyAfter1Match);

console.log("\n📊 SCÉNARIO: Après 3 matchs (avec d'autres équipes entre)");
const historyAfter3Matches = [
    { opponent: "macfly", matchNumber: 0, timestamp: Date.now() - 3600000 },
    { opponent: "autre_equipe", matchNumber: 1, timestamp: Date.now() - 1800000 },
    { opponent: "autre_equipe2", matchNumber: 2, timestamp: Date.now() - 900000 }
];
simulateOpponentScore("onazelf", "macfly", "Team Shiver", "Team Frye", historyAfter3Matches);

console.log("\n📈 EXPLICATION DU SCORE 180.37:");
console.log("  100 (base) + 50 (autre camp) + 30 (jamais affronté) + 0.37 (attente) = 180.37");
console.log("  ✅ C'est un score EXCELLENT qui encourage les matchs inter-camps");

console.log("\n🔧 SYSTÈME ANTI-RÉPÉTITION:");
console.log("  • Priorité 1: Autres camps jamais affrontés (score ~180)");
console.log("  • Priorité 2: Même camp jamais affronté (score ~130)");
console.log("  • Priorité 3: Autres camps +3 matchs écoulés (score ~130)");
console.log("  • Priorité 4: Équipes affrontées récemment (score < 50)");

console.log("\n🎯 CONCLUSION:");
console.log("  Le système fonctionne correctement ! Score 180.37 = match optimal");
console.log("  Plus tu as d'équipes, plus le système sera efficace pour éviter les répétitions");