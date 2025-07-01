// src/commands/documentation.js
const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const { getCurrentFestival } = require('../utils/festivalManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('documentation')
        .setDescription('Guide complet pour participer aux festivals Splatoon 3')
        .addStringOption(option =>
            option.setName('section')
                .setDescription('Section spécifique à consulter')
                .setRequired(false)
                .addChoices(
                    { name: '📖 Guide complet', value: 'guide' },
                    { name: '🎮 Comment commencer', value: 'start' },
                    { name: '👥 Gestion d\'équipe', value: 'team' },
                    { name: '⚔️ Système de matchs', value: 'matches' },
                    { name: '📊 Scores et points', value: 'scores' },
                    { name: '💾 Liste des commandes', value: 'commands' },
                    { name: '📋 Règles', value: 'rules' }
                )),

    async execute(interaction) {
        const section = interaction.options.getString('section');
        const festival = getCurrentFestival();

        // Si aucune section spécifiée, afficher le menu principal
        if (!section) {
            return await showMainMenu(interaction, festival);
        }

        // Afficher la section demandée
        switch (section) {
            case 'guide':
                await showCompleteGuide(interaction, festival);
                break;
            case 'start':
                await showGettingStarted(interaction, festival);
                break;
            case 'team':
                await showTeamManagement(interaction, festival);
                break;
            case 'matches':
                await showMatchSystem(interaction, festival);
                break;
            case 'scores':
                await showScoreSystem(interaction, festival);
                break;
            case 'commands':
                await showCommandsList(interaction, festival);
                break;
            case 'rules':
                await showRules(interaction, festival);
                break;
            default:
                await showMainMenu(interaction, festival);
        }
    },

    // EXPORTER TOUTES LES FONCTIONS INDIVIDUELLES
    showCompleteGuide,
    showGettingStarted,
    showTeamManagement,
    showMatchSystem,
    showScoreSystem,
    showCommandsList,
    showRules
};

// Menu principal avec sélection
async function showMainMenu(interaction, festival) {
    const embed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle('📚 Documentation - Festivals Splatoon 3')
        .setDescription('Bienvenue dans le guide complet des festivals ! Sélectionnez une section pour en savoir plus.')
        .addFields(
            { name: '🎮 Comment commencer', value: 'Les premières étapes pour participer', inline: true },
            { name: '👥 Gestion d\'équipe', value: 'Créer, rejoindre et gérer votre équipe', inline: true },
            { name: '⚔️ Système de matchs', value: 'Comment fonctionnent les matchs', inline: true },
            { name: '📊 Scores et points', value: 'Système de points et multiplicateurs', inline: true },
            { name: '💾 Liste des commandes', value: 'Toutes les commandes disponibles', inline: true },
            { name: '📋 Règles', value: 'Règles et conditions importantes', inline: true }
        );

    if (festival) {
        embed.addFields({
            name: '🎯 Festival actuel',
            value: `**${festival.title}**\nFormat: ${festival.getTeamSizeDisplay()}\nMode: ${festival.getGameModeDisplay()}`,
            inline: false
        });
    }

    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('doc_section_select')
        .setPlaceholder('Choisissez une section à consulter')
        .addOptions([
            {
                label: 'Guide complet',
                description: 'Tout le processus du début à la fin',
                value: 'guide',
                emoji: '📖'
            },
            {
                label: 'Comment commencer',
                description: 'Premiers pas pour participer',
                value: 'start',
                emoji: '🎮'
            },
            {
                label: 'Gestion d\'équipe',
                description: 'Créer et gérer votre équipe',
                value: 'team',
                emoji: '👥'
            },
            {
                label: 'Système de matchs',
                description: 'Comment se déroulent les matchs',
                value: 'matches',
                emoji: '⚔️'
            },
            {
                label: 'Scores et points',
                description: 'Système de points et multiplicateurs',
                value: 'scores',
                emoji: '📊'
            },
            {
                label: 'Liste des commandes',
                description: 'Toutes les commandes disponibles',
                value: 'commands',
                emoji: '💾'
            },
            {
                label: 'Règles',
                description: 'Règles et conditions',
                value: 'rules',
                emoji: '📋'
            }
        ]);

    const row = new ActionRowBuilder().addComponents(selectMenu);

    await interaction.reply({
        embeds: [embed],
        components: [row],
        ephemeral: true
    });
}

