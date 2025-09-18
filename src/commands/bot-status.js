// src/commands/bot-status.js
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { safeReply, safeEdit, safeFollowUp } = require('../utils/responseUtils');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('bot-status')
        .setDescription('Affiche le statut du bot et des services'),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const uptime = process.uptime();
        const uptimeHours = (uptime / 3600).toFixed(1);
        const memoryMB = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1);
        
        const embed = new EmbedBuilder()
            .setColor('#00FF00')
            .setTitle('🤖 Statut du Bot Splatoon 3 Festival')
            .setTimestamp()
            .addFields(
                {
                    name: '🔄 Mode de fonctionnement',
                    value: '**Keep-alive permanent ACTIF**\n└ Bot maintenu éveillé H24 pour réactivité maximale',
                    inline: false
                },
                {
                    name: '📊 Informations système',
                    value: `⏱️ **Uptime**: ${uptimeHours}h\n` +
                           `💾 **Mémoire**: ${memoryMB} MB\n` +
                           `🏥 **Health Server**: ${global.healthServer ? 'Actif' : 'Inactif'}`,
                    inline: true
                },
                {
                    name: '⚡ Performances',
                    value: '✅ **Réactivité**: Immédiate\n' +
                           '✅ **Disponibilité**: 24h/24\n' +
                           '✅ **Stabilité**: Maximale',
                    inline: true
                }
            );

        if (process.env.NODE_ENV === 'production') {
            embed.addFields({
                name: '📈 Consommation Render',
                value: `📅 **Mois en cours**: ~${Math.floor(new Date().getDate() * 24)}h utilisées\n` +
                       `📊 **Limite mensuelle**: 750h\n` +
                       `💰 **Marge restante**: ${750 - Math.floor(new Date().getDate() * 24)}h`,
                inline: false
            });
        }

        embed.setFooter({ 
            text: 'Bot configuré pour performance maximale - Simple et fiable' 
        });

        await safeEdit(interaction, { embeds: [embed] });
    }
};
