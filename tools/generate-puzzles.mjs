#!/usr/bin/env node
/**
 * Writes src/daily/puzzles.json — the daily content schedule.
 * Hand-editing the JSON afterwards is fine; this script just bootstraps it.
 * Each entry pins a date; dates past the end of the list fall back to the
 * deterministic rotation implemented in src/daily/registry.ts.
 */
import { writeFileSync } from 'node:fs';

const LAUNCH = '2026-10-01';
const art = [
  ['moonlit-garden', 'Moonlit Garden', 'Nature', '#6b4a8c'],
  ['harbor-lighthouse', 'Harbor Lighthouse', 'Architecture', '#d8433b'],
  ['lavender-fields', 'Lavender Fields', 'Landscapes', '#8b5fbf'],
  ['mosaic-tiles', 'Mosaic Tiles', 'Geometric', '#1f5f8b'],
  ['autumn-path', 'Autumn Path', 'Seasonal', '#e8742e'],
  ['koi-pond', 'Koi Pond', 'Nature', '#2b7a80'],
  ['night-city', 'Night City', 'Architecture', '#3b2466'],
  ['sunflower-row', 'Sunflower Row', 'Flowers', '#e0a020'],
  ['paper-circles', 'Paper Circles', 'Abstract', '#2a9d8f'],
  ['alpine-dawn', 'Alpine Dawn', 'Landscapes', '#6d5ea3'],
  ['lantern-evening', 'Lantern Evening', 'Peaceful', '#f7a24a'],
  ['bauhaus-blocks', 'Bauhaus Blocks', 'Geometric', '#e2533d'],
  ['fern-hollow', 'Fern Hollow', 'Nature', '#2f7a4a'],
  ['old-bridge', 'Old Stone Bridge', 'Architecture', '#8f7b63'],
  ['tulip-parade', 'Tulip Parade', 'Flowers', '#e8414f'],
  ['desert-mesa', 'Desert Mesa', 'Landscapes', '#c96f47'],
  ['ribbon-dance', 'Ribbon Dance', 'Abstract', '#9a4dc9'],
  ['winter-cabin', 'Winter Cabin', 'Seasonal', '#5a6fa8'],
  ['balloon-sky', 'Balloon Morning', 'Peaceful', '#ef476f'],
  ['hexagon-hive', 'Honey Hexagons', 'Geometric', '#e89f1d'],
  ['birch-grove', 'Birch Grove', 'Nature', '#d9795a'],
  ['windmill-meadow', 'Windmill Meadow', 'Architecture', '#e7414d'],
  ['poppy-breeze', 'Poppy Breeze', 'Flowers', '#e63b2e'],
  ['misty-fjord', 'Misty Fjord', 'Landscapes', '#56808f'],
  ['ocean-waves', 'Ocean Swirl', 'Abstract', '#1d6a96'],
  ['starry-campsite', 'Starry Campsite', 'Peaceful', '#1f3160'],
  ['cherry-spring', 'Cherry Blossom Spring', 'Seasonal', '#e05785'],
  ['crystal-garden', 'Crystal Garden', 'Geometric', '#7b5ea7'],
  ['hillside-village', 'Hillside Village', 'Architecture', '#d0583f'],
  ['wild-bouquet', 'Wild Bouquet', 'Flowers', '#5b2a86'],
  ['rolling-hills', 'Rolling Hills', 'Landscapes', '#4c9150'],
  ['summer-shore', 'Summer Shore', 'Seasonal', '#1ca3c4'],
];
// Sun..Sat
const WEEK = ['expert', 'easy', 'medium', 'medium', 'hard', 'medium', 'hard'];
const DIFF = { easy: [3, 3], medium: [4, 4], hard: [5, 5], expert: [6, 6] };

const start = Date.UTC(2026, 9, 1);
const puzzles = art.map(([slug, title, category, accent], i) => {
  const d = new Date(start + i * 86400000);
  const date = d.toISOString().slice(0, 10);
  const difficulty = WEEK[d.getUTCDay()];
  const [rows, columns] = DIFF[difficulty];
  return {
    id: `daily-${String(i + 1).padStart(3, '0')}`,
    date,
    title,
    category,
    difficulty,
    rows,
    columns,
    art: `assets/art/${slug}.svg`,
    seed: 1000 + i * 7919,
    accent,
  };
});

const doc = {
  $comment: 'Daily puzzle schedule. See docs/GAME_DESIGN.md → Content pipeline.',
  launchDate: LAUNCH,
  weeklyDifficulty: WEEK,
  puzzles,
};
writeFileSync(new URL('../src/daily/puzzles.json', import.meta.url), JSON.stringify(doc, null, 2) + '\n');
console.log(`Wrote ${puzzles.length} puzzles`);
