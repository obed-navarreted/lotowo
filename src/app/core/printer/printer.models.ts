import { Ticket, TicketPrint } from '../models/api.models';

export type PrinterConnectionState =
  | 'DISABLED'
  | 'UNCONFIGURED'
  | 'CONNECTING'
  | 'CONNECTED'
  | 'DISCONNECTED'
  | 'UNSUPPORTED'
  | 'ERROR';

export interface PrinterDevice {
  id: string;
  name: string;
  bonded: boolean;
}

export interface PrinterSettings {
  enabled: boolean;
  automaticPrinting: boolean;
  deviceId: string | null;
  deviceName: string | null;
  paperWidthMm: 58;
  columns: 32;
}

export interface PrinterQueueJob {
  id: string;
  ticket: Ticket;
  print: TicketPrint;
  createdAt: string;
}

export const DEFAULT_PRINTER_SETTINGS: PrinterSettings = {
  enabled: false,
  automaticPrinting: true,
  deviceId: null,
  deviceName: null,
  paperWidthMm: 58,
  columns: 32,
};
