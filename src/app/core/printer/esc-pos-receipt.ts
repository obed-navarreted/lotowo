import { Ticket, TicketPrint } from '../models/api.models';
import { drawLabel } from '../../shared/draw-label';

const ESC = 0x1b;
const LF = 0x0a;

export function buildEscPosReceipt(ticket: Ticket, print: TicketPrint, columns = 32): Uint8Array {
  const bytes: number[] = [];
  const command = (...values: number[]) => bytes.push(...values);
  const line = (value = '') => command(...ascii(value), LF);
  const center = () => command(ESC, 0x61, 1);
  const left = () => command(ESC, 0x61, 0);
  const bold = (enabled: boolean) => command(ESC, 0x45, enabled ? 1 : 0);

  command(ESC, 0x40);
  center();
  bold(true);
  line('SUERTE');
  bold(false);
  line(repeat('-', columns));
  if (print.printType === 'REPRINT') {
    bold(true);
    line(`REIMPRESION ${print.printNumber - 1}`);
    bold(false);
  }
  bold(true);
  line(`RECIBO DE VENTA  #${ticket.receiptNumber}`);
  bold(false);
  line(repeat('-', columns));
  left();
  line(
    fitPair(
      'SORTEO',
      drawLabel({ drawType: ticket.drawType, scheduledAt: ticket.drawScheduledAt }),
      columns,
    ),
  );
  line(repeat('-', columns));
  bold(true);
  line(fitColumns('NUMERO', 'JUGADA', 'PREMIO', columns));
  bold(false);
  for (const item of ticket.items) {
    line(fitColumns(item.number, amount(item.stake), amount(item.potentialPayout), columns));
  }
  line(repeat('-', columns));
  bold(true);
  line(fitPair('TOTAL CORDOBAS', amount(ticket.totalAmount), columns));
  bold(false);
  line(repeat('-', columns));
  center();
  line(dateTime(print.printedAt));
  line(print.printedByName);
  line(ticket.routeCode);
  command(LF, LF, LF);
  return Uint8Array.from(bytes);
}

function amount(value: number): string {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
    useGrouping: true,
  }).format(value);
}

function dateTime(value: string): string {
  return new Intl.DateTimeFormat('es-NI', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'America/Managua',
  }).format(new Date(value));
}

function fitPair(left: string, right: string, columns: number): string {
  const safeLeft = plain(left);
  const safeRight = plain(right);
  const space = columns - safeLeft.length - safeRight.length;
  if (space >= 1) return `${safeLeft}${repeat(' ', space)}${safeRight}`;
  return `${safeLeft}\n${safeRight.slice(0, columns)}`;
}

function fitColumns(first: string, second: string, third: string, columns: number): string {
  const firstWidth = 7;
  const secondWidth = 10;
  const thirdWidth = columns - firstWidth - secondWidth;
  return `${plain(first).slice(0, firstWidth).padEnd(firstWidth)}${plain(second)
    .slice(0, secondWidth)
    .padStart(secondWidth)}${plain(third).slice(0, thirdWidth).padStart(thirdWidth)}`;
}

function repeat(value: string, count: number): string {
  return value.repeat(Math.max(0, count));
}

function ascii(value: string): number[] {
  return [...plain(value)].map((character) => character.charCodeAt(0));
}

function plain(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[–—]/g, '-')
    .replace(/[^\x20-\x7e\n]/g, '');
}
