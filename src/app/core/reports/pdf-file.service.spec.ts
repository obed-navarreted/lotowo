import { describe, expect, it, vi } from 'vitest';
import { PdfFileService } from './pdf-file.service';

class TestPdfFileService extends PdfFileService {
  native = false;
  readonly writtenFiles: Array<{ fileName: string; data: string }> = [];
  readonly sharedFiles: Array<{ fileName: string; fileUri: string }> = [];

  protected override isNativePlatform(): boolean {
    return this.native;
  }

  protected override async writeTemporaryFile(fileName: string, data: string): Promise<string> {
    this.writtenFiles.push({ fileName, data });
    return 'file:///reporte.pdf';
  }

  protected override async shareFile(fileName: string, fileUri: string): Promise<void> {
    this.sharedFiles.push({ fileName, fileUri });
  }
}

describe('PdfFileService', () => {
  it('keeps the browser download outside the native application', async () => {
    const service = new TestPdfFileService();
    const document = { save: vi.fn() } as unknown as import('jspdf').jsPDF;

    await service.save(document, 'reporte.pdf');

    expect(document.save).toHaveBeenCalledWith('reporte.pdf');
    expect(service.writtenFiles).toEqual([]);
    expect(service.sharedFiles).toEqual([]);
  });

  it('writes and shares the PDF through Android instead of using a WebView download', async () => {
    const service = new TestPdfFileService();
    service.native = true;
    const document = {
      save: vi.fn(),
      output: vi.fn().mockReturnValue(new Uint8Array([37, 80, 68, 70]).buffer),
    } as unknown as import('jspdf').jsPDF;

    await service.save(document, 'reporte.pdf');

    expect(document.save).not.toHaveBeenCalled();
    expect(service.writtenFiles).toEqual([{ fileName: 'reporte.pdf', data: 'JVBERg==' }]);
    expect(service.sharedFiles).toEqual([
      { fileName: 'reporte.pdf', fileUri: 'file:///reporte.pdf' },
    ]);
  });
});
