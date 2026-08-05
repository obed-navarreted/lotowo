const NICARAGUA_TIME_ZONE = 'America/Managua';

export interface DrawLabelSource {
  drawType: 'DAILY' | 'NATIONAL_LOTTERY';
  scheduledAt: string;
}

export function drawLabel(draw: DrawLabelSource): string {
  const scheduledAt = new Date(draw.scheduledAt);
  const date = new Intl.DateTimeFormat('en-GB', {
    day: '2-digit', month: '2-digit', year: '2-digit', timeZone: NICARAGUA_TIME_ZONE
  }).format(scheduledAt);
  const time = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric', hour12: true, timeZone: NICARAGUA_TIME_ZONE
  }).format(scheduledAt).replace(/\s/g, '');
  return `${draw.drawType === 'DAILY' ? 'LOTO' : 'Lotería'} - ${date} - ${time}`;
}
