import { TestBed } from '@angular/core/testing';
import { PwaInstallService } from './pwa-install.service';

describe('PwaInstallService', () => {
  beforeEach(() => TestBed.configureTestingModule({}));

  it('captures the browser install event and exposes the native prompt', async () => {
    const service = TestBed.inject(PwaInstallService);
    service.start();
    let prompted = false;
    const event = new Event('beforeinstallprompt', { cancelable: true });
    Object.defineProperties(event, {
      prompt: {
        value: async () => {
          prompted = true;
        },
      },
      userChoice: {
        value: Promise.resolve({ outcome: 'accepted', platform: 'web' }),
      },
    });

    window.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(service.installAvailable()).toBe(true);
    expect(service.offerVisible()).toBe(true);

    await service.install();

    expect(prompted).toBe(true);
    expect(service.installed()).toBe(true);
    expect(service.installAvailable()).toBe(false);
  });

  it('allows dismissing the custom invitation', () => {
    const service = TestBed.inject(PwaInstallService);
    service.start();
    service.dismiss();

    expect(service.offerVisible()).toBe(false);
  });
});
