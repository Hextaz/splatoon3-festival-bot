# Oracle Cloud Always Free - Déploiement Bot Discord

## Variables d'environnement requises

```bash
# Discord
export BOT_TOKEN="votre_bot_token_discord"
export CLIENT_ID="votre_client_id"

# Base de données (MongoDB Atlas recommandé)
export DATABASE_URL="mongodb+srv://user:password@cluster.mongodb.net/splatoon3-bot"
export MONGODB_URI="mongodb+srv://user:password@cluster.mongodb.net/splatoon3-bot"

# Configuration serveur Discord
export ALLOWED_GUILD_ID="832335212419219506"

# Oracle Cloud (optionnel)
export NODE_ENV="production"
export PORT="3000"
```

## Commandes de déploiement

```bash
# 1. Mise à jour système
sudo dnf update -y

# 2. Installation Node.js
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
sudo dnf install -y nodejs

# 3. Installation PM2 (gestionnaire de processus)
sudo npm install -g pm2

# 4. Clone du repository
git clone https://github.com/votre-username/splatoon3-festival-bot.git
cd splatoon3-festival-bot

# 5. Installation des dépendances
npm install

# 6. Configuration des variables d'environnement
# Créer le fichier .env avec les bonnes valeurs

# 7. Démarrage avec PM2
pm2 start src/index.js --name "splatoon-bot"
pm2 startup
pm2 save
```

## Configuration Firewall Oracle Cloud

```bash
# Ouvrir le port 3000 pour le Health Server
sudo firewall-cmd --permanent --add-port=3000/tcp
sudo firewall-cmd --reload
```
