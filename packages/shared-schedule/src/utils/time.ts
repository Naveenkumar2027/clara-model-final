import { zonedTimeToUtc, utcToZonedTime, format } from 'date-fns-tz';

/**
 * Timezone for all schedule computations
 */
export const TIMEZONE = 'Asia/Kolkata';

/**
 * Working hours configuration
 */
export const WORKING_HOURS = {
  start: '08:30',
  end: '16:30',
} as const;

/**
 * Parse time string in HH:MM format (24-hour)
 * Returns minutes since midnight (0-1439)
 */
export function parseTime(timeStr: string): number {
  // Require exactly 2 digits for hours and 2 digits for minutes (HH:MM format)
  const match = timeStr.trim().match(/^(\d{2}):(\d{2})$/);
  if (!match) {
    throw new Error(`Invalid time format: ${timeStr}. Expected HH:MM (e.g., 08:30, not 8:30)`);
  }
  
  const hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  
  if (hours < 0 || hours > 23) {
    throw new Error(`Invalid hours: ${hours}. Must be 0-23`);
  }
  if (minutes < 0 || minutes > 59) {
    throw new Error(`Invalid minutes: ${minutes}. Must be 0-59`);
  }
  
  return hours * 60 + minutes;
}

/**
 * Format minutes since midnight to HH:MM string
 */
export function formatTime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
}

/**
 * Get current time in Asia/Kolkata timezone
 */
export function getCurrentTimeInTimezone(): Date {
  return utcToZonedTime(new Date(), TIMEZONE);
}

/**
 * Get date at specific time in Asia/Kolkata timezone
 */
export function getDateAtTime(date: Date, timeStr: string): Date {
  const [year, month, day] = [
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  ];
  
  const minutes = parseTime(timeStr);
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  
  // Create date in local timezone, then convert to UTC for Asia/Kolkata
  const localDate = new Date(year, month, day, hours, mins, 0, 0);
  return zonedTimeToUtc(localDate, TIMEZONE);
}

/**
 * Format date to time string in Asia/Kolkata timezone
 */
export function formatTimeFromDate(date: Date): string {
  const zonedDate = utcToZonedTime(date, TIMEZONE);
  return format(zonedDate, 'HH:mm', { timeZone: TIMEZONE });
}

/**
 * Get day of week name from date (Monday-Saturday)
 */
export function getDayOfWeek(date: Date): string {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const zonedDate = utcToZonedTime(date, TIMEZONE);
  return days[zonedDate.getDay()];
}

/**
 * Check if time is within working hours
 */
export function isWithinWorkingHours(timeStr: string): boolean {
  const time = parseTime(timeStr);
  const start = parseTime(WORKING_HOURS.start);
  const end = parseTime(WORKING_HOURS.end);
  return time >= start && time <= end;
}

/**
 * Check if two time ranges overlap
 */
export function timeRangesOverlap(
  start1: string,
  end1: string,
  start2: string,
  end2: string
): boolean {
  const s1 = parseTime(start1);
  const e1 = parseTime(end1);
  const s2 = parseTime(start2);
  const e2 = parseTime(end2);
  
  return s1 < e2 && s2 < e1;
}

/**
 * Merge overlapping time ranges
 */
export function mergeTimeRanges(
  ranges: Array<{ start: string; end: string }>
): Array<{ start: string; end: string }> {
  if (ranges.length === 0) return [];
  
  // Sort by start time
  const sorted = [...ranges].sort((a, b) => parseTime(a.start) - parseTime(b.start));
  
  const merged: Array<{ start: string; end: string }> = [sorted[0]];
  
  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i];
    const last = merged[merged.length - 1];
    
    if (parseTime(current.start) <= parseTime(last.end)) {
      // Overlapping or adjacent - merge
      last.end = parseTime(current.end) > parseTime(last.end) ? current.end : last.end;
    } else {
      // Non-overlapping - add new range
      merged.push(current);
    }
  }
  
  return merged;
}

