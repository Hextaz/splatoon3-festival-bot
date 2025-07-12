# Guide déploiement Render.com

## Étapes de déploiement

### 1. Connexion à Render
- Allez sur https://render.com
- Connectez-vous avec GitHub
- Autorisez l'accès à votre repository

### 2. Configuration Web Service
```
Repository: Hextaz/splatoon3-festival-bot
Branch: main
Build Command: npm install
Start Command: node src/index.js
```

### 3. Variables d'environnement
```
BOT_TOKEN=votre_token_discord
CLIENT_ID=votre_client_id  
DATABASE_URL=mongodb+srv://...
MONGODB_URI=mongodb+srv://...
ALLOWED_GUILD_ID=832335212419219506
NODE_ENV=production
PORT=3000
```

### 4. Plan
```
Plan: Free (0$)
✅ 512MB RAM
✅ 750h/mois
✅ Smart Sleep va optimiser cela!
```

## Avantages immédiats avec Smart Sleep

Votre système va économiser ÉNORMÉMENT d'heures :
- 🎯 Keep-alive seulement pendant festivals
- 😴 Sleep automatique quand pas de festival
- 📊 Au lieu de 750h → Probablement 200-400h/mois utilisées
- 💰 Largement suffisant pour vos besoins !

## Migration Oracle plus tard
- ✅ Code déjà prêt
- ✅ Même configuration
- ✅ Migration en 30 minutes quand Oracle disponible
