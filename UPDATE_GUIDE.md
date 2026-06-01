# Prise en compte des mise à jour du code

Lors du développement de l'application, des mises à jour régulières seront disponibles avec des résolutions de bugs ou des nouvelles fonctionnalités, voici la démarche pour les récupérer:

1. Aller dans le dossier où est le code source de l'application (nommé `telemetryDisplay`) et assurez vous qu'aucune instance de l'application n'est ouverte.
2. Clic droit dans la fenêtre et faites `Open Git Bash here`.
3. Assurez vous d'avoir une connexion internet.
4. Tapez dans le terminal ouvert les commandes suivantes, {nom de la branche} est indiquée dans le message de push:
```bash
git fetch
git checkout {nom de la branche}
git pull
```
5. Relancez l'application avec le script `Map Replay.sh`

**Si besoin** de mettre à jour les bibliothèques Python, depuis `telemetryDisplay` dans un terminal **Git Bash**:

```bash
source .venv/Scripts/activate
python -m pip install -r requirements.txt
deactivate
```

**Si besoin** de mettre à jours les dépendances Node, depuis `telemetryDisplay` dans un terminal **Git Bash**:

```bash
npm install
cd frontend
npm install
cd ..
```