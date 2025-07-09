// src/commands/debug-sleep.js
const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('debug-sleep')
        .setDescription('Voir l\'état du système de veille intelligent (Admin)')
        .addSubcommand(subcommand =>
            subcommand
                .setName('status')
                .setDescription('Afficher l\'état actuel du Smart Sleep Manager'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('force-awake')
                .setDescription('Forcer le keep-alive pour une durée')
                .addIntegerOption(option =>
                    option.setName('minutes')
                        .setDescription('Durée en minutes (1-120)')
                        .setRequired(true)
                        .setMinValue(1)
                        .setMaxValue(120))
                .addStringOption(option =>
                    option.setName('reason')
                        .setDescription('Raison du keep-alive forcé')
                        .setRequired(false)))
        .setDefaultMemberPermissions(PermissionFlagsBits.ADMINISTRATOR),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });
        
        const subcommand = interaction.options.getSubcommand();
        
        if (subcommand === 'status') {
            await this.handleStatus(interaction);
        } else if (subcommand === 'force-awake') {
            await this.handleForceAwake(interaction);
        }
    },

    async handleStatus(interaction) {
        if (process.env.NODE_ENV !== 'production') {
            return await interaction.editReply({
                content: '⚠️ Cette commande fonctionne uniquement en production (Render).\n' +
                         'En développement local, la veille n\'est pas active.',
                ephemeral: true
            });
        }

        const { smartSleepManager } = require('../utils/smartSleep');
        const status = smartSleepManager.getStatus();
        
        // Calculer les informations de temps
        const now = new Date();
        const uptimeHours = (status.uptime / 3600).toFixed(1);
        const memoryMB = (status.memoryUsage.heapUsed / 1024 / 1024).toFixed(1);
        
        const embed = new EmbedBuilder()
            .setColor(status.isKeepAliveActive ? '#00FF00' : '#FFA500')
            .setTitle('🧠 Smart Sleep Manager - État actuel')
            .setTimestamp()
            .addFields(
                {
                    name: '💤 Mode de veille',
                    value: status.isKeepAliveActive ? 
                        `🔄 **Keep-alive ACTIF**\n└ ${status.currentReason}` : 
                        '😴 **Veille AUTORISÉE**\n└ Économie d\'heures Render active',
                    inline: false
                },
                {
                    name: '📊 Informations système',
                    value: `⏱️ **Uptime**: ${uptimeHours}h\n` +
                           `💾 **Mémoire**: ${memoryMB} MB\n` +
                           `🔄 **Dernière vérif**: <t:${Math.floor(status.lastCheck?.getTime() / 1000 || now.getTime() / 1000)}:R>`,
                    inline: true
                }
            );

        if (status.currentFestival) {
            const festival = status.currentFestival;
            const startTime = Math.floor(new Date(festival.startDate).getTime() / 1000);
            const endTime = Math.floor(new Date(festival.endDate).getTime() / 1000);
            
            embed.addFields({
                name: '🏕️ Festival actuel',
                value: `**${festival.title}**\n` +
                       `${festival.isActive ? '🟢' : '🔴'} Statut: ${festival.isActive ? 'Actif' : 'Inactif'}\n` +
                       `📅 Début: <t:${startTime}:F>\n` +
                       `📅 Fin: <t:${endTime}:F>\n` +
                       `⏰ Début: <t:${startTime}:R>\n` +
                       `⏰ Fin: <t:${endTime}:R>`,
                inline: false
            });
        } else {
            embed.addFields({
                name: '🏕️ Festival actuel',
                value: '❌ Aucun festival configuré',
                inline: false
            });
        }

        // Calcul approximatif des économies
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const hoursThisMonth = (now - startOfMonth) / (1000 * 60 * 60);
        const daysThisMonth = Math.floor(hoursThisMonth / 24);
        
        // Estimation basée sur 70% de veille quand pas de festival
        const estimatedSavings = status.isKeepAliveActive ? 
            0 : Math.max(0, hoursThisMonth * 0.7);
        
        embed.addFields({
            name: '💰 Économies estimées ce mois',
            value: `📊 **~${estimatedSavings.toFixed(0)}h** économisées sur 750h\n` +
                   `📅 Jour ${daysThisMonth + 1} du mois\n` +
                   `⚡ Mode actuel: ${status.isKeepAliveActive ? 'Consommation' : 'Économie'}`,
            inline: false
        });

        // Footer avec conseils
        embed.setFooter({
            text: status.isKeepAliveActive ? 
                'Le bot reste éveillé pour assurer le service pendant le festival' :
                'Le bot peut se mettre en veille pour économiser les heures Render'
        });

        await interaction.editReply({ embeds: [embed] });
    },

    async handleForceAwake(interaction) {
        if (process.env.NODE_ENV !== 'production') {
            return await interaction.editReply({
                content: '⚠️ Cette commande fonctionne uniquement en production (Render).',
                ephemeral: true
            });
        }

        const minutes = interaction.options.getInteger('minutes');
        const reason = interaction.options.getString('reason') || 'Force manuelle par admin';
        
        const { smartSleepManager } = require('../utils/smartSleep');
        
        const duration = minutes * 60 * 1000; // Convertir en ms
        smartSleepManager.forceKeepAlive(duration, reason);
        
        const embed = new EmbedBuilder()
            .setColor('#FF9900')
            .setTitle('⚡ Keep-alive forcé activé')
            .setDescription(`Le bot restera éveillé pendant **${minutes} minute(s)**`)
            .addFields(
                {
                    name: '📝 Raison',
                    value: reason,
                    inline: false
                },
                {
                    name: '⏰ Fin prévue',
                    value: `<t:${Math.floor((Date.now() + duration) / 1000)}:R>`,
                    inline: true
                },
                {
                    name: '💡 Note',
                    value: 'Après cette période, le système reviendra au mode automatique',
                    inline: false
                }
            )
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
        
        // Log pour traçabilité
        console.log(`⚡ Keep-alive forcé par ${interaction.user.tag} pour ${minutes}min: ${reason}`);
    }
};
