import { z } from 'zod';
import { parseTime } from './utils/time.js';

/**
 * Common OCR typos for time strings
 * Maps common mistakes to correct values
 */
const TIME_OCR_TYPOS: Record<string, string> = {
  '13:1t5': '13:15',
  '13:lt5': '13:15',
  '13:1ts': '13:15',
  '08:3o': '08:30',
  '08:3O': '08:30',
  '09:2s': '09:25',
  '10:4o': '10:40',
  '11:3s': '11:35',
  '12:3o': '12:30',
  '14:1o': '14:10',
  '15:0s': '15:05',
  '16:1o': '16:10',
};

/**
 * Fix common OCR typos in time strings
 */
function fixTimeTypo(timeStr: string): string {
  const trimmed = timeStr.trim();
  
  // Check direct mapping
  if (TIME_OCR_TYPOS[trimmed]) {
    return TIME_OCR_TYPOS[trimmed];
  }
  
  // Try to fix common patterns
  // Replace 't' or 'T' with '1' if it's in the minutes position and makes sense
  let fixed = trimmed.replace(/^(\d{1,2}):(\d{1})[tT](\d)$/, '$1:$21$3');
  // Replace 'o' or 'O' with '0' in minutes
  fixed = fixed.replace(/^(\d{1,2}):([oO])(\d)$/, '$1:0$3');
  fixed = fixed.replace(/^(\d{1,2}):(\d)([oO])$/, '$1:$20');
  // Replace 's' or 'S' with '5' in minutes (common OCR error)
  fixed = fixed.replace(/^(\d{1,2}):(\d{1})[sS]$/, '$1:$25');
  
  // Validate the fixed time
  try {
    parseTime(fixed);
    return fixed;
  } catch {
    // If fixing didn't work, return original
    return trimmed;
  }
}

/**
 * Validate and normalize time string (HH:MM format)
 */
function validateTime(timeStr: string, context: string): string {
  let normalized = timeStr.trim();
  
  // Try to fix OCR typos first
  const fixed = fixTimeTypo(normalized);
  if (fixed !== normalized) {
    normalized = fixed;
  }
  
  // Validate format
  if (!/^\d{1,2}:\d{2}$/.test(normalized)) {
    throw new Error(
      `Invalid time format in ${context}: "${timeStr}". Expected HH:MM format (24-hour).`
    );
  }
  
  // Validate and parse
  try {
    parseTime(normalized);
    return normalized;
  } catch (error) {
    throw new Error(
      `Invalid time value in ${context}: "${timeStr}". ${error instanceof Error ? error.message : 'Must be valid HH:MM time.'}`
    );
  }
}

/**
 * Custom Zod refinement for time strings
 */
const timeStringSchema = z.string().refine(
  (val) => {
    try {
      validateTime(val, 'time');
      return true;
    } catch {
      return false;
    }
  },
  {
    message: 'Invalid time format. Expected HH:MM (24-hour format).',
  }
).transform((val) => {
  // Normalize during transform
  const fixed = fixTimeTypo(val.trim());
  try {
    parseTime(fixed);
    return fixed;
  } catch {
    return val.trim();
  }
});

/**
 * Slot schema
 */
export const SlotSchema = z.object({
  start_time: timeStringSchema,
  end_time: timeStringSchema,
  subject_code: z.string().nullable().optional(),
  subject_name: z.string().min(1),
  class_details: z.string().nullable().optional(),
}).refine(
  (data) => {
    try {
      const start = parseTime(data.start_time);
      const end = parseTime(data.end_time);
      return end > start;
    } catch {
      return false;
    }
  },
  {
    message: 'end_time must be after start_time',
    path: ['end_time'],
  }
);

export type Slot = z.infer<typeof SlotSchema>;

/**
 * Timetable day schema
 */
