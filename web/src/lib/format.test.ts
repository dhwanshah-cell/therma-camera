import { describe, expect, it } from 'vitest';
import {
  GAS_RAW_UNIT_LABEL,
  formatBytes,
  formatGasRaw,
  formatHumidity,
  formatMissionNumber,
  formatTemperature,
  formatValue,
  gasStatusLabel,
  timeAgo,
} from './format';

describe('format helpers', () => {
  it('renders null/undefined/NaN as --', () => {
    expect(formatValue(null)).toBe('--');
    expect(formatValue(undefined)).toBe('--');
    expect(formatValue(Number.NaN)).toBe('--');
    expect(formatTemperature(null)).toBe('--');
    expect(formatHumidity(undefined)).toBe('--');
    expect(formatGasRaw(null)).toBe('--');
    expect(formatBytes(null)).toBe('--');
    expect(gasStatusLabel(null)).toBe('--');
    expect(timeAgo(null)).toBe('--');
  });

  it('formats real numbers with units', () => {
    expect(formatValue(3.14159, { digits: 2, unit: 'm' })).toBe('3.14 m');
    expect(formatTemperature(21.456)).toBe('21.5 °C');
    expect(formatHumidity(55.4)).toBe('55 %');
    expect(formatMissionNumber(1)).toBe('MISSION #001');
    expect(formatMissionNumber(null)).toBe('MISSION --');
  });

  it('never labels the gas raw ADC value as ppm', () => {
    const label = `${formatGasRaw(512)} ${GAS_RAW_UNIT_LABEL}`;
    expect(label).toBe('512 raw ADC');
    expect(label.toLowerCase()).not.toContain('ppm');
    expect(GAS_RAW_UNIT_LABEL.toLowerCase()).not.toContain('ppm');
    expect(gasStatusLabel(true)).toContain('GAS ALERT');
    expect(gasStatusLabel(false)).toBe('NORMAL');
    expect(gasStatusLabel(true).toLowerCase()).not.toContain('ppm');
  });

  it('computes relative time', () => {
    const now = Date.parse('2026-09-29T12:00:00Z');
    expect(timeAgo('2026-09-29T11:59:57Z', now)).toBe('3 s ago');
    expect(timeAgo('2026-09-29T11:55:00Z', now)).toBe('5 min ago');
    expect(timeAgo('not a date', now)).toBe('--');
  });
});
