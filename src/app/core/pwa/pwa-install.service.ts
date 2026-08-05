import { DOCUMENT } from '@angular/common';
import { computed, inject, Injectable, signal } from '@angular/core';

interface InstallChoice {
  outcome: 'accepted' | 'dismissed';
  platform: string;
}

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<InstallChoice>;
}

interface NavigatorWithStandalone extends Navigator {
  standalone?: boolean;
}

@Injectable({ providedIn: 'root' })
export class PwaInstallService {
  private readonly document = inject(DOCUMENT);
  private readonly browser = this.document.defaultView;
  private deferredPrompt: BeforeInstallPromptEvent | null = null;
  private started = false;

  readonly installAvailable = signal(false);
  readonly dismissed = signal(false);
  readonly installing = signal(false);
  readonly installed = signal(this.isRunningStandalone());
  readonly ios = this.isIosDevice();
  readonly secureConnection = this.browser?.isSecureContext ?? false;
  readonly offerVisible = computed(
    () =>
      !this.installed() &&
      !this.dismissed() &&
      (this.installAvailable() || this.ios || !this.secureConnection),
  );

  start(): void {
    if (this.started || !this.browser) return;
    this.started = true;
    this.browser.addEventListener('beforeinstallprompt', this.captureInstallPrompt);
    this.browser.addEventListener('appinstalled', this.markInstalled);
  }

  async install(): Promise<void> {
    const prompt = this.deferredPrompt;
    if (!prompt || this.installing()) return;
    this.installing.set(true);
    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      this.deferredPrompt = null;
      this.installAvailable.set(false);
      if (choice.outcome === 'accepted') this.installed.set(true);
      else this.dismissed.set(true);
    } finally {
      this.installing.set(false);
    }
  }

  dismiss(): void {
    this.dismissed.set(true);
  }

  private readonly captureInstallPrompt = (event: Event): void => {
    event.preventDefault();
    this.deferredPrompt = event as BeforeInstallPromptEvent;
    this.installAvailable.set(true);
    this.dismissed.set(false);
  };

  private readonly markInstalled = (): void => {
    this.deferredPrompt = null;
    this.installAvailable.set(false);
    this.installed.set(true);
  };

  private isRunningStandalone(): boolean {
    const navigator = this.browser?.navigator as NavigatorWithStandalone | undefined;
    return Boolean(
      navigator?.standalone || this.browser?.matchMedia?.('(display-mode: standalone)').matches,
    );
  }

  private isIosDevice(): boolean {
    const navigator = this.browser?.navigator;
    if (!navigator) return false;
    return (
      /iPad|iPhone|iPod/i.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
    );
  }
}
