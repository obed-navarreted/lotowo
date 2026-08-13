import { describe, expect, it } from 'vitest';
import { MountingReport } from '../models/api.models';
import { MountingImageService } from './mounting-image.service';

class TestMountingImageService extends MountingImageService {
  native = false;
  readonly downloads: Array<{ blob: Blob; fileName: string }> = [];
  readonly writes: Array<{ fileName: string; data: string }> = [];
  readonly shares: Array<{ fileName: string; fileUri: string }> = [];

  protected override isNativePlatform(): boolean {
    return this.native;
  }

  protected override render(): HTMLCanvasElement {
    return {
      toBlob: (callback: BlobCallback) => callback(new Blob(['PNG'], { type: 'image/png' })),
    } as HTMLCanvasElement;
  }

  protected override downloadBrowser(blob: Blob, fileName: string): void {
    this.downloads.push({ blob, fileName });
  }

  protected override async writeTemporaryFile(fileName: string, data: string): Promise<string> {
    this.writes.push({ fileName, data });
    return 'file:///numeros.png';
  }

  protected override async shareFile(fileName: string, fileUri: string): Promise<void> {
    this.shares.push({ fileName, fileUri });
  }
}

const report: MountingReport = {
  drawId: 'draw-id',
  drawType: 'DAILY',
  scheduledAt: '2026-08-12T15:00:00-06:00',
  assumedPayout: 25_000,
  externalMultiplier: 80,
  totalStakeToRequest: 62.5,
  generatedAt: '2026-08-12T14:00:00-06:00',
  items: [],
};

describe('MountingImageService', () => {
  it('downloads the PNG in a browser', async () => {
    const service = new TestMountingImageService();

    await service.export(report);

    expect(service.downloads).toHaveLength(1);
    expect(service.downloads[0]?.fileName).toBe('numeros-a-pedir-2026-08-12.png');
    expect(service.downloads[0]?.blob.type).toBe('image/png');
    expect(service.writes).toEqual([]);
  });

  it('writes and shares the PNG from Android', async () => {
    const service = new TestMountingImageService();
    service.native = true;

    await service.export(report);

    expect(service.downloads).toEqual([]);
    expect(service.writes).toEqual([{ fileName: 'numeros-a-pedir-2026-08-12.png', data: 'UE5H' }]);
    expect(service.shares).toEqual([
      {
        fileName: 'numeros-a-pedir-2026-08-12.png',
        fileUri: 'file:///numeros.png',
      },
    ]);
  });
});
