import type { FeedEntry } from "@miramenu/contracts";
import {
  MAX_KEPT_ENTRIES,
  memoryEntryStore,
  type EntryStore,
} from "@miramenu/diner-core";

const DATABASE = "miramenu";
const VERSION = 1;
const ENTRIES = "feedEntries";
const BY_ENTERED_AT = "enteredAt";

const resultOf = <T>(request: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

const committed = (transaction: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });

function openDatabase(factory: IDBFactory): Promise<IDBDatabase> {
  const request = factory.open(DATABASE, VERSION);
  request.onupgradeneeded = () => {
    request.result
      .createObjectStore(ENTRIES, { keyPath: "entryId" })
      .createIndex(BY_ENTERED_AT, "enteredAt");
  };
  return resultOf(request);
}

/** The entries in the database, oldest first by `enteredAt` (ISO, so it sorts as time). */
function databaseStore(database: IDBDatabase, cap: number): EntryStore {
  return {
    add(entry) {
      const transaction = database.transaction(ENTRIES, "readwrite");
      const entries = transaction.objectStore(ENTRIES);
      entries.put(entry);
      const counting = entries.count();
      counting.onsuccess = () => {
        let excess = counting.result - cap;
        if (excess <= 0) return;
        const oldest = entries.index(BY_ENTERED_AT).openKeyCursor();
        oldest.onsuccess = () => {
          const cursor = oldest.result;
          if (cursor === null || excess <= 0) return;
          entries.delete(cursor.primaryKey);
          excess -= 1;
          cursor.continue();
        };
      };
      return committed(transaction);
    },
    pending(limit) {
      const transaction = database.transaction(ENTRIES, "readonly");
      return resultOf<FeedEntry[]>(
        transaction
          .objectStore(ENTRIES)
          .index(BY_ENTERED_AT)
          .getAll(null, limit),
      );
    },
    remove(entryIds) {
      const transaction = database.transaction(ENTRIES, "readwrite");
      const entries = transaction.objectStore(ENTRIES);
      for (const entryId of entryIds) entries.delete(entryId);
      return committed(transaction);
    },
  };
}

async function openStore(
  factory: () => IDBFactory | undefined,
  cap: number,
): Promise<EntryStore> {
  let database: IDBDatabase;
  try {
    const indexedDb = factory();
    if (indexedDb === undefined) return memoryEntryStore(cap);
    database = await openDatabase(indexedDb);
  } catch {
    // Refused (a private window, blocked storage): the entries live in memory for this
    // visit, and the flush and the beacon still send them.
    return memoryEntryStore(cap);
  }
  // A newer version in another tab needs this connection closed to upgrade.
  database.onversionchange = () => database.close();
  return databaseStore(database, cap);
}

/**
 * The web's EntryStore (ADR-0011, ADR-0024): closed feed entries in IndexedDB, so they
 * survive a lost network and a closed tab. Past `cap` the oldest go, which the API would
 * refuse anyway after 7 days. Opened on first use; without IndexedDB, in memory.
 */
export function indexedDbEntryStore(
  factory: () => IDBFactory | undefined = () => globalThis.indexedDB,
  cap: number = MAX_KEPT_ENTRIES,
): EntryStore {
  let opened: Promise<EntryStore> | null = null;
  const store = () => (opened ??= openStore(factory, cap));
  return {
    add: async (entry) => (await store()).add(entry),
    pending: async (limit) => (await store()).pending(limit),
    remove: async (entryIds) => (await store()).remove(entryIds),
  };
}
