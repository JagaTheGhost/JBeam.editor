/**
 * Standard BeamNG beam presets for 1-click physics tuning
 */
export const BEAM_PRESETS = [
  {
    name: 'Rigid 8MN',
    tooltip: 'Heavy chassis & ladder frame rails (8 MN/m, unbreakable)',
    properties: { beamSpring: 8001000, beamDamp: 300, beamDeform: 150000, beamStrength: 'FLT_MAX' },
    beamType: '|NORMAL'
  },
  {
    name: 'Chassis 2MN',
    tooltip: 'Standard vehicle subframe & body cage (2 MN/m, unbreakable)',
    properties: { beamSpring: 2001000, beamDamp: 150, beamDeform: 45000, beamStrength: 'FLT_MAX' },
    beamType: '|NORMAL'
  },
  {
    name: 'Light 800kN',
    tooltip: 'Sheet metal, fenders & body panels (800 kN/m, yield 15kN)',
    properties: { beamSpring: 801000, beamDamp: 80, beamDeform: 15000, beamStrength: 120000 },
    beamType: '|NORMAL'
  },
  {
    name: 'Support',
    tooltip: 'Anti-inversion contact support (3.5 MN/m, precompression 0.95)',
    properties: { beamSpring: 3501000, beamDamp: 100, beamDeform: 65000, beamStrength: 'FLT_MAX', beamPrecompression: 0.95 },
    beamType: '|SUPPORT'
  },
  {
    name: 'Latch 25kN',
    tooltip: 'Breakable latch/hinge for hood/trunk (yield 8kN, snap 25kN)',
    properties: { beamSpring: 1201000, beamDamp: 90, beamDeform: 8000, beamStrength: 25000 },
    beamType: '|NORMAL'
  }
];

/**
 * Formats large Newton values into engineering readable units (kN, MN)
 */
export function formatNtoMetric(val, unit = 'N') {
  if (val === undefined || val === null || val === '') return '';
  const num = Number(val);
  if (isNaN(num)) return '';
  if (Math.abs(num) >= 1000000) {
    const formatted = (num / 1000000).toFixed(2).replace(/\.?0+$/, '');
    return `${formatted} M${unit}`;
  }
  if (Math.abs(num) >= 1000) {
    const formatted = (num / 1000).toFixed(1).replace(/\.?0+$/, '');
    return `${formatted} k${unit}`;
  }
  return `${num} ${unit}`;
}
