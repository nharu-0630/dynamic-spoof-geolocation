/**
 * The 東海道新幹線 daytime service pattern, known as the 12-2-3 ダイヤ
 * (12 のぞみ + 2 ひかり + 3 こだま per hour), in force since the 2023-03-18
 * timetable revision.
 *
 * Source: 東海道新幹線 § 現行のダイヤパターンと停車駅, Japanese Wikipedia,
 * https://ja.wikipedia.org/wiki/東海道新幹線 — text available under CC BY-SA 4.0.
 * Train-number blocks come from the same article's 現行の号数の振り方 section.
 *
 * Wikipedia publishes the departure minute past the hour, the arrival minute at
 * the far end and the stopping pattern; it does not publish intermediate times.
 * Those are reconstructed in core/shinkansen/timetable.ts from the section
 * distances and a running model, so the numbers here are the only observed data.
 */

/** `●` stop · `→` pass · `▲` stops at 0–2 of the marked stations · `-` not served. */
export type StopMark = '●' | '→' | '▲' | '-';

export type TrainType = 'のぞみ' | 'ひかり' | 'こだま';
export type Direction = 'down' | 'up';

export interface PatternSlot {
  type: TrainType;
  /** Minute past the hour the train leaves 東京 (下り) or 新大阪 (上り). */
  departMinute: number;
  /** Scheduled journey time over the section operated, in minutes. */
  runMinutes: number;
  /**
   * Stop marks for all 17 stations, in travel order: 東京→新大阪 for 下り,
   * 新大阪→東京 for 上り.
   */
  stops: string;
  /** Where the train goes beyond 新大阪, or where an 上り train starts. */
  through?: string;
  /** `◆` in the source table: a 臨時列車 or a seasonal extension. */
  seasonal?: boolean;
}

const N_DOWN = '●●●→→→→→→→→→●→→●●';
const N_UP = '●●→→●→→→→→→→→→●●●';

/** 下り: 東京発. */
export const DOWN_PATTERN: readonly PatternSlot[] = [
  { type: 'のぞみ', departMinute: 0, runMinutes: 150, stops: N_DOWN, through: '新大阪' },
  {
    type: 'ひかり',
    departMinute: 3,
    runMinutes: 174,
    stops: '●●●→▲▲→●→●→→●→→●●',
    through: '岡山',
  },
  { type: 'のぞみ', departMinute: 9, runMinutes: 147, stops: N_DOWN, through: '博多', seasonal: true },
  { type: 'のぞみ', departMinute: 12, runMinutes: 147, stops: N_DOWN, through: '博多' },
  { type: 'のぞみ', departMinute: 18, runMinutes: 147, stops: N_DOWN, through: '新大阪', seasonal: true },
  { type: 'のぞみ', departMinute: 21, runMinutes: 147, stops: N_DOWN, through: '博多', seasonal: true },
  { type: 'のぞみ', departMinute: 24, runMinutes: 150, stops: N_DOWN, through: '新大阪', seasonal: true },
  // 東京 27分発 → 名古屋 06分着.
  { type: 'こだま', departMinute: 27, runMinutes: 159, stops: '●●●●●●●●●●●●●----', through: '名古屋' },
  { type: 'のぞみ', departMinute: 30, runMinutes: 150, stops: N_DOWN, through: '博多' },
  {
    type: 'ひかり',
    departMinute: 33,
    runMinutes: 174,
    stops: '●●●▲→→→→→→▲→●●●●●',
    through: '新大阪',
  },
  { type: 'のぞみ', departMinute: 39, runMinutes: 147, stops: N_DOWN, through: '博多', seasonal: true },
  { type: 'のぞみ', departMinute: 42, runMinutes: 150, stops: N_DOWN, through: '広島', seasonal: true },
  { type: 'のぞみ', departMinute: 48, runMinutes: 147, stops: N_DOWN, through: '博多' },
  { type: 'のぞみ', departMinute: 51, runMinutes: 150, stops: N_DOWN, through: '新大阪', seasonal: true },
  { type: 'のぞみ', departMinute: 54, runMinutes: 150, stops: N_DOWN, through: '新大阪', seasonal: true },
  { type: 'こだま', departMinute: 57, runMinutes: 234, stops: '●'.repeat(17), through: '新大阪' },
];

/** 上り: 新大阪発（こだま1本のみ名古屋始発）. */
export const UP_PATTERN: readonly PatternSlot[] = [
  { type: 'のぞみ', departMinute: 0, runMinutes: 147, stops: N_UP, through: '新大阪', seasonal: true },
  { type: 'のぞみ', departMinute: 6, runMinutes: 147, stops: N_UP, through: '博多' },
  { type: 'のぞみ', departMinute: 9, runMinutes: 147, stops: N_UP, through: '新大阪', seasonal: true },
  { type: 'のぞみ', departMinute: 15, runMinutes: 150, stops: N_UP, through: '博多', seasonal: true },
  {
    type: 'ひかり',
    departMinute: 18,
    runMinutes: 174,
    stops: '●●●●●→▲→→→→→→▲●●●',
    through: '新大阪',
  },
  { type: 'のぞみ', departMinute: 21, runMinutes: 150, stops: N_UP, through: '新大阪', seasonal: true },
  // 名古屋 38分発 → 東京 18分着.
  { type: 'こだま', departMinute: 38, runMinutes: 160, stops: '----●●●●●●●●●●●●●', through: '名古屋' },
  { type: 'のぞみ', departMinute: 24, runMinutes: 150, stops: N_UP, through: '新大阪', seasonal: true },
  { type: 'のぞみ', departMinute: 30, runMinutes: 147, stops: N_UP, through: '博多' },
  { type: 'のぞみ', departMinute: 33, runMinutes: 150, stops: N_UP, through: '博多', seasonal: true },
  { type: 'のぞみ', departMinute: 39, runMinutes: 147, stops: N_UP, through: '広島', seasonal: true },
  { type: 'のぞみ', departMinute: 45, runMinutes: 150, stops: N_UP, through: '博多' },
  {
    type: 'ひかり',
    departMinute: 48,
    runMinutes: 174,
    stops: '●●→→●→→●→●→▲▲→●●●',
    through: '岡山',
  },
  { type: 'のぞみ', departMinute: 51, runMinutes: 150, stops: N_UP, through: '新大阪', seasonal: true },
  { type: 'こだま', departMinute: 54, runMinutes: 234, stops: '●'.repeat(17), through: '新大阪' },
  { type: 'のぞみ', departMinute: 57, runMinutes: 147, stops: N_UP, through: '博多', seasonal: true },
];

/**
 * Train-number blocks, from 現行の号数の振り方 (2026-03-14). 下り are odd,
 * 上り even. Numbers are handed out in departure order within each block, so
 * they look like the real thing without claiming to be it.
 */
export const NUMBER_BLOCKS = {
  'のぞみ/山陽': 1,
  'のぞみ/東海道': 231,
  'ひかり/山陽': 701,
  'ひかり/東海道': 631,
  こだま: 801,
} as const;

/** First and last departure from the originating terminal. */
export const SERVICE_WINDOW = { firstMinute: 6 * 60, lastMinute: 21 * 60 + 30 };

/** 臨時列車 (`◆`) only run in the busier part of the day. */
export const SEASONAL_WINDOW = { firstMinute: 7 * 60, lastMinute: 20 * 60 };
