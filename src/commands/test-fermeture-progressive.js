const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('test-fermeture-progressive')
        .setDescription('[TEST] Tester le système de fermeture progressive du festival')
        .addSubcommand(subcommand =>
            subcommand
                .setName('start')
                .setDescription('Démarrer une fermeture progressive de test'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('status')
                .setDescription('Voir l\'état de la fermeture en cours'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('count-matches')
                .setDescription('Compter les matchs actuellement en cours'))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

    category: 'test',
    cooldown: 5,

    async execute(interaction) {
        try {
            const guildId = interaction.guildId;
            const subcommand = interaction.options.getSubcommand();
            
            console.log(`🧪 [TEST-FERMETURE] Commande: ${subcommand} pour guild: ${guildId}`);

            await interaction.deferReply({ ephemeral: true });

            if (subcommand === 'start') {
                // 🎯 TEST DE FERMETURE PROGRESSIVE
                const festivalManager = require('../utils/festivalManager');
                const festival = await festivalManager.getCurrentFestivalAsync(guildId);
                
                if (!festival || !festival.isActive) {
                    return await interaction.editReply({
                        content: '❌ Aucun festival actif pour tester la fermeture progressive.'
                    });
                }

                const embed = new EmbedBuilder()
                    .setTitle('🧪 Test Fermeture Progressive')
                    .setColor('#e67e22')
                    .setTimestamp();

                let description = `**Festival testé:** ${festival.title}\n\n`;
                
                // Importer et utiliser ProgressiveCloser
                const ProgressiveCloser = require('../utils/progressiveCloser');
                const closer = new ProgressiveCloser(guildId);
                
                description += `🔄 **Démarrage de la fermeture progressive...**\n`;
                description += `• Blocage des nouveaux matchs\n`;
                description += `• Surveillance des matchs en cours\n`;
                description += `• Attente intelligente avant nettoyage\n\n`;
                description += `⚠️ **ATTENTION:** Ceci est un test réel !`;

                embed.setDescription(description);
                await interaction.editReply({ embeds: [embed] });

                // Démarrer réellement la fermeture progressive
                try {
                    await closer.startProgressiveClosing(festival, interaction.client);
                    console.log('✅ Test fermeture progressive démarré');
                } catch (error) {
                    console.error('❌ Erreur test fermeture:', error);
                    await interaction.followUp({
                        content: `❌ Erreur lors du test: ${error.message}`,
                        ephemeral: true
                    });
                }

            } else if (subcommand === 'status') {
                // 📊 STATUT DE LA FERMETURE
                const festivalManager = require('../utils/festivalManager');
                const festival = await festivalManager.getCurrentFestivalAsync(guildId);
                
                const embed = new EmbedBuilder()
                    .setTitle('📊 État de la Fermeture')
                    .setColor('#3498db')
                    .setTimestamp();

                let description = '';
                
                if (!festival) {
                    description = '❌ **Aucun festival trouvé**';
                } else {
                    description += `**Festival:** ${festival.title}\n`;
                    description += `**État:** ${festival.isActive ? '🟢 Actif' : '🔴 Inactif'}\n`;
                    description += `**Fermeture:** ${festival.isClosing ? '🟠 En cours' : '🟢 Normale'}\n\n`;
                    
                    if (festival.isClosing) {
                        description += `⚠️ **Le festival est en cours de fermeture**\n`;
                        description += `• Nouveaux matchs bloqués\n`;
                        description += `• Matchs en cours autorisés\n`;
                        description += `• Nettoyage en attente\n`;
                    } else if (festival.isActive) {
                        description += `✅ **Fonctionnement normal**\n`;
                        description += `• Nouveaux matchs autorisés\n`;
                        description += `• Système opérationnel\n`;
                    } else {
                        description += `🔴 **Festival terminé ou inactif**`;
                    }
                }

                embed.setDescription(description);
                await interaction.editReply({ embeds: [embed] });

            } else if (subcommand === 'count-matches') {
                // 🎮 COMPTAGE DES MATCHS
                const ProgressiveCloser = require('../utils/progressiveCloser');
                const closer = new ProgressiveCloser(guildId);
                
                const matchInfo = await closer.countActiveMatches();
                
                const embed = new EmbedBuilder()
                    .setTitle('🎮 Matchs en Cours')
                    .setColor('#9b59b6')
                    .setTimestamp();

                let description = `**Résultats du comptage:**\n\n`;
                description += `🎯 **Matchs actifs:** ${matchInfo.activeMatches}\n`;
                description += `👥 **Équipes occupées:** ${matchInfo.teamsInMatch}\n\n`;
                
                if (matchInfo.teamNames.length > 0) {
                    description += `**Équipes en match:**\n`;
                    matchInfo.teamNames.forEach(name => {
                        description += `• ${name}\n`;
                    });
                } else {
                    description += `✅ **Aucun match en cours**\n`;
                    description += `Le nettoyage peut procéder immédiatement.`;
                }

                embed.setDescription(description);
                await interaction.editReply({ embeds: [embed] });
            }

        } catch (error) {
            console.error('❌ [TEST-FERMETURE] Erreur:', error);
            
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