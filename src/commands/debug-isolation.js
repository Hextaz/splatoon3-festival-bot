const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { Team, Vote, CampScore, PendingResult, MatchHistory, TeamMatchCounter, MapProbability } = require('../models/mongodb');
const DataAdapter = require('../utils/dataAdapter');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('debug-isolation')
        .setDescription('Debug: Vérifier l\'isolation des données par festival et serveur (Admin)')
        .setDefaultMemberPermissions(PermissionFlagsBits.ADMINISTRATOR)
        .addStringOption(option =>
            option.setName('action')
                .setDescription('Action à effectuer')
                .setRequired(true)
                .addChoices(
                    { name: 'Voir isolation actuelle', value: 'check' },
                    { name: 'Compter par festival', value: 'count-by-festival' },
                    { name: 'Lister tous les festivals', value: 'list-festivals' }
                )),
    
    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });
        
        const action = interaction.options.getString('action');
        const guildId = interaction.guild.id;
        
        try {
            const adapter = new DataAdapter(guildId);
            
            switch (action) {
                case 'check':
                    await checkCurrentIsolation(interaction, guildId, adapter);
                    break;
                case 'count-by-festival':
                    await countByFestival(interaction, guildId);
                    break;
                case 'list-festivals':
                    await listAllFestivals(interaction, guildId);
                    break;
            }
        } catch (error) {
            console.error('Erreur debug-isolation:', error);
            await interaction.editReply(`❌ Erreur: ${error.message}`);
        }
    }
};

async function checkCurrentIsolation(interaction, guildId, adapter) {
    const festival = await adapter.getFestival();
    
    if (!festival) {
        await interaction.editReply('❌ Aucun festival actif trouvé pour vérifier l\'isolation');
        return;
    }
    
    // Compter les données liées au festival actuel
    const teams = await Team.countDocuments({ guildId, festivalId: festival._id });
    const votes = await Vote.countDocuments({ guildId, festivalId: festival._id });
    const scores = await CampScore.countDocuments({ guildId, festivalId: festival._id });
    const pending = await PendingResult.countDocuments({ guildId, festivalId: festival._id });
    const history = await MatchHistory.countDocuments({ guildId, festivalId: festival._id });
    const counters = await TeamMatchCounter.countDocuments({ guildId, festivalId: festival._id });
    const mapProbs = await MapProbability.countDocuments({ guildId, festivalId: festival._id });
    
    // Compter les données orphelines (sans festivalId)
    const orphanTeams = await Team.countDocuments({ guildId, festivalId: { $exists: false } });
    const orphanVotes = await Vote.countDocuments({ guildId, festivalId: { $exists: false } });
    
    let response = `🔍 **ISOLATION DES DONNÉES**\n\n`;
    response += `**Festival actuel:** ${festival.title}\n`;
    response += `**ID Festival:** \`${festival._id}\`\n\n`;
    
    response += `**📊 DONNÉES LIÉES AU FESTIVAL ACTUEL:**\n`;
    response += `• Équipes: ${teams}\n`;
    response += `• Votes: ${votes}\n`;
    response += `• Scores: ${scores}\n`;
    response += `• Résultats en attente: ${pending}\n`;
    response += `• Historique matchs: ${history}\n`;
    response += `• Compteurs matchs: ${counters}\n`;
    response += `• Probabilités cartes: ${mapProbs}\n\n`;
    
    if (orphanTeams > 0 || orphanVotes > 0) {
        response += `⚠️ **DONNÉES ORPHELINES (PROBLÈME):**\n`;
        if (orphanTeams > 0) response += `• Équipes sans festival: ${orphanTeams}\n`;
        if (orphanVotes > 0) response += `• Votes sans festival: ${orphanVotes}\n`;
    } else {
        response += `✅ **Aucune donnée orpheline trouvée**`;
    }
    
    await interaction.editReply(response);
}

async function countByFestival(interaction, guildId) {
    // Obtenir tous les festivals de ce serveur
    const { Festival } = require('../models/mongodb');
    const festivals = await Festival.find({ guildId }).sort({ createdAt: -1 });
    
    if (festivals.length === 0) {
        await interaction.editReply('❌ Aucun festival trouvé pour ce serveur');
        return;
    }
    
    let response = `📊 **DONNÉES PAR FESTIVAL (${festivals.length} festivals)**\n\n`;
    
    for (const festival of festivals) {
        const teams = await Team.countDocuments({ guildId, festivalId: festival._id });
        const votes = await Vote.countDocuments({ guildId, festivalId: festival._id });
        const scores = await CampScore.countDocuments({ guildId, festivalId: festival._id });
        const history = await MatchHistory.countDocuments({ guildId, festivalId: festival._id });
        
        const status = festival.isActive ? '🟢 ACTIF' : '🔴 INACTIF';
        const date = festival.createdAt.toLocaleDateString('fr-FR');
        
        response += `**${festival.title}** ${status}\n`;
        response += `📅 ${date} | 👥 ${teams} équipes | 🗳️ ${votes} votes | 📈 ${history} matchs\n\n`;
    }
    
    await interaction.editReply(response);
}

async function listAllFestivals(interaction, guildId) {
    const { Festival } = require('../models/mongodb');
    const festivals = await Festival.find({ guildId }).sort({ createdAt: -1 });
    
    if (festivals.length === 0) {
        await interaction.editReply('❌ Aucun festival trouvé pour ce serveur');
        return;
    }
    
    let response = `🏟️ **TOUS LES FESTIVALS (${festivals.length})**\n\n`;
    
    festivals.forEach((festival, index) => {
        const status = festival.isActive ? '🟢 ACTIF' : '🔴 INACTIF';
        const date = festival.createdAt.toLocaleDateString('fr-FR');
        
        response += `${index + 1}. **${festival.title}** ${status}\n`;
        response += `   📅 ${date}\n`;
        response += `   🆔 \`${festival._id}\`\n\n`;
    });
    
    await interaction.editReply(response);
}
