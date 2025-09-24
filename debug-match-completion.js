console.log("=== DEBUG MATCH COMPLETION SYSTEM ===");

const { dataAdapter } = require('./src/utils/dataAdapter');
const { finishMatch } = require('./src/utils/matchSearch');
const { guildDataManager } = require('./src/utils/database');

async function testMatchCompletion() {
    try {
        console.log("\n1. Test de création d'un match factice...");
        
        // Créer deux équipes de test
        const guildId = "test_guild";
        const guildDb = guildDataManager.getDatabase(guildId);
        
        const team1Data = {
            name: "Team1",
            camp: "Big Man",
            members: ["user1", "user2"],
            busy: true,
            currentOpponent: "Team2",
            currentMatchMultiplier: "x1"
        };
        
        const team2Data = {
            name: "Team2", 
            camp: "Frye",
            members: ["user3", "user4"],
            busy: true,
            currentOpponent: "Team1",
            currentMatchMultiplier: "x1"
        };
        
        // Sauvegarder les équipes
        const teams = await guildDb.load('teams.json', {});
        teams["Team1"] = team1Data;
        teams["Team2"] = team2Data;
        await guildDb.save('teams.json', teams);
        console.log("✅ Équipes de test créées");
        
        // Créer un match en BD
        console.log("\n2. Création du match en base de données...");
        await dataAdapter.createMatch({
            guildId: guildId,
            team1Name: "Team1",
            team2Name: "Team2", 
            team1Camp: "Big Man",
            team2Camp: "Frye",
            status: "in_progress",
            multiplier: "x1",
            createdAt: new Date()
        });
        console.log("✅ Match créé en BD avec statut 'in_progress'");
        
        // Vérifier les matchs actifs
        console.log("\n3. Vérification des matchs actifs...");
        const activeMatches = await dataAdapter.getActiveMatches(guildId);
        console.log(`📊 Matchs actifs trouvés: ${activeMatches.length}`);
        if (activeMatches.length > 0) {
            console.log("Match actuel:", {
                team1: activeMatches[0].team1Name,
                team2: activeMatches[0].team2Name,
                status: activeMatches[0].status
            });
        }
        
        // Terminer le match avec finishMatch
        console.log("\n4. Test de finishMatch()...");
        await finishMatch("Team1", "Team2", guildId);
        console.log("✅ finishMatch() appelé");
        
        // Vérifier le statut après finishMatch
        console.log("\n5. Vérification après finishMatch...");
        const activeMatchesAfter = await dataAdapter.getActiveMatches(guildId);
        console.log(`📊 Matchs actifs restants: ${activeMatchesAfter.length}`);
        
        // Vérifier l'état des équipes
        const updatedTeams = await guildDb.load('teams.json', {});
        const team1 = updatedTeams["Team1"];
        const team2 = updatedTeams["Team2"];
        
        console.log("\n6. État des équipes après finishMatch:");
        console.log("Team1 busy:", team1?.busy, "opponent:", team1?.currentOpponent);
        console.log("Team2 busy:", team2?.busy, "opponent:", team2?.currentOpponent);
        
        // Nettoyer les équipes de test
        delete updatedTeams["Team1"];
        delete updatedTeams["Team2"];
        await guildDb.save('teams.json', updatedTeams);
        console.log("\n✅ Test terminé, équipes de test supprimées");
        
    } catch (error) {
        console.error("❌ Erreur durant le test:", error);
    }
}

testMatchCompletion();