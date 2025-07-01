// src/commands/analyze-wait-time-effectiveness.js
const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { getAllTeams } = require('../utils/teamManager');
const { calculateOpponentScore, getTeamMatchHistory } = require('../utils/matchSearch');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('analyze-wait-time-effectiveness')
        .setDescription('Analyser l\'efficacité des seuils de temps d\'attente actuels (Admin)')
        .addIntegerOption(option =>
            option.setName('samples')
                .setDescription('Nombre d\'échantillons à analyser')
                .setRequired(false)
                .setMinValue(100)
                .setMaxValue(5000))
        .setDefaultMemberPermissions(PermissionFlagsBits.ADMINISTRATOR),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });
        
        // Handle default value manually since setDefaultValue doesn't exist for integers
        const sampleCount = interaction.options.getInteger('samples') || 1000;
        const allTeams = getAllTeams().filter(t => 
            t.isVirtual || // Inclure toutes les équipes virtuelles
            (!t.isVirtual && (t.matchesPlayed || 0) > 0) // Inclure les équipes réelles avec des matchs
            );
        
        console.log(`🔍 Debug - Équipes trouvées : ${allTeams.length}`);
        console.log(`🔍 Debug - Équipes virtuelles : ${allTeams.filter(t => t.isVirtual).length}`);
        console.log(`🔍 Debug - Équipes réelles : ${allTeams.filter(t => !t.isVirtual).length}`);
        
        if (allTeams.length < 4) {
            return await interaction.editReply(
                `❌ Pas assez d'équipes pour l'analyse (trouvées: ${allTeams.length}, minimum: 4).\n` +
                `Utilisez \`/test-mode create-teams count:12\` pour créer des équipes de test.`
            );
        }
        
        console.log(`🔬 Analyse de l'efficacité des temps d'attente sur ${sampleCount} échantillons...`);
        
        // Simuler différents scenarios de temps d'attente
        const scenarios = [
            { name: 'Instantané', waitTime: 0 },
            { name: '30 secondes', waitTime: 30 * 1000 },
            { name: '1 minute', waitTime: 60 * 1000 },
            { name: '1.5 minutes', waitTime: 90 * 1000 },
            { name: '2 minutes', waitTime: 2 * 60 * 1000 },
            { name: '3 minutes', waitTime: 3 * 60 * 1000 },
            { name: '5 minutes', waitTime: 5 * 60 * 1000 }
        ];
        
        const results = {};
        
        for (const scenario of scenarios) {
            results[scenario.name] = await analyzeWaitTimeScenario(
                allTeams, 
                scenario.waitTime, 
                sampleCount
            );
        }
        
        // Générer le rapport d'analyse
        await generateWaitTimeReport(results, interaction);
    }
};

// Analyser un scenario de temps d'attente spécifique
async function analyzeWaitTimeScenario(teams, waitTime, sampleCount) {
    const results = {
        scenario: waitTime,
        totalSamples: 0,
        matchAttempts: 0,
        successfulMatches: 0,
        rejectedMatches: 0,
        scoreDistribution: {
            excellent: 0,    // ≥130
            good: 0,        // 80-129
            ok: 0,          // 50-79
            poor: 0         // <50
        },
        rematchPatterns: {
            neverFaced: 0,
            over5matches: 0,
            between3and5: 0,
            exactly2matches: 0,
            lastMatch: 0
        },
        averageScore: 0,
        diversityScore: 0
    };
    
    let totalScore = 0;
    
    for (let i = 0; i < sampleCount; i++) {
        // Sélectionner deux équipes au hasard
        const team1 = teams[Math.floor(Math.random() * teams.length)];
        let team2 = teams[Math.floor(Math.random() * teams.length)];
        
        // S'assurer que ce ne soit pas la même équipe
        while (team2.name === team1.name) {
            team2 = teams[Math.floor(Math.random() * teams.length)];
        }
        
        results.totalSamples++;
        
        // Calculer les scores avec le temps d'attente simulé
        const score1to2 = calculateOpponentScore(team1.name, { ...team2, waitTime });
        const score2to1 = calculateOpponentScore(team2.name, { ...team1, waitTime });
        const avgScore = (score1to2 + score2to1) / 2;
        
        totalScore += avgScore;
        
        // Catégoriser le score
        if (avgScore >= 130) results.scoreDistribution.excellent++;
        else if (avgScore >= 80) results.scoreDistribution.good++;
        else if (avgScore >= 50) results.scoreDistribution.ok++;
        else results.scoreDistribution.poor++;
        
        // Analyser le pattern de rematch
        const pattern = analyzeRematchPattern(team1.name, team2.name);
        results.rematchPatterns[pattern]++;
        
        // Déterminer si ce serait un match selon les règles actuelles
        const wouldMatch = wouldTeamsMatchWithWaitTime(avgScore, waitTime);
        results.matchAttempts++;
        
        if (wouldMatch) {
            results.successfulMatches++;
        } else {
            results.rejectedMatches++;
        }
    }
    
    results.averageScore = totalScore / results.totalSamples;
    results.successRate = (results.successfulMatches / results.matchAttempts * 100);
    results.diversityScore = calculateDiversityScore(results.rematchPatterns);
    
    return results;
}

