const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const fs = require('fs').promises;
const path = require('path');
const { safeEdit } = require('../utils/responseUtils');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('reset-system')
        .setDescription('Réinitialiser complètement le système (Admin uniquement - DANGEREUX)')
        .setDefaultMemberPermissions(PermissionFlagsBits.ADMINISTRATOR),
    
    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });
        
        try {
            console.log('=== DÉBUT RÉINITIALISATION COMPLÈTE DU SYSTÈME ===');
            
            // 1. NETTOYER MONGODB via DataAdapter
            const DataAdapter = require('../utils/dataAdapter');
            const adapter = new DataAdapter(interaction.guild.id);
            await adapter.cleanup();
            console.log('✅ MongoDB nettoyé (festivals, équipes, votes, scores, matchs, probabilités)');
            
            // 2. Nettoyage COMPLET MongoDB (même les données orphelines)
            const { Festival, Team, Vote, Match, CampScore, MapProbability, GuildConfig } = require('../models/mongodb');
            const { isMongoDBAvailable } = require('../utils/database');
            
            if (isMongoDBAvailable()) {
                // Supprimer TOUTES les données de ce serveur, même orphelines
                await Festival.deleteMany({ guildId: interaction.guild.id });
                await Team.deleteMany({ guildId: interaction.guild.id });
                await Vote.deleteMany({ guildId: interaction.guild.id });
                await Match.deleteMany({ guildId: interaction.guild.id });
                await CampScore.deleteMany({ guildId: interaction.guild.id });
                await MapProbability.deleteMany({ guildId: interaction.guild.id });
                await GuildConfig.deleteMany({ guildId: interaction.guild.id });
                console.log('✅ Nettoyage COMPLET MongoDB - toutes données orphelines supprimées (config incluse)');
            }
            
            // 3. Nettoyer les fichiers JSON locaux (fallback/sécurité)
            const dataPath = path.join(__dirname, '../../data');
            const files = ['festivals.json', 'teams.json', 'votes.json', 'scores.json', 'pendingResults.json'];
            
            for (const file of files) {
                const filePath = path.join(dataPath, file);
                try {
                    await fs.unlink(filePath);
                    console.log(`Fichier ${file} supprimé`);
                } catch (error) {
                    if (error.code !== 'ENOENT') {
                        console.error(`Erreur lors de la suppression de ${file}:`, error);
                    }
                }
            }
            
            // 4. Supprimer SEULEMENT les rôles créés par le bot
            const guild = interaction.guild;
            
            const rolesToDelete = guild.roles.cache.filter(role => 
                role.name.startsWith('Team ') || 
                role.name.startsWith('Camp ') || 
                role.name === 'Team Leader'
            );
            
            console.log(`${rolesToDelete.size} rôles du bot à supprimer`);
            
            for (const [id, role] of rolesToDelete) {
                try {
                    await role.delete('Réinitialisation système bot');
                    console.log(`Rôle ${role.name} supprimé`);
                } catch (error) {
                    console.error(`Erreur lors de la suppression du rôle ${role.name}:`, error);
                }
                await new Promise(resolve => setTimeout(resolve, 300));
            }
            
            // 5. Supprimer SEULEMENT les salons d'équipes et de matchs (PAS la catégorie)
            const teamChannels = guild.channels.cache.filter(channel => 
                channel.name && (
                    channel.name.startsWith('team-') || 
                    channel.name.startsWith('match-') ||
                    channel.name.includes('equipe-')
                )
            );
            
            console.log(`${teamChannels.size} salons d'équipes/matchs à supprimer`);
            
            for (const [id, channel] of teamChannels) {
                try {
                    await channel.delete('Réinitialisation système bot');
                    console.log(`Salon ${channel.name} supprimé`);
                } catch (error) {
                    console.error(`Erreur lors de la suppression du salon ${channel.name}:`, error);
                }
                await new Promise(resolve => setTimeout(resolve, 300));
            }
            
            console.log('=== FIN RÉINITIALISATION COMPLÈTE DU SYSTÈME ===');
            
            // Réponse à l'utilisateur
            await safeEdit(interaction, {
                content: `✅ **Système COMPLÈTEMENT nettoyé !**\n\n` +
                        `�️ **MongoDB:** TOUTES les données supprimées (festivals, équipes, votes, scores, matchs)\n` +
                        `🎭 **Rôles:** ${rolesToDelete.size} rôles du bot supprimés\n` +
                        `💬 **Salons:** ${teamChannels.size} salons d'équipes/matchs supprimés\n\n` +
                        `🔄 **Le système est maintenant 100% propre pour un nouveau festival.**`,
                ephemeral: true
            });
            
        } catch (error) {
            console.error('Erreur lors de la réinitialisation du système:', error);
            await safeEdit(interaction, {
                content: `❌ Une erreur s'est produite: ${error.message}`,
                ephemeral: true
            });
        }
    }
};