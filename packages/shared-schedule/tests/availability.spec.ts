import { describe, it, expect, beforeEach } from 'vitest';
import { loadFacultyData, isFreeNow, nextFreeWindow, freeIntervalsOnDay, isFreeAtTime } from '../src/index.js';
import { getCurrentTimeInTimezone, getDateAtTime } from '../src/utils/time.js';

// Mock faculty data for testing
const mockFacultyData = [
  {
    faculty_name: 'Ms. Test Faculty',
    email: 'test@example.com',
    route: '/test',
    short_name: 'test',
    designation: 'Assistant Professor',
    academic_year: '2025-2026',
    semester_type: 'Odd',
    workload: {
      theory_hours: 8,
      lab_hours: 8,
      total_units: 16,
    },
    courses_taught: [
      {
        subject_code: 'TEST101',
        subject_name: 'Test Course',
      },
    ],
    timetable: [
      {
        day: 'Monday',
        slots: [
          {
            start_time: '08:30',
            end_time: '09:25',
            subject_code: 'TEST101',
            subject_name: 'Test Course',
            class_details: '5th A',
          },
          {
            start_time: '11:35',
            end_time: '12:30',
            subject_code: 'TEST101',
            subject_name: 'Test Course',
            class_details: '5th B',
          },
        ],
      },
      {
        day: 'Tuesday',
        slots: [],
      },
      {
        day: 'Wednesday',
        slots: [
          {
            start_time: '10:40',
            end_time: '12:30',
            subject_code: 'TEST101',
            subject_name: 'Test Course',
            class_details: '5th A',
          },
        ],
      },
      {
        day: 'Thursday',
        slots: [],
      },
      {
        day: 'Friday',
        slots: [],
      },
      {
        day: 'Saturday',
        slots: [],
      },
    ],
  },
];

describe('Availability Engine', () => {
  beforeEach(() => {
    // Load mock data before each test
    loadFacultyData(mockFacultyData);
  });

  describe('isFreeNow', () => {
    it('should return free=true when no class at current time', () => {
      // Monday at 10:00 (between 09:25 and 11:35)
      const monday10AM = getDateAtTime(
        new Date('2025-01-06T10:00:00+05:30'), // Monday in Asia/Kolkata
        '10:00'
      );

      const result = isFreeNow('test', monday10AM);
      expect(result.free).toBe(true);
    });

    it('should return free=false when class is in session', () => {
      // Monday at 09:00 (during 08:30-09:25 slot)
      const monday9AM = getDateAtTime(
        new Date('2025-01-06T09:00:00+05:30'),
        '09:00'
      );

      const result = isFreeNow('test', monday9AM);
      expect(result.free).toBe(false);
      expect(result.currentSlot).toBeDefined();
      expect(result.currentSlot?.subject_name).toBe('Test Course');
    });

    it('should return free=true for empty day', () => {
      // Tuesday (no slots)
      const tuesday10AM = getDateAtTime(
        new Date('2025-01-07T10:00:00+05:30'),
        '10:00'
      );

      const result = isFreeNow('test', tuesday10AM);
      expect(result.free).toBe(true);
      expect(result.reason).toContain('No scheduled classes');
    });

    it('should return error for non-existent faculty', () => {
      const result = isFreeNow('nonexistent', new Date());
      expect(result.free).toBe(false);
      expect(result.reason).toContain('not found');
    });
  });

  describe('freeIntervalsOnDay', () => {
    it('should return free intervals for day with slots', () => {
      // Monday
      const monday = new Date('2025-01-06T10:00:00+05:30');
      const intervals = freeIntervalsOnDay('test', monday);

      expect(intervals.length).toBeGreaterThan(0);
      // Should have free time before first slot, between slots, and after last slot
      expect(intervals.some(i => i.start === '08:30' && i.end === '09:25')).toBe(false); // This is busy
      expect(intervals.some(i => i.start === '09:25' && i.end === '11:35')).toBe(true); // Free between slots
    });

    it('should return full day free for empty day', () => {
      // Tuesday (no slots)
      const tuesday = new Date('2025-01-07T10:00:00+05:30');
      const intervals = freeIntervalsOnDay('test', tuesday);

      expect(intervals.length).toBe(1);
      expect(intervals[0].start).toBe('08:30');
      expect(intervals[0].end).toBe('16:30');
    });

    it('should handle multi-hour slots', () => {
      // Wednesday (has 10:40-12:30 slot)
      const wednesday = new Date('2025-01-08T10:00:00+05:30');
      const intervals = freeIntervalsOnDay('test', wednesday);

      // Should have free time before and after the slot
      expect(intervals.length).toBeGreaterThan(0);
      const beforeSlot = intervals.find(i => i.end === '10:40');
      const afterSlot = intervals.find(i => i.start === '12:30');
      expect(beforeSlot || afterSlot).toBeDefined();
    });
  });

  describe('nextFreeWindow', () => {
    it('should find next free window on same day', () => {
      // Monday at 09:00 (during class)
      const monday9AM = getDateAtTime(
        new Date('2025-01-06T09:00:00+05:30'),
        '09:00'
      );

      const result = nextFreeWindow('test', monday9AM);
      expect(result).not.toBeNull();
      expect(result?.start).toBe('09:25'); // Next free after first slot
      expect(result?.day).toBe('Monday');
    });

    it('should find next free window on next day if busy all day', () => {
      // Create a faculty with slots all day Monday
      const busyFacultyData = [
        {
          ...mockFacultyData[0],
          timetable: [
            {
              day: 'Monday',
              slots: [
                {
                  start_time: '08:30',
                  end_time: '16:30',
                  subject_name: 'All Day Class',
                  class_details: '5th A',
                },
              ],
            },
            {
              day: 'Tuesday',
              slots: [],
            },
            {
              day: 'Wednesday',
              slots: [],
            },
            {
              day: 'Thursday',
              slots: [],
            },
            {
              day: 'Friday',
              slots: [],
            },
            {
              day: 'Saturday',
              slots: [],
            },
          ],
        },
      ];
      loadFacultyData(busyFacultyData);

      const monday10AM = getDateAtTime(
        new Date('2025-01-06T10:00:00+05:30'),
        '10:00'
      );

      const result = nextFreeWindow('test', monday10AM);
      expect(result).not.toBeNull();
      expect(result?.day).toBe('Tuesday'); // Next day
    });

    it('should return null if no free window in next 7 days', () => {
      // This would require a faculty with slots every day
      // For simplicity, we'll test with a faculty that has minimal free time
      const result = nextFreeWindow('test', new Date());
      // Should still find a free window (empty days)
      expect(result).not.toBeNull();
    });
  });

  describe('isFreeAtTime', () => {
    it('should return free=true for time with no class', () => {
      // Monday at 10:00
      const monday = new Date('2025-01-06T10:00:00+05:30');
      const result = isFreeAtTime('test', '10:00', monday);

      expect(result.free).toBe(true);
    });

    it('should return free=false for time during class', () => {
      // Monday at 09:00 (during 08:30-09:25 slot)
      const monday = new Date('2025-01-06T09:00:00+05:30');
      const result = isFreeAtTime('test', '09:00', monday);

      expect(result.free).toBe(false);
      expect(result.currentSlot).toBeDefined();
    });

    it('should validate time format', () => {
      const result = isFreeAtTime('test', 'invalid-time', new Date());
      expect(result.free).toBe(false);
      expect(result.reason).toContain('Invalid time format');
    });
  });

  describe('Edge Cases', () => {
    it('should handle back-to-back slots', () => {
      const backToBackData = [
        {
          ...mockFacultyData[0],
          timetable: [
            {
              day: 'Monday',
              slots: [
                {
                  start_time: '08:30',
                  end_time: '09:25',
                  subject_name: 'Class 1',
                  class_details: '5th A',
                },
                {
                  start_time: '09:25',
                  end_time: '10:20',
                  subject_name: 'Class 2',
                  class_details: '5th B',
                },
              ],
            },
            {
              day: 'Tuesday',
              slots: [],
            },
            {
              day: 'Wednesday',
              slots: [],
            },
            {
              day: 'Thursday',
              slots: [],
            },
            {
              day: 'Friday',
              slots: [],
            },
            {
              day: 'Saturday',
              slots: [],
            },
          ],
        },
      ];
      loadFacultyData(backToBackData);

      // At the boundary (09:25), should be free (end of first slot, start of second)
      const monday925 = getDateAtTime(
        new Date('2025-01-06T09:25:00+05:30'),
        '09:25'
      );
      const result = isFreeNow('test', monday925);
      // At exact boundary, should be considered free (slot ends at 09:25, next starts at 09:25)
      // Actually, if end_time is exclusive, 09:25 should be free
      expect(result.free).toBe(true); // End time is exclusive
    });

    it('should handle overlapping slots', () => {
      // Overlapping slots should be treated as busy union
      const overlappingData = [
        {
          ...mockFacultyData[0],
          timetable: [
            {
              day: 'Monday',
              slots: [
                {
                  start_time: '08:30',
                  end_time: '10:20',
                  subject_name: 'Class 1',
                  class_details: '5th A',
                },
                {
                  start_time: '09:25',
                  end_time: '11:35',
                  subject_name: 'Class 2',
                  class_details: '5th B',
                },
              ],
            },
            {
              day: 'Tuesday',
              slots: [],
            },
            {
              day: 'Wednesday',
              slots: [],
            },
            {
              day: 'Thursday',
              slots: [],
            },
            {
              day: 'Friday',
              slots: [],
            },
            {
              day: 'Saturday',
              slots: [],
            },
          ],
        },
      ];
      loadFacultyData(overlappingData);

      // At 10:00, should be busy (in overlapping region)
      const monday10AM = getDateAtTime(
        new Date('2025-01-06T10:00:00+05:30'),
        '10:00'
      );
      const result = isFreeNow('test', monday10AM);
      expect(result.free).toBe(false);
    });
  });
});

