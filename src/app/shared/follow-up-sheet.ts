const MANAGUA_NOON = 'T12:00:00-06:00';

export function isWeekendDate(date: string): boolean {
  const day = new Date(`${date}${MANAGUA_NOON}`).getUTCDay();
  return day === 0 || day === 6;
}

export function followUpTurns(date: string): string[] {
  return isWeekendDate(date)
    ? ['12:00 p. m.', '3:00 p. m.', '6:00 p. m.']
    : ['12:00 p. m.', '3:00 p. m.'];
}

export function followUpDrawTimes(date: string): string[] {
  return isWeekendDate(date)
    ? ['11:00 a. m.', '3:00 p. m.', '6:00 p. m.', '9:00 p. m.']
    : ['11:00 a. m.', '3:00 p. m.', '9:00 p. m.'];
}
