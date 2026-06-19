/**
 * ConfigManager - Stockage centralisé de la configuration et gestion de l'état
 *
 * Classe Singleton qui gère toutes les configurations de l'application :
 * - Persistance dans le localStorage avec accès par notation par point
 * - Gère le store Zustand pour l'état d'exécution
 * - Fournit un modèle d'abonnés (subscribers) pour les mises à jour réactives
 * - Supporte la synchronisation entre onglets via StorageEvent
 *
 * Utilisation :
 * const layouts = ConfigManager.get('layouts');
 * ConfigManager.set('math-channels', [...]);
 * const unsubscribe = ConfigManager.subscribe('layouts', (newValue) => {...});
 */

import * as TOML from "smol-toml";

import {
  CONFIG_DEFAULTS,
  type ConfigStorage,
  type ImportSelection,
  type ParsedTomlData,
  getNestedValue,
  isValidConfigKey,
  setNestedValue,
} from "../types/ConfigTypes";
import type { BreakpointObject, CartoObject } from "../types";

type SubscriberCallback<T = unknown> = (newValue: T) => void;
type Subscribers = Map<string, Set<SubscriberCallback>>;

const STORAGE_PREFIX = "telemetry-display.config";

/**
 * ConfigManager Singleton - gestion unifiée de la configuration
 */
class ConfigManagerClass {
  private storage: ConfigStorage;
  private subscribers: Subscribers = new Map();
  private storageEventListener: ((e: StorageEvent) => void) | null = null;

  constructor() {
    this.storage = this.loadFromLocalStorage();
    this.setupStorageEventListener();
  }

  /**
   * Charge toutes les configurations depuis le localStorage
   */
  private loadFromLocalStorage(): ConfigStorage {
    if (typeof window === "undefined") {
      return CONFIG_DEFAULTS;
    }

    const result: Partial<ConfigStorage> = {};

    for (const key of Object.keys(CONFIG_DEFAULTS) as Array<keyof ConfigStorage>) {
      const storageKey = `${STORAGE_PREFIX}.${key}`;
      try {
        const raw = window.localStorage.getItem(storageKey);
        if (raw) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (result as any)[key] = JSON.parse(raw);
        } else {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (result as any)[key] = CONFIG_DEFAULTS[key];
        }
      } catch (error) {
        console.error(`Échec du chargement de la configuration ${key}:`, error);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (result as any)[key] = CONFIG_DEFAULTS[key];
      }
    }