// Guide complet étape par étape
async function showCompleteGuide(interaction, festival) {
    const embed = new EmbedBuilder()
        .setColor('#00ff00')
        .setTitle('📖 Guide complet - Comment participer à un festival')
        .setDescription('Voici le processus complet pour participer à un festival Splatoon 3 :')
        .addFields(
            {
                name: '🎯 Étape 1 : Choisir un camp',
                value: '• Utilisez `/vote` pour choisir l\'un des 3 camps\n• **Attention** : Ce choix est définitif !\n• Vous recevrez un rôle de camp',
                inline: false
            },
            {
                name: '👥 Étape 2 : Former une équipe',
                value: '• **Option A** : Créez votre équipe avec `/create-team`\n• **Option B** : Rejoignez une équipe avec `/join-team`\n• Consultez les équipes disponibles avec `/teams-list`',
                inline: false
            },
            {
                name: '⚔️ Étape 3 : Chercher des matchs',
                value: `• Votre équipe doit être complète (${festival?.getTeamSizeDisplay() || '4 joueurs'})\n• Utilisez \`/search-match\` pour trouver un adversaire\n• Le système vous mettra en relation automatiquement`,
                inline: false
            },
            {
                name: '🎮 Étape 4 : Jouer le match',
                value: '• Rejoingnez votre adversaire en jeu (Splatoon 3)\n• Jouez le Best of 3 (BO3) généré par le bot\n• Suivez les modes et maps indiqués',
                inline: false
            },
            {
                name: '📊 Étape 5 : Déclarer les résultats',
                value: '• Le capitaine utilise `/results` pour déclarer victoire/défaite\n• L\'équipe adverse doit confirmer\n• Les points sont automatiquement attribués',
                inline: false
            },
            {
                name: '🔄 Étape 6 : Répéter',
                value: '• Cherchez de nouveaux matchs avec `/search-match`\n• Continuez jusqu\'à la fin du festival\n• Contribuez aux points de votre camp !',
                inline: false
            }
        )
        .setFooter({ text: 'Conseil : Consultez /my-team régulièrement pour voir l\'état de votre équipe' });

    await interaction.reply({
        embeds: [embed],
        ephemeral: true
    });
}

// Guide pour commencer
async function showGettingStarted(interaction, festival) {
    const embed = new EmbedBuilder()
        .setColor('#ffaa00')
        .setTitle('🎮 Comment commencer - Premiers pas')
        .setDescription('Vous débutez ? Voici les premières étapes essentielles :');

    if (!festival) {
        embed.addFields({
            name: '⚠️ Aucun festival actif',
            value: 'Il n\'y a pas de festival en cours actuellement. Attendez qu\'un administrateur en crée un !',
            inline: false
        });
    } else {
        embed.addFields(
            {
                name: '🎯 1. Votez pour un camp',
                value: `**Commande** : \`/vote\`\n**Camps disponibles** : ${festival.campNames.join(', ')}\n**Important** : Vous ne pourrez plus changer de camp !`,
                inline: false
            },
            {
                name: '👀 2. Explorez les options',
                value: '**Voir les équipes** : `/teams-list`\n**Voir le festival** : `/current-festival`\n**Voir votre équipe** : `/my-team` (si vous en avez une)',
                inline: false
            },
            {
                name: '👥 3. Rejoignez ou créez une équipe',
                value: `**Créer** : \`/create-team nom_equipe\`\n**Rejoindre** : \`/join-team\`\n**Format actuel** : ${festival.getTeamSizeDisplay()}`,
                inline: false
            },
            {
                name: '✅ 4. Vérifiez que vous êtes prêt',
                value: '• Vous avez voté pour un camp ✓\n• Vous êtes dans une équipe complète ✓\n• Vous pouvez commencer à chercher des matchs !',
                inline: false
            }
        );
    }

    embed.addFields({
        name: '💡 Conseils pour débuter',
        value: '• Communiquez avec votre équipe dans le salon privé\n• Coordonnez-vous avant les matchs\n• N\'hésitez pas à demander de l\'aide aux autres joueurs',
        inline: false
    });

    await interaction.reply({
        embeds: [embed],
        ephemeral: true
    });
}

