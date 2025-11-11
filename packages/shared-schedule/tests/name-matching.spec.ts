import { describe, it, expect } from 'vitest';
import {
  levenshteinDistance,
  normalizeForMatching,
  findFacultyByName,
  matchFacultyName,
} from '../src/utils/name-matching.js';

describe('Name Matching', () => {
  describe('Levenshtein Distance', () => {
    it('should calculate distance between identical strings', () => {
      expect(levenshteinDistance('test', 'test')).toBe(0);
    });

    it('should calculate distance between different strings', () => {
      expect(levenshteinDistance('kitten', 'sitting')).toBe(3);
      expect(levenshteinDistance('anitha', 'anita')).toBe(1);
    });

    it('should handle empty strings', () => {
      expect(levenshteinDistance('', 'test')).toBe(4);
      expect(levenshteinDistance('test', '')).toBe(4);
      expect(levenshteinDistance('', '')).toBe(0);
    });
  });

  describe('Normalize for Matching', () => {
    it('should lowercase and remove special chars', () => {
      expect(normalizeForMatching('Ms. Test Faculty')).toBe('ms test faculty');
      expect(normalizeForMatching('Dr.  Test   Faculty  ')).toBe('dr test faculty');
    });

    it('should handle names with punctuation', () => {
      expect(normalizeForMatching("Mrs. O'Brien")).toBe('mrs obrien');
      expect(normalizeForMatching('Test-Faculty')).toBe('testfaculty');
    });
  });

  describe('Match Faculty Name', () => {
    const mockFaculty = {
      short_name: 'acs',
      faculty_name: 'Mrs. Anitha C S (ACS)',
      email: 'anithacs@gmail.com',
    };

    it('should match exact short name', () => {
      const result = matchFacultyName('acs', mockFaculty);
      expect(result).not.toBeNull();
      expect(result?.matchType).toBe('exact');
      expect(result?.score).toBe(1000);
    });

    it('should match exact full name', () => {
      const result = matchFacultyName('Mrs. Anitha C S (ACS)', mockFaculty);
      expect(result).not.toBeNull();
      expect(result?.matchType).toBe('exact');
    });

    it('should match short name substring', () => {
      const result = matchFacultyName('ac', mockFaculty);
      expect(result).not.toBeNull();
      expect(result?.matchType).toBe('short_name');
    });

    it('should match partial name', () => {
      const result = matchFacultyName('Anitha', mockFaculty);
      expect(result).not.toBeNull();
      expect(result?.matchType).toBe('partial');
    });

    it('should match fuzzy name with distance <= 2', () => {
      const result = matchFacultyName('Anita', mockFaculty);
      expect(result).not.toBeNull();
      expect(result?.matchType).toBe('fuzzy');
      expect(result?.distance).toBeLessThanOrEqual(2);
    });

    it('should reject fuzzy name with distance > 2', () => {
      const result = matchFacultyName('CompletelyDifferent', mockFaculty);
      expect(result).toBeNull();
    });

    it('should be case-insensitive', () => {
      const result1 = matchFacultyName('ACS', mockFaculty);
      const result2 = matchFacultyName('acs', mockFaculty);
      expect(result1).not.toBeNull();
      expect(result2).not.toBeNull();
    });
  });

  describe('Find Faculty by Name', () => {
    const mockFaculties = [
      {
        short_name: 'ldn',
        faculty_name: 'Ms. Lakshmi Durga N',
        email: 'lakshmidurgan@gmail.com',
      },
      {
        short_name: 'acs',
        faculty_name: 'Mrs. Anitha C S (ACS)',
        email: 'anithacs@gmail.com',
      },
      {
        short_name: 'gd',
        faculty_name: 'Dr. Dhivyasri G',
        email: 'gdhivyasri@gmail.com',
      },
    ];

    it('should find exact match first', () => {
      const results = findFacultyByName('acs', mockFaculties);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].faculty.short_name).toBe('acs');
      expect(results[0].matchType).toBe('exact');
    });

    it('should rank results by score', () => {
      const results = findFacultyByName('anitha', mockFaculties);
      expect(results.length).toBeGreaterThan(0);
      // Exact or partial matches should come before fuzzy
      expect(results[0].score).toBeGreaterThanOrEqual(500);
    });

    it('should return top 3 matches', () => {
      const results = findFacultyByName('a', mockFaculties);
      expect(results.length).toBeLessThanOrEqual(3);
    });

    it('should handle fuzzy matching with typos', () => {
      const results = findFacultyByName('Anita', mockFaculties);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].faculty.short_name).toBe('acs');
      expect(results[0].distance).toBeLessThanOrEqual(2);
    });

    it('should return empty array for no matches', () => {
      const results = findFacultyByName('Nonexistent', mockFaculties);
      expect(results).toHaveLength(0);
    });
  });
});

