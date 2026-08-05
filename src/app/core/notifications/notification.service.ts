import { computed, inject, Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { SwPush } from '@angular/service-worker';
import { Capacitor } from '@capacitor/core';
import type { PluginListenerHandle } from '@capacitor/core';
import {
  PushNotifications,
} from '@capacitor/push-notifications';
import type {
  ActionPerformed,
  PushNotificationSchema,
  Token,
} from '@capacitor/push-notifications';
import { catchError, of, Subscription, switchMap, take, timer } from 'rxjs';
import { LotoApiService } from '../api/loto-api.service';
import { AuthService } from '../auth/auth.service';
import { PushConfiguration, PushSubscriptionPayload, UserNotification } from '../models/api.models';

export type AppNotification = UserNotification;

const REFRESH_INTERVAL_MS = 30_000;

@Injectable({ providedIn: 'root' })
export class NotificationService {
  private readonly api = inject(LotoApiService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly swPush = inject(SwPush);
  private readonly notificationsState = signal<AppNotification[]>([]);
  private lifecycle?: Subscription;
  private refreshSubscription?: Subscription;
  private started = false;
  private pushConfiguration?: PushConfiguration;
  private nativeListeners: PluginListenerHandle[] = [];
  private nativeListenersReady = false;

  private readonly nativeAndroid =
    Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';

  readonly notifications = this.notificationsState.asReadonly();
  readonly unreadCount = computed(
    () => this.notificationsState().filter((item) => !item.read).length,
  );
  readonly browserSupported =
    this.nativeAndroid ||
    (typeof window !== 'undefined' &&
      window.isSecureContext &&
      'Notification' in window &&
      this.swPush.isEnabled);
  readonly browserPermission = signal<NotificationPermission>(
    typeof Notification === 'undefined' ? 'denied' : Notification.permission,
  );
  readonly pushActive = signal(false);
  readonly pushMessage = signal('');

  start(): void {
    if (!this.auth.user()?.id || this.started) return;
    this.started = true;
    const lifecycle = new Subscription();
    this.lifecycle = lifecycle;
    this.refreshSubscription = timer(0, REFRESH_INTERVAL_MS)
      .pipe(
        switchMap(() =>
          this.api.getNotifications().pipe(catchError(() => of([] as AppNotification[]))),
        ),
      )
      .subscribe((notifications) => this.notificationsState.set(notifications));

    if (this.nativeAndroid) {
      void this.configureNativePush();
      return;
    }
    if (!this.browserSupported) return;
    lifecycle.add(this.swPush.messages.subscribe(() => this.refresh()));
    lifecycle.add(
      this.swPush.notificationClicks.subscribe((event) => {
        const data = event.notification.data as
          { notificationId?: string; route?: string } | undefined;
        if (data?.notificationId) this.markRead(data.notificationId);
        if (data?.route) void this.router.navigateByUrl(data.route);
      }),
    );
    this.api
      .getPushConfiguration()
      .pipe(take(1))
      .subscribe({
        next: (configuration) => {
          this.pushConfiguration = configuration;
          if (!configuration.enabled || !configuration.publicKey) return;
          this.swPush.subscription.pipe(take(1)).subscribe((subscription) => {
            if (subscription) {
              void this.register(subscription).catch(() => {
                this.pushActive.set(false);
                this.pushMessage.set('No pudimos vincular las notificaciones a esta sesión.');
              });
            }
          });
        },
      });
  }

  stop(): void {
    this.refreshSubscription?.unsubscribe();
    this.refreshSubscription = undefined;
    this.lifecycle?.unsubscribe();
    this.lifecycle = undefined;
    for (const listener of this.nativeListeners) void listener.remove();
    this.nativeListeners = [];
    this.nativeListenersReady = false;
    this.notificationsState.set([]);
    this.pushActive.set(false);
    this.pushMessage.set('');
    this.started = false;
  }

  async requestBrowserPermission(): Promise<void> {
    this.pushMessage.set('');
    if (!this.browserSupported) {
      this.pushMessage.set(
        'Para activar push, abre la versión instalada de Suerte mediante una conexión HTTPS confiable.',
      );
      return;
    }
    if (this.nativeAndroid) {
      await this.requestNativePermission();
      return;
    }
    try {
      const configuration = this.pushConfiguration ?? (await this.loadConfiguration());
      if (!configuration.enabled || !configuration.publicKey) {
        this.pushMessage.set('Las notificaciones push no están habilitadas en este servidor.');
        return;
      }
      const subscription = await this.swPush.requestSubscription({
        serverPublicKey: configuration.publicKey,
      });
      this.browserPermission.set(Notification.permission);
      await this.register(subscription);
    } catch (error) {
      this.browserPermission.set(Notification.permission);
      this.pushActive.set(false);
      this.pushMessage.set(
        Notification.permission === 'denied'
          ? 'El navegador bloqueó las notificaciones. Puedes habilitarlas desde los permisos del sitio.'
          : 'No pudimos activar las notificaciones push en este dispositivo.',
      );
    }
  }

  markRead(id: string): void {
    this.notificationsState.update((items) =>
      items.map((item) => (item.id === id ? { ...item, read: true } : item)),
    );
    this.api.markNotificationRead(id).subscribe({ error: () => this.refresh() });
  }

  markAllRead(): void {
    this.notificationsState.update((items) => items.map((item) => ({ ...item, read: true })));
    this.api.markAllNotificationsRead().subscribe({ error: () => this.refresh() });
  }

  private refresh(): void {
    this.api.getNotifications().subscribe({
      next: (notifications) => this.notificationsState.set(notifications),
    });
  }

  private async loadConfiguration(): Promise<PushConfiguration> {
    const configuration = await new Promise<PushConfiguration>((resolve, reject) => {
      this.api.getPushConfiguration().pipe(take(1)).subscribe({ next: resolve, error: reject });
    });
    this.pushConfiguration = configuration;
    return configuration;
  }

  private async configureNativePush(): Promise<void> {
    try {
      await this.ensureNativeListeners();
      const configuration = this.pushConfiguration ?? (await this.loadConfiguration());
      if (!configuration.androidEnabled) {
        this.pushMessage.set('Las notificaciones push de Android no están habilitadas en este servidor.');
        return;
      }
      await this.createAndroidChannel();
      const permission = await PushNotifications.checkPermissions();
      this.browserPermission.set(this.mapNativePermission(permission.receive));
      if (permission.receive === 'granted') await PushNotifications.register();
    } catch {
      this.pushActive.set(false);
      this.pushMessage.set('No pudimos preparar las notificaciones push en este dispositivo.');
    }
  }

  private async requestNativePermission(): Promise<void> {
    try {
      await this.ensureNativeListeners();
      const configuration = this.pushConfiguration ?? (await this.loadConfiguration());
      if (!configuration.androidEnabled) {
        this.pushMessage.set('Las notificaciones push de Android no están habilitadas en este servidor.');
        return;
      }
      await this.createAndroidChannel();
      const result = await PushNotifications.requestPermissions();
      this.browserPermission.set(this.mapNativePermission(result.receive));
      if (result.receive !== 'granted') {
        this.pushActive.set(false);
        this.pushMessage.set(
          'Android bloqueó las notificaciones. Puedes habilitarlas desde los permisos de Suerte.',
        );
        return;
      }
      await PushNotifications.register();
    } catch {
      this.pushActive.set(false);
      this.pushMessage.set('No pudimos activar las notificaciones push en este dispositivo.');
    }
  }

  private async ensureNativeListeners(): Promise<void> {
    if (this.nativeListenersReady) return;
    this.nativeListenersReady = true;
    try {
      this.nativeListeners.push(
        await PushNotifications.addListener('registration', (token: Token) => {
          void this.registerNativeToken(token.value);
        }),
        await PushNotifications.addListener('registrationError', () => {
          this.pushActive.set(false);
          this.pushMessage.set(
            'Android no pudo registrar este dispositivo. Verifica la configuración de Firebase.',
          );
        }),
        await PushNotifications.addListener(
          'pushNotificationReceived',
          (_notification: PushNotificationSchema) => this.refresh(),
        ),
        await PushNotifications.addListener(
          'pushNotificationActionPerformed',
          (event: ActionPerformed) => this.openNativeNotification(event),
        ),
      );
    } catch (error) {
      this.nativeListenersReady = false;
      throw error;
    }
  }

  private async createAndroidChannel(): Promise<void> {
    await PushNotifications.createChannel({
      id: 'lotowo_alerts',
      name: 'Alertas de Suerte',
      description: 'Cierres, resultados pendientes y premios comprometidos.',
      importance: 4,
      visibility: 1,
      vibration: true,
    });
  }

  private async registerNativeToken(token: string): Promise<void> {
    if (!token || !this.started) return;
    try {
      await new Promise<void>((resolve, reject) => {
        this.api
          .registerAndroidPushToken({ token, deviceName: this.androidDeviceName() })
          .pipe(take(1))
          .subscribe({ next: () => resolve(), error: reject });
      });
      this.pushActive.set(true);
      this.pushMessage.set('Notificaciones push activas en este dispositivo.');
    } catch {
      this.pushActive.set(false);
      this.pushMessage.set('No pudimos vincular las notificaciones a esta sesión.');
    }
  }

  private openNativeNotification(event: ActionPerformed): void {
    const data = event.notification.data as
      | { notificationId?: string; route?: string }
      | undefined;
    if (data?.notificationId) this.markRead(data.notificationId);
    if (data?.route) void this.router.navigateByUrl(data.route);
  }

  private androidDeviceName(): string {
    const agent = typeof navigator === 'undefined' ? 'Android' : navigator.userAgent;
    return `Android · ${agent}`.slice(0, 200);
  }

  private mapNativePermission(permission: string): NotificationPermission {
    if (permission === 'granted') return 'granted';
    if (permission === 'denied') return 'denied';
    return 'default';
  }

  private async register(subscription: PushSubscription): Promise<void> {
    const json = subscription.toJSON();
    if (!json.endpoint || !json.keys?.['p256dh'] || !json.keys?.['auth']) {
      throw new Error('La suscripción push del navegador está incompleta.');
    }
    const payload: PushSubscriptionPayload = {
      endpoint: json.endpoint,
      expirationTime: json.expirationTime ?? null,
      keys: {
        p256dh: json.keys['p256dh'],
        auth: json.keys['auth'],
      },
    };
    await new Promise<void>((resolve, reject) => {
      this.api
        .registerPushSubscription(payload)
        .pipe(take(1))
        .subscribe({ next: () => resolve(), error: reject });
    });
    this.pushActive.set(true);
    this.pushMessage.set('Notificaciones push activas en este dispositivo.');
  }
}
