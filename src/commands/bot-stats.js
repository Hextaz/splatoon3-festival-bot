// src/commands/bot-stats.js
// Commande pour voir les statistiques du bot

const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('bot-stats')
        .setDescription('Afficher les statistiques du bot (Admin seulement)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        
    async execute(interaction) {
        try {
            const client = interaction.client;
            
            // Collecte des statistiques
            const guilds = client.guilds.cache;
            const totalGuilds = guilds.size;
            const totalMembers = guilds.reduce((acc, guild) => acc + guild.memberCount, 0);
            
            // Statistiques détaillées par serveur
            const guildDetails = guilds.map(guild => ({
                name: guild.name,
                id: guild.id,
                members: guild.memberCount,
                owner: guild.ownerId,
                createdAt: guild.createdAt
            }));
            
            // Uptime du bot
            const uptime = process.uptime();
            const uptimeFormatted = formatUptime(uptime);
            
            // Mémoire utilisée
            const memoryUsage = process.memoryUsage();
            const memoryMB = Math.round(memoryUsage.heapUsed / 1024 / 1024);
            
            // Smart Sleep stats (si disponible)
            let smartSleepInfo = "Non disponible";
            if (global.smartSleepManager) {
                const status = global.smartSleepManager.getStatus();
                smartSleepInfo = `Keep-alive: ${status.isKeepAliveActive ? '🟢 Actif' : '🔴 Inactif'}`;
                if (status.currentReason) {
                    smartSleepInfo += `\nRaison: ${status.currentReason}`;
                }
            }
            
            // Création de l'embed
            const embed = new EmbedBuilder()
                .setTitle('📊 Statistiques du Bot')
                .setColor(0x00ff00)
                .setTimestamp()
                .addFields(
                    { name: '🏰 Serveurs Discord', value: `${totalGuilds}`, inline: true },
                    { name: '👥 Utilisateurs totaux', value: `${totalMembers.toLocaleString()}`, inline: true },
                    { name: '⏱️ Uptime', value: uptimeFormatted, inline: true },
                    { name: '💾 Mémoire utilisée', value: `${memoryMB} MB`, inline: true },
                    { name: '🛡️ Smart Sleep', value: smartSleepInfo, inline: false }
                );
                
            // Ajouter détails des serveurs si peu nombreux
            if (totalGuilds <= 10) {
                const guildList = guildDetails.map(guild => 
                    `**${guild.name}** (${guild.members} membres)`
                ).join('\n');
                
                embed.addFields({
                    name: '📋 Détails des serveurs',
                    value: guildList || 'Aucun serveur',
                    inline: false
                });
            }
            
            // Version du bot
            const packageJson = require('../../package.json');
            embed.setFooter({ 
                text: `Version ${packageJson.version || '1.0.0'} | Node.js ${process.version}` 
            });
            
            await interaction.reply({ embeds: [embed], ephemeral: true });
            
        } catch (error) {
            console.error('Erreur bot-stats:', error);
            await interaction.reply({ 
                content: '❌ Erreur lors de la récupération des statistiques.', 
                ephemeral: true 
            });
        }
    }
};

function formatUptime(seconds) {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (days > 0) {
        return `${days}j ${hours}h ${minutes}m`;
    } else if (hours > 0) {
        return `${hours}h ${minutes}m`;
    } else {
        return `${minutes}m`;
    }
}
