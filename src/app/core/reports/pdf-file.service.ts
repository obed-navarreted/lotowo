import { Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

@Injectable({ providedIn: 'root' })
export class PdfFileService {
  async save(document: import('jspdf').jsPDF, fileName: string): Promise<void> {
    if (!Capacitor.isNativePlatform()) {
      document.save(fileName);
      return;
    }

    const data = this.base64(document.output('arraybuffer'));
    const file = await Filesystem.writeFile({
      path: fileName,
      data,
      directory: Directory.Cache,
      recursive: true,
    });
    await Share.share({
      title: 'Reporte Suerte',
      text: fileName,
      url: file.uri,
      dialogTitle: 'Guardar o compartir PDF',
    });
  }

  private base64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    const chunkSize = 0x8000;
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
    }
    return btoa(binary);
  }
}
