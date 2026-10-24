import { create } from 'zustand';

import {
  requestDurableStorage,
  storageUsage,
  type StorageDurability,
} from '@services/db/persistence';

export interface StorageState {
  /** Undefined until the browser has been asked. */
  durability?: StorageDurability | undefined;
  /** Bytes this origin holds, where the browser will say. */
  bytes?: number | undefined;
  /** Set while the notice is hidden for this visit. */
  noticeDismissed: boolean;

  /** Asks the browser to keep the data and records what it decided. */
  ensureDurable: () => Promise<void>;
  /** Re-reads the figures without asking for anything. */
  refresh: () => Promise<void>;
  dismissNotice: () => void;
}

/**
 * What the browser promises about the data this application stores.
 *
 * Kept out of the settings store on purpose: this is not a preference. It is
 * the browser's answer to a request, and the user can only be told about it —
 * which is the whole reason it is held somewhere the interface can read.
 *
 * Deliberately not persisted either. The answer can change between visits, and
 * a remembered "yes" would reassure somebody whose data is no longer safe.
 */
export const useStorageStore = create<StorageState>()((set) => ({
  noticeDismissed: false,

  ensureDurable: async () => {
    const durability = await requestDurableStorage();
    const { bytes } = await storageUsage();
    set({ durability, bytes });
  },

  refresh: async () => {
    const { durability, bytes } = await storageUsage();
    set({ durability, bytes });
  },

  /**
   * Hides the notice for this visit only. It is held in memory rather than
   * written down, so it comes back on the next load — data that can vanish
   * without warning is not something to be allowed to silence for good.
   */
  dismissNotice: () => {
    set({ noticeDismissed: true });
  },
}));
