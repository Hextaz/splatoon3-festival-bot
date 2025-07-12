const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { guildDataManager } = require('../utils/database');
const config = require('../config');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('migrate-data')
        .setDescription('Migrer les données globales vers ce serveur (Admin uniquement)')
        .setDefaultMemberPermissions(PermissionFlagsBits.ADMINISTRATOR),
    
    async execute(interaction) {
        // Vérifier si le multi-serveur est activé
        if (!config.multiServerEnabled) {
            return await interaction.reply({
                content: '❌ Le support multi-serveur n\'est pas activé. Utilisez `/config` pour l\'activer.',
                ephemeral: true
            });
        }

        const embed = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle('🔄 Migration des données')
            .setDescription('Voulez-vous migrer les données globales vers ce serveur ?')
            .addFields(
                { 
                    name: '⚠️ Attention', 
                    value: 'Cette opération va:\n• Copier toutes les données globales vers ce serveur\n• Créer des sauvegardes des fichiers originaux\n• Permettre un fonctionnement indépendant par serveur' 
                },
                { 
                    name: '📋 Données concernées', 
                    value: '• Festivals\n• Équipes\n• Scores\n• Votes\n• Configuration\n• Historique des matchs' 
                }
            );

        const confirmButton = {
            type: 1,
            components: [{
                type: 2,
                style: 3,
                label: '✅ Migrer',
                custom_id: 'confirm_migrate'
            }, {
                type: 2,
                style: 4,
                label: '❌ Annuler',
                custom_id: 'cancel_migrate'
            }]
        };

        await interaction.reply({
            embeds: [embed],
            components: [confirmButton],
            ephemeral: true
        });

        // Gérer la réponse
        const filter = i => i.user.id === interaction.user.id;
        const collector = interaction.channel.createMessageComponentCollector({ filter, time: 30000 });

        collector.on('collect', async i => {
            if (i.customId === 'confirm_migrate') {
                await i.deferUpdate();
                
                try {
                    console.log(`🔄 Début de la migration pour le serveur ${interaction.guild.name} (${interaction.guild.id})`);
                    await guildDataManager.migrateGlobalDataToGuild(interaction.guild.id);
                    
                    const successEmbed = new EmbedBuilder()
                        .setColor('#00ff00')
                        .setTitle('✅ Migration réussie')
                        .setDescription('Les données ont été migrées avec succès vers ce serveur !')
                        .addFields(
                            { name: '🎯 Serveur', value: interaction.guild.name },
                            { name: '📁 Emplacement', value: `data/guilds/${interaction.guild.id}/` },
                            { name: '💾 Sauvegardes', value: 'Fichiers originaux sauvegardés avec extension .backup' }
                        );

                    await i.editReply({
                        embeds: [successEmbed],
                        components: []
                    });

                } catch (error) {
                    console.error('Erreur lors de la migration:', error);
                    
                    const errorEmbed = new EmbedBuilder()
                        .setColor('#ff0000')
                        .setTitle('❌ Erreur de migration')
                        .setDescription('Une erreur est survenue lors de la migration.')
                        .addFields(
                            { name: '🐛 Erreur', value: error.message }
                        );

                    await i.editReply({
                        embeds: [errorEmbed],
                        components: []
                    });
                }
            } else if (i.customId === 'cancel_migrate') {
                await i.update({
                    content: '❌ Migration annulée.',
                    embeds: [],
                    components: []
                });
            }
        });

        collector.on('end', async collected => {
            if (collected.size === 0) {
                await interaction.editReply({
                    content: '⏱️ Temps écoulé. Migration annulée.',
                    embeds: [],
                    components: []
                });
            }
        });
    }
};
