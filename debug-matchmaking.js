console.log("=== DIAGNOSTIC SYSTÈME DE MATCHMAKING ===");

const { getAllTeams } = require('./src/utils/database');
const { matchHistoryManager } = require('./src/utils/matchHistoryManager');

async function analyzeMatchmakingScores() {
    try {
        const guildId = "832335212419219506"; // Ton guild ID des logs
        
        console.log("\n1. 📊 Analyse des équipes disponibles...");
        
        // Charger les équipes 
        const { guildDataManager } = require('./src/utils/database');
        const guildDb = guildDataManager.getDatabase(guildId);
        const teams = await guildDb.load('teams.json', {});
        
        const teamNames = Object.keys(teams);
        console.log(`Équipes trouvées: ${teamNames.join(', ')}`);
        
        if (teamNames.length < 2) {
            console.log("❌ Pas assez d'équipes pour analyser le matchmaking");
            return;
        }
        
        console.log("\n2. 🎯 Détail du calcul de score...");
        
        // Pour chaque équipe, calculer son score contre les autres
        for (const teamName of teamNames) {
            const team = teams[teamName];
            console.log(`\n--- Analyse pour équipe ${teamName} (Camp: ${team.camp}) ---`);
            
            for (const opponentName of teamNames) {
                if (teamName === opponentName) continue;
                
                const opponent = teams[opponentName];
                console.log(`\n  📋 Score contre ${opponentName} (Camp: ${opponent.camp}):`);
                
                // Simuler le calcul de score étape par étape
                let score = 100;
                console.log(`    • Score de base: ${score}`);
                
                // Bonus autre camp
                if (team.camp !== opponent.camp) {
                    score += 50;
                    console.log(`    • Bonus autre camp: +50 (total: ${score})`);
                } else {
                    console.log(`    • Même camp: +0 (total: ${score})`);
                }
                
                // Vérifier l'historique des matchs
                try {
                    const history = matchHistoryManager.getHistoryForGuild ? 
                        matchHistoryManager.getHistoryForGuild(guildId) : new Map();
                    const counters = matchHistoryManager.getCountersForGuild ? 
                        matchHistoryManager.getCountersForGuild(guildId) : new Map();
                    
                    const teamHistory = history.get(teamName) || [];
                    const currentMatchNumber = counters.get(teamName) || 0;
                    
                    console.log(`    • Historique: ${teamHistory.length} matchs joués`);
                    console.log(`    • Match actuel: #${currentMatchNumber}`);
                    
                    const matchesAgainstOpponent = teamHistory.filter(match => match.opponent === opponentName);
                    
                    if (matchesAgainstOpponent.length > 0) {
                        const lastMatch = matchesAgainstOpponent[matchesAgainstOpponent.length - 1];
                        const matchesSince = currentMatchNumber - lastMatch.matchNumber;
                        
                        console.log(`    • Dernière confrontation: match #${lastMatch.matchNumber} (il y a ${matchesSince} matchs)`);
                        
                        if (matchesSince === 0) {
                            score -= 100;
                            console.log(`    • Pénalité match précédent: -100 (total: ${score})`);
                        } else if (matchesSince === 1) {
                            score -= 80;  
                            console.log(`    • Pénalité 1 match: -80 (total: ${score})`);
                        } else if (matchesSince === 2) {
                            score -= 50;
                            console.log(`    • Pénalité 2 matchs: -50 (total: ${score})`);
                        } else if (matchesSince >= 3 && matchesSince <= 5) {
                            score -= 20;
                            console.log(`    • Pénalité 3-5 matchs: -20 (total: ${score})`);
                        } else {
                            console.log(`    • Pas de pénalité (${matchesSince} matchs): +0 (total: ${score})`);
                        }
                    } else {
                        score += 30;
                        console.log(`    • Bonus jamais affronté: +30 (total: ${score})`);
                    }
                    
                } catch (error) {
                    console.log(`    ⚠️ Erreur historique: ${error.message}`);
                    score += 30; // Fallback comme jamais affronté
                    console.log(`    • Bonus fallback: +30 (total: ${score})`);
                }
                
                // Bonus temps d'attente (simulé)
                const waitTime = Math.random() * 60000; // 0-1 minute aléatoire
                const waitMinutes = waitTime / (60 * 1000);
                const waitBonus = Math.min(waitMinutes * 2, 20);
                score += waitBonus;
                console.log(`    • Bonus attente (${waitMinutes.toFixed(1)}min): +${waitBonus.toFixed(2)} (total: ${score.toFixed(2)})`);
                
                console.log(`    🎯 SCORE FINAL: ${Math.max(score, 1).toFixed(2)}`);
            }
        }
        
        console.log("\n3. 📈 Catégories de matchmaking:");
        console.log("  • Score ≥ 130: EXCELLENT (priorité max)");
        console.log("  • Score 80-129: BON (priorité élevée)"); 
        console.log("  • Score 50-79: OK (priorité modérée)");
        console.log("  • Score < 50: DERNIER RECOURS");
        
        console.log("\n4. 🔍 Analyse du log:");
        console.log("  • Score 180.37 = EXCELLENT autres camps");
        console.log("  • Cela indique: camps différents + jamais/rarement affrontés + temps attente");
        
    } catch (error) {
        console.error("❌ Erreur lors de l'analyse:", error);
    }
}

analyzeMatchmakingScores();