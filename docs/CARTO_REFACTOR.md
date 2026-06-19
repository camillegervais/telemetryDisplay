# Refactoring de la gestion des cartos

## Table des matières

1. [Contexte et motivations](#1-contexte-et-motivations)
2. [Nouveaux modèles de données](#2-nouveaux-modèles-de-données)
3. [Impact sur les composants existants](#3-impact-sur-les-composants-existants)
4. [Nouvelles fonctionnalités](#4-nouvelles-fonctionnalités)
5. [Architecture de l'import / export .m](#5-architecture-de-limport--export-m)
6. [Plan de migration](#6-plan-de-migration)
7. [Risques et points de vigilance](#7-risques-et-points-de-vigilance)

---

## 1. Contexte et motivations

### Situation actuelle

Chaque carto (`MapTuningData`) est un objet auto-suffisant qui contient :

```typescript
// AVANT
export type MapTuningData = {
  inputChannelX: string;       // channel d'entrée axe X
  inputChannelY: string;       // channel d'entrée axe Y
  outputChannelName: string;
  gridData: number[][];        // table de valeurs
  rowHeaders: number[];        // breakpoints axe X  ← embarqués dans la carto
  colHeaders: number[];        // breakpoints axe Y  ← embarqués dans la carto
  braking_signal: boolean;
  gainVal: number;
  offsetVal: number;
  interpolation: "floor" | "nearest" | "linear" | "round";
  extrapolation: "clamp" | "linear";
};
```

Et dans `SoftTab`, une opération carto ne référence que la clé de la carto :

```typescript
// AVANT
export type SoftLutOp = {
  id: string;
  kind: "lut2d";
  name: string;
  mapConfigKey: string;   // → map-configs[key] qui contient TOUT
};
```

### Problèmes identifiés

| Problème | Conséquence |
|----------|-------------|
| Les channels d'entrée sont couplés à la carto | Impossible de réutiliser une même carto avec deux signaux d'entrée différents |
| Les breakpoints sont internes à la carto | Pas de partage possible entre cartos, contrairement à TeamDB |
| Format incompatible avec TeamDB | Import / export .m nécessite une reformulation complète |
| Pas d'import / export .m pour les cartos | Désynchronisation potentielle entre l'outil et les valeurs réelles embarquées |

---

## 2. Nouveaux modèles de données

### 2.1 Objet `Breakpoint`

Les breakpoints deviennent des objets indépendants, identifiés par une clé unique.

```typescript
// NOUVEAU
export type BreakpointObject = {
  name: string;           // Identifiant humain (ex : "BP_N_Engine", "BP_TPS")
  values: number[];       // Valeurs triées croissantes
  unit?: string;          // Unité optionnelle (ex : "rpm", "%")
  description?: string;   // Description libre
};

// Stockage : ConfigManager key "breakpoint-configs"
// Record<string, BreakpointObject>  →  { "BP_N_Engine": { name: ..., values: [...] }, ... }
```

### 2.2 Objet `Carto`

La carto ne contient plus les breakpoints ni les channels d'entrée, mais des **références** aux objets breakpoints.

```typescript
// NOUVEAU
export type CartoObject = {
  name: string;
  breakpointKeyX: string;         // Clé vers un BreakpointObject (axe X / lignes)
  breakpointKeyY?: string;        // Clé vers un BreakpointObject (axe Y / colonnes) — absent si carto 1D
  gridData: number[][];           // Table de valeurs [lignes × colonnes]
  gainVal: number;
  offsetVal: number;
  interpolation: "floor" | "nearest" | "linear" | "round";
  extrapolation: "clamp" | "linear";
  braking_signal: boolean;
  // Channels indicatifs pour la visualisation uniquement (pas utilisés pour le calcul)
  defaultInputChannelX?: string;
  defaultInputChannelY?: string;
};

// Stockage : ConfigManager key "carto-configs"
// Record<string, CartoObject>
```

> **Règle de cohérence** : `gridData.length` doit être égal à `breakpointKeyX.values.length` et `gridData[0].length` doit être égal à `breakpointKeyY.values.length` (ou `1` si carto 1D).

### 2.3 Objet `SoftLutOp` (bloc SoftTab)

L'opération carto dans un bloc logiciel déclare explicitement les channels utilisés pour l'interpolation.

```typescript
// NOUVEAU
export type SoftLutOp = {
  id: string;
  kind: "lut2d";
  name: string;                   // Nom du signal de sortie produit
  cartoKey: string;               // Référence vers carto-configs[key]
  inputChannelX: string;          // Channel utilisé pour interpoler sur l'axe X (calcul réel)
  inputChannelY?: string;         // Channel utilisé pour interpoler sur l'axe Y (calcul réel)
};
```

> Les channels renseignés ici sont ceux qui pilotent effectivement le calcul. Ils peuvent être un signal du dataset de base (catégorie `Dataset`) ou un signal calculé en amont dans le même bloc (opération précédente).

### 2.4 Récapitulatif du stockage localStorage

| Clé ConfigManager | Ancienne valeur | Nouvelle valeur |
|---|---|---|
| `map-configs` | `Record<string, MapTuningData>` | **supprimée** (remplacée par les deux clés ci-dessous) |
| `carto-configs` | *(nouveau)* | `Record<string, CartoObject>` |
| `breakpoint-configs` | *(nouveau)* | `Record<string, BreakpointObject>` |
| `soft-blocks` | `SoftLutOp` avec `mapConfigKey` | `SoftLutOp` avec `cartoKey` + `inputChannelX/Y` |

---

## 3. Impact sur les composants existants

### 3.1 `MapTuning.tsx` → restructuration en deux sections

#### Section A — Gestionnaire de breakpoints

Une nouvelle sous-section (panneau ou accordéon) permet de gérer les objets breakpoints indépendamment :

- **Liste** de tous les breakpoints existants avec leur nom, nombre de valeurs et unité
- **Créer** un nouveau breakpoint (nom + saisie manuelle ou coller depuis Excel)
- **Éditer** les valeurs d'un breakpoint existant (inline ou tableau)
- **Supprimer** un breakpoint — avec avertissement si celui-ci est référencé par au moins une carto
- **Duplication** d'un breakpoint

> Point de vigilance : lors de la suppression ou de la modification d'un breakpoint, toutes les cartos qui y font référence doivent être signalées (badge ou tooltip listant les cartos impactées).

#### Section B — Gestionnaire de cartos

Reprend l'essentiel de l'interface actuelle avec les adaptations suivantes :

- **Sélection des breakpoints** par des `<select>` référençant les objets breakpoints (plus de saisie libre)
  - À la sélection, les valeurs du breakpoint choisi s'affichent dans les en-têtes de lignes / colonnes de la grille
  - Si la taille du breakpoint est incompatible avec `gridData`, un avertissement est affiché et l'utilisateur peut choisir de réinitialiser la table ou d'annuler
- **Channels indicatifs** (`defaultInputChannelX`, `defaultInputChannelY`) : champs libres ou sélecteur parmi les signaux disponibles, clairement labelisés *"à titre indicatif — visualisation uniquement"*
  - Ces channels activent les fonctionnalités :
    - Highlight de la cellule utilisée lors du survol de la courbe (déjà existant via `useHoverToLutCell`)
    - Statistiques d'utilisation (distribution des breakpoints sur le sLap, déjà existant via `use1DMapUsageStats`)
- La table de valeurs, gain, offset, interpolation et extrapolation restent identiques à l'existant

### 3.2 `SoftTab.tsx` → déclaration des channels dans le bloc

Pour chaque `SoftLutOp` dans un bloc :

- **Sélection de la carto** : `<select>` parmi `carto-configs`
- **Sélection du channel X** : liste des signaux disponibles à ce stade du pipeline (dataset + opérations antérieures du même bloc), avec indication de catégorie (`Dataset` vs `Calculé`)
- **Sélection du channel Y** (si carto 2D) : idem

> Contrainte : un channel utilisé pour une interpolation doit provenir du dataset de base ou d'une opération antérieure du **même bloc** (pas d'un autre bloc, pour garantir la cohérence temporelle du calcul).

#### Impact sur le backend

L'appel `POST /api/datasets/calculate` doit être adapté pour passer les channels depuis `SoftLutOp` plutôt que depuis la carto :

```typescript
// NOUVEAU payload
{
  datasetId: string;
  cartoKey: string;              // clé de la carto (pour récupérer gridData, gain, offset, etc.)
  breakpointKeyX: string;        // envoyé explicitement (valeurs résolues côté front ou back)
  breakpointKeyY?: string;
  inputChannelX: string;         // depuis SoftLutOp
  inputChannelY?: string;        // depuis SoftLutOp
  // + gridData, breakpoints résolus, gain, offset, interp, extrap
}
```

Alternativement, le frontend résout lui-même les objets avant d'envoyer la requête et transmet directement `rowHeaders`, `colHeaders`, `gridData`, comme aujourd'hui — ce qui minimise les changements backend.

### 3.3 `ImportPanel.tsx` → pas de changement fonctionnel

- Le panneau affiche toujours toutes les cartos avec leurs contrôles gain / offset
- Il lit désormais `carto-configs` à la place de `map-configs`
- L'API de mise à jour est identique dans la logique (juste le nom de la clé ConfigManager change)

### 3.4 Cross-tab sync — règles impactées

Deux nouvelles clés participent à la synchronisation :

| Clé | Comportement d'écriture | Abonnés |
|-----|------------------------|---------|
| `carto-configs` | Debounce 300 ms (même règle que `map-configs`) | MapTuning, ImportPanel, SoftTab |
| `breakpoint-configs` | Debounce 300 ms | MapTuning, SoftTab |

Le recalcul d'un bloc SoftTab doit être déclenché si **`carto-configs` OU `breakpoint-configs`** change (pas seulement `carto-configs`). La logique de `SignalWorkspace` devra s'abonner aux deux clés pour invalider le cache des signaux calculés.

---

## 4. Nouvelles fonctionnalités

### 4.1 Validation de cohérence breakpoint ↔ carto

À chaque modification d'un breakpoint ou d'une carto, une fonction de validation vérifie :

```
breakpoint[cartoObject.breakpointKeyX].values.length === cartoObject.gridData.length
breakpoint[cartoObject.breakpointKeyY]?.values.length === cartoObject.gridData[0].length
```

En cas d'incohérence : badge d'erreur sur la carto concernée, blocage du calcul SoftTab avec message explicatif.

### 4.2 Channels indicatifs dans MapTuning

Les champs `defaultInputChannelX` / `defaultInputChannelY` de `CartoObject` sont utilisés pour :

- Alimenter `useHoverToLutCell` quand la carto est sélectionnée dans MapTuning (en l'absence d'une déclaration explicite dans un bloc SoftTab)
- Alimenter `use1DMapUsageStats` pour afficher la distribution des cellules utilisées

Ces channels sont **purement indicatifs** et ne participent à aucun calcul.

---

## 5. Architecture de l'import / export .m

### 5.1 Principe de la brique indépendante

L'import et l'export des cartos depuis / vers des fichiers `.m` sont encapsulés dans un module **adapter** isolé, sans dépendance directe aux composants React. Cela permet de remplacer l'adaptateur VCU par un adaptateur TAG sans modifier le reste de l'application.

```
frontend/src/utils/cartoAdapters/
  ├── index.ts                  ← interface commune (importFromM, exportToM)
  ├── vcuAdapter.ts             ← implémentation spécifique VCU
  └── tagAdapter.ts             ← implémentation future TAG
```

#### Interface commune

```typescript
export interface CartoAdapter {
  /**
   * Parse un fichier .m et retourne les cartos et breakpoints trouvés.
   * Ne modifie pas le localStorage — c'est l'appelant qui décide de merger.
   */
  parseM(fileContent: string): {
    breakpoints: Record<string, BreakpointObject>;
    cartos: Record<string, CartoObject>;
  };

  /**
   * Génère le contenu d'un fichier .m à partir des cartos et breakpoints fournis.
   */
  exportToM(
    cartos: Record<string, CartoObject>,
    breakpoints: Record<string, BreakpointObject>
  ): string;
}
```

### 5.2 Logique de merge à l'import

Lors d'un import, la brique adopte une stratégie **merge par nom** :

1. Parcourir les cartos extraites du fichier `.m`
2. Pour chaque carto dont le `name` correspond à une carto existante en localStorage :
   - Mettre à jour `gridData`, `breakpointKeyX`, `breakpointKeyY` (remplacer les valeurs)
   - **Conserver** `gainVal`, `offsetVal`, `interpolation`, `extrapolation`, `defaultInputChannelX/Y` (paramètres applicatif)
3. Pour les breakpoints : même logique (merge par nom, mise à jour des valeurs)
4. Les cartos ou breakpoints présents dans le localStorage mais **absents** du fichier `.m` sont **conservés** (pas de suppression)
5. Les cartos présentes dans le fichier `.m` mais **absentes** du localStorage sont **ignorées** (pas de création automatique) — ou proposées à l'utilisateur selon la préférence UX

[TODO] Logique de merge pour les blocs Evo

### 5.3 Fenêtre modale d'import / export (implémentation différée)

La fenêtre d'import sera similaire à l'import de config TOML existant :

- Drag & drop ou sélection de fichier `.m`
- Prévisualisation des cartos détectées (nom, taille, statut : *connue / inconnue*)
- Sélection des cartos à importer (cases à cocher) (cartos identifiées cochées automatiquement)
- Bouton **Importer** → déclenche le merge
- Bouton **Exporter** → génère et télécharge le fichier `.m` avec les cartos actuelles (même format que import TAG/VCU)

---

## 6. Plan de migration

### Étape 1 — Nouveaux types et stores (sans casser l'existant)

- [ ] Ajouter `BreakpointObject` et `CartoObject` dans `types.ts`
- [ ] Ajouter `breakpoint-configs` et `carto-configs` dans `ConfigTypes.ts`
- [ ] Ajouter `cartoKey`, `inputChannelX`, `inputChannelY` dans `SoftLutOp` (garder `mapConfigKey` temporairement pour compatibilité)

### Étape 2 — Migration des données existantes

- [ ] Écrire une fonction `migrateMapConfigsToCartoSystem()` :
  - Pour chaque `MapTuningData` dans `map-configs` :
    - Créer un `BreakpointObject` pour les `rowHeaders` (nommé `BP_<cartoName>_X`)
    - Créer un `BreakpointObject` pour les `colHeaders` (nommé `BP_<cartoName>_Y`)
    - Créer un `CartoObject` avec références vers ces breakpoints
  - Écrire le résultat dans `carto-configs` et `breakpoint-configs`
  - Conserver `map-configs` jusqu'à validation
- [ ] Appeler cette migration au démarrage si `map-configs` existe et `carto-configs` est absent

### Étape 3 — Mise à jour de MapTuning

- [ ] Section A : panneau de gestion des breakpoints
- [ ] Section B : adaptation de la grille (sélecteurs de breakpoints, channels indicatifs)
- [ ] Validation de cohérence taille

### Étape 4 — Mise à jour de SoftTab

- [ ] Adapter `SoftLutOp` (sélecteur de carto + sélecteurs de channels)
- [ ] Adapter la construction du payload envoyé à `/api/datasets/calculate`
- [ ] Abonnement cross-tab sur `breakpoint-configs` pour invalider le cache

### Étape 5 — Mise à jour de ImportPanel

- [ ] Lire `carto-configs` au lieu de `map-configs`

### Étape 6 — Adaptateur VCU (import / export .m)

- [ ] Implémenter `vcuAdapter.ts` dès réception du format des fichiers `.m`
- [ ] Créer la fenêtre modale d'import / export

### Étape 7 — Nettoyage

- [ ] Supprimer `map-configs` et les anciens types `MapTuningData`
- [ ] Supprimer le champ `mapConfigKey` de `SoftLutOp`

---

## 7. Risques et points de vigilance

### R1 — Incohérence taille breakpoint / carto

**Risque** : lors de l'édition d'un breakpoint partagé entre plusieurs cartos, modifier le nombre de valeurs rend toutes les cartos référencées incohérentes.

**Mitigation** :
- Afficher clairement les cartos impactées avant modification
- Afficher les cartos pour lesquelles les breakpoints ne sont pas de la bonne taille dans la liste des cartos (MapTuning.tsx)

### R2 — Breakpoints partagés à usage multiple

**Risque** : modifier un breakpoint `BP_N_Engine` affecte silencieusement toutes les cartos qui l'utilisent.

**Mitigation** :
- Afficher le nombre de cartos et la liste de celles-ci utilisant le breakpoint dans son en-tête

### R3 — Migration des données localStorage existantes

**Risque** : l'utilisateur a des cartos sauvegardées dans `map-configs` ; la migration automatique peut générer des noms de breakpoints en doublon ou écraser des données.

**Mitigation** :
- La migration est non-destructive (elle ne supprime pas `map-configs`)
- Détecter les doublons de breakpoints par comparaison des valeurs (pas seulement du nom)
- Journaliser les actions de migration pour pouvoir les auditer

### R4 — Cross-tab : abonnement à deux clés

**Risque** : ajouter `breakpoint-configs` comme déclencheur de recalcul peut provoquer des recalculs redondants si les deux clés changent simultanément (import batch).

**Mitigation** :
- Utiliser un debounce commun (300 ms) avec un verrou partagé pour les deux clés
- Regrouper les écritures `carto-configs` + `breakpoint-configs` dans une transaction unique lors d'un import

### R5 — Channels indicatifs confondus avec les channels de calcul

**Risque** : un utilisateur pourrait croire que modifier `defaultInputChannelX` dans MapTuning suffit à changer le channel utilisé dans le calcul SoftTab.

**Mitigation** :
- Labelling clair dans l'UI : *"Channel par défaut (visualisation uniquement)"*
- Dans SoftTab, les channels déclarés dans le bloc prévalent toujours ; les channels indicatifs de la carto ne sont pas utilisés

### R6 — Compatibilité des formats .m VCU vs TAG

**Risque** : implémenter l'adaptateur VCU puis devoir tout réécrire pour TAG si les formats divergent trop.

**Mitigation** :
- L'interface `CartoAdapter` est volontairement minimale (`parseM` / `exportToM`)
- Le reste de l'application ne connaît que cette interface, pas l'implémentation
- L'adaptateur TAG pourra être ajouté sans modifier les composants React

### R7 — Sélection des channels dans SoftTab : cohérence du pipeline

**Risque** : l'utilisateur sélectionne un channel d'une opération *postérieure* du même bloc comme entrée d'une carto, créant une dépendance circulaire.

**Mitigation** :
- La liste des channels disponibles pour une opération est construite dynamiquement à partir des opérations *précédentes* du bloc uniquement (ordre d'affichage = ordre d'exécution)
- Les channels d'autres blocs sont exclus de la liste
