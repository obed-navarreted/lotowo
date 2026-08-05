import { computed, Injectable, signal } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { buildEscPosReceipt } from './esc-pos-receipt';
import {
  DEFAULT_PRINTER_SETTINGS,
  PrinterConnectionState,
  PrinterDevice,
  PrinterQueueJob,
  PrinterSettings,
} from './printer.models';
import { PrinterQueueStore } from './printer-queue.store';
import { ThermalPrinter } from './thermal-printer.plugin';

const SETTINGS_KEY = 'lotowo.printer-settings.v1';
const RETRY_MS = 3_000;

@Injectable({ providedIn: 'root' })
export class PrinterService {
  private readonly settingsState = signal<PrinterSettings>(DEFAULT_PRINTER_SETTINGS);
  private readonly stateValue = signal<PrinterConnectionState>('DISABLED');
  private readonly messageValue = signal<string | null>(null);
  private readonly queueSizeValue = signal(0);
  private started = false;
  private connecting = false;
  private discovering = false;
  private processing = false;
  private retryTimer: ReturnType<typeof setInterval> | null = null;
  private statusListener: { remove(): Promise<void> } | null = null;

  readonly settings = this.settingsState.asReadonly();
  readonly state = this.stateValue.asReadonly();
  readonly message = this.messageValue.asReadonly();
  readonly queueSize = this.queueSizeValue.asReadonly();
  readonly isNativeAndroid = Capacitor.getPlatform() === 'android';
  readonly connected = computed(() => this.stateValue() === 'CONNECTED');
  readonly directPrintingReady = computed(
    () => this.settingsState().enabled && this.settingsState().deviceId !== null,
  );

  constructor(private readonly queue: PrinterQueueStore) {}

