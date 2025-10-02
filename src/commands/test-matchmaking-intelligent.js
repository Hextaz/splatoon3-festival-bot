const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('test-matchmaking-intelligent')
        .setDescription('[TEST] Tester le système de matchmaking avec période d\'observation')
        .addSubcommand(subcommand =>
            subcommand
                .setName('status')
                .setDescription('Voir l\'état actuel du matchmaking intelligent'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('simulate')
                .setDescription('Simuler un processus de matchmaking'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('config')
                .setDescription('Voir la configuration du matchmaking'))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

    category: 'test',
    cooldown: 5,

    async execute(interaction) {
        try {
            const guildId = interaction.guildId;
            const subcommand = interaction.options.getSubcommand();
            
            console.log(`🧪 [TEST-MATCHMAKING] Commande: ${subcommand} pour guild: ${guildId}`);

            await interaction.deferReply({ ephemeral: true });

            if (subcommand === 'status') {
                // 📊 STATUT DU MATCHMAKING
                const matchSearch = require('../utils/matchSearch');
                const waitingTeams = matchSearch.getWaitingTeams ? matchSearch.getWaitingTeams(guildId) : [];
                
                const embed = new EmbedBuilder()
                    .setTitle('📊 État du Matchmaking Intelligent')
                    .setColor('#3498db')
                    .setTimestamp();

                let description = `**Configuration actuelle:**\n`;
                description += `• Temps d'attente minimum: 15 secondes\n`;
                description += `• Seuil "excellent match": 130 points\n`;
                description += `• Période d'observation intelligente: ✅ Active\n\n`;

                description += `**Équipes en attente: ${waitingTeams.length}**\n`;
                if (waitingTeams.length > 0) {
                    waitingTeams.forEach((team, index) => {
                        const waitTime = Date.now() - (team.searchStartTime || Date.now());
                        description += `• ${team.name}: ${Math.floor(waitTime / 1000)}s d'attente\n`;
                    });
                } else {
                    description += `Aucune équipe en recherche de match\n`;
                }

                embed.setDescription(description);
                await interaction.editReply({ embeds: [embed] });

            } else if (subcommand === 'simulate') {
                // 🎯 SIMULATION D'UN MATCHMAKING
                const embed = new EmbedBuilder()
                    .setTitle('🎯 Simulation de Matchmaking')
                    .setColor('#f39c12')
                    .setTimestamp();

                let description = `**Simulation d'un processus intelligent:**\n\n`;
                
                // Simuler différents scores
                const scenarios = [
                    { score: 150, description: "Match excellent (>130)" },
                    { score: 100, description: "Match bon (80-130)" },
                    { score: 60, description: "Match moyen (40-80)" },
                    { score: 20, description: "Match faible (<40)" }
                ];

                for (const scenario of scenarios) {
                    const matchSearch = require('../utils/matchSearch');
                    
                    // Simuler la décision
                    const decision = mockDecideMatchTiming(scenario.score, 10000); // 10s d'attente
                    
                    description += `**${scenario.description}** (Score: ${scenario.score})\n`;
                    description += `→ Décision: ${decision.action}\n`;
                    if (decision.action === 'wait') {
                        description += `→ Attente: ${Math.floor(decision.waitTime / 1000)}s\n`;
                    }
                    description += `\n`;
                }

                embed.setDescription(description);
                await interaction.editReply({ embeds: [embed] });

            } else if (subcommand === 'config') {
                // ⚙️ CONFIGURATION
                const embed = new EmbedBuilder()
                    .setTitle('⚙️ Configuration Matchmaking')
                    .setColor('#9b59b6')
                    .setTimestamp();

                let description = `**Paramètres du système intelligent:**\n\n`;
                description += `🕒 **MINIMUM_WAIT_TIME**: 15 000ms (15s)\n`;
                description += `  → Temps minimum avant tout match\n\n`;
                
                description += `⭐ **EXCELLENT_SCORE_THRESHOLD**: 130 points\n`;
                description += `  → Seuil pour match "excellent"\n\n`;
                
                description += `🧠 **Logique d'attente:**\n`;
                description += `  • Score >130: Match immédiat après 15s\n`;
                description += `  • Score 80-130: Attente progressive\n`;
                description += `  • Score 40-80: Attente plus longue\n`;
                description += `  • Score <40: Attente maximale\n\n`;
                
                description += `🎯 **Objectif:** Éviter les matchs miroirs immédiats\n`;
                description += `⚡ **Bénéfice:** Meilleure qualité des matchs`;

                embed.setDescription(description);
                await interaction.editReply({ embeds: [embed] });
            }

        } catch (error) {
            console.error('❌ [TEST-MATCHMAKING] Erreur:', error);
            
            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ Erreur de test')
                .setDescription(`Une erreur s'est produite: ${error.message}`)
                .setColor('#e74c3c')
                .setTimestamp();

            if (interaction.deferred) {
                await interaction.editReply({ embeds: [errorEmbed] });
            } else {
                await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
            }
        }
    }
};

// Fonction helper pour simuler la logique de décision
function mockDecideMatchTiming(matchScore, currentWaitTime) {
    const MINIMUM_WAIT_TIME = 15000; // 15 secondes
    const EXCELLENT_SCORE_THRESHOLD = 130;

    if (currentWaitTime < MINIMUM_WAIT_TIME) {
        return { action: 'wait', waitTime: MINIMUM_WAIT_TIME - currentWaitTime };
    }

    if (matchScore >= EXCELLENT_SCORE_THRESHOLD) {
        return { action: 'match', reason: 'Excellent score' };
    }

    // Score plus faible = attente plus longue
    let baseWaitTime = 5000; // 5 secondes de base
    if (matchScore < 40) {
        baseWaitTime = 20000; // 20 secondes pour très mauvais scores
    } else if (matchScore < 80) {
        baseWaitTime = 15000; // 15 secondes pour scores moyens
    } else {
        baseWaitTime = 8000; // 8 secondes pour bons scores
    }

    if (currentWaitTime >= baseWaitTime) {
        return { action: 'match', reason: 'Temps d\'attente suffisant' };
    }

    return { action: 'wait', waitTime: baseWaitTime - currentWaitTime };
}