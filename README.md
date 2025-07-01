# 🎮 Splatoon 3 Festival Bot

Un bot Discord avancé pour organiser et gérer des festivals Splatoon 3 avec système de matchmaking intelligent, gestion d'équipes automatisée et génération de BO3 pondérée.

## ✨ Fonctionnalités principales

### 🏕️ Gestion des festivals
- **Création de festivals** avec 3 camps personnalisables
- **Programmation automatique** avec activation/désactivation temporisée  
- **Annonces automatiques** de début, milieu et fin de festival
- **Modes de jeu configurables** (Défense de Zone, Clam Blitz, Tour Control, etc.)
- **Gestion du temps** avec fuseaux horaires

### 👥 Système d'équipes avancé
- **Création d'équipes** avec capitaines et membres (jusqu'à 4 joueurs)
- **Équipes ouvertes/fermées** avec codes d'accès optionnels
- **Salons Discord privés** créés automatiquement pour chaque équipe
- **Rôles Discord** automatiques (Team Leader, camps)
- **Gestion des membres** (ajout/suppression/transfert de leadership)

### 🎯 Matchmaking intelligent
- **Algorithme de scoring sophistiqué** basé sur l'historique des matchs
- **Évitement des rematches** récents pour plus de diversité
- **Temps d'attente adaptatifs** (seuils à 1min, 2min+)
- **Bonus inter-camps** pour encourager les affrontements entre camps différents
- **Recherche automatique** d'adversaires compatibles
- **Système de verrouillage** pour éviter les conflits concurrentiels

### 🎲 Génération de BO3 pondérée
- **Maps et modes** générés selon les probabilités historiques
- **Évitement des répétitions** dans une même session
- **Système de bannissement** de maps par mode
- **Équilibrage automatique** pour éviter les maps favorites
- **Données intégrées** des maps Splatoon 3 officielles

### 📊 Suivi des scores et historique
- **Système de points** automatique selon les résultats
- **Multiplicateurs dynamiques** pour l'équilibrage
- **Confirmation mutuelle** des résultats entre équipes
- **Historique persistant** de tous les matchs joués
- **Nettoyage automatique** en fin de festival

### 🗳️ Système de votes
- **Vote individuel** pour les camps du festival
- **Restriction à un vote** par utilisateur Discord
- **Statistiques en temps réel** des votes par camp

## 🚀 Installation

### Prérequis
- **Node.js** 16.9.0 ou supérieur
- **Discord Bot** configuré avec les permissions appropriées
- **Serveur Discord** avec permissions administrateur pour le bot

### 1. Installation
```bash
# Cloner le repository
git clone https://github.com/votre-username/splatoon3-festival-bot.git
cd splatoon3-festival-bot

# Installer les dépendances
npm install
```

### 2. Configuration
Créez un fichier `.env` à la racine du projet :
```env
BOT_TOKEN=votre_token_discord_bot
CLIENT_ID=id_application_discord
```

### 3. Déploiement et démarrage
```bash
# Déployer les commandes slash
node src/deploy-commands.js

# Démarrer le bot
npm start
```

## 📋 Commandes disponibles

### 👑 Administration (Permissions Administrateur)
- `/start-festival` - Créer un nouveau festival avec tous les paramètres
- `/end-festival` - Terminer le festival actuel proprement
- `/reset-system` - Réinitialisation complète du système
- `/config` - Configuration avancée du bot
- `/force-cleanup` - Nettoyage forcé des données

### 🏕️ Participation utilisateurs
- `/vote` - Voter pour un camp du festival
- `/create-team` - Créer une nouvelle équipe
- `/join-team` - Rejoindre une équipe existante
- `/leave-team` - Quitter son équipe actuelle
- `/my-team` - Voir les informations de son équipe
- `/kick-member` - Exclure un membre (capitaine uniquement)

### ⚔️ Matchmaking et matchs
- `/search-match` - Lancer la recherche d'adversaire
- `/results` - Déclarer les résultats d'un match terminé
- `/current-festival` - Voir le festival actuel et ses statistiques
- `/teams-list` - Lister toutes les équipes inscrites
- `/view-scores` - Voir les scores actuels par camp

### 📊 Informations et debug
- `/documentation` - Guide complet d'utilisation
- `/debug-matchmaking` - Analyser l'état du système de matchmaking
- `/debug-team-scores` - Voir les scores de pondération d'une équipe
- `/map-stats` - Statistiques des maps jouées

### 🧪 Tests et développement (Admin uniquement)
- `/test-mode` - Créer des équipes virtuelles pour tests
- `/test-matchmaking-advanced` - Tests avancés avec métriques détaillées
- `/test-matchmaking-waves` - Tests de charge par vagues synchronisées
- `/analyze-wait-time-effectiveness` - Analyser l'efficacité des temps d'attente
- `/analyze-matchmaking-patterns` - Analyser les patterns de compatibilité

## 🏗️ Architecture technique

