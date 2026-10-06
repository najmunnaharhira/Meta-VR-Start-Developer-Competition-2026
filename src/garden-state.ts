/**
 * Persistent garden progress: one ritual per local calendar day grows the
 * plant one stage and adds a flower in the colour of that day's intention.
 *
 * Pure data + localStorage. No World, no DOM beyond storage.
 */

export type Intention = 'focus' | 'calm' | 'move' | 'connect';

export const INTENTIONS: readonly Intention[] = [
  'focus',
  'calm',
  'move',
  'connect',
];

export const INTENTION_COLORS: Record<Intention, number> = {
  focus: 0x4f8cff,
  calm: 0xb48cff,
  move: 0xff9a3c,
  connect: 0xff6fa8,
};

export const INTENTION_LABELS: Record<Intention, string> = {
  focus: 'Focus',
  calm: 'Calm',
  move: 'Move',
  connect: 'Connect',
};

export interface GardenDay {
  day: string; // YYYY-MM-DD, local time
  intention: Intention;
}

/** Where the pot sits, in the local frame of the desk plane it was placed on. */
export interface DeskSpot {
  label: string;
  width: number;
  depth: number;
  x: number;
  z: number;
  /** Plane height above the floor; floor-relative so it is stable across sessions. */
  height?: number;
}

export interface GardenSave {
  version: 1;
  stage: number;
  streak: number;
  bestStreak: number;
  lastDay: string | null;
  history: GardenDay[];
  highContrast: boolean;
  /** Days added by the "skip to tomorrow" demo button, so judges can see growth. */
  dayOffset: number;
  deskSpot?: DeskSpot;
}

const STORAGE_KEY = 'desk-garden.save.v1';
export const MAX_STAGE = 12;
const MAX_HISTORY = 30;

export function emptySave(): GardenSave {
  return {
    version: 1,
    stage: 0,
    streak: 0,
    bestStreak: 0,
    lastDay: null,
    history: [],
    highContrast: false,
    dayOffset: 0,
  };
}

export function loadSave(): GardenSave {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptySave();
    const parsed = JSON.parse(raw) as Partial<GardenSave>;
    if (parsed.version !== 1) return emptySave();
    return { ...emptySave(), ...parsed };
  } catch {
    return emptySave();
  }
}

export function writeSave(save: GardenSave): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(save));
  } catch {
    // Storage can be unavailable (private mode); progress then lasts the session.
  }
}

export function dayKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function today(save: GardenSave, now = new Date()): string {
  const shifted = new Date(now);
  shifted.setDate(shifted.getDate() + save.dayOffset);
  return dayKey(shifted);
}

export function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  const ta = Date.UTC(ay, am - 1, ad);
  const tb = Date.UTC(by, bm - 1, bd);
  return Math.round((tb - ta) / 86_400_000);
}

export function doneToday(save: GardenSave, now = new Date()): boolean {
  return save.lastDay === today(save, now);
}

/** How thirsty the plant looks: 0 = fine, 1 = fully drooping. Never dies. */
export function droopAmount(save: GardenSave, now = new Date()): number {
  if (save.lastDay == null) return 0;
  const missed = daysBetween(save.lastDay, today(save, now)) - 1;
  return Math.max(0, Math.min(1, missed / 3));
}

export function completeRitual(
  save: GardenSave,
  intention: Intention,
  now = new Date(),
): GardenSave {
  const day = today(save, now);
  if (save.lastDay === day) return save;
  const consecutive =
    save.lastDay != null && daysBetween(save.lastDay, day) === 1;
  const streak = consecutive ? save.streak + 1 : 1;
  const history = [...save.history, { day, intention }].slice(-MAX_HISTORY);
  return {
    ...save,
    stage: Math.min(MAX_STAGE, save.stage + 1),
    streak,
    bestStreak: Math.max(save.bestStreak, streak),
    lastDay: day,
    history,
  };
}
