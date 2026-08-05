import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { SwPush } from '@angular/service-worker';
import { BehaviorSubject, Subject } from 'rxjs';
import { NotificationService } from './notification.service';

describe('NotificationService', () => {
  let service: NotificationService;
  let http: HttpTestingController;
  const subscriptionState = new BehaviorSubject<PushSubscription | null>(null);
  const messages = new Subject<object>();
  const clicks = new Subject<{
    action: string;
    notification: NotificationOptions & { title: string };
  }>();
  const pushSubscription = {
    toJSON: () => ({
      endpoint: 'https://push.example/subscription',
      expirationTime: null,
      keys: { p256dh: 'public-key', auth: 'auth-key' },
    }),
  } as unknown as PushSubscription;
  const swPush = {
    isEnabled: true,
    messages,
    notificationClicks: clicks,
    subscription: subscriptionState,
    requestSubscription: vi.fn().mockResolvedValue(pushSubscription),
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-02T18:00:00.000Z'));
    sessionStorage.clear();
    sessionStorage.setItem('lotowo.access-token', 'admin-token');
    sessionStorage.setItem(
      'lotowo.user',
      JSON.stringify({
        id: 'admin-id',
        username: 'admin',
        fullName: 'Admin',
        role: 'ADMIN',
        routeId: null,
        mustChangePassword: false,
      }),
    );
    Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true });
    vi.stubGlobal('Notification', { permission: 'default' });
    subscriptionState.next(null);
    swPush.requestSubscription.mockClear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: SwPush, useValue: swPush },
        { provide: Router, useValue: { navigateByUrl: vi.fn() } },
      ],
    });
    service = TestBed.inject(NotificationService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    service.stop();
    http.verify();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('loads the persistent notification history and marks notices as read through the API', () => {
    service.start();
    vi.advanceTimersByTime(0);
    http.expectOne('/api/v1/notifications').flush([
      {
        id: 'notification-id',
        type: 'WINNER_PENDING',
        title: 'Ganador pendiente',
        message: 'Ve a registrar el número ganador.',
        route: '/results',
        drawId: 'draw-id',
        createdAt: '2026-08-02T18:00:00.000Z',
        read: false,
      },
    ]);
    http
      .expectOne('/api/v1/notifications/push/configuration')
      .flush({ enabled: true, publicKey: 'vapid-public-key', androidEnabled: false });

    expect(service.unreadCount()).toBe(1);
    service.markRead('notification-id');
    http.expectOne('/api/v1/notifications/notification-id/read').flush(null);
    expect(service.unreadCount()).toBe(0);
  });

  it('registers a browser push subscription only after the user requests it', async () => {
    service.start();
    vi.advanceTimersByTime(0);
    http.expectOne('/api/v1/notifications').flush([]);
    http
      .expectOne('/api/v1/notifications/push/configuration')
      .flush({ enabled: true, publicKey: 'vapid-public-key', androidEnabled: false });

    expect(swPush.requestSubscription).not.toHaveBeenCalled();
    const activation = service.requestBrowserPermission();
    await Promise.resolve();
    expect(swPush.requestSubscription).toHaveBeenCalledWith({
      serverPublicKey: 'vapid-public-key',
    });
    http.expectOne('/api/v1/notifications/push/subscriptions').flush(null);
    await activation;

    expect(service.pushActive()).toBe(true);
  });
});
