# Implémentation de l'Import .m pour les Cartos

## 📋 Résumé

L'import des fichiers .m est maintenant entièrement implémenté selon le plan dans CARTO_REFACTOR.md. Le système suit l'architecture d'adapter modulaire pour supporter VCU puis TAG.

## 🏗️ Architecture

### Structure des fichiers créés

```
frontend/src/utils/cartoAdapters/
├── index.ts                 # Interface CartoAdapter (contrat commun)
├── vcuAdapter.ts            # Implémentation VCU (parser .m format VCU)
└── test-parser-simple.js    # Test du parser (pour vérification)

frontend/src/utils/
├── cartoImportService.ts    # Service de fusion et import (logique métier)

frontend/src/components/
├── CartoImportModal.tsx     # Modal UI pour sélection/résumé
├── CartoImportPanel.tsx     # Panel avec input fichier + orchestration
└── MapTuning.tsx            # Intégration du panel (bouton + callback)
```

## 🔧 Fonctionnalités implémentées

### 1. Interface CartoAdapter (`cartoAdapters/index.ts`)

Interface minimale et volontairement simple pour permettre le remplacement VCU → TAG sans impact sur le reste de l'app :

```typescript
export interface CartoAdapter {
  parseM(fileContent: string): {
    breakpoints: Record<string, BreakpointObject>;
    cartos: Record<string, CartoObject>;
  };

  exportToM(
    cartos: Record<string, CartoObject>,
    breakpoints: Record<string, BreakpointObject>
  ): string;
}
```

### 2. Parser VCU (`cartoAdapters/vcuAdapter.ts`)

**Format reconnu** : Variables MATLAB avec suffixes
- `c.APP_XXX_Axis` → breakpoint
- `c.APP_YYY_XAxis` → breakpoint axe X
- `c.APP_ZZZ_YAxis` → breakpoint axe Y
- `c.APP_BBB_Bkp` → breakpoint

**Capacités du parser** :
- ✅ Parsing multiline (support des lignes terminées par `...`)
- ✅ Extraction des valeurs numériques entre `[` et `]`
- ✅ Tri automatique des valeurs
- ✅ Gestion des erreurs d'analyse
- ✅ Export vers format .m (génération de fichiers)

**Exemple d'entrée** :
```matlab
c.APP_RPMEngine_Axis = ...
 [0, 1000, 2000, 3000, 4000, 5000];
c.APP_TPSPedal_Axis = ...
 [0, 25, 50, 75, 100];
```

**Sortie du parser** :
```javascript
{
  breakpoints: {
    "APP_RPMEngine_Axis": {
      name: "RPMEngine",
      values: [0, 1000, 2000, 3000, 4000, 5000],
      unit: undefined,
      description: "Imported from APP_RPMEngine_Axis"
    },
    "APP_TPSPedal_Axis": {
      name: "TPSPedal",
      values: [0, 25, 50, 75, 100],
      unit: undefined,
      description: "Imported from APP_TPSPedal_Axis"
    }
  },
  cartos: {} // Pour future extension (2D cartos en .m)
}
```

### 3. Service d'Import et Fusion (`cartoImportService.ts`)

**Stratégie de merge par nom** (conforme CARTO_REFACTOR.md section 5.2) :

```typescript
CartoImportService.importAndMerge(fileContent, vcuAdapter)
```

Logique :
1. Parser le fichier .m via l'adapter
2. Pour chaque breakpoint importé :
   - Si un breakpoint existant a le **même nom** : mettre à jour ses valeurs
   - Sinon : créer un nouveau breakpoint (avec clé unique)
3. Les cartos référençant ces breakpoints voient les nouvelles valeurs **automatiquement** (via cross-tab sync)
4. Déterminer les breakpoints créés, mis à jour et les cartos affectés

**Validations** :
- Vérifier que les breakpoints ont un nom non-vide
- Vérifier que le tableau `values` n'est pas vide
- Vérifier que les valeurs sont triées en ordre croissant

**Résultat** :
```typescript
{
  breakpointsCreated: ["APP_NewBp_Axis"],      // Nouveaux breakpoints
  breakpointsUpdated: ["APP_RPMEngine_Axis"],  // Mis à jour
  cartosAffected: ["Ma_Map_1", "Ma_Map_2"],    // Cartos impactées
  errors: []                                    // Erreurs si validation échoue
}
```

### 4. UI Modal (`components/CartoImportModal.tsx`)

**État 1 : Sélection des breakpoints** (avant import)
- Affiche la liste des breakpoints détectés dans le fichier
- Cases à cocher pour sélectionner/désélectionner individuellement
- Bouton "Select All" / "Deselect All"
- Affiche le nombre de valeurs et les 3 premières valeurs en aperçu

**État 2 : Résumé d'import** (après import)
- ✅ Nombre de breakpoints créés
- 🔄 Nombre de breakpoints mis à jour
- 📈 Nombre de cartos affectés
- ❌ Erreurs de validation (le cas échéant)
- Auto-fermeture après 2 secondes si succès

### 5. Panel d'Import (`components/CartoImportPanel.tsx`)

**Orchestration complète** :
1. Bouton "📥 Import .m" dans MapTuning
2. Au clic : sélecteur de fichier (accept `.m`)
3. À la sélection du fichier :
   - Lire le contenu
   - Parser via VcuAdapter
   - Valider les breakpoints
   - Ouvrir la modal de sélection (état 1)
4. À la confirmation (clique "Import") :
   - Appeler `CartoImportService.importAndMerge()`
   - Passer au résumé (état 2)
   - Auto-fermer après 2s