// Analyser le pattern de rematch
function analyzeRematchPattern(team1Name, team2Name) {
    const history1 = getTeamMatchHistory(team1Name);
    const lastFaceOff = history1.recentHistory.find(h => h.opponent === team2Name);
    
    if (!lastFaceOff) {
        return 'neverFaced';
    } else if (lastFaceOff.matchesAgo > 5) {
        return 'over5matches';
    } else if (lastFaceOff.matchesAgo >= 3) {
        return 'between3and5';
    } else if (lastFaceOff.matchesAgo === 2) {
        return 'exactly2matches';
    } else {
        return 'lastMatch';
    }
}

// Déterminer si les équipes seraient matchées avec un temps d'attente donné
function wouldTeamsMatchWithWaitTime(avgScore, waitTime) {
    const waitTimeMinutes = waitTime / (60 * 1000);
    
    // Reproduction de la logique de selectOpponentWithWeighting
    if (waitTimeMinutes < 1) {
        return avgScore >= 130; // Seulement excellent
    } else if (waitTimeMinutes < 2) {
        return avgScore >= 80;  // Excellent + bon
    } else {
        return avgScore >= 1;   // Tous (dernier recours après 2min)
    }
}

// Calculer le score de diversité
function calculateDiversityScore(patterns) {
    const total = Object.values(patterns).reduce((a, b) => a + b, 1);
    const ideal = total / Object.keys(patterns).length;
    
    const variance = Object.values(patterns).reduce((sum, count) => {
        return sum + Math.pow(count - ideal, 2);
    }, 0) / Object.keys(patterns).length;
    
    return Math.max(0, (100 - Math.sqrt(variance) * 10));
}