// Gestion d'équipe
async function showTeamManagement(interaction, festival) {
    const teamSize = festival?.teamSize || 4;
    const formatDisplay = festival?.getTeamSizeDisplay() || '4v4';

    const embed = new EmbedBuilder()
        .setColor('#aa00ff')
        .setTitle('👥 Gestion d\'équipe - Tout savoir sur les équipes')
        .setDescription(`Format actuel : **${formatDisplay}** (${teamSize} joueurs par équipe)`)
        .addFields(
            {
                name: '🛠️ Créer une équipe',
                value: '**Commande** : `/create-team nom_equipe`\n• Vous devenez automatiquement capitaine\n• Choisissez entre équipe ouverte ou fermée\n• Un salon privé est créé pour votre équipe',
                inline: false
            },
            {
                name: '🚪 Rejoindre une équipe',
                value: '**Commande** : `/join-team`\n• Entrez le nom de l\'équipe\n• Code requis pour les équipes fermées\n• Vous devez être du même camp que l\'équipe',
                inline: false
            },
            {
                name: '👑 Rôle du capitaine',
                value: '• Déclarer les résultats avec `/results`\n• Expulser des membres avec `/kick-member`\n• Gérer les paramètres de l\'équipe\n• Représenter l\'équipe dans les matchs',
                inline: false
            },
            {
                name: '📋 Types d\'équipe',
                value: '**🔓 Ouverte** : N\'importe qui peut rejoindre\n**🔒 Fermée** : Code d\'accès requis\n• Le code est affiché dans `/my-team`\n• Partagez-le avec vos amis',
                inline: false
            },
            {
                name: '🏠 Salon d\'équipe',
                value: '• Salon privé automatiquement créé\n• Seuls les membres peuvent y accéder\n• Idéal pour coordonner vos stratégies\n• Reçoit les notifications de matchs',
                inline: false
            },
            {
                name: '🚪 Quitter une équipe',
                value: '**Commande** : `/leave-team`\n• Quittez votre équipe actuelle\n• Vous perdez l\'accès au salon privé\n• Vous pouvez rejoindre ou créer une nouvelle équipe',
                inline: false
            }
        )
        .addFields({
            name: '💡 Conseils d\'équipe',
            value: `• Une équipe doit avoir exactement ${teamSize} membres pour jouer\n• Communiquez dans votre salon privé\n• Organisez des sessions d\'entraînement\n• Respectez les horaires de vos coéquipiers`,
            inline: false
        });

    await interaction.reply({
        embeds: [embed],
        ephemeral: true
    });
}

