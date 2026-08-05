import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PrinterDevice } from '../../core/printer/printer.models';
import { PrinterService } from '../../core/printer/printer.service';
import { Icon } from '../../shared/icon/icon';

@Component({
  selector: 'lo-printer-settings-page',
  imports: [FormsModule, Icon],
  templateUrl: './printer-settings.page.html',
  styleUrl: './printer-settings.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PrinterSettingsPage {
  protected readonly printer = inject(PrinterService);
  protected readonly devices = signal<PrinterDevice[]>([]);
  protected readonly searching = signal(false);
  protected readonly saving = signal(false);
  protected readonly testing = signal(false);
  protected readonly message = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);

  protected async toggleEnabled(enabled: boolean): Promise<void> {
    this.clearFeedback();
    await this.printer.saveSettings({ enabled });
    if (enabled) await this.loadPaired();
  }

  protected async toggleAutomatic(automaticPrinting: boolean): Promise<void> {
    await this.printer.saveSettings({ automaticPrinting });
  }

  protected async loadPaired(): Promise<void> {
    if (!this.printer.isNativeAndroid) return;
    this.searching.set(true);
    this.clearFeedback();
    try {
      this.devices.set(await this.printer.pairedDevices());
      if (!this.devices().length) {
        this.message.set('No hay impresoras vinculadas. Puedes buscar dispositivos cercanos.');
      }
    } catch {
      this.error.set('No pudimos leer los dispositivos Bluetooth. Revisa los permisos de Suerte.');
    } finally {
      this.searching.set(false);
    }
  }

  protected async search(): Promise<void> {
    this.searching.set(true);
    this.clearFeedback();
    try {
      this.devices.set(await this.printer.discoverDevices());
      if (!this.devices().length) this.message.set('No encontramos dispositivos cercanos.');
    } catch {
      this.error.set(
        'No pudimos buscar dispositivos Bluetooth. Verifica que Bluetooth esté activo.',
      );
    } finally {
      this.searching.set(false);
    }
  }

  protected async select(device: PrinterDevice): Promise<void> {
    this.saving.set(true);
    this.clearFeedback();
    try {
      await this.printer.pair(device);
      this.message.set(`${device.name} quedó guardada como impresora de este teléfono.`);
      await this.loadPaired();
    } catch {
      this.error.set('No pudimos vincular o conectar la impresora seleccionada.');
    } finally {
      this.saving.set(false);
    }
  }

  protected async test(): Promise<void> {
    this.testing.set(true);
    this.clearFeedback();
    try {
      await this.printer.testPrint();
      this.message.set('Enviamos una impresión de prueba.');
    } catch {
      this.error.set('No pudimos imprimir la prueba. Enciende la impresora e intenta nuevamente.');
    } finally {
      this.testing.set(false);
    }
  }

  private clearFeedback(): void {
    this.message.set(null);
    this.error.set(null);
  }
}
