const { SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle } = require('discord.js');
const { safeReply, safeEdit } = require('../utils/responseUtils');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('debug-interactions')
        .setDescription('Teste les interactions et le système anti-doublons')
        .addStringOption(option =>
            option.setName('test-type')
                .setDescription('Type de test à effectuer')
                .setRequired(false)
                .addChoices(
                    { name: 'Boutons simples', value: 'simple' },
                    { name: 'Boutons critiques', value: 'critical' },
                    { name: 'Menu déroulant', value: 'select' },
                    { name: 'État des interactions', value: 'status' }
                )),

    async execute(interaction) {
        try {
            await interaction.deferReply({ ephemeral: true });

            const testType = interaction.options.getString('test-type') || 'status';

            if (testType === 'status') {
                // Afficher l'état du système anti-doublons
                const processedCount = interaction.client._processedInteractions?.size || 0;
                const userActionsCount = interaction.client._lastUserActions?.size || 0;
                const recentInteractionsCount = interaction.client._recentInteractions?.size || 0;
                const lastCleanup = interaction.client._lastCleanup || 'Jamais';

                const embed = new EmbedBuilder()
                    .setColor('#00ff00')
                    .setTitle('🔍 État du système anti-doublons (Triple couche)')
                    .addFields(
                        { name: 'Couche 1: IDs traités', value: processedCount.toString(), inline: true },
                        { name: 'Couche 2: Actions utilisateur', value: userActionsCount.toString(), inline: true },
                        { name: 'Couche 3: Interactions récentes', value: recentInteractionsCount.toString(), inline: true },
                        { name: 'Dernier nettoyage', value: new Date(lastCleanup).toLocaleTimeString(), inline: true },
                        { name: 'Uptime', value: process.uptime().toFixed(0) + 's', inline: true },
                        { name: 'Mémoire utilisée', value: (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2) + ' MB', inline: true },
                        { name: 'Version Node.js', value: process.version, inline: true }
                    )
                    .setDescription(`
**Protection active :**
• ✅ ID unique Discord (10s)
• ✅ Action utilisateur (1s)
• ✅ Fenêtre temporelle (2s)
• ✅ État interaction pré-defer
• ✅ Erreur spécialisée par code
                    `);

                return await safeEdit(interaction, { embeds: [embed] });
            }

            if (testType === 'simple') {
                const embed = new EmbedBuilder()
                    .setColor('#0099ff')
                    .setTitle('🧪 Test d\'interactions simples')
                    .setDescription('Cliquez sur les boutons ci-dessous pour tester les interactions:');

                const row = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId('debug_simple_1')
                            .setLabel('Bouton 1')
                            .setStyle(ButtonStyle.Primary),
                        new ButtonBuilder()
                            .setCustomId('debug_simple_2')
                            .setLabel('Bouton 2')
                            .setStyle(ButtonStyle.Secondary),
                        new ButtonBuilder()
                            .setCustomId('debug_simple_3')
                            .setLabel('Bouton 3')
                            .setStyle(ButtonStyle.Success)
                    );

                return await safeEdit(interaction, { embeds: [embed], components: [row] });
            }

            if (testType === 'critical') {
                const embed = new EmbedBuilder()
                    .setColor('#ff6600')
                    .setTitle('⚠️ Test d\'interactions critiques')
                    .setDescription('Ces boutons simulent les interactions critiques du festival:');

                const row = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId('teamsize_4')
                            .setLabel('Test: 4v4')
                            .setStyle(ButtonStyle.Primary),
                        new ButtonBuilder()
                            .setCustomId('gamemode_test')
                            .setLabel('Test: Mode')
                            .setStyle(ButtonStyle.Secondary),
                        new ButtonBuilder()
                            .setCustomId('mapban_test')
                            .setLabel('Test: Maps')
                            .setStyle(ButtonStyle.Danger)
                    );

                return await safeEdit(interaction, { embeds: [embed], components: [row] });
            }

        } catch (error) {
            console.error('Erreur dans debug-interactions:', error);
            try {
                await safeEdit(interaction, {
                    content: `Erreur de debug: ${error.message}`
                });
            } catch (editError) {
                console.error('Impossible de répondre à l\'erreur:', editError);
            }
        }
    },
};
