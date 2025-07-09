# Commandes de connexion Oracle Cloud

## 1. Connexion SSH à votre VM
```bash
# Remplacez par votre IP et chemin de clé
ssh -i /path/to/your/private-key opc@YOUR_VM_IP
```

## 2. Configuration initiale
```bash
# Mise à jour système
sudo dnf update -y

# Installation Git
sudo dnf install -y git curl

# Téléchargement du script de déploiement
wget https://raw.githubusercontent.com/votre-username/splatoon3-festival-bot/main/oracle-deploy.sh
chmod +x oracle-deploy.sh

# IMPORTANT: Éditez le script avec votre URL de repository
sed -i 's|votre-username|VOTRE-VRAIE-USERNAME|g' oracle-deploy.sh
```

## 3. Configuration Database (MongoDB Atlas recommandé)
```bash
# Créez un cluster gratuit sur MongoDB Atlas
# https://cloud.mongodb.com/

# String de connexion type:
# mongodb+srv://username:password@cluster0.xxxxx.mongodb.net/splatoon3-bot
```

## 4. Configuration Discord
```bash
# Sur Discord Developer Portal
# https://discord.com/developers/applications

# Récupérez:
# - BOT_TOKEN
# - CLIENT_ID
# - ID de votre serveur Discord
```

## 5. Déploiement
```bash
# Exécution du script de déploiement
./oracle-deploy.sh

# Configuration manuelle du .env
nano splatoon3-festival-bot/.env

# Redémarrage après configuration
cd splatoon3-festival-bot
pm2 restart splatoon-bot
```
