import type { IssueLocation } from '../../../shared/types/civic.js';

export interface SamplePreset {
  readonly id: string;
  readonly badge: string;
  readonly title: string;
  readonly description: string;
  readonly location: IssueLocation;
  readonly presetIndex: number;
}

export const JUDGE_SAMPLE_PRESETS: ReadonlyArray<SamplePreset> = [
  {
    id: 'preset-pothole',
    badge: 'Sample 1: Deep Pothole',
    title: 'Deep pothole near Central Market intersection',
    description:
      'A wide water-filled pothole has opened across the eastbound lane outside Central Market, forcing two-wheelers and cars to swerve sharply.',
    location: {
      lat: 37.7749,
      lng: -122.4194,
      address: '240 Market St, Downtown District',
    },
    presetIndex: 1,
  },
  {
    id: 'preset-water',
    badge: 'Sample 2: Burst Water Pipe',
    title: 'Pressurized water pipe leaking across Civic Center sidewalk',
    description:
      'Clean water is spraying from a ruptured underground valve near the Oakwood bus stop and flooding the pedestrian crossing.',
    location: {
      lat: 37.7795,
      lng: -122.4151,
      address: '92 Oakwood Ave, Civic Center',
    },
    presetIndex: 2,
  },
  {
    id: 'preset-streetlight',
    badge: 'Sample 3: Broken Streetlight',
    title: 'Damaged streetlight pole with exposed wire near Elm Park',
    description:
      'Streetlight pole #18 is dark and its junction box cover is open with low-hanging cable near the evening walking path.',
    location: {
      lat: 37.7685,
      lng: -122.4261,
      address: '512 Elm Park North Path',
    },
    presetIndex: 3,
  },
  {
    id: 'preset-garbage',
    badge: 'Sample 4: Overflowing Bins',
    title: 'Uncollected overflowing garbage dumpsters at Harbor Alley',
    description:
      'Three municipal waste bins have been overflowing onto the pavement for four days, causing strong odor and blocked walkway access.',
    location: {
      lat: 37.7841,
      lng: -122.4072,
      address: '19 Harbor Plaza Service Alley',
    },
    presetIndex: 4,
  },
];
