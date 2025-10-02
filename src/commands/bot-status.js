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
                    name: '� Hébergement Railway',
                    value: '**Plateforme stable et optimisée**\n└ Pas d\'hibernation - Performances constantes',
                    inline: false
                },
                {
                    name: '📊 Informations système',
                    value: `⏱️ **Uptime**: ${uptimeHours}h\n` +
                           `💾 **Mémoire**: ${memoryMB} MB\n` +
                           `� **Status**: En ligne`,
                    inline: true
                },
                {
                    name: '⚡ Performances',
                    value: '✅ **Réactivité**: Immédiate\n' +
                           '✅ **Disponibilité**: 24h/24\n' +
                           '✅ **Stabilité**: Optimale Railway',
                    inline: true
                }
            );

        // Informations Railway
        embed.addFields({
            name: '� Hébergement Railway',
            value: `🎯 **Plan**: Hobby Plan\n` +
                   `� **Coût**: 1$/mois après le premier mois gratuit\n` +
                   `� **Avantages**: Pas d'hibernation, stable H24`,
            inline: false
        });

        embed.setFooter({ 
            text: 'Bot configuré pour performance maximale - Simple et fiable' 
        });

        await safeEdit(interaction, { embeds: [embed] });
    }
};
