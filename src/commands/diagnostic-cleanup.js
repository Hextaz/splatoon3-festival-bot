const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('diagnostic-cleanup')
        .setDescription('[ADMIN] Diagnostiquer et nettoyer les duplications')
        .addSubcommand(subcommand =>
            subcommand
                .setName('check')
                .setDescription('Vérifier l\'état des données sans les modifier'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('cleanup-duplicates')
                .setDescription('Nettoyer uniquement les duplications (sans supprimer les données valides)'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('full-cleanup')
                .setDescription('⚠️ Nettoyage complet de toutes les données de festival'))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

    category: 'admin',
    cooldown: 5,

    async execute(interaction) {
        try {
            const guildId = interaction.guildId;
            const subcommand = interaction.options.getSubcommand();
            
            console.log(`🔧 [DIAGNOSTIC] Commande: ${subcommand} pour guild: ${guildId}`);

            // Importer le nettoyeur robuste
            const RobustCleaner = require('../utils/robustCleaner');
            const cleaner = new RobustCleaner(guildId);

            await interaction.deferReply({ ephemeral: true });

            if (subcommand === 'check') {
                // 🔍 DIAGNOSTIC UNIQUEMENT
                console.log(`🔍 Diagnostic en cours...`);
                const diagnostic = await cleaner.diagnose();
                
                const embed = new EmbedBuilder()
                    .setTitle('🔍 Diagnostic des données')
                    .setColor('#3498db')
                    .setTimestamp();

                let description = `**État des collections:**\n`;
                description += `• Teams: ${diagnostic.teams.total} (${diagnostic.teams.duplicates} duplications)\n`;
                description += `• Matches: ${diagnostic.matches.total} (${diagnostic.matches.duplicates} duplications)\n`;
                description += `• Votes: ${diagnostic.votes.total}\n`;
                description += `• Festival: ${diagnostic.festival ? 'Actif' : 'Inactif'}\n\n`;

                if (diagnostic.teams.duplicates > 0 || diagnostic.matches.duplicates > 0) {
                    description += `⚠️ **Duplications détectées !**\n`;
                    description += `Utilisez \`/diagnostic-cleanup cleanup-duplicates\` pour les nettoyer.`;
                    embed.setColor('#e74c3c');
                } else {
                    description += `✅ **Aucune duplication détectée**`;
                    embed.setColor('#27ae60');
                }

                embed.setDescription(description);
                
                await interaction.editReply({ embeds: [embed] });
                console.log(`✅ Diagnostic terminé`);

            } else if (subcommand === 'cleanup-duplicates') {
                // 🧹 NETTOYAGE INTELLIGENT DES DUPLICATIONS
                console.log(`🧹 Nettoyage des duplications...`);
                const results = await cleaner.cleanupDuplicatesOnly();
                
                const embed = new EmbedBuilder()
                    .setTitle('🧹 Nettoyage des duplications')
                    .setColor('#f39c12')
                    .setTimestamp();

                let description = `**Résultats du nettoyage:**\n`;
                description += `• Teams supprimées: ${results.teams.deleted}\n`;
                description += `• Matches supprimés: ${results.matches.deleted}\n`;
                description += `• Votes nettoyés: ${results.votes.deleted}\n\n`;

                if (results.teams.deleted > 0 || results.matches.deleted > 0) {
                    description += `✅ **Duplications supprimées avec succès !**`;
                    embed.setColor('#27ae60');
                } else {
                    description += `ℹ️ **Aucune duplication trouvée à nettoyer**`;
                    embed.setColor('#3498db');
                }

                embed.setDescription(description);
                
                await interaction.editReply({ embeds: [embed] });
                console.log(`✅ Nettoyage des duplications terminé:`, results);

            } else if (subcommand === 'full-cleanup') {
                // ⚠️ NETTOYAGE COMPLET
                console.log(`⚠️ Nettoyage complet demandé...`);
                const results = await cleaner.cleanupGuild();
                
                const embed = new EmbedBuilder()
                    .setTitle('⚠️ Nettoyage complet effectué')
                    .setColor('#e74c3c')
                    .setTimestamp();

                let description = `**Données supprimées:**\n`;
                description += `• Teams: ${results.teams.deleted}\n`;
                description += `• Matches: ${results.matches.deleted}\n`;
                description += `• Votes: ${results.votes.deleted}\n`;
                description += `• Festival: ${results.festival.deleted ? 'Supprimé' : 'Non trouvé'}\n\n`;
                description += `🔄 **Toutes les données de festival ont été effacées**`;

                embed.setDescription(description);
                
                await interaction.editReply({ embeds: [embed] });
                console.log(`⚠️ Nettoyage complet terminé:`, results);
            }

        } catch (error) {
            console.error('❌ [DIAGNOSTIC] Erreur:', error);
            
            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ Erreur de diagnostic')
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