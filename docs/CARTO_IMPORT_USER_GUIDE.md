# Guide d'utilisation : Import de cartos depuis fichiers .m

## 🎯 Objectif

Importer des **breakpoints** (axes d'interpolation) depuis des fichiers .m VCU vers Telemetry Display. Les breakpoints importés sont automatiquement **fusionnés** avec ceux existants par **nom de breakpoint**.

## 📥 Marche à suivre

### Étape 1 : Accéder à MapTuning
- Ouvrir l'onglet **"Map Tuning"** dans l'application

### Étape 2 : Cliquer sur le bouton d'import
- Localiser la barre d'actions en bas du panneau MapTuning
- Cliquer sur le bouton **"📥 Import .m"** (à côté du bouton "Save")

### Étape 3 : Sélectionner le fichier
- Une boîte de dialogue de sélection de fichier s'ouvre
- Sélectionner un fichier `.m` VCU (ex : `VCU320_4200_CHA_26S24_R04_LMA_#94_C514_Race_Run02.m`)

### Étape 4 : Prévisualiser et sélectionner
Une **modal de sélection** s'affiche avec :

```
📊 Import Cartos from .m File

✓ Select All / Deselect All
□ RPMEngine (10 values: 0.00, 1000.00, 2000.00, ...)
☑ TPSPedal (5 values: 0.00, 25.00, 50.00, ...)
☑ LambdaSensor (8 values: 0.80, 0.90, 1.00, ...)
□ MAF_Voltage (15 values: 0.50, 1.50, 2.50, ...)
... et plus

[Cancel] [Import]
```

- **Cocher** les breakpoints à importer
- **Décocher** les breakpoints à ignorer
- Cliquer sur **"Import"**

### Étape 5 : Résumé d'import
Une **modal de résumé** s'affiche :

```
✅ Created: 3 breakpoints
🔄 Updated: 5 breakpoints
📈 Affected: 8 cartos
```

- L'import s'est déroulé correctement ✅
- Les breakpoints sont sauvegardés dans le localStorage
- Les cartos qui référencent ces breakpoints se **recalculent automatiquement**
- La modal se ferme automatiquement après 2 secondes

## 📋 Format attendu du fichier .m

Le fichier doit contenir des **variables MATLAB** avec les suffixes suivants :

```matlab
c.APP_<NOM>_Axis = [val1, val2, val3, ...];
c.APP_<NOM>_XAxis = [val1, val2, val3, ...];
c.APP_<NOM>_YAxis = [val1, val2, val3, ...];
c.APP_<NOM>_Bkp = [val1, val2, val3, ...];
```

### Exemple valide

```matlab
% Header (optionnel)
% Version  11019_4200
% Exported on 19/06/2026

% Breakpoints (axes)
c.APP_NEngineRPM_Axis = ...
 [0, 1000, 2000, 3000, 4000, 5000, 6000];

c.APP_PedalTPS_Axis = ...
 [0.0, 25.0, 50.0, 75.0, 100.0];

% Breakpoints 2D (optionnel)
c.APP_AirTemp_Bkp = ...
 [-10, 0, 10, 20, 30, 40];
```

## 🔄 Logique de fusion (merge)

### Règle 1 : Fusion par nom
- Le système cherche les breakpoints **existants** portant le **même nom**
- Si trouvé : **met à jour les valeurs** du breakpoint existant
- Si non trouvé : **crée un nouveau breakpoint**

### Exemple
**Avant import** (localStorage) :
```
"breakpoint-configs": {
  "APP_NEngineRPM_Axis": { name: "NEngineRPM", values: [0, 1000, 2000, 3000] },
  "APP_PedalTPS_Axis": { name: "PedalTPS", values: [0, 50, 100] }
}
```

**Fichier .m importé** :
```matlab
c.APP_NEngineRPM_Axis = [0, 1000, 2000, 3000, 4000, 5000, 6000];
c.APP_AirTemp_Bkp = [-10, 0, 10, 20, 30, 40];
```

**Après import** (localStorage) :
```
"breakpoint-configs": {
  "APP_NEngineRPM_Axis": { name: "NEngineRPM", values: [0, 1000, 2000, 3000, 4000, 5000, 6000] },  // ✏️ Mis à jour
  "APP_PedalTPS_Axis": { name: "PedalTPS", values: [0, 50, 100] },  // 📌 Inchangé
  "APP_AirTemp_Bkp": { name: "AirTemp", values: [-10, 0, 10, 20, 30, 40] }  // ✨ Créé
}
```

### Règle 2 : Non-destructif
- Les breakpoints **existants** mais **absents du fichier .m** restent inchangés
- Aucune suppression automatique
- Aucune création de cartos (seulement mise à jour des breakpoints)

### Règle 3 : Cartos affectées
- Les cartos qui référencent les breakpoints mis à jour reçoivent **automatiquement** les nouvelles valeurs
- Le système SignalWorkspace détecte le changement et **recalcule les blocs SoftTab**
- Aucune intervention manuelle requise

## ⚠️ Cas particuliers

### Validation échouée
Si le fichier .m contient des **erreurs**, une **modal d'erreur** s'affiche :

```
❌ Breakpoint APP_BadBp: values are not sorted (100 < 50)
❌ Breakpoint APP_EmptyBp: values array is empty
```

→ Corriger le fichier .m et réessayer

### Breakpoints incomplets
Si un breakpoint dans le fichier est incomplet (ex: nom vide, pas de valeurs), il est **ignoré** avec un avertissement.

### Pas de cartos dans .m
Le fichier .m du VCU ne contient généralement que des **breakpoints** (axes). Les **cartos 2D** ne sont pas importées.
- Pour créer des cartos 2D, utiliser le panneau **"Map Tuning"** (cliquer sur la grille)

## 🔗 Intégration avec le reste de l'app

### MapTuning
- Les breakpoints importés apparaissent immédiatement dans les **listes de sélection** (dropdown "Breakpoint X", "Breakpoint Y")

### SoftTab
- Les blocs SoftTab utilisant les breakpoints mis à jour se **recalculent automatiquement**
- Les courbes affichées reflètent les nouvelles valeurs

### Cross-tab sync
- Si vous avez Telemetry Display ouvert dans **2 onglets**, importer dans un onglet met à jour l'autre **automatiquement** (storage event)

## ✅ Checklist après import

- [ ] Modal d'import fermée automatiquement
- [ ] Message de succès affiché
- [ ] Breakpoints visibles dans MapTuning (liste de sélection)
- [ ] Cartos affectées se recalculent (si utilisées dans SoftTab)
- [ ] Cross-tab sync fonctionne (2 onglets = synchronisation)

## ❓ Questions fréquentes

### Q: Puis-je importer plusieurs fichiers .m ?
**R:** Oui. Chaque import **fusionne** les breakpoints. Importer un 2ème fichier met à jour les breakpoints existants et crée les nouveaux.

### Q: Les cartos 2D peuvent-elles être importées ?
**R:** Actuellement, seuls les breakpoints (1D) sont importés. Les cartos 2D doivent être créées manuellement via MapTuning.

### Q: Que se passe-t-il si je change les valeurs d'un breakpoint importé ?
**R:** Les changements sont sauvegardés. Réimporter le même fichier .m mettra à jour les valeurs avec celles du fichier.

### Q: Puis-je exporter mes cartos au format .m ?
**R:** Pas encore. Cette fonctionnalité est prévue pour une version future.

### Q: Comment supprimer un breakpoint importé ?
**R:** Via le panneau MapTuning, section "Breakpoints", cliquer sur l'icône 🗑️ (avec vérification si breakpoint est utilisé par des cartos).

## 📞 Problèmes ?

Si l'import échoue :
1. Vérifier le format du fichier .m (suffix `_Axis`, `_XAxis`, `_YAxis`, `_Bkp`)
2. Vérifier que les valeurs sont triées en ordre croissant
3. Vérifier que les tables `[ ]` ne sont pas vides
4. Consulter le message d'erreur affiché pour plus de détails

---

**Version** : 1.0  
**Dernière mise à jour** : 2026-06-19  
**Adapter** : VCU (TAG à venir)
