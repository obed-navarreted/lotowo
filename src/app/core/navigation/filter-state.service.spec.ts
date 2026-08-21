import { TestBed } from '@angular/core/testing';
import { AuthService } from '../auth/auth.service';
import { FilterStateService } from './filter-state.service';

describe('FilterStateService', () => {
  beforeEach(() => {
    sessionStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        FilterStateService,
        { provide: AuthService, useValue: { user: () => ({ id: 'user-1' }) } },
      ],
    });
  });

  afterEach(() => sessionStorage.clear());

  it('restores filters only inside the current user scope', () => {
    const service = TestBed.inject(FilterStateService);
    service.save('tickets', { date: '2026-08-21', sellerId: 'seller-1' });

    expect(service.restore<{ date: string; sellerId: string }>('tickets')).toEqual({
      date: '2026-08-21',
      sellerId: 'seller-1',
    });
    expect(sessionStorage.getItem('suerte.filters.user-1.tickets')).not.toBeNull();
  });

  it('ignores and removes corrupted state', () => {
    const service = TestBed.inject(FilterStateService);
    sessionStorage.setItem('suerte.filters.user-1.reports', '{broken');

    expect(service.restore('reports')).toBeNull();
    expect(sessionStorage.getItem('suerte.filters.user-1.reports')).toBeNull();
  });
});
