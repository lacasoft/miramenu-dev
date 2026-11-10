import { isOverdue, likeOwnerOf, mayModerate } from './interaction-rules';

describe('interaction rules', () => {
  describe('likeOwnerOf', () => {
    const device = '0b6f1a52-7c64-4c4e-9a1e-1f2d3c4b5a69';
    const diner = { id: '7e1c2b3a-4d5e-4f60-8a7b-9c8d7e6f5a4b' };

    it('likes as the account when the diner is registered, keeping the device', () => {
      expect(likeOwnerOf({ deviceId: device, diner })).toEqual({
        kind: 'diner',
        dinerId: diner.id,
        deviceId: device,
      });
      expect(likeOwnerOf({ deviceId: null, diner })).toEqual({
        kind: 'diner',
        dinerId: diner.id,
        deviceId: null,
      });
    });

    it('likes as the device when anonymous, and as nobody without one', () => {
      expect(likeOwnerOf({ deviceId: device, diner: null })).toEqual({
        kind: 'device',
        deviceId: device,
      });
      expect(likeOwnerOf({ deviceId: null, diner: null })).toBeNull();
    });
  });

  describe('mayModerate', () => {
    it('lets a moderator decide only on the pending version they read', () => {
      expect(mayModerate({ status: 'pending', version: 2 }, 2)).toBe(true);
      expect(mayModerate({ status: 'pending', version: 3 }, 2)).toBe(false);
    });

    it('refuses a comment already moderated or deleted', () => {
      for (const status of ['approved', 'rejected', 'deleted'] as const) {
        expect(mayModerate({ status, version: 1 }, 1)).toBe(false);
      }
    });
  });

  describe('isOverdue', () => {
    const now = new Date('2026-11-10T12:00:00.000Z');

    it('flags a comment pending for the threshold or longer', () => {
      expect(isOverdue(new Date('2026-11-09T12:00:00.000Z'), now, 24)).toBe(
        true,
      );
      expect(isOverdue(new Date('2026-11-09T12:00:00.001Z'), now, 24)).toBe(
        false,
      );
      expect(isOverdue(new Date('2026-11-10T11:00:00.000Z'), now, 1)).toBe(
        true,
      );
    });
  });
});
