import { Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { MountingReport } from '../models/api.models';
import { drawLabel } from '../../shared/draw-label';

@Injectable({ providedIn: 'root' })
export class MountingImageService {
  async export(report: MountingReport): Promise<void> {
    const canvas = this.render(report);
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (result) =>
          result ? resolve(result) : reject(new Error('No fue posible crear la imagen.')),
        'image/png',
        1,
      ),
    );
    const fileName = `numeros-a-pedir-${this.fileDate(report.scheduledAt)}.png`;
    if (!this.isNativePlatform()) {
      this.downloadBrowser(blob, fileName);
      return;
    }
    const fileUri = await this.writeTemporaryFile(fileName, await this.base64(blob));
    await this.shareFile(fileName, fileUri);
  }

  protected isNativePlatform(): boolean {
    return Capacitor.isNativePlatform();
  }

  protected downloadBrowser(blob: Blob, fileName: string): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1_000);
  }

  protected async writeTemporaryFile(fileName: string, data: string): Promise<string> {
    const file = await Filesystem.writeFile({
      path: fileName,
      data,
      directory: Directory.Cache,
      recursive: true,
    });
    return file.uri;
  }

  protected async shareFile(fileName: string, fileUri: string): Promise<void> {
    await Share.share({
      title: 'Números a pedir',
      text: fileName,
      url: fileUri,
      dialogTitle: 'Guardar o compartir imagen',
    });
  }

  protected render(report: MountingReport): HTMLCanvasElement {
    const width = 1080;
    const columns = report.items.length <= 2 ? Math.max(report.items.length, 1) : 4;
    const rows = Math.max(1, Math.ceil(report.items.length / columns));
    const headerHeight = 430;
    const cardHeight = 176;
    const footerHeight = 130;
    const height = Math.max(900, headerHeight + rows * cardHeight + footerHeight);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Este dispositivo no permite generar la imagen.');

    context.fillStyle = '#f8f6f1';
    context.fillRect(0, 0, width, height);
    context.textAlign = 'center';
    context.fillStyle = '#aa8030';
    context.font = '700 25px Arial, sans-serif';
    context.fillText('SUERTE', width / 2, 72);
    context.fillStyle = '#23221f';
    context.font = '700 62px Arial, sans-serif';
    context.fillText('Números a pedir', width / 2, 150);
    context.fillStyle = '#68655e';
    context.font = '400 28px Arial, sans-serif';
    context.fillText(drawLabel(report), width / 2, 205);
    context.fillStyle = '#6d4bed';
    context.font = '700 21px Arial, sans-serif';
    context.fillText(`${this.modeLabel(report.mode)} · PAGO ×80`, width / 2, 244);
    context.strokeStyle = '#c29849';
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(100, 270);
    context.lineTo(width - 100, 270);
    context.stroke();

    context.font = '400 21px Arial, sans-serif';
    context.fillStyle = '#858078';
    context.fillText('VENTAS', width * 0.2, 320);
    context.fillText(report.mode === 'FREE' ? 'A ASUMIR' : 'TOTAL A PEDIR', width * 0.5, 320);
    context.fillText(
      report.mode === 'FREE' ? 'TOTAL A PEDIR' : 'RESULTADO MÍNIMO',
      width * 0.8,
      320,
    );
    context.font = '700 35px Arial, sans-serif';
    context.fillStyle = '#292824';
    context.fillText(this.amount(report.grossSales), width * 0.2, 367);
    context.fillText(
      this.amount(
        report.mode === 'FREE' ? (report.assumedPayout ?? 0) : report.totalStakeToRequest,
      ),
      width * 0.5,
      367,
    );
    context.fillStyle =
      report.mode === 'FREE'
        ? '#292824'
        : report.minimumResultAfterMounting < 0
          ? '#c34747'
          : '#2f7b67';
    context.fillText(
      this.amount(
        report.mode === 'FREE' ? report.totalStakeToRequest : report.minimumResultAfterMounting,
      ),
      width * 0.8,
      367,
    );

    if (!report.items.length) {
      context.fillStyle = '#2f7b67';
      context.font = '700 38px Arial, sans-serif';
      context.fillText('No hay números que pedir', width / 2, 530);
      context.fillStyle = '#77736b';
      context.font = '400 24px Arial, sans-serif';
      context.fillText('No se requiere cobertura con el criterio elegido.', width / 2, 575);
    } else {
      const gap = 18;
      const horizontalMargin = columns === 1 ? 290 : 44;
      const availableWidth = width - horizontalMargin * 2 - gap * (columns - 1);
      const cardWidth = availableWidth / columns;
      report.items.forEach((item, index) => {
        const column = index % columns;
        const row = Math.floor(index / columns);
        const x = horizontalMargin + column * (cardWidth + gap);
        const y = headerHeight + row * cardHeight;
        context.fillStyle = '#ffffff';
        context.strokeStyle = '#dfd9cd';
        context.lineWidth = 2;
        this.roundedRectangle(context, x, y, cardWidth, 150, 18);
        context.fill();
        context.stroke();
        context.fillStyle = '#6d4bed';
        context.font = '700 42px Arial, sans-serif';
        context.fillText(item.number, x + cardWidth / 2, y + 54);
        context.fillStyle = '#292824';
        context.font = '700 32px Arial, sans-serif';
        context.fillText(this.amount(item.stakeToRequest), x + cardWidth / 2, y + 100);
        context.fillStyle = '#8a857d';
        context.font = '400 17px Arial, sans-serif';
        context.fillText(`de ${this.amount(item.potentialPayout)}`, x + cardWidth / 2, y + 130);
      });
    }

    context.strokeStyle = '#ded8cc';
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(100, height - 92);
    context.lineTo(width - 100, height - 92);
    context.stroke();
    context.fillStyle = '#817d75';
    context.font = '400 20px Arial, sans-serif';
    context.fillText(`Generado ${this.generatedAt(report.generatedAt)}`, width / 2, height - 48);
    return canvas;
  }

  private amount(value: number): string {
    return new Intl.NumberFormat('es-NI', { maximumFractionDigits: 2 }).format(value);
  }

  private modeLabel(mode: MountingReport['mode']): string {
    return {
      FREE: 'MODO LIBRE',
      ZERO_LOSS_WITH_COST: 'CERO PÉRDIDA',
      ZERO_LOSS_WITHOUT_COST: 'VENTAS VS. PREMIOS',
    }[mode];
  }

  private roundedRectangle(
    context: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number,
  ): void {
    const safeRadius = Math.min(radius, width / 2, height / 2);
    context.beginPath();
    context.moveTo(x + safeRadius, y);
    context.lineTo(x + width - safeRadius, y);
    context.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
    context.lineTo(x + width, y + height - safeRadius);
    context.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height);
    context.lineTo(x + safeRadius, y + height);
    context.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
    context.lineTo(x, y + safeRadius);
    context.quadraticCurveTo(x, y, x + safeRadius, y);
    context.closePath();
  }

  private generatedAt(value: string): string {
    return new Intl.DateTimeFormat('es-NI', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZone: 'America/Managua',
    }).format(new Date(value));
  }

  private fileDate(value: string): string {
    return new Intl.DateTimeFormat('en-CA', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      timeZone: 'America/Managua',
    }).format(new Date(value));
  }

  private async base64(blob: Blob): Promise<string> {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const chunkSize = 0x8000;
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
    }
    return btoa(binary);
  }
}