// Générer le rapport d'analyse des temps d'attente
async function generateWaitTimeReport(results, interaction) {
    // Embed principal avec vue d'ensemble
    const overviewEmbed = new EmbedBuilder()
        .setColor('#FF9900')
        .setTitle('🔬 Analyse de l\'efficacité des temps d\'attente')
        .setDescription('Impact des seuils de temps d\'attente sur la qualité du matchmaking')
        .addFields(
            {
                name: '📊 Métriques analysées',
                value: '• **Taux de match** : Pourcentage de tentatives qui aboutissent\n' +
                       '• **Score moyen** : Qualité moyenne des matchs\n' +
                       '• **Diversité** : Équilibre des patterns de rematch\n' +
                       '• **Distribution** : Répartition par qualité',
                inline: false
            }
        );
    
    // Analyser les tendances
    const scenarios = Object.keys(results);
    const successRates = scenarios.map(s => results[s].successRate);
    const averageScores = scenarios.map(s => results[s].averageScore);
    const diversityScores = scenarios.map(s => results[s].diversityScore);
    
    // Trouver les optimums
    const bestSuccessRate = Math.max(...successRates);
    const bestAverageScore = Math.max(...averageScores);
    const bestDiversity = Math.max(...diversityScores);
    
    const bestSuccessScenario = scenarios[successRates.indexOf(bestSuccessRate)];
    const bestScoreScenario = scenarios[averageScores.indexOf(bestAverageScore)];
    const bestDiversityScenario = scenarios[diversityScores.indexOf(bestDiversity)];
    
    overviewEmbed.addFields(
        {
            name: '🏆 Meilleurs scenarios',
            value: `**Taux de match** : ${bestSuccessScenario} (${bestSuccessRate.toFixed(1)}%)\n` +
                   `**Score moyen** : ${bestScoreScenario} (${bestAverageScore.toFixed(1)} pts)\n` +
                   `**Diversité** : ${bestDiversityScenario} (${bestDiversity.toFixed(1)}/100)`,
            inline: false
        }
    );
    
    await interaction.editReply({ embeds: [overviewEmbed] });
    
    // Détail par scenario
    for (const [scenarioName, data] of Object.entries(results)) {
        const detailEmbed = new EmbedBuilder()
            .setColor(getScenarioColor(data.successRate))
            .setTitle(`⏱️ Scenario: ${scenarioName}`)
            .addFields(
                {
                    name: '📈 Performance',
                    value: `**Taux de match** : ${data.successRate.toFixed(1)}% (${data.successfulMatches}/${data.matchAttempts})\n` +
                           `**Score moyen** : ${data.averageScore.toFixed(1)} points\n` +
                           `**Diversité** : ${data.diversityScore.toFixed(1)}/100`,
                    inline: true
                },
                {
                    name: '🎯 Distribution qualité',
                    value: `🏆 Excellent: ${data.scoreDistribution.excellent}\n` +
                           `⭐ Bon: ${data.scoreDistribution.good}\n` +
                           `⚠️ OK: ${data.scoreDistribution.ok}\n` +
                           `🚨 Faible: ${data.scoreDistribution.poor}`,
                    inline: true
                },
                {
                    name: '🔄 Patterns rematch',
                    value: `Jamais: ${data.rematchPatterns.neverFaced}\n` +
                           `>5 matchs: ${data.rematchPatterns.over5matches}\n` +
                           `3-5 matchs: ${data.rematchPatterns.between3and5}\n` +
                           `2 matchs: ${data.rematchPatterns.exactly2matches}\n` +
                           `Dernier: ${data.rematchPatterns.lastMatch}`,
                    inline: false
                }
            );
        
        await interaction.followUp({ embeds: [detailEmbed], ephemeral: true });
    }
    
    // Recommandations
    const recommendationEmbed = new EmbedBuilder()
        .setColor('#00FF00')
        .setTitle('💡 Recommandations')
        .setDescription('Suggestions d\'optimisation basées sur l\'analyse');
    
    const recommendations = generateRecommendations(results);
    recommendationEmbed.addFields(...recommendations);
    
    await interaction.followUp({ embeds: [recommendationEmbed], ephemeral: true });
}

// Obtenir la couleur selon la performance
function getScenarioColor(successRate) {
    if (successRate >= 80) return '#00FF00'; // Vert
    if (successRate >= 60) return '#FFA500'; // Orange
    if (successRate >= 40) return '#FF4500'; // Rouge orangé
    return '#FF0000'; // Rouge
}

// Générer des recommandations
function generateRecommendations(results) {
    const recommendations = [];
    
    // Analyser les tendances
    const scenarios = Object.keys(results);
    const data = scenarios.map(s => ({
        name: s,
        ...results[s]
    }));
    
    // Recommandation 1: Taux de match optimal
    const sortedBySuccess = data.sort((a, b) => b.successRate - a.successRate);
    recommendations.push({
        name: '🎯 Optimisation du taux de match',
        value: `**Meilleur**: ${sortedBySuccess[0].name} (${sortedBySuccess[0].successRate.toFixed(1)}%)\n` +
               `Pour maximiser le nombre de matchs créés, privilégier des temps d'attente de ${sortedBySuccess[0].name.toLowerCase()}.`,
        inline: false
    });
    
    // Recommandation 2: Qualité des matchs
    const sortedByScore = data.sort((a, b) => b.averageScore - a.averageScore);
    recommendations.push({
        name: '⭐ Optimisation de la qualité',
        value: `**Meilleur**: ${sortedByScore[0].name} (${sortedByScore[0].averageScore.toFixed(1)} pts)\n` +
               `Pour maximiser la qualité des confrontations, utiliser ${sortedByScore[0].name.toLowerCase()}.`,
        inline: false
    });
    
    // Recommandation 3: Équilibre
    const balanced = data.find(d => 
        d.successRate > 50 && 
        d.averageScore > 90 && 
        d.diversityScore > 60
    );
    
    if (balanced) {
        recommendations.push({
            name: '⚖️ Recommandation équilibrée',
            value: `**${balanced.name}** offre un bon compromis :\n` +
                   `• Taux de match: ${balanced.successRate.toFixed(1)}%\n` +
                   `• Score moyen: ${balanced.averageScore.toFixed(1)} pts\n` +
                   `• Diversité: ${balanced.diversityScore.toFixed(1)}/100`,
            inline: false
        });
    }
    
    return recommendations;
}