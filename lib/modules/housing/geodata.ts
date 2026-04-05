// Approximate zip code boundary polygons for Austin target zips.
// These are simplified bounding polygons — real boundaries would come from Census TIGER/Line shapefiles.

export const ZIP_BOUNDARIES: Record<string, [number, number][]> = {
  '78745': [
    [30.195, -97.810], [30.195, -97.740], [30.230, -97.740], [30.230, -97.810],
  ],
  '78704': [
    [30.235, -97.775], [30.235, -97.740], [30.270, -97.740], [30.270, -97.775],
  ],
  '78749': [
    [30.195, -97.870], [30.195, -97.830], [30.230, -97.830], [30.230, -97.870],
  ],
  '78748': [
    [30.160, -97.845], [30.160, -97.800], [30.195, -97.800], [30.195, -97.845],
  ],
  '78731': [
    [30.340, -97.785], [30.340, -97.740], [30.375, -97.740], [30.375, -97.785],
  ],
};

// Mock isochrone polygons (30-min drive time boundaries)
// In production these would come from Mapbox Isochrone API

export const ISOCHRONE_JOLLYVILLE: [number, number][] = [
  [30.48, -97.85], [30.50, -97.78], [30.49, -97.70],
  [30.46, -97.65], [30.42, -97.63], [30.38, -97.65],
  [30.35, -97.70], [30.34, -97.78], [30.36, -97.85],
  [30.40, -97.88], [30.44, -97.88],
];

export const ISOCHRONE_DOWNTOWN: [number, number][] = [
  [30.31, -97.82], [30.33, -97.75], [30.32, -97.68],
  [30.29, -97.64], [30.25, -97.63], [30.21, -97.65],
  [30.19, -97.70], [30.18, -97.78], [30.20, -97.83],
  [30.24, -97.85], [30.28, -97.84],
];

// Isochrone center points (the addresses being measured from)
export const ISOCHRONE_CENTERS: { label: string; position: [number, number]; color: string }[] = [
  { label: 'Visa Jollyville', position: [30.4441, -97.7584], color: '#46f1c5' },
  { label: 'Downtown Austin', position: [30.2672, -97.7431], color: '#fbab29' },
];

// Austin center coordinates
export const AUSTIN_CENTER: [number, number] = [30.2672, -97.7431];
export const DEFAULT_ZOOM = 11;
