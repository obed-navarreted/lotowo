type ScheduledDraw = {
  scheduledAt: string;
};

/** Orders draw and result histories from the most recent draw to the oldest one. */
export function newestDrawFirst(left: ScheduledDraw, right: ScheduledDraw): number {
  return right.scheduledAt.localeCompare(left.scheduledAt);
}

/** Orders daily result summaries from the most recent business date to the oldest one. */
export function newestDayFirst(left: { date: string }, right: { date: string }): number {
  return right.date.localeCompare(left.date);
}
