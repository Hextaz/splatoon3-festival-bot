const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const fs = require('fs').promises;
const path = require('path');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('reset-system')
        .setDescription('Réinitialiser complètement le système (Admin uniquement - DANGEREUX)')
        .setDefaultMemberPermissions(PermissionFlagsBits.ADMINISTRATOR),
    
    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });
        
        try {
            console.log('=== DÉBUT RÉINITIALISATION COMPLÈTE DU SYSTÈME ===');
            
            // Chemin vers les fichiers de données
            const dataPath = path.join(__dirname, '../../data');
            const files = ['festivals.json', 'teams.json', 'votes.json', 'scores.json', 'pendingResults.json'];
            
            // Supprimer tous les fichiers de données
            for (const file of files) {
                const filePath = path.join(dataPath, file);
                try {
                    await fs.unlink(filePath);
                    console.log(`Fichier ${file} supprimé`);
                } catch (error) {
                    if (error.code !== 'ENOENT') {
                        console.error(`Erreur lors de la suppression de ${file}:`, error);
                    } else {
                        console.log(`Le fichier ${file} n'existait pas`);
                    }
                }
            }
            
            // Supprimer les rôles et canaux
            const guild = interaction.guild;
            
            // 1. Suppression des rôles
            const rolesToDelete = guild.roles.cache.filter(role => 
                role.name.startsWith('Team ') || role.name.startsWith('Camp ')
            );
            
            console.log(`${rolesToDelete.size} rôles à supprimer`);
            
            for (const [id, role] of rolesToDelete) {
                try {
                    await role.delete('Réinitialisation complète du système');
                    console.log(`Rôle ${role.name} supprimé`);
                } catch (error) {
                    console.error(`Erreur lors de la suppression du rôle ${role.name}:`, error);
                }
                // Pause pour éviter les limites de rate
                await new Promise(resolve => setTimeout(resolve, 300));
            }
            
            // 2. Suppression des canaux
            const category = guild.channels.cache.find(
                channel => channel.type === 4 && channel.name === 'Festival'
            );
            
            if (category) {
                // Supprimer d'abord les canaux dans la catégorie
                const channelsInCategory = guild.channels.cache.filter(
                    channel => channel.parentId === category.id
                );
                
                console.log(`${channelsInCategory.size} canaux dans la catégorie à supprimer`);
                
                for (const [id, channel] of channelsInCategory) {
                    try {
                        await channel.delete('Réinitialisation complète du système');
                        console.log(`Canal ${channel.name} supprimé`);
                    } catch (error) {
                        console.error(`Erreur lors de la suppression du canal ${channel.name}:`, error);
                    }
                    // Pause pour éviter les limites de rate
                    await new Promise(resolve => setTimeout(resolve, 300));
                }
                
                // Puis supprimer la catégorie
                try {
                    await category.delete('Réinitialisation complète du système');
                    console.log('Catégorie Festival supprimée');
                } catch (error) {
                    console.error('Erreur lors de la suppression de la catégorie Festival:', error);
                }
            }
            
            console.log('=== FIN RÉINITIALISATION COMPLÈTE DU SYSTÈME ===');
            
            // Réponse à l'utilisateur
            await interaction.editReply({
                content: '✅ Système entièrement réinitialisé. Vous pouvez maintenant redémarrer le bot pour un démarrage propre.',
                ephemeral: true
            });
            
        } catch (error) {
            console.error('Erreur lors de la réinitialisation du système:', error);
            await interaction.editReply({
                content: `❌ Une erreur s'est produite: ${error.message}`,
                ephemeral: true
            });
        }
    }
};