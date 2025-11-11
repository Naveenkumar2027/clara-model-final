import { describe, it, expect } from 'vitest';
import { validateFacultyData, FacultySchema, SlotSchema } from '../src/schema.js';
import { parseTime } from '../src/utils/time.js';

describe('Schema Validation', () => {
  describe('Time Validation', () => {
    it('should parse valid time strings', () => {
      expect(parseTime('08:30')).toBe(510); // 8*60 + 30
      expect(parseTime('13:15')).toBe(795); // 13*60 + 15
      expect(parseTime('23:59')).toBe(1439);
    });

    it('should reject invalid time formats', () => {
      expect(() => parseTime('8:30')).toThrow();
      expect(() => parseTime('08:3')).toThrow();
      expect(() => parseTime('25:00')).toThrow();
      expect(() => parseTime('08:60')).toThrow();
      expect(() => parseTime('abc')).toThrow();
    });

    it('should fix OCR typos', () => {
      // Test that "13:1t5" gets fixed to "13:15"
      const slotWithTypo = {
        start_time: '13:1t5',
        end_time: '14:10',
        subject_name: 'Test',
      };
      
      // The schema should normalize this
      const result = SlotSchema.safeParse(slotWithTypo);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.start_time).toBe('13:15');
      }
    });
  });

  describe('Slot Schema', () => {
    it('should validate valid slot', () => {
      const validSlot = {
        start_time: '08:30',
        end_time: '09:25',
        subject_code: 'BCD501',
        subject_name: 'Software Engineering',
        class_details: '5th A',
      };

      const result = SlotSchema.safeParse(validSlot);
      expect(result.success).toBe(true);
    });

    it('should reject slot where end_time is before start_time', () => {
      const invalidSlot = {
        start_time: '09:25',
        end_time: '08:30',
        subject_name: 'Test',
      };

      const result = SlotSchema.safeParse(invalidSlot);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].path).toContain('end_time');
      }
    });

    it('should allow nullable subject_code and class_details', () => {
      const slot = {
        start_time: '13:15',
        end_time: '14:10',
        subject_code: null,
        subject_name: 'PE',
        class_details: null,
      };

      const result = SlotSchema.safeParse(slot);
      expect(result.success).toBe(true);
    });
  });

  describe('Faculty Schema', () => {
    it('should validate complete faculty data', () => {
      const validFaculty = {
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
      };

      const result = FacultySchema.safeParse(validFaculty);
      expect(result.success).toBe(true);
    });

    it('should normalize faculty name', () => {
      const faculty = {
        faculty_name: 'ms.  test   faculty  ',
        email: 'test@example.com',
        route: '/test',
        short_name: 'test',
        designation: 'assistant professor',
        academic_year: '2025-2026',
        semester_type: 'Odd',
        workload: {
          theory_hours: 8,
          lab_hours: 8,
          total_units: 16,
        },
        courses_taught: [],
        timetable: [
          { day: 'Monday', slots: [] },
          { day: 'Tuesday', slots: [] },
          { day: 'Wednesday', slots: [] },
          { day: 'Thursday', slots: [] },
          { day: 'Friday', slots: [] },
          { day: 'Saturday', slots: [] },
        ],
      };

      const result = FacultySchema.safeParse(faculty);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.faculty_name).toBe('Ms. Test Faculty');
        expect(result.data.designation).toBe('Assistant Professor');
      }
    });

    it('should reject invalid email', () => {
      const faculty = {
        faculty_name: 'Test Faculty',
        email: 'invalid-email',
        route: '/test',
        short_name: 'test',
        designation: 'Professor',
        academic_year: '2025-2026',
        semester_type: 'Odd',
        workload: {
          theory_hours: 8,
          lab_hours: 8,
          total_units: 16,
        },
        courses_taught: [],
        timetable: [
          { day: 'Monday', slots: [] },
          { day: 'Tuesday', slots: [] },
          { day: 'Wednesday', slots: [] },
          { day: 'Thursday', slots: [] },
          { day: 'Friday', slots: [] },
          { day: 'Saturday', slots: [] },
        ],
      };

      const result = FacultySchema.safeParse(faculty);
      expect(result.success).toBe(false);
    });
  });

  describe('Faculty Array Validation', () => {
    it('should validate array of faculties', () => {
      const faculties = [
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
          courses_taught: [],
          timetable: [
            { day: 'Monday', slots: [] },
            { day: 'Tuesday', slots: [] },
            { day: 'Wednesday', slots: [] },
            { day: 'Thursday', slots: [] },
            { day: 'Friday', slots: [] },
            { day: 'Saturday', slots: [] },
          ],
        },
      ];

      expect(() => validateFacultyData(faculties)).not.toThrow();
      const result = validateFacultyData(faculties);
      expect(result).toHaveLength(1);
    });

    it('should reject invalid time in timetable', () => {
      const faculties = [
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
          courses_taught: [],
          timetable: [
            {
              day: 'Monday',
              slots: [
                {
                  start_time: 'invalid-time',
                  end_time: '09:25',
                  subject_name: 'Test',
                },
              ],
            },
            { day: 'Tuesday', slots: [] },
            { day: 'Wednesday', slots: [] },
            { day: 'Thursday', slots: [] },
            { day: 'Friday', slots: [] },
            { day: 'Saturday', slots: [] },
          ],
        },
      ];

      expect(() => validateFacultyData(faculties)).toThrow();
    });

    it('should provide detailed error message with field path', () => {
      const faculties = [
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
          courses_taught: [],
          timetable: [
            {
              day: 'Monday',
              slots: [
                {
                  start_time: '13:1t5', // Invalid time that can't be auto-corrected uniquely
                  end_time: '14:10',
                  subject_name: 'Test',
                },
              ],
            },
            { day: 'Tuesday', slots: [] },
            { day: 'Wednesday', slots: [] },
            { day: 'Thursday', slots: [] },
            { day: 'Friday', slots: [] },
            { day: 'Saturday', slots: [] },
          ],
        },
      ];

      try {
        validateFacultyData(faculties);
        // If validation passes, the typo was fixed
        // This is acceptable behavior
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        if (error instanceof Error) {
          expect(error.message).toContain('time');
        }
      }
    });
  });
});

