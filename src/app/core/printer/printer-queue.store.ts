import { Injectable } from '@angular/core';
import { PrinterQueueJob } from './printer.models';

const DATABASE = 'lotowo-printer';
const STORE = 'receipt-queue';

@Injectable({ providedIn: 'root' })
export class PrinterQueueStore {
  async put(job: PrinterQueueJob): Promise<void> {
    const store = await this.store('readwrite');
    await request(store.put(job));
  }

  async all(): Promise<PrinterQueueJob[]> {
    const store = await this.store('readonly');
    const jobs = await request<PrinterQueueJob[]>(store.getAll());
    return jobs.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }

  async remove(id: string): Promise<void> {
    const store = await this.store('readwrite');
    await request(store.delete(id));
  }

  private async store(mode: IDBTransactionMode): Promise<IDBObjectStore> {
    const database = await openDatabase();
    return database.transaction(STORE, mode).objectStore(STORE);
  }
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const opening = indexedDB.open(DATABASE, 1);
    opening.onupgradeneeded = () => {
      if (!opening.result.objectStoreNames.contains(STORE)) {
        opening.result.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    opening.onsuccess = () => resolve(opening.result);
    opening.onerror = () => reject(opening.error);
  });
}

function request<T = undefined>(operation: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    operation.onsuccess = () => resolve(operation.result);
    operation.onerror = () => reject(operation.error);
  });
}