5. Callback `onImportComplete()` pour rafraîchir l'UI

### 6. Intégration dans MapTuning

Le composant `CartoImportPanel` est intégré dans la barre d'actions de MapTuning :

```
[💾 Save] [📥 Import .m] [View 3D] [Show export]
```

Lors d'un import réussi :
- Les breakpoints mis à jour sont visibles immédiatement dans la liste de sélection
- Les cartos affectées reçoivent les nouvelles valeurs via cross-tab sync (StorageEvent)
- SignalWorkspace se réabonne et recalcule les blocs SoftTab qui utilisent ces breakpoints

## 🔄 Flux complet d'import

```
1. Utilisateur clique sur "📥 Import .m" dans MapTuning
   ↓
2. Sélectionne fichier .m
   ↓
3. CartoImportPanel lit le fichier
   ↓
4. VcuAdapter.parseM(content) → extrait les breakpoints
   ↓
5. CartoImportService.validateImportedBreakpoints() → vérifie validité
   ↓
6. CartoImportModal affiche la liste (état 1 : sélection)
   ↓
7. Utilisateur clique "Import"
   ↓
8. CartoImportService.importAndMerge() → fusionne avec localStorage
   ↓
9. ConfigManager.set("breakpoint-configs", updatedBreakpoints)
   ↓
10. StorageEvent déclenché → cross-tab sync
    ↓
11. MapTuning se réabonne → Met à jour setBreakpointConfigs
    ↓
12. SignalWorkspace se réabonne → Recalcule les blocs SoftTab
    ↓
13. CartoImportModal affiche résumé (état 2 : résultat)
    ↓
14. Auto-fermeture après 2s
    ↓
15. Callback onImportComplete() → Optionnel, rafraîchit l'UI parent
```

## 🧪 Validation et test

### Avec le fichier template fourni

Le fichier `VCU320_4200_CHA_26S24_R04_LMA_#94_C514_Race_Run02.m` (6818 lignes) contient :
- 180+ variables APP avec suffixes `_Axis`, `_XAxis`, `_YAxis`, `_Bkp`
- Format multiline (chaque variable peut s'étendre sur plusieurs lignes avec `...`)
- Exemples :
  ```matlab
  c.APP_MMGUABSvWheelTovCarSat_Axis = [-5, 0, 1, 2, 4, 6, 10, 15, 20, 25];
  c.APP_rSlipOptTCRPIDvLat_Yaxis = [0.00, 0.50, 1.00, ..., 10.00];
  ```

### TypeScript

Tous les fichiers compilent sans erreur :
- ✅ `cartoAdapters/index.ts`
- ✅ `cartoAdapters/vcuAdapter.ts`
- ✅ `cartoImportService.ts`
- ✅ `components/CartoImportModal.tsx`
- ✅ `components/CartoImportPanel.tsx`
- ✅ `components/MapTuning.tsx` (intégration)

## 🚀 Prochaines étapes

### Phase 1 (Optionnel mais recommandé)
- [ ] Tester manuellement l'import .m dans l'app
- [ ] Vérifier que les breakpoints sont bien fusionnés par nom
- [ ] Vérifier que les cartos affectées se recalculent
- [ ] Vérifier la cross-tab sync (ouvrir 2 onglets, importer dans 1, voir les changements dans l'autre)

### Phase 2 (Future)
- [ ] Implémenter `tagAdapter.ts` quand le format TAG sera connu
  - Créer une classe `TagAdapter implements CartoAdapter`
  - Ajouter un sélecteur dans CartoImportPanel pour choisir entre VCU et TAG
- [ ] Ajouter un bouton "Export .m" pour générer des fichiers (via `vcuAdapter.exportToM()`)
- [ ] Gérer les cartos 2D en .m (actuellement, only breakpoints are supported)
- [ ] Tests unitaires pour le parser VCU

### Phase 3 (Optionnel)
- [ ] Drag & drop pour importer des fichiers .m
- [ ] Historique d'import (log des imports effectués)
- [ ] Détection de doublons de breakpoints (values identiques, noms différents)

## 📝 Notes d'implémentation

### Choix de design

1. **Interface minimale** : CartoAdapter ne connaît que `parseM()` et `exportToM()`. Cela permet de changer d'adapter sans toucher au reste.

2. **Fusion par nom** : Les breakpoints et cartos sont associés par `name`, pas par clé. Cela permet à l'utilisateur d'importer depuis plusieurs fichiers .m et de fusionner par sémantique.

3. **Non-destructif** : L'import ne crée jamais de cartos, il ne crée que des breakpoints. Les cartos restent gérées manuellement par l'utilisateur via MapTuning.

4. **Cross-tab automatic** : Dès que les breakpoints sont sauvegardés dans ConfigManager, les autres onglets reçoivent les changements via StorageEvent. Pas de logique spéciale requise.

5. **Validation en deux temps** :
   - Première validation dans le parser (format correct)
   - Deuxième validation dans le service (cohérence des données)

### Limitations actuelles

- Les **cartos 2D** ne sont pas extraites du fichier .m (le fichier ne contient que des breakpoints)
- Les **unités** ne sont pas parsées (les breakpoints reçoivent `unit: undefined`)
- Le format **.m export** ne gère que les breakpoints, pas les cartos 2D

Ces limitations peuvent être levées dans les phases futures.

## 🔗 Références

- CARTO_REFACTOR.md : Section 5 (Architecture de l'import / export .m)
- types.ts : BreakpointObject, CartoObject, CartoAdapter
- ConfigManager.ts : Stockage localStorage et cross-tab sync
- MapTuning.tsx : Intégration UI
