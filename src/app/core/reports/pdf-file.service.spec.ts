import { Capacitor } from '@capacitor/core';
import { Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PdfFileService } from './pdf-file.service';

const nativeMocks = vi.hoisted(() => ({
  isNative: vi.fn(),
  writeFile: vi.fn(),
  share: vi.fn(),
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: nativeMocks.isNative },
}));
vi.mock('@capacitor/filesystem', () => ({
  Directory: { Cache: 'CACHE' },
  Filesystem: { writeFile: nativeMocks.writeFile },
}));
vi.mock('@capacitor/share', () => ({
  Share: { share: nativeMocks.share },
}));

describe('PdfFileService', () => {
  afterEach(() => vi.restoreAllMocks());

  it('keeps the browser download outside the native application', async () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false);
    const document = { save: vi.fn() } as unknown as import('jspdf').jsPDF;

    await new PdfFileService().save(document, 'reporte.pdf');

    expect(document.save).toHaveBeenCalledWith('reporte.pdf');
  });

  it('writes and shares the PDF through Android instead of using a WebView download', async () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
    vi.mocked(Filesystem.writeFile).mockResolvedValue({ uri: 'file:///reporte.pdf' });
    vi.mocked(Share.share).mockResolvedValue({ activityType: 'android' });
    const document = {
      save: vi.fn(),
      output: vi.fn().mockReturnValue(new Uint8Array([37, 80, 68, 70]).buffer),
    } as unknown as import('jspdf').jsPDF;

    await new PdfFileService().save(document, 'reporte.pdf');

    expect(document.save).not.toHaveBeenCalled();
    expect(Filesystem.writeFile).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'reporte.pdf', data: 'JVBERg==' }),
    );
    expect(Share.share).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'file:///reporte.pdf',
        dialogTitle: 'Guardar o compartir PDF',
      }),
    );
  });
});
