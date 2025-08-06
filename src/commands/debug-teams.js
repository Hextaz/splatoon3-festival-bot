const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { Team } = require('../models/mongodb');
const DataAdapter = require('../utils/dataAdapter');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('debug-teams')
        .setDescription('Debug: Voir et supprimer les équipes en base de données (Admin)')
        .setDefaultMemberPermissions(PermissionFlagsBits.ADMINISTRATOR)
        .addStringOption(option =>
            option.setName('action')
                .setDescription('Action à effectuer')
                .setRequired(true)
                .addChoices(
                    { name: 'Lister les équipes', value: 'list' },
                    { name: 'Supprimer toutes les équipes', value: 'clear' },
                    { name: 'Compter les équipes', value: 'count' }
                )),
    
    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });
        
        const action = interaction.options.getString('action');
        const guildId = interaction.guild.id;
        
        try {
            switch (action) {
                case 'list':
                    const allTeams = await Team.find({ guildId });
                    if (allTeams.length === 0) {
                        await interaction.editReply('✅ Aucune équipe trouvée en base de données');
                    } else {
                        let response = `📊 **${allTeams.length} équipes trouvées:**\n\n`;
                        allTeams.forEach((team, index) => {
                            response += `${index + 1}. **${team.name}** (Festival: \`${team.festivalId}\`)\n`;
                        });
                        await interaction.editReply(response);
                    }
                    break;
                    
                case 'count':
                    const count = await Team.countDocuments({ guildId });
                    await interaction.editReply(`📊 **${count}** équipes en base de données pour ce serveur`);
                    break;
                    
                case 'clear':
                    const adapter = new DataAdapter(guildId);
                    const result = await adapter.clearAllTeams();
                    await interaction.editReply(`🗑️ **${result.deletedCount}** équipes supprimées de la base de données`);
                    break;
            }
        } catch (error) {
            console.error('Erreur debug-teams:', error);
            await interaction.editReply(`❌ Erreur: ${error.message}`);
        }
    }
};
