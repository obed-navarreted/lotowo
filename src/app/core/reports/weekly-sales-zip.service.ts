import { Injectable } from '@angular/core';
import { RouteSummary } from '../models/admin.models';
import { UtilityDrawSummary, UtilitySellerSummary, UtilitySummary } from '../models/api.models';
import { zipSync } from 'fflate';

export interface WeeklyRouteSales {
  route: RouteSummary;
  report: UtilitySummary;
}

@Injectable({ providedIn: 'root' })
export class WeeklySalesZipService {
  async export(packages: WeeklyRouteSales[]): Promise<void> {
    if (!packages.length) throw new Error('No hay ventas por ruta');
    const outer: Record<string, Uint8Array> = {};
    for (const routePackage of packages) {
      const routeName = routePackage.route?.name ?? 'Sin ruta';
      const routeCode = routePackage.route?.code ?? 'SIN_RUTA';
      const routeFolder = `${this.safe(routeCode)}_${this.safe(routeName)}`;
      for (const seller of [...routePackage.report.sellers].sort((left, right) =>
        left.sellerName.localeCompare(right.sellerName, 'es'),
      )) {
        const png = await this.sellerImage(routePackage.report, seller, routeName);
        const fileName = `${this.safe(routeName)}_${this.safe(seller.sellerName)}_${routePackage.report.from}_${routePackage.report.to}.png`;
        outer[`${routeFolder}/${fileName}`] = new Uint8Array(await png.arrayBuffer());
      }
    }
    const archive = zipSync(outer, { level: 6 });
    const blob = new Blob([archive.slice().buffer], { type: 'application/zip' });
    const report = packages[0].report;
    this.download(blob, `ventas_${report.from}_${report.to}.zip`);
  }

  private async sellerImage(
    report: UtilitySummary,
    seller: UtilitySellerSummary,
    routeName: string,
  ): Promise<Blob> {
    const days = this.days(seller);
    const width = 1400;
    const height = 310 + days.reduce((total, day) => total + 72 + day.entries.length * 48, 0);
    const scale = 2;
    const canvas = document.createElement('canvas');
    canvas.width = width * scale;
    canvas.height = height * scale;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas no disponible');
    context.scale(scale, scale);
    context.fillStyle = '#fbfaf7';
    context.fillRect(0, 0, width, height);
    context.fillStyle = '#25232b';
    context.textAlign = 'center';
    context.font = '700 17px Arial, sans-serif';
    context.fillText('DETALLE SEMANAL DE VENTAS', width / 2, 38);
    context.font = '700 25px Arial, sans-serif';
    context.fillText(seller.sellerName, width / 2, 74);
    context.fillStyle = '#77737c';
    context.font = '14px Arial, sans-serif';
    context.fillText(
      `${routeName} · ${this.date(report.from)} – ${this.date(report.to)}`,
      width / 2,
      100,
    );

    this.roundedRect(context, 40, 125, width - 80, 118, 18, '#ffffff', '#e3e0d9');
    this.metric(context, 280, 165, 'VENTA TOTAL', seller.grossSales);
    this.metric(context, 700, 165, 'COMISIÓN', seller.commissionAmount);
    this.metric(context, 1120, 165, 'BOLETOS', seller.ticketCount, false);

    let y = 280;
    for (const day of days) {
      context.fillStyle = '#25232b';
      context.textAlign = 'left';
      context.font = '700 17px Arial, sans-serif';
      context.fillText(this.date(day.date), 42, y);
      context.textAlign = 'right';
      context.fillStyle = '#4d4870';
      context.fillText(`Venta del día ${this.money(day.totalSales)}`, width - 42, y);
      y += 24;
      context.strokeStyle = '#dedbd3';
      context.beginPath();
      context.moveTo(42, y);
      context.lineTo(width - 42, y);
      context.stroke();
      y += 30;
      for (const entry of day.entries) {
        context.textAlign = 'left';
        context.fillStyle = '#25232b';
        context.font = '700 14px Arial, sans-serif';
        context.fillText(this.draw(entry), 52, y);
        context.fillStyle = '#77737c';
        context.font = '13px Arial, sans-serif';
        context.fillText(`Ganador ${entry.winningNumber ?? '—'}`, 330, y);
        context.textAlign = 'right';
        context.fillText(`Venta ${this.money(entry.grossSales)}`, 980, y);
        context.fillText(`Premio ${this.money(entry.prizesPaid)}`, width - 52, y);
        y += 31;
        context.strokeStyle = '#eeeae3';
        context.beginPath();
        context.moveTo(52, y);
        context.lineTo(width - 52, y);
        context.stroke();
        y += 17;
      }
      y += 24;
    }
    context.textAlign = 'center';
    context.fillStyle = '#8b8790';
    context.font = '12px Arial, sans-serif';
    context.fillText(`Generado ${this.generatedAt()}`, width / 2, height - 28);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('No se generó la imagen'))),
        'image/png',
      ),
    );
  }

  private days(seller: UtilitySellerSummary): Array<{
    date: string;
    totalSales: number;
    entries: UtilityDrawSummary[];
  }> {
    const grouped = new Map<string, UtilityDrawSummary[]>();
    for (const entry of seller.entries) {
      const date = this.localDate(entry.scheduledAt);
      grouped.set(date, [...(grouped.get(date) ?? []), entry]);
    }
    return [...grouped.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([date, entries]) => ({
        date,
        totalSales: entries.reduce((total, entry) => total + entry.grossSales, 0),
        entries: [...entries].sort(
          (left, right) =>
            new Date(left.scheduledAt).getTime() - new Date(right.scheduledAt).getTime(),
        ),
      }));
  }

  private metric(
    context: CanvasRenderingContext2D,
    x: number,
    y: number,
    label: string,
    value: number,
    currency = true,
  ): void {
    context.textAlign = 'center';
    context.fillStyle = '#77737c';
    context.font = '700 11px Arial, sans-serif';
    context.fillText(label, x, y);
    context.fillStyle = '#25232b';
    context.font = '700 23px Arial, sans-serif';
    context.fillText(currency ? this.money(value) : String(value), x, y + 34);
  }

  private roundedRect(
    context: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number,
    fill: string,
    stroke: string,
  ): void {
    context.beginPath();
    context.roundRect(x, y, width, height, radius);
    context.fillStyle = fill;
    context.fill();
    context.strokeStyle = stroke;
    context.stroke();
  }

  private draw(entry: UtilityDrawSummary): string {
    const hour = new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      hour12: true,
      timeZone: 'America/Managua',
    })
      .format(new Date(entry.scheduledAt))
      .replace(' ', '');
    return entry.drawType === 'NATIONAL_LOTTERY' ? `${hour} · Lotería` : hour;
  }

  private date(value: string): string {
    return new Intl.DateTimeFormat('es-NI', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      timeZone: 'America/Managua',
    }).format(new Date(`${value}T12:00:00-06:00`));
  }

  private localDate(value: string): string {
    const parts = new Intl.DateTimeFormat('en-CA', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      timeZone: 'America/Managua',
    }).formatToParts(new Date(value));
    const date = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${date['year']}-${date['month']}-${date['day']}`;
  }

  private money(value: number): string {
    return new Intl.NumberFormat('es-NI', { maximumFractionDigits: 2 }).format(value);
  }

  private generatedAt(): string {
    return new Intl.DateTimeFormat('es-NI', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZone: 'America/Managua',
    }).format(new Date());
  }

  private safe(value: string): string {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .toLowerCase();
  }

  private download(blob: Blob, name: string): void {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = name;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