    return result as ConfigStorage;
  }

  /**
   * Sauvegarde une configuration spécifique dans le localStorage
   */
  private saveToLocalStorage<K extends keyof ConfigStorage>(key: K, value: ConfigStorage[K]): void {
    if (typeof window === "undefined") {
      return;
    }

    try {
      const storageKey = `${STORAGE_PREFIX}.${key}`;
      window.localStorage.setItem(storageKey, JSON.stringify(value));
    } catch (error) {
      console.error(`Échec de la sauvegarde de la configuration ${key}:`, error);
    }
  }

  /**
   * Configure l'écouteur pour la synchronisation entre les onglets
   */
  private setupStorageEventListener(): void {
    if (typeof window === "undefined") {
      return;
    }

    this.storageEventListener = (event: StorageEvent) => {
      // Ne traite que les événements de nos clés de configuration
      if (!event.key || !event.key.startsWith(STORAGE_PREFIX)) {
        return;
      }

      const key = event.key.replace(`${STORAGE_PREFIX}.`, "");
      if (!isValidConfigKey(key)) {
        return;
      }

      try {
        let newValue: unknown;
        if (event.newValue) {
          newValue = JSON.parse(event.newValue);
        } else {
          newValue = CONFIG_DEFAULTS[key as keyof ConfigStorage];
        }

        // Met à jour le stockage interne
        (this.storage as Record<string, unknown>)[key] = newValue;

        // Notifie les abonnés
        this.notifySubscribers(key, newValue);
      } catch (error) {
        console.error(`Échec du traitement de l'événement de stockage pour ${key}:`, error);
      }
    };

    window.addEventListener("storage", this.storageEventListener);
  }

  /**
   * Récupère une valeur de configuration via la notation par points
   * @example get('layouts') or get('layouts.0.name')
   */
  public get<T = unknown>(path: string): T | undefined {
    const parts = path.split(".");
    const topLevelKey = parts[0];

    if (!isValidConfigKey(topLevelKey)) {
      console.warn(`Clé de configuration invalide : ${topLevelKey}`);
      return undefined;
    }

    if (parts.length === 1) {
      return this.storage[topLevelKey] as T;
    }

    const nestedPath = parts.slice(1).join(".");
    return getNestedValue<T>(this.storage[topLevelKey], nestedPath);
  }

  /**
   * Définit une valeur de configuration via la notation par points
   * Met à jour le stockage interne et le localStorage
   * @example set('layouts', [...]) or set('layouts.0.name', 'New Name')
   */
  public set<T = unknown>(path: string, value: T): void {
    const parts = path.split(".");
    const topLevelKey = parts[0];

    if (!isValidConfigKey(topLevelKey)) {
      throw new Error(`Clé de configuration invalide : ${topLevelKey}`);
    }

    if (parts.length === 1) {
      // Définition d'une clé de premier niveau
      const storedValue = value as ConfigStorage[typeof topLevelKey];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (this.storage as any)[topLevelKey] = storedValue;
      this.saveToLocalStorage(topLevelKey, storedValue);
      this.notifySubscribers(path, value);
    } else {
      // Définition d'une valeur imbriquée
      const nestedPath = parts.slice(1).join(".");
      const updated = setNestedValue(
        this.storage[topLevelKey] as Record<string, unknown>,
        nestedPath,
        value
      );
      const storedValue = updated as ConfigStorage[typeof topLevelKey];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (this.storage as any)[topLevelKey] = storedValue;
      this.saveToLocalStorage(topLevelKey, storedValue);
      this.notifySubscribers(path, value);
    }
  }

  /**
   * S'abonne aux changements d'une valeur de configuration
   * Retourne une fonction de désabonnement
   * @example
   * const unsubscribe = ConfigManager.subscribe('layouts', (newValue) => {
   * console.log('Layouts changed:', newValue);
   * });
   * unsubscribe(); // arrête l'écoute
   */
  public subscribe<T = unknown>(path: string, callback: SubscriberCallback<T>): () => void {
    if (!this.subscribers.has(path)) {
      this.subscribers.set(path, new Set());
    }

    this.subscribers.get(path)!.add(callback as SubscriberCallback);

    return () => {
      this.subscribers.get(path)?.delete(callback as SubscriberCallback);
      if (this.subscribers.get(path)?.size === 0) {
        this.subscribers.delete(path);
      }
    };
  }

  /**
   * S'abonne avec un délai (debounce) - empêche les doubles actions sur des mises à jour rapides
   * Idéal pour les opérations coûteuses (appels API, recalculs)
   * @param path Clé de configuration à surveiller
   * @param callback Fonction à appeler quand la valeur change
   * @param debounceMs Délai avant d'appeler le callback (défaut 100ms)
   * @returns Fonction de désabonnement
   * * @example
   * ConfigManager.subscribeDebouncedFull(
   * 'math-channels',
   * (newValue) => recalculateAll(newValue),
   * 200
   * );
   */
  public subscribeDebouncedFull<T = unknown>(
    path: string,
    callback: (value: T) => void,
    debounceMs: number = 100
  ): () => void {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let lastValue: unknown = this.get(path);

    const wrappedCallback: SubscriberCallback<T> = (newValue: T) => {
      // Ignorer si la valeur n'a pas réellement changé
      if (JSON.stringify(newValue) === JSON.stringify(lastValue)) {
        return;
      }
      lastValue = newValue;

      // Effacer l'appel en attente
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }

      // Programmer le nouvel appel
      timeoutId = setTimeout(() => {
        callback(newValue);
        timeoutId = null;
      }, debounceMs);
    };

    return this.subscribe(path, wrappedCallback);
  }

  /**
   * Met à jour plusieurs valeurs de configuration de manière atomique
   * Toutes les mises à jour utilisent le même lot, évitant les états intermédiaires
   * @param updates Objet avec les clés de configuration et leurs nouvelles valeurs
   * * @example
   * ConfigManager.setBatch({
   * 'math-channels': newChannels,
   * 'dataset-id': datasetId
   * });
   */
  public setBatch(updates: Partial<ConfigStorage>): void {
    // Valider toutes les clés en premier
    for (const key of Object.keys(updates)) {
      if (!isValidConfigKey(key)) {
        throw new Error(`Clé de configuration invalide : ${key}`);
      }
    }

    // Appliquer toutes les mises à jour
    for (const key of Object.keys(updates) as Array<keyof ConfigStorage>) {
      const value = updates[key];
      if (value !== undefined) {
        const storedValue = value as ConfigStorage[typeof key];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (this.storage as any)[key] = storedValue;
        this.saveToLocalStorage(key, storedValue);
        this.notifySubscribers(key as string, value);
      }
    }
  }

  /**
   * Notifie tous les abonnés pour un chemin de configuration
   */
  private notifySubscribers(path: string, value: unknown): void {
    const callbacks = this.subscribers.get(path);
    if (callbacks) {
      callbacks.forEach((callback) => {
        try {
          callback(value);
        } catch (error) {
          console.error(`Erreur de l'abonné pour ${path}:`, error);
        }
      });
    }

    // Notifie également les abonnés parents (ex: si 'layouts.0' change, notifier les abonnés 'layouts')
    const parts = path.split(".");
    if (parts.length > 1) {
      const parentPath = parts.slice(0, -1).join(".");
      const parentCallbacks = this.subscribers.get(parentPath);
      if (parentCallbacks) {
        const parentValue = this.get(parentPath);
        parentCallbacks.forEach((callback) => {
          try {
            callback(parentValue);
          } catch (error) {
            console.error(`Erreur de l'abonné pour ${parentPath}:`, error);
          }
        });
      }
    }
  }

  /**
   * Récupère toutes les configurations sous forme d'instantané (snapshot)
   * Utile pour la fonctionnalité d'exportation
   */
  public getAllConfig(): ConfigStorage {
    return JSON.parse(JSON.stringify(this.storage));
  }

  /**
   * Efface toutes les configurations et réinitialise aux valeurs par défaut
   */
  public clear(): void {
    if (typeof window === "undefined") {
      return;
    }

    for (const key of Object.keys(CONFIG_DEFAULTS) as Array<keyof ConfigStorage>) {
      const storageKey = `${STORAGE_PREFIX}.${key}`;
      window.localStorage.removeItem(storageKey);
      const defaultValue = CONFIG_DEFAULTS[key] as ConfigStorage[typeof key];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (this.storage as any)[key] = defaultValue;
      this.notifySubscribers(key as string, defaultValue);
    }
  }

  /**
   * Nettoie les écouteurs d'événements (appelé à l'arrêt de l'application si nécessaire)
   */
  public destroy(): void {
    if (this.storageEventListener && typeof window !== "undefined") {
      window.removeEventListener("storage", this.storageEventListener);
    }
  }

  /**
   * Exporte toutes les configurations au format TOML (à l'exclusion de dataset-id)
   */
  public exportToToml(): string {
    const exportData: Record<string, unknown> = {
      _meta: {
        version: "1.0",
        exportDate: new Date().toISOString(),
      },
      session: this.storage.session,
      layouts: this.storage.layouts,
      "math-channels": this.storage["math-channels"],
      "breakpoint-configs": this.storage["breakpoint-configs"],
      "carto-configs": this.storage["carto-configs"],
      "user-preferences": this.storage["user-preferences"],
      "soft-blocks": this.storage["soft-blocks"],
      "signal-colors": this.storage["signal-colors"],
      "teldata-configs": this.storage["teldata-configs"],
    };

    return TOML.stringify(exportData);
  }

  /**
   * Analyse le TOML pour l'aperçu de l'importation sans appliquer de changements
   * Renvoie des données structurées avec des métadonnées pour l'interface d'importation sélective
   */
  public parseTomlForImport(tomlString: string): ParsedTomlData {
    try {
      const parsed = TOML.parse(tomlString) as Record<string, unknown>;

      const layouts = (parsed.layouts as ConfigStorage["layouts"]) || [];
      const mathChannels = (parsed["math-channels"] as ConfigStorage["math-channels"]) || [];
      const breakpoints = (parsed["breakpoint-configs"] as Record<string, BreakpointObject>) || {};
      const cartos = (parsed["carto-configs"] as Record<string, CartoObject>) || {};
      const softBlocks = (parsed["soft-blocks"] as ConfigStorage["soft-blocks"]) || [];
      const signalColors = (parsed["signal-colors"] as ConfigStorage["signal-colors"]) || {};
      const telDataConfigs = (parsed["teldata-configs"] as ConfigStorage["teldata-configs"]) || [];
      const meta = parsed._meta as { version?: string; exportDate?: string } | undefined;

      return {
        layouts: {
          items: layouts,
          count: layouts.length,
        },
        mathChannels: {
          items: mathChannels,
          count: mathChannels.length,
        },
        breakpoints: {
          items: breakpoints,
          keys: Object.keys(breakpoints),
          count: Object.keys(breakpoints).length,
        },
        cartos: {
          items: cartos,
          keys: Object.keys(cartos),
          count: Object.keys(cartos).length,
        },
        softBlocks: {
          items: softBlocks,
          count: softBlocks.length,
        },
        signalColors: {
          items: signalColors,
          count: Object.keys(signalColors).length,
        },
        telDataConfigs: {
          items: telDataConfigs,
          count: telDataConfigs.length,
        },
        meta: {
          version: meta?.version || "1.0",
          exportDate: meta?.exportDate || new Date().toISOString(),
        },
      };
    } catch (error) {
      throw new Error(
        `Échec de l'analyse de la configuration TOML: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Importe les configurations depuis le TOML avec des options sélectives
   * Permet des importations partielles avec les modes de fusion (add) ou de remplacement (replace)
   */
  public importFromTomlPartial(data: ParsedTomlData, selection: ImportSelection): void {
    try {
      // Fonction utilitaire pour fusionner des tableaux en dédupliquant sur une clé
      const mergeArrays = <T extends Record<string, unknown>>(
        existing: T[],
        imported: T[],
        keyField: keyof T = "id" as keyof T
      ): T[] => {
        const existingMap = new Map(existing.map((item) => [item[keyField], item]));
        imported.forEach((item) => {
          existingMap.set(item[keyField], item);
        });
        return Array.from(existingMap.values());
      };

      const updates: Partial<ConfigStorage> = {};

      // Gestion des layouts
      if (selection.layouts?.enabled) {
        const selectedLayouts = selection.layouts.selectedIds
          ? data.layouts.items.filter((l) => selection.layouts?.selectedIds?.includes(l.id))
          : data.layouts.items;

        if (selection.layouts.mode === "replace") {
          updates.layouts = selectedLayouts;
        } else {
          updates.layouts = mergeArrays(this.storage.layouts, selectedLayouts, "id");
        }
      }

      // Gestion des math channels
      if (selection.mathChannels?.enabled) {
        if (selection.mathChannels.mode === "replace") {
          updates["math-channels"] = data.mathChannels.items;
        } else {
          updates["math-channels"] = mergeArrays(
            this.storage["math-channels"],
            data.mathChannels.items,
            "name"
          );
        }
      }

      // Gestion des breakpoints
      if (selection.breakpoints?.enabled) {
        const selectedKeys = selection.breakpoints.selectedKeys && selection.breakpoints.selectedKeys.length > 0
          ? selection.breakpoints.selectedKeys
          : data.breakpoints.keys;
        const selectedConfigs = Object.fromEntries(
          selectedKeys.map((key) => [key, data.breakpoints.items[key]]).filter(([, v]) => v)
        );

        if (selection.breakpoints.mode === "replace") {
          updates["breakpoint-configs"] = selectedConfigs as Record<string, BreakpointObject>;
        } else {
          updates["breakpoint-configs"] = {
            ...this.storage["breakpoint-configs"],
            ...selectedConfigs,
          };
        }
      }

      // Gestion des cartos 2D
      if (selection.cartos?.enabled) {
        const selectedKeys = selection.cartos.selectedKeys && selection.cartos.selectedKeys.length > 0
          ? selection.cartos.selectedKeys
          : data.cartos.keys;
        const selectedConfigs = Object.fromEntries(
          selectedKeys.map((key) => [key, data.cartos.items[key]]).filter(([, v]) => v)
        );

        if (selection.cartos.mode === "replace") {
          updates["carto-configs"] = selectedConfigs as Record<string, CartoObject>;
        } else {
          updates["carto-configs"] = {
            ...this.storage["carto-configs"],
            ...selectedConfigs,
          };
        }
      }

      // Gestion des soft blocks
      if (selection.softBlocks?.enabled) {
        const selectedBlocks = selection.softBlocks.selectedIds && selection.softBlocks.selectedIds.length > 0
          ? data.softBlocks.items.filter((block) => selection.softBlocks?.selectedIds?.includes(block.id))
          : data.softBlocks.items;

        if (selection.softBlocks.mode === "replace") {
          updates["soft-blocks"] = selectedBlocks;
        } else {
          updates["soft-blocks"] = mergeArrays(
            this.storage["soft-blocks"],
            selectedBlocks,
            "id"
          );
        }
      }

      // Gestion des signal colors
      if (selection.signalColors?.enabled) {
        if (selection.signalColors.mode === "replace") {
          updates["signal-colors"] = data.signalColors.items;
        } else {
          updates["signal-colors"] = {
            ...this.storage["signal-colors"],
            ...data.signalColors.items,
          };
        }
      }
      
      // Gestion des TelData configs
      if (selection.telDataConfigs?.enabled) {
        const selectedConfigs = selection.telDataConfigs.selectedIds && selection.telDataConfigs.selectedIds.length > 0
          ? data.telDataConfigs.items.filter((c) => selection.telDataConfigs?.selectedIds?.includes(c.id))
          : data.telDataConfigs.items;

        if (selection.telDataConfigs.mode === "replace") {
          updates["teldata-configs"] = selectedConfigs;
        } else {
          updates["teldata-configs"] = mergeArrays(
            this.storage["teldata-configs"],
            selectedConfigs,
            "id"
          );
        }
      }

      // Appliquer toutes les mises à jour
      for (const [key, value] of Object.entries(updates)) {
        if (value !== undefined) {
          const storageKey = key as keyof ConfigStorage;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (this.storage as any)[storageKey] = value;
          this.saveToLocalStorage(storageKey, value as ConfigStorage[typeof storageKey]);
          this.notifySubscribers(key, value);
        }
      }
    } catch (error) {
      throw new Error(
        `Échec de l'importation de la configuration TOML: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Importe les configurations depuis le format TOML (remplace toutes les configs existantes)
   */
  public importFromToml(tomlString: string): void {
    try {
      const parsed = TOML.parse(tomlString) as Record<string, unknown>;

      // Extrait les configurations, en ignorant _meta
      const configsToImport: Partial<ConfigStorage> = {
        session: (parsed.session as ConfigStorage["session"]) || this.storage.session,
        layouts: (parsed.layouts as ConfigStorage["layouts"]) || this.storage.layouts,
        "math-channels": (parsed["math-channels"] as ConfigStorage["math-channels"]) || this.storage["math-channels"],
        "breakpoint-configs": (parsed["breakpoint-configs"] as ConfigStorage["breakpoint-configs"]) || this.storage["breakpoint-configs"],
        "carto-configs": (parsed["carto-configs"] as ConfigStorage["carto-configs"]) || this.storage["carto-configs"],
        "user-preferences": (parsed["user-preferences"] as ConfigStorage["user-preferences"]) || this.storage["user-preferences"],
        "soft-blocks": (parsed["soft-blocks"] as ConfigStorage["soft-blocks"]) || this.storage["soft-blocks"],
        "signal-colors": (parsed["signal-colors"] as ConfigStorage["signal-colors"]) || this.storage["signal-colors"],
        "dataset-id": this.storage["dataset-id"], // Garde le dataset actuel
      };

      // Remplace toutes les configurations (sauf dataset-id qui reste inchangé)
      for (const key of Object.keys(configsToImport) as Array<keyof ConfigStorage>) {
        if (key === "dataset-id") continue; // Ne pas écraser le dataset

        const value = configsToImport[key];
        if (value !== undefined) {
          const storedValue = value as ConfigStorage[typeof key];
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (this.storage as any)[key] = storedValue;
          this.saveToLocalStorage(key, storedValue);
          this.notifySubscribers(key as string, value);
        }
      }
    } catch (error) {
      throw new Error(`Échec de l'importation de la configuration TOML: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

/**
 * Instance Singleton - exportée en tant qu'API publique
 */
export const ConfigManager = new ConfigManagerClass();

/**
 * Exportation du type pour les scénarios d'injection de dépendances (optionnel)
 */
export type { ConfigManagerClass };