/** Documented concentration bands, subdivided into fixed 2 µg/m³ steps. */
export const PM25_COLOR_STEP = 2;
export const PM25_BANDS = [
  { lower: 0, upper: 12.5, range: '0–12.4', light: '#cceec5', dark: '#168243' },
  { lower: 12.5, upper: 30.5, range: '12.5–30.4', light: '#fff9b0', dark: '#b58a00' },
  { lower: 30.5, upper: 50.5, range: '30.5–50.4', light: '#ffe0ac', dark: '#eb7000' },
  { lower: 50.5, upper: 125.5, range: '50.5–125.4', light: '#ffc4b9', dark: '#c71923' },
  { lower: 125.5, upper: 225.5, range: '125.5–225.4', light: '#e2c9ee', dark: '#782992' },
  { lower: 225.5, upper: 325.5, range: '225.5–325.4', light: '#d59daa', dark: '#63001e' },
  { lower: 325.5, upper: 500.5, range: '325.5+', light: '#747474', dark: '#111111' },
] as const;

function shade(band: typeof PM25_BANDS[number], index: number): string {
  const count = Math.ceil((band.upper - band.lower) / PM25_COLOR_STEP);
  const fraction = Math.min(Math.max(index / (count - 1), 0), 1);
  const channels = [1, 3, 5].map(offset => {
    const start = parseInt(band.light.slice(offset, offset + 2), 16);
    const end = parseInt(band.dark.slice(offset, offset + 2), 16);
    return Math.round(start + (end - start) * fraction).toString(16).padStart(2, '0');
  });
  return `#${channels.join('')}`;
}

/** Use the same half-up rounding for readings and concentration classification. */
export function roundPm25(value: number): number {
  return Math.floor(Math.max(0, value) * 10 + .5) / 10;
}

export function pm25Color(value: number): string {
  if (!Number.isFinite(value)) return '#9ca3af';
  const rounded = roundPm25(value);
  const band = PM25_BANDS.find(item => rounded < item.upper) ?? PM25_BANDS[PM25_BANDS.length - 1];
  return shade(band, Math.floor((rounded - band.lower) / PM25_COLOR_STEP));
}

/** Same discrete shades as the map, with hard stops to show the 2-unit steps. */
export function pm25BandGradient(band: typeof PM25_BANDS[number], direction: 'to right' | 'to top' = 'to right'): string {
  const span = band.upper - band.lower;
  const count = Math.ceil(span / PM25_COLOR_STEP);
  const stops = Array.from({ length: count }, (_, index) => {
    const color = shade(band, index);
    const start = index * PM25_COLOR_STEP / span * 100;
    const end = Math.min((index + 1) * PM25_COLOR_STEP / span * 100, 100);
    return `${color} ${start}%, ${color} ${end}%`;
  });
  return `linear-gradient(${direction}, ${stops.join(', ')})`;
}