```
src/
├── commands/                 # Commandes slash Discord
│   ├── analyze-*.js         # Commandes d'analyse
│   ├── create-*.js          # Commandes de création
│   ├── debug-*.js           # Commandes de debug
│   ├── test-*.js            # Commandes de test
│   └── user commands/       # Commandes utilisateur
├── events/                  # Gestionnaires d'événements Discord
│   ├── interactionCreate.js # Gestion des interactions
│   └── ready.js            # Événement de démarrage
├── models/                  # Modèles de données
│   ├── Festival.js         # Modèle de festival
│   ├── Team.js             # Modèle d'équipe
│   ├── Match.js            # Modèle de match
│   └── Vote.js             # Modèle de vote
├── utils/                   # Utilitaires et gestionnaires
│   ├── matchSearch.js      # Système de matchmaking intelligent
│   ├── teamManager.js      # Gestion complète des équipes
│   ├── festivalManager.js  # Gestion des festivals
│   ├── scoreTracker.js     # Suivi des scores et historique
│   ├── bo3Generator.js     # Génération pondérée des BO3
│   ├── matchHistoryManager.js # Gestion persistante de l'historique
│   └── database.js         # Utilitaires de base de données
├── data/                    # Données persistantes (JSON)
│   ├── config.json         # Configuration du bot
│   ├── festivals.json      # Données des festivals
│   ├── teams.json          # Données des équipes
│   ├── scores.json         # Scores et historique
│   ├── matchHistory.json   # Historique des matchs
│   └── mapsAndModes.js     # Données maps/modes Splatoon 3
└── index.js                # Point d'entrée principal
```

## 🔧 Fonctionnalités avancées

### Algorithme de matchmaking
Le système utilise un score composite sophistiqué :
- **Score de base** : 100 points
- **Bonus inter-camps** : +50 points si camps différents
- **Bonus temps d'attente** : +2 points par minute (max +20)
- **Pénalités rematches** : -80 pts (dernier match), -50 pts (avant-dernier), -20 pts (3-5 matchs)
- **Seuils adaptatifs** : Critères assouplis après 1min puis 2min d'attente

### Génération de BO3 intelligente
- **Probabilités individuelles** par équipe et map basées sur l'historique
- **Évitement répétitions** dans la session active
- **Maps bannies** exclues automatiquement par mode
- **Équilibrage** pour éviter les maps trop favorisées

### Système de tests intégré
- **Équipes virtuelles** pour simulation de charge
- **Métriques temps réel** du matchmaking avec 7 scenarios de temps
- **Analyse d'efficacité** des algorithmes de matching
- **Tests de régression** avec vagues synchronisées
- **Simulation automatique** de résultats

## 📊 Métriques et monitoring

Le bot collecte automatiquement :
- **Taux de matching** : Pourcentage de recherches abouties par seuil temporel
- **Temps d'attente moyens** par équipe et scenario
- **Distribution des scores** de compatibilité (Excellent/Bon/OK/Faible)
- **Diversité des matchs** (évitement rematches, ratio inter/intra-camps)
- **Performance système** (erreurs, verrouillages, latence)

### Rapports disponibles
- **Analyse statique** : Efficacité théorique sur 2000 échantillons
- **Tests dynamiques** : Métriques temps réel avec simulation
- **Patterns de matching** : Matrix de compatibilité entre équipes
- **Recommandations** : Optimisations basées sur les données

## 🔒 Sécurité et robustesse

### Gestion des conflits
- **Système de verrouillage** pour éviter les conditions de course
- **Transactions atomiques** pour les opérations critiques
- **Vérification d'état** avant chaque opération
- **Récupération automatique** en cas d'incohérence

### Nettoyage automatique
- **Réinitialisation complète** en fin de festival
- **Suppression des rôles** et salons Discord
- **Nettoyage des données** temporaires
- **Vérification d'intégrité** au démarrage

## 📈 Statistiques de performance

**Tests de charge** (16 équipes virtuelles, 20 minutes) :
- **Matchs simultanés** : Jusqu'à 8 matchs en parallèle
- **Temps de recherche** : Moyenne <3 secondes
- **Taux de succès** : >95% dans conditions normales
- **Diversité** : <5% de rematches sur 50+ matchs

## 🤝 Contribution

Les contributions sont bienvenues ! Pour contribuer :

1. **Fork** le repository
2. Créez une **branche feature** (`git checkout -b feature/nouvelle-fonctionnalite`)
3. **Committez** vos changements (`git commit -m 'feat: description'`)
4. **Testez** avec `/test-mode` et `/test-matchmaking-advanced`
5. **Push** et ouvrez une **Pull Request**

### Guidelines de développement
- **Testez** vos modifications avec les commandes de test intégrées
- **Commentez** la logique complexe (surtout matchmaking)
- **Utilisez** le système de verrouillage pour les opérations critiques
- **Respectez** la structure modulaire existante

## 📞 Support et bugs

- **Documentation complète** : Utilisez `/documentation` dans Discord
- **Issues GitHub** : Pour bugs et demandes de fonctionnalités
- **Tests intégrés** : Utilisez `/debug-*` pour diagnostiquer les problèmes

## 📜 Licence

Ce projet est sous licence **MIT**. Voir le fichier `LICENSE` pour plus de détails.

---

**Développé avec ❤️ pour la communauté Splatoon 3**