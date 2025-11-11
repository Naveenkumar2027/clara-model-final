import {
  getFacultyByShortName,
  getTodaySchedule,
  getWeeklySchedule,
  type Faculty,
  type Slot,
} from './store.js';
import {
  parseTime,
  formatTime,
  getCurrentTimeInTimezone,
  getDateAtTime,
  formatTimeFromDate,
  getDayOfWeek,
  WORKING_HOURS,
  mergeTimeRanges,
} from './utils/time.js';

/**
 * Check if faculty is free at a specific time
 */
export interface AvailabilityStatus {
  free: boolean;
  currentSlot?: Slot;
  reason?: string;
}

/**
 * Check if faculty is free right now
 */
export function isFreeNow(shortName: string, now: Date = getCurrentTimeInTimezone()): AvailabilityStatus {
  const faculty = getFacultyByShortName(shortName);
  if (!faculty) {
    return {
      free: false,
      reason: `Faculty with short name "${shortName}" not found`,
    };
  }

  const dayOfWeek = getDayOfWeek(now);
  const daySchedule = faculty.timetable.find(day => day.day === dayOfWeek);
  
  // If no schedule for this day, check if it's a working day
  if (!daySchedule || daySchedule.slots.length === 0) {
    // Empty day = free all day (unless it's outside working hours)
    const currentTime = formatTimeFromDate(now);
    const currentMinutes = parseTime(currentTime);
    const workStart = parseTime(WORKING_HOURS.start);
    const workEnd = parseTime(WORKING_HOURS.end);
    
    if (currentMinutes < workStart || currentMinutes > workEnd) {
      return {
        free: false,
        reason: 'Outside working hours',
      };
    }
    
    return {
      free: true,
      reason: 'No scheduled classes today',
    };
  }

  // Check current time against slots
  const currentTime = formatTimeFromDate(now);
  const currentMinutes = parseTime(currentTime);

  // Sort slots by start time to handle back-to-back slots correctly
  const sortedSlots = [...daySchedule.slots].sort((a, b) => {
    const aStart = parseTime(a.start_time);
    const bStart = parseTime(b.start_time);
    return aStart - bStart;
  });

  // Check for back-to-back slots: if a slot ends at time T and next starts at time T,
  // then time T should be considered free (transition period)
  for (let i = 0; i < sortedSlots.length; i++) {
    const slot = sortedSlots[i];
    const slotStart = parseTime(slot.start_time);
    const slotEnd = parseTime(slot.end_time);
    
    // Check if current time is exactly at the boundary between two back-to-back slots
    if (i > 0) {
      const prevSlot = sortedSlots[i - 1];
      const prevSlotEnd = parseTime(prevSlot.end_time);
      
      // If previous slot ends at current time and this slot starts at current time,
      // then current time is free (boundary between slots)
      if (prevSlotEnd === currentMinutes && slotStart === currentMinutes) {
        continue; // Skip this slot, time is free at the boundary
      }
    }
    
    // Check if current time is within this slot
    // Slots are inclusive at start, exclusive at end
    // So if currentMinutes == slotStart, it's in the slot
    // But if currentMinutes == slotEnd, it's NOT in the slot (exclusive end)
    if (currentMinutes >= slotStart && currentMinutes < slotEnd) {
      return {
        free: false,
        currentSlot: slot,
        reason: `Teaching ${slot.subject_name} (${slot.start_time}–${slot.end_time})`,
      };
    }
    
    // If we've passed all slots that could contain this time, break early
    if (currentMinutes < slotStart) {
      break;
    }
  }

  // Not in any slot = free
  return {
    free: true,
    reason: 'No class at this time',
  };
}

/**
 * Get next free window for a faculty
 */
export interface NextFreeWindow {
  start: string;
  end: string;
  durationMin: number;
  day: string;
}

export function nextFreeWindow(
  shortName: string,
  fromDateTime: Date = getCurrentTimeInTimezone()
): NextFreeWindow | null {
  const faculty = getFacultyByShortName(shortName);
  if (!faculty) {
    return null;
  }

  // Get free intervals for today and next few days
  const daysToCheck = 7; // Check up to a week ahead
  const currentTime = formatTimeFromDate(fromDateTime);
  const currentMinutes = parseTime(currentTime);
  const workStart = parseTime(WORKING_HOURS.start);
  const workEnd = parseTime(WORKING_HOURS.end);

  for (let dayOffset = 0; dayOffset < daysToCheck; dayOffset++) {
    const checkDate = new Date(fromDateTime);
    checkDate.setDate(checkDate.getDate() + dayOffset);
    const dayOfWeek = getDayOfWeek(checkDate);
    
    const daySchedule = faculty.timetable.find(day => day.day === dayOfWeek);
    const slots = daySchedule?.slots || [];

    // If no slots, faculty is free all day (within working hours)
    if (slots.length === 0) {
      if (dayOffset === 0 && currentMinutes >= workEnd) {
        // Already past working hours today, check next day
        continue;
      }
      
      const freeStart = dayOffset === 0 && currentMinutes > workStart
        ? currentTime
        : WORKING_HOURS.start;
      const freeEnd = WORKING_HOURS.end;
      
      return {
        start: freeStart,
        end: freeEnd,
        durationMin: parseTime(freeEnd) - parseTime(freeStart),
        day: dayOfWeek,
      };
    }

    // Find free intervals for this day
    const freeIntervals = freeIntervalsOnDay(shortName, checkDate);
    
    // For today, skip intervals that have already passed
    if (dayOffset === 0) {
      const futureIntervals = freeIntervals.filter(interval => {
        const intervalStart = parseTime(interval.start);
        return intervalStart > currentMinutes;
      });
      
      if (futureIntervals.length > 0) {
        const next = futureIntervals[0];
        return {
          start: next.start,
          end: next.end,
          durationMin: parseTime(next.end) - parseTime(next.start),
          day: dayOfWeek,
        };
      }
      
      // No more free intervals today, check if we're before working hours end
      if (currentMinutes < workEnd) {
        // Check if there's a gap after last slot and before work end
        const lastSlot = slots[slots.length - 1];
        const lastSlotEnd = parseTime(lastSlot.end_time);
        if (lastSlotEnd < workEnd) {
          return {
            start: lastSlot.end_time,
            end: WORKING_HOURS.end,
            durationMin: workEnd - lastSlotEnd,
            day: dayOfWeek,
          };
        }
      }
    } else {
      // For future days, return first free interval
      if (freeIntervals.length > 0) {
        const next = freeIntervals[0];
        return {
          start: next.start,
          end: next.end,
          durationMin: parseTime(next.end) - parseTime(next.start),
          day: dayOfWeek,
        };
      }
    }
  }

  // No free window found in the next week
  return null;
}

/**
 * Get free intervals for a specific day
 */
export interface FreeInterval {
  start: string;
  end: string;
}

export function freeIntervalsOnDay(shortName: string, date: Date): FreeInterval[] {
  const faculty = getFacultyByShortName(shortName);
  if (!faculty) {
    return [];
  }

  const dayOfWeek = getDayOfWeek(date);
  const daySchedule = faculty.timetable.find(day => day.day === dayOfWeek);
  const slots = daySchedule?.slots || [];

  // If no slots, faculty is free all day (within working hours)
  if (slots.length === 0) {
    return [
      {
        start: WORKING_HOURS.start,
        end: WORKING_HOURS.end,
      },
    ];
  }

  // Merge overlapping/adjacent slots
  const busyRanges = slots.map(slot => ({
    start: slot.start_time,
    end: slot.end_time,
  }));
  const mergedBusy = mergeTimeRanges(busyRanges);

  // Find free intervals between busy ranges
  const freeIntervals: FreeInterval[] = [];
  const workStart = parseTime(WORKING_HOURS.start);
  const workEnd = parseTime(WORKING_HOURS.end);

  // Check before first slot
  if (mergedBusy.length > 0) {
    const firstBusyStart = parseTime(mergedBusy[0].start);
    if (firstBusyStart > workStart) {
      freeIntervals.push({
        start: WORKING_HOURS.start,
        end: mergedBusy[0].start,
      });
    }
  } else {
    // No busy slots = free all day
    freeIntervals.push({
      start: WORKING_HOURS.start,
      end: WORKING_HOURS.end,
    });
    return freeIntervals;
  }

  // Check between slots
  for (let i = 0; i < mergedBusy.length - 1; i++) {
    const currentEnd = parseTime(mergedBusy[i].end);
    const nextStart = parseTime(mergedBusy[i + 1].start);
    
    if (nextStart > currentEnd) {
      freeIntervals.push({
        start: mergedBusy[i].end,
        end: mergedBusy[i + 1].start,
      });
    }
  }

  // Check after last slot
  if (mergedBusy.length > 0) {
    const lastBusyEnd = parseTime(mergedBusy[mergedBusy.length - 1].end);
    if (lastBusyEnd < workEnd) {
      freeIntervals.push({
        start: mergedBusy[mergedBusy.length - 1].end,
        end: WORKING_HOURS.end,
      });
    }
  }

  return freeIntervals;
}

/**
 * Check if faculty is free at a specific time on a specific day
 */
export function isFreeAtTime(
  shortName: string,
  timeStr: string,
  date: Date = getCurrentTimeInTimezone()
): AvailabilityStatus {
  const faculty = getFacultyByShortName(shortName);
  if (!faculty) {
    return {
      free: false,
      reason: `Faculty with short name "${shortName}" not found`,
    };
  }

  // Parse the time
  let queryTime: number;
  try {
    queryTime = parseTime(timeStr);
  } catch {
    return {
      free: false,
      reason: `Invalid time format: "${timeStr}"`,
    };
  }

  const dayOfWeek = getDayOfWeek(date);
  const daySchedule = faculty.timetable.find(day => day.day === dayOfWeek);
  
  // If no schedule for this day, check working hours
  if (!daySchedule || daySchedule.slots.length === 0) {
    const workStart = parseTime(WORKING_HOURS.start);
    const workEnd = parseTime(WORKING_HOURS.end);
    
    if (queryTime < workStart || queryTime > workEnd) {
      return {
        free: false,
        reason: 'Outside working hours',
      };
    }
    
    return {
      free: true,
      reason: 'No scheduled classes on this day',
    };
  }

  // Check if time falls within any slot
  for (const slot of daySchedule.slots) {
    const slotStart = parseTime(slot.start_time);
    const slotEnd = parseTime(slot.end_time);
    
    if (queryTime >= slotStart && queryTime < slotEnd) {
      return {
        free: false,
        currentSlot: slot,
        reason: `Teaching ${slot.subject_name} (${slot.start_time}–${slot.end_time})`,
      };
    }
  }

  // Not in any slot = free
  return {
    free: true,
    reason: 'No class at this time',
  };
}

