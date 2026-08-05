import { Route, Routes } from '@angular/router';
import { routes } from './app.routes';

function flatten(config: Routes): Route[] {
  return config.flatMap((route) => [route, ...flatten(route.children ?? [])]);
}

describe('application routes', () => {
  it('does not combine redirects with activation guards', () => {
    const invalid = flatten(routes).filter(
      (route) => route.redirectTo !== undefined && (route.canActivate?.length ?? 0) > 0,
    );

    expect(invalid).toEqual([]);
  });
});
