import {
  deviationMeters,
  isNearDestination,
  latestPoint,
  shouldRecomputeRoute,
} from './trip-logic.js';

describe('trip logic (docs/01-biznes-qoidalar.md §10)', () => {
  describe('isNearDestination', () => {
    it('stops sharing once within auto_stop_radius_m', () => {
      expect(isNearDestination(50, 50)).toBe(true);
      expect(isNearDestination(49, 50)).toBe(true);
      expect(isNearDestination(51, 50)).toBe(false);
    });
  });

  describe('deviationMeters', () => {
    it('measures off a polyline when one is stored', () => {
      const last = {
        lastRouteAt: new Date(),
        polyline: [
          { lat: 0, lng: 0 },
          { lat: 0.01, lng: 0 },
        ],
        origin: null,
      };
      // On the line vs. well off to the side.
      expect(deviationMeters({ lat: 0.005, lng: 0 }, last)).toBeLessThan(5);
      expect(deviationMeters({ lat: 0.005, lng: 0.01 }, last)).toBeGreaterThan(500);
    });

    it('falls back to the last ETA point when there is no polyline', () => {
      const origin = { lat: 41.3, lng: 69.25 };
      const last = { lastRouteAt: new Date(), polyline: null, origin };
      expect(deviationMeters(origin, last)).toBeCloseTo(0, 3);
      expect(deviationMeters({ lat: 41.31, lng: 69.25 }, last)).toBeGreaterThan(1_000);
    });

    it('is infinite (forces a recompute) before any route has ever been computed', () => {
      const last = { lastRouteAt: null, polyline: null, origin: null };
      expect(deviationMeters({ lat: 0, lng: 0 }, last)).toBe(Number.POSITIVE_INFINITY);
    });
  });

  describe('shouldRecomputeRoute', () => {
    const now = new Date('2026-01-01T00:10:00.000Z');

    it('recomputes when there is no previous route', () => {
      expect(
        shouldRecomputeRoute({
          lastRouteAt: null,
          now,
          etaRefreshSec: 120,
          deviationM: 0,
          routeDeviationM: 300,
        }),
      ).toBe(true);
    });

    it('recomputes once eta_refresh_sec has elapsed, not before', () => {
      const justUnder = new Date(now.getTime() - 119_000);
      const justOver = new Date(now.getTime() - 121_000);
      expect(
        shouldRecomputeRoute({
          lastRouteAt: justUnder,
          now,
          etaRefreshSec: 120,
          deviationM: 0,
          routeDeviationM: 300,
        }),
      ).toBe(false);
      expect(
        shouldRecomputeRoute({
          lastRouteAt: justOver,
          now,
          etaRefreshSec: 120,
          deviationM: 0,
          routeDeviationM: 300,
        }),
      ).toBe(true);
    });

    it('recomputes early when the pro strayed past route_deviation_m', () => {
      const secondsAgo = new Date(now.getTime() - 10_000);
      expect(
        shouldRecomputeRoute({
          lastRouteAt: secondsAgo,
          now,
          etaRefreshSec: 120,
          deviationM: 301,
          routeDeviationM: 300,
        }),
      ).toBe(true);
      expect(
        shouldRecomputeRoute({
          lastRouteAt: secondsAgo,
          now,
          etaRefreshSec: 120,
          deviationM: 300,
          routeDeviationM: 300,
        }),
      ).toBe(false);
    });
  });

  describe('latestPoint', () => {
    it('picks the point with the latest `at`, regardless of array order', () => {
      const points = [
        { at: '2026-01-01T00:00:02.000Z', tag: 'middle' },
        { at: '2026-01-01T00:00:01.000Z', tag: 'first' },
        { at: '2026-01-01T00:00:03.000Z', tag: 'last' },
      ];
      expect(latestPoint(points).tag).toBe('last');
    });
  });
});