// Système de matchs
async function showMatchSystem(interaction, festival) {
    const embed = new EmbedBuilder()
        .setColor('#ff0066')
        .setTitle('⚔️ Système de matchs - Comment se déroulent les combats')
        .setDescription('Découvrez comment fonctionne le système de matchmaking et les règles de jeu :')
        .addFields(
            {
                name: '🔍 Recherche de match',
                value: '**Commande** : `/search-match`\n• Votre équipe doit être complète\n• Le système trouve automatiquement un adversaire\n• Vous recevez une notification quand un match est trouvé',
                inline: false
            },
            {
                name: '🎯 BO3 (Best of 3)',
                value: '• Chaque match est un **Best of 3**\n• Le bot génère 3 manches avec modes et maps\n• La première équipe à gagner 2 manches remporte le BO3\n• Modes possibles : ' + (festival?.getGameModeDisplay() || 'Modes mixtes'),
                inline: false
            },
            {
                name: '🎮 Déroulement d\'un match',
                value: '1. **Match trouvé** → Salon temporaire créé\n2. **BO3 généré** → Modes et maps affichés\n3. **Rejoignez-vous en jeu** (Splatoon 3)\n4. **Jouez les 3 manches** selon l\'ordre\n5. **Déclarez le résultat** avec `/results`',
                inline: false
            },
            {
                name: '📊 Déclaration des résultats',
                value: '• **Capitaine** utilise `/results`\n• Déclare **Victoire** ou **Défaite**\n• L\'équipe adverse doit **confirmer**\n• En cas de contestation, contactez un admin',
                inline: false
            },
            {
                name: '🏟️ Salon de match',
                value: '• Salon temporaire créé pour chaque match\n• Accessible aux deux équipes\n• Contient les informations du BO3\n• Supprimé automatiquement après le match',
                inline: false
            },
            {
                name: '⏱️ Temps d\'attente',
                value: '• **Recherche** : Jusqu\'à 5 minutes\n• **Cooldown** : 3 secondes entre les matchs\n• **Annulation** : Bouton dans le salon d\'équipe\n• Soyez patients, le système trouve l\'adversaire idéal !',
                inline: false
            }
        )
        .addFields({
            name: '⚠️ Règles importantes',
            value: '• Respectez l\'ordre des manches du BO3\n• Ne quittez pas en cours de match\n• Soyez fair-play avec vos adversaires\n• En cas de problème technique, contactez un admin',
            inline: false
        });

    await interaction.reply({
        embeds: [embed],
        ephemeral: true
    });
}

// Système de scores et points
async function showScoreSystem(interaction, festival) {
    const embed = new EmbedBuilder()
        .setColor('#00aaff')
        .setTitle('📊 Système de scores - Points et multiplicateurs')
        .setDescription('Comprenez comment les points sont attribués et contribuez à la victoire de votre camp :')
        .addFields(
            {
                name: '🎯 Attribution des points',
                value: '• **1 point de base** par victoire de BO3\n• Les points vont au **camp** de l\'équipe gagnante\n• Seul le résultat du BO3 compte (pas les manches individuelles)\n• Toute l\'équipe contribue aux points du camp',
                inline: false
            },
            {
                name: '✨ Système de multiplicateurs',
                value: '**x1** (Normal) - 85% des matchs ⚪\n**x10** (Multiplicateur) - 10% des matchs ✨\n**x100** (Super Multiplicateur) - 4% des matchs ⭐\n**x333** (Multiplicateur Légendaire) - 1% des matchs 🔥',
                inline: false
            },
            {
                name: '🔥 Matchs spéciaux',
                value: '• Les multiplicateurs sont **aléatoires**\n• Annoncés avant le début du match\n• **Tous les BO3** avec multiplicateur sont cruciaux\n• Peuvent complètement changer le classement !',
                inline: false
            },
            {
                name: '🏆 Classement des camps',
                value: '• **Points absolus** stockés pour chaque camp\n• **Pourcentages** calculés automatiquement\n• Classement mis à jour en temps réel\n• Le camp avec le plus de points gagne !',
                inline: false
            },
            {
                name: '📈 Consulter les scores',
                value: '• **Votre contribution** : Visible dans votre salon d\'équipe\n• **Scores globaux** : `/current-festival`\n• **Détails** : Commande admin pour voir l\'historique\n• **Annonces** : À mi-parcours et fin de festival',
                inline: false
            },
            {
                name: '🎲 Stratégie',
                value: '• **Jouez régulièrement** : Plus de matchs = plus de chances\n• **Matchs multiplicateurs** : Ne les ratez pas !\n• **Travail d\'équipe** : Coordonnez-vous avec votre camp\n• **Persévérance** : Chaque point compte !',
                inline: false
            }
        )
        .addFields({
            name: '💡 Exemples de calcul',
            value: '• Match normal gagné = **+1 point** pour votre camp\n• Match x10 gagné = **+10 points** pour votre camp\n• Match x333 gagné = **+333 points** pour votre camp !',
            inline: false
        });

    await interaction.reply({
        embeds: [embed],
        ephemeral: true
    });
}

