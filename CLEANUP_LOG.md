# Scripts de nettoyage pour production

## Fichiers supprimés lors du nettoyage:
- test-smart-sleep.js (script de test local)
- oracle-capacity-hunter.py (hunter Oracle)
- ORACLE_*.md (documentation Oracle)
- oracle-deploy.sh (script déploiement Oracle)
- Dockerfile (non utilisé pour Render)
- ecosystem.config.json (PM2 config pour Oracle)

## Fichiers conservés:
- src/commands/test-*.js (utiles pour debug en production)
- src/utils/guildDataManager.js (préparé pour multi-serveurs)
- SMART_SLEEP_DOCUMENTATION.md (documentation importante)
- RENDER_DEPLOYMENT.md (guide déploiement)

## Configuration finale:
- Multi-serveurs activé par défaut
- Smart Sleep optimisé pour Render
- Limite: 50 serveurs Discord max
- Données séparées par serveur

## Prêt pour déploiement Render.com ✅