export const TimetableDaySchema = z.object({
  day: z.enum(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']),
  slots: z.array(SlotSchema),
});

export type TimetableDay = z.infer<typeof TimetableDaySchema>;

/**
 * Course taught schema
 */
export const CourseTaughtSchema = z.object({
  subject_code: z.string().min(1),
  subject_name: z.string().min(1),
});

export type CourseTaught = z.infer<typeof CourseTaughtSchema>;

/**
 * Workload schema
 */
export const WorkloadSchema = z.object({
  theory_hours: z.number().int().nonnegative(),
  lab_hours: z.number().int().nonnegative(),
  total_units: z.number().int().nonnegative(),
});

export type Workload = z.infer<typeof WorkloadSchema>;

/**
 * Faculty schema
 */
export const FacultySchema = z.object({
  faculty_name: z.string().min(1).transform((val) => {
    // Normalize: title case, trim, collapse spaces
    return val
      .trim()
      .replace(/\s+/g, ' ')
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }),
  email: z.string().email().toLowerCase().trim(),
  route: z.string().min(1).transform((val) => {
    // Ensure route starts with /
    const trimmed = val.trim();
    return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  }),
  short_name: z.string().min(1).toLowerCase().trim(),
  designation: z.string().min(1).transform((val) => {
    // Title case, trim
    return val
      .trim()
      .replace(/\s+/g, ' ')
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }),
  academic_year: z.string().min(1),
  semester_type: z.string().min(1),
  workload: WorkloadSchema,
  courses_taught: z.array(CourseTaughtSchema).transform((val) => {
    // Uppercase subject codes, trim subject names
    return val.map(course => ({
      subject_code: course.subject_code.toUpperCase().trim(),
      subject_name: course.subject_name.trim().replace(/\s+/g, ' '),
    }));
  }),
  timetable: z.array(TimetableDaySchema).refine(
    (days) => {
      // Validate that all days are present and unique
      const dayNames = days.map(d => d.day);
      const uniqueDays = new Set(dayNames);
      return uniqueDays.size === dayNames.length;
    },
    {
      message: 'Duplicate days found in timetable',
    }
  ).transform((days) => {
    // Sort days and validate slots within each day
    const dayOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return days
      .map(day => {
        // Sort slots by start time
        const sortedSlots = [...day.slots].sort((a, b) => {
          const startA = parseTime(a.start_time);
          const startB = parseTime(b.start_time);
          return startA - startB;
        });
        
        // Validate no overlapping slots (warn but don't fail)
        for (let i = 0; i < sortedSlots.length - 1; i++) {
          const current = sortedSlots[i];
          const next = sortedSlots[i + 1];
          const currentEnd = parseTime(current.end_time);
          const nextStart = parseTime(next.start_time);
          
          if (currentEnd > nextStart) {
            console.warn(
              `Overlapping slots detected for ${day.day}: ${current.start_time}-${current.end_time} and ${next.start_time}-${next.end_time}`
            );
          }
        }
        
        return {
          ...day,
          slots: sortedSlots,
        };
      })
      .sort((a, b) => {
        const indexA = dayOrder.indexOf(a.day);
        const indexB = dayOrder.indexOf(b.day);
        return indexA - indexB;
      });
  }),
});

export type Faculty = z.infer<typeof FacultySchema>;

/**
 * Faculty array schema
 */
export const FacultyArraySchema = z.array(FacultySchema);

/**
 * Validate and normalize faculty data
 */
export function validateFacultyData(data: unknown): Faculty[] {
  try {
    const result = FacultyArraySchema.parse(data);
    return result;
  } catch (error) {
    if (error instanceof z.ZodError) {
      // Format error with field path
      const errors = error.errors.map((err) => {
        const path = err.path.join('.');
        return `Field ${path}: ${err.message}`;
      });
      throw new Error(`Validation failed:\n${errors.join('\n')}`);
    }
    throw error;
  }
}

/**
 * Deep freeze object to make it immutable
 */
export function deepFreeze<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  
  Object.getOwnPropertyNames(obj).forEach((prop) => {
    const value = (obj as any)[prop];
    if (value && typeof value === 'object') {
      deepFreeze(value);
    }
  });
  
  return Object.freeze(obj);
}