  start(): void {
    if (this.started) return;
    this.started = true;
    this.settingsState.set(restoreSettings(this.settingsKey()));
    void this.refreshQueueSize();
    if (!this.isNativeAndroid) {
      this.updatePassiveState();
      return;
    }
    void ThermalPrinter.addListener('statusChanged', (status) => {
      if (!this.started) return;
      this.stateValue.set(status.connected ? 'CONNECTED' : 'DISCONNECTED');
      this.messageValue.set(status.message ?? null);
      if (status.connected) void this.processQueue();
    }).then((listener) => {
      if (this.started) this.statusListener = listener;
      else void listener.remove();
    });
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) void this.ensureConnected();
    });
    this.retryTimer = setInterval(() => void this.ensureConnected(), RETRY_MS);
    void this.ensureConnected();
  }

  stop(): void {
    if (this.retryTimer) clearInterval(this.retryTimer);
    this.retryTimer = null;
    this.started = false;
    if (this.statusListener) void this.statusListener.remove();
    this.statusListener = null;
    if (this.isNativeAndroid) void ThermalPrinter.disconnect().catch(() => undefined);
    this.stateValue.set('DISABLED');
  }

  async saveSettings(update: Partial<PrinterSettings>): Promise<void> {
    const previous = this.settingsState();
    const next = { ...previous, ...update };
    localStorage.setItem(this.settingsKey(), JSON.stringify(next));
    this.settingsState.set(next);
    this.messageValue.set(null);
    if (!next.enabled) {
      if (this.isNativeAndroid) await ThermalPrinter.disconnect().catch(() => undefined);
      this.stateValue.set('DISABLED');
      return;
    }
    if (previous.deviceId !== next.deviceId && this.isNativeAndroid) {
      await ThermalPrinter.disconnect().catch(() => undefined);
    }
    await this.ensureConnected(true);
  }

  async requestPermissions(): Promise<boolean> {
    if (!this.isNativeAndroid) return false;
    const response = await ThermalPrinter.requestPermissions();
    return response.granted;
  }

  async pairedDevices(): Promise<PrinterDevice[]> {
    if (!this.isNativeAndroid) return [];
    await this.requestPermissions();
    return (await ThermalPrinter.getPairedDevices()).devices;
  }

  async discoverDevices(): Promise<PrinterDevice[]> {
    if (!this.isNativeAndroid) return [];
    await this.requestPermissions();
    this.discovering = true;
    try {
      return (await ThermalPrinter.discoverDevices()).devices;
    } finally {
      this.discovering = false;
    }
  }

  async pair(device: PrinterDevice): Promise<void> {
    if (!this.isNativeAndroid) throw new Error('La conexión directa requiere la app Android.');
    if (!device.bonded) await ThermalPrinter.pair({ deviceId: device.id });
    await this.saveSettings({ deviceId: device.id, deviceName: device.name, enabled: true });
  }

  async testPrint(): Promise<void> {
    if (!(await this.ensureConnected(true)))
      throw new Error('No se pudo conectar con la impresora.');
    const lines = [
      '\x1b@',
      '\x1ba\x01',
      '\x1bE\x01',
      'SUERTE\n',
      '\x1bE\x00',
      'Impresora configurada\n',
      '03/08/2026\n\n\n',
    ];
    await ThermalPrinter.print({ data: toBase64(new TextEncoder().encode(lines.join(''))) });
  }

  async enqueue(job: PrinterQueueJob): Promise<void> {
    await this.queue.put(job);
    await this.refreshQueueSize();
    void this.processQueue();
  }

  async ensureConnected(force = false): Promise<boolean> {
    if (!this.started && !force) return false;
    if (this.discovering && !force) return false;
    const settings = this.settingsState();
    if (!settings.enabled) {
      this.stateValue.set('DISABLED');
      return false;
    }
    if (!settings.deviceId) {
      this.stateValue.set('UNCONFIGURED');
      return false;
    }
    if (!this.isNativeAndroid) {
      this.stateValue.set('UNSUPPORTED');
      return false;
    }
    if (document.hidden && !force) return false;
    if (this.connected()) {
      try {
        const status = await ThermalPrinter.getStatus();
        if (status.connected) return true;
        this.stateValue.set('DISCONNECTED');
      } catch {
        this.stateValue.set('DISCONNECTED');
      }
    }
    if (this.connecting) return false;
    this.connecting = true;
    this.stateValue.set('CONNECTING');
    try {
      const status = await ThermalPrinter.connect({ deviceId: settings.deviceId });
      this.stateValue.set(status.connected ? 'CONNECTED' : 'DISCONNECTED');
      this.messageValue.set(status.message ?? null);
      if (status.connected) void this.processQueue();
      return status.connected;
    } catch (error) {
      this.stateValue.set('DISCONNECTED');
      this.messageValue.set(errorMessage(error));
      return false;
    } finally {
      this.connecting = false;
    }
  }

  stateLabel(): string {
    return {
      DISABLED: 'Impresión deshabilitada',
      UNCONFIGURED: 'Impresora sin configurar',
      CONNECTING: 'Conectando impresora',
      CONNECTED: 'Impresora conectada',
      DISCONNECTED: 'Impresora desconectada',
      UNSUPPORTED: 'Impresión directa disponible en Android',
      ERROR: 'Error de impresora',
    }[this.stateValue()];
  }

  private async processQueue(): Promise<void> {
    if (this.processing || !this.connected()) return;
    this.processing = true;
    try {
      for (const job of await this.queue.all()) {
        const payload = buildEscPosReceipt(job.ticket, job.print, this.settingsState().columns);
        try {
          await ThermalPrinter.print({ data: toBase64(payload) });
          await this.queue.remove(job.id);
          await this.refreshQueueSize();
        } catch (error) {
          this.stateValue.set('DISCONNECTED');
          this.messageValue.set(errorMessage(error));
          break;
        }
      }
    } finally {
      this.processing = false;
    }
  }

  private updatePassiveState(): void {
    const settings = this.settingsState();
    this.stateValue.set(
      !settings.enabled ? 'DISABLED' : !settings.deviceId ? 'UNCONFIGURED' : 'UNSUPPORTED',
    );
  }

  private async refreshQueueSize(): Promise<void> {
    try {
      this.queueSizeValue.set((await this.queue.all()).length);
    } catch {
      this.queueSizeValue.set(0);
    }
  }

  private settingsKey(): string {
    return `${SETTINGS_KEY}.${currentUserId()}`;
  }
}

function currentUserId(): string {
  for (const storage of [localStorage, sessionStorage]) {
    try {
      const user = JSON.parse(storage.getItem('lotowo.user') ?? '{}') as { id?: string };
      if (user.id) return user.id;
    } catch {
      // Continue with the other storage area.
    }
  }
  return 'anonymous';
}

function restoreSettings(key: string): PrinterSettings {
  try {
    return {
      ...DEFAULT_PRINTER_SETTINGS,
      ...JSON.parse(localStorage.getItem(key) ?? '{}'),
    };
  } catch {
    return DEFAULT_PRINTER_SETTINGS;
  }
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'No se pudo comunicar con la impresora.';
}
