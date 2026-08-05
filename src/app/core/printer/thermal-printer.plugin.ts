import { PluginListenerHandle, registerPlugin } from '@capacitor/core';
import { PrinterDevice } from './printer.models';

export interface NativePrinterStatus {
  connected: boolean;
  deviceId?: string;
  deviceName?: string;
  message?: string;
}

interface ThermalPrinterPlugin {
  isAvailable(): Promise<{ available: boolean }>;
  requestPermissions(): Promise<{ granted: boolean }>;
  getPairedDevices(): Promise<{ devices: PrinterDevice[] }>;
  discoverDevices(): Promise<{ devices: PrinterDevice[] }>;
  pair(options: { deviceId: string }): Promise<{ paired: boolean }>;
  connect(options: { deviceId: string }): Promise<NativePrinterStatus>;
  disconnect(): Promise<void>;
  getStatus(): Promise<NativePrinterStatus>;
  print(options: { data: string }): Promise<void>;
  addListener(
    eventName: 'statusChanged',
    listener: (status: NativePrinterStatus) => void,
  ): Promise<PluginListenerHandle>;
}

export const ThermalPrinter = registerPlugin<ThermalPrinterPlugin>('ThermalPrinter');
