import { vi } from 'vitest';
import { BusinessFinanceDetails } from '../models/api.models';
import { ExpenseReportPdfService } from './expense-report-pdf.service';
import { PdfFileService } from './pdf-file.service';

describe('ExpenseReportPdfService', () => {
  it('creates an A4 expense report and delegates saving for web or Android', async () => {
    const save = vi.fn(async (_document: import('jspdf').jsPDF, _fileName: string) => undefined);
    const service = new ExpenseReportPdfService({ save } as unknown as PdfFileService);
    const details: BusinessFinanceDetails = {
      from: '2026-08-23',
      to: '2026-08-28',
      mountings: [
        {
          id: 'mounting-id',
          drawId: 'draw-id',
          drawName: 'Sorteo diario',
          drawType: 'DAILY',
          scheduledAt: '2026-08-28T17:00:00Z',
          winningNumber: '03',
          totalStake: 400,
          externalPrize: 8_000,
          source: 'MANUAL_LATE',
          registeredAt: '2026-08-28T17:01:00Z',
          registeredByName: 'Administrador',
          items: [
            {
              number: '03',
              stakeAmount: 100,
              payoutMultiplier: 80,
              potentialExternalPayout: 8_000,
            },
          ],
        },
      ],
      movements: [
        {
          id: 'expense-id',
          date: '2026-08-27',
          type: 'EXPENSE',
          amount: 350,
          description: 'Combustible',
          userId: null,
          userName: null,
          active: true,
          createdAt: '2026-08-27T18:00:00Z',
          createdBy: 'admin-id',
          deletedAt: null,
          deletedBy: null,
          deletedByName: null,
        },
        {
          id: 'mounting-expense-id',
          date: '2026-08-27',
          type: 'MOUNTING_EXPENSE',
          amount: 300,
          description: 'Montada 9 PM',
          userId: null,
          userName: null,
          active: true,
          createdAt: '2026-08-27T18:00:00Z',
          createdBy: 'admin-id',
          deletedAt: null,
          deletedBy: null,
          deletedByName: null,
        },
        {
          id: 'mounting-income-id',
          date: '2026-08-27',
          type: 'MOUNTING_INCOME',
          amount: 8_000,
          description: 'Premio externo 9 PM',
          userId: null,
          userName: null,
          active: true,
          createdAt: '2026-08-27T18:00:00Z',
          createdBy: 'admin-id',
          deletedAt: null,
          deletedBy: null,
          deletedByName: null,
        },
      ],
    };

    await service.export(details);

    expect(save).toHaveBeenCalledOnce();
    const [document, fileName] = save.mock.calls[0]!;
    expect(fileName).toBe('suerte-gastos-2026-08-23-2026-08-28.pdf');
    expect(document.getNumberOfPages()).toBeGreaterThanOrEqual(1);
  });
});
