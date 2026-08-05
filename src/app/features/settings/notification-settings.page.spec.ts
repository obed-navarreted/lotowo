import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { NotificationSettingsPage } from './notification-settings.page';

describe('NotificationSettingsPage', () => {
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [NotificationSettingsPage],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('loads and saves the prize exposure threshold', () => {
    const fixture = TestBed.createComponent(NotificationSettingsPage);
    http.expectOne('/api/v1/notifications/settings').flush({
      numberExposureEnabled: false,
      numberExposureThreshold: 40_000,
      updatedAt: '2026-08-04T12:00:00Z',
    });
    fixture.detectChanges();

    const component = fixture.componentInstance as unknown as {
      enabled: boolean;
      threshold: number;
      save(): void;
    };
    component.enabled = true;
    component.threshold = 50_000;
    component.save();

    const save = http.expectOne('/api/v1/notifications/settings');
    expect(save.request.method).toBe('PUT');
    expect(save.request.body).toEqual({
      numberExposureEnabled: true,
      numberExposureThreshold: 50_000,
    });
    save.flush({
      numberExposureEnabled: true,
      numberExposureThreshold: 50_000,
      updatedAt: '2026-08-04T12:01:00Z',
    });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('configuración de alertas fue actualizada');
  });
});