// Liste des commandes
async function showCommandsList(interaction, festival) {
    const embed = new EmbedBuilder()
        .setColor('#6600ff')
        .setTitle('💾 Liste des commandes - Référence complète')
        .setDescription('Toutes les commandes disponibles pour les joueurs :')
        .addFields(
            {
                name: '🎯 Commandes de base',
                value: '`/vote` - Choisir un camp (obligatoire)\n`/current-festival` - Voir les infos du festival\n`/documentation` - Afficher ce guide',
                inline: false
            },
            {
                name: '👥 Gestion d\'équipe',
                value: '`/create-team <nom>` - Créer une nouvelle équipe\n`/join-team` - Rejoindre une équipe existante\n`/my-team` - Voir les infos de votre équipe\n`/leave-team` - Quitter votre équipe actuelle\n`/teams-list` - Voir toutes les équipes',
                inline: false
            },
            {
                name: '⚔️ Système de matchs',
                value: '`/search-match` - Chercher un adversaire\n`/results` - Déclarer le résultat (capitaines)',
                inline: false
            },
            {
                name: '🔧 Commandes de gestion (Capitaines)',
                value: '`/kick-member` - Expulser un membre de l\'équipe',
                inline: false
            },
            {
                name: '📊 Informations',
                value: 'Les scores détaillés sont visibles via `/current-festival`\nL\'historique des matchs est dans votre salon d\'équipe',
                inline: false
            }
        )
        .addFields({
            name: '💡 Conseils d\'utilisation',
            value: '• Utilisez `/my-team` régulièrement pour vérifier votre statut\n• `/teams-list` vous aide à trouver une équipe à rejoindre\n• Toutes les commandes importantes sont également dans vos salons privés',
            inline: false
        });

    await interaction.reply({
        embeds: [embed],
        ephemeral: true
    });
}

// Règles et conditions
async function showRules(interaction, festival) {
    const embed = new EmbedBuilder()
        .setColor('#ff6600')
        .setTitle('📋 Règles et conditions - À respecter impérativement')
        .setDescription('Règles importantes pour assurer le bon déroulement des festivals :')
        .addFields(
            {
                name: '⚖️ Règles générales',
                value: '• **Fair-play obligatoire** avec tous les participants\n• **Respectez vos adversaires** avant, pendant et après les matchs\n• **Pas de triche** ou d\'exploitation de bugs\n• **Suivez les instructions** des administrateurs',
                inline: false
            },
            {
                name: '🎯 Règles de camp',
                value: '• **Un seul vote par personne** et par festival\n• **Impossible de changer** de camp une fois voté\n• **Une seule équipe** par personne en même temps\n• **Respectez l\'esprit de compétition** entre camps',
                inline: false
            },
            {
                name: '👥 Règles d\'équipe',
                value: `• **Équipes de ${festival?.teamSize || 4} joueurs** exactement\n• **Même camp obligatoire** pour tous les membres\n• **Capitaine responsable** de l\'équipe\n• **Communication respectueuse** dans les salons`,
                inline: false
            },
            {
                name: '⚔️ Règles de match',
                value: '• **Suivez l\'ordre du BO3** généré par le bot\n• **Jouez toutes les manches** même si vous menez 2-0\n• **Résultats honnêtes** obligatoires\n• **Confirmation mutuelle** des résultats',
                inline: false
            },
            {
                name: '🚫 Comportements interdits',
                value: '• **Insultes ou harcèlement** envers d\'autres joueurs\n• **Déclarations de résultats fausses**\n• **Abandon volontaire** de matchs en cours\n• **Utilisation de plusieurs comptes** (multi-accounting)',
                inline: false
            },
            {
                name: '⚠️ Sanctions possibles',
                value: '• **Avertissement** pour manquements mineurs\n• **Exclusion temporaire** du festival en cours\n• **Bannissement définitif** pour les cas graves\n• **Annulation de matchs** en cas de triche avérée',
                inline: false
            }
        )
        .addFields({
            name: '🆘 En cas de problème',
            value: '• **Problème technique** : Contactez immédiatement un administrateur\n• **Conflit de résultat** : Fournissez des preuves (screenshots)\n• **Comportement toxique** : Signalez via message privé aux admins\n• **Bug du bot** : Reportez dans le canal dédié',
            inline: false
        });

    await interaction.reply({
        embeds: [embed],
        ephemeral: true
    });
}