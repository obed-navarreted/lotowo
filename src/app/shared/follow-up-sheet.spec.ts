import { followUpDrawTimes, followUpTurns, isWeekendDate } from './follow-up-sheet';

describe('follow-up sheet calendar', () => {
  it('uses two collection turns from Monday to Friday', () => {
    expect(isWeekendDate('2026-08-07')).toBe(false);
    expect(followUpTurns('2026-08-07')).toEqual(['11:00 a. m.', '3:00 p. m.']);
    expect(followUpDrawTimes('2026-08-07')).toEqual(['11:00 a. m.', '3:00 p. m.', '9:00 p. m.']);
  });

  it('adds the 6 PM turn and draw on Saturday and Sunday', () => {
    for (const date of ['2026-08-08', '2026-08-09']) {
      expect(isWeekendDate(date)).toBe(true);
      expect(followUpTurns(date)).toEqual(['11:00 a. m.', '3:00 p. m.', '6:00 p. m.']);
      expect(followUpDrawTimes(date)).toEqual([
        '11:00 a. m.',
        '3:00 p. m.',
        '6:00 p. m.',
        '9:00 p. m.',
      ]);
    }
  });
});
