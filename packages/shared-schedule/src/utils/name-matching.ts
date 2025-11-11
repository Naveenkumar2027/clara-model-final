/**
 * Calculate Levenshtein distance between two strings
 */
export function levenshteinDistance(str1: string, str2: string): number {
  const len1 = str1.length;
  const len2 = str2.length;
  
  if (len1 === 0) return len2;
  if (len2 === 0) return len1;
  
  const matrix: number[][] = [];
  
  // Initialize matrix
  for (let i = 0; i <= len1; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= len2; j++) {
    matrix[0][j] = j;
  }
  
  // Fill matrix
  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,     // deletion
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j - 1] + 1  // substitution
        );
      }
    }
  }
  
  return matrix[len1][len2];
}

/**
 * Normalize string for matching (lowercase, remove special chars, trim)
 */
export function normalizeForMatching(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^\w\s]/g, '') // Remove special characters
    .replace(/\s+/g, ' ')     // Collapse whitespace
    .trim();
}

/**
 * Extract name parts from faculty name (remove honorifics, get first/last names)
 */
export function extractNameParts(name: string): string[] {
  const normalized = normalizeForMatching(name);
  // Remove common honorifics
  const withoutHonorifics = normalized.replace(/\b(mrs?|ms|dr|prof|professor|mr)\b\.?\s*/g, '');
  // Extract words (name parts)
  const parts = withoutHonorifics.split(/\s+/).filter(p => p.length > 0);
  return parts;
}

/**
 * Match type for ranking search results
 */
export type MatchType = 'exact' | 'short_name' | 'fuzzy' | 'partial';

export interface NameMatchResult {
  faculty: any; // Faculty object (will be typed properly in store.ts)
  matchType: MatchType;
  distance: number;
  score: number; // Higher is better (for sorting)
}

/**
 * Check if query matches faculty name with various strategies
 */
export function matchFacultyName(
  query: string,
  faculty: {
    short_name: string;
    faculty_name: string;
    email: string;
  }
): NameMatchResult | null {
  const normalizedQuery = normalizeForMatching(query);
  const normalizedShortName = normalizeForMatching(faculty.short_name);
  const normalizedFullName = normalizeForMatching(faculty.faculty_name);
  const normalizedEmail = normalizeForMatching(faculty.email.split('@')[0]);
  
  // 1. Exact match (short name or full name)
  if (normalizedQuery === normalizedShortName || normalizedQuery === normalizedFullName) {
    return {
      faculty,
      matchType: 'exact',
      distance: 0,
      score: 1000,
    };
  }
  
  // 2. Short name match
  if (normalizedShortName.includes(normalizedQuery) || normalizedQuery.includes(normalizedShortName)) {
    return {
      faculty,
      matchType: 'short_name',
      distance: 0,
      score: 800,
    };
  }
  
  // 3. Partial match (query is substring of name or vice versa)
  if (normalizedFullName.includes(normalizedQuery) || normalizedQuery.includes(normalizedFullName)) {
    const distance = Math.abs(normalizedFullName.length - normalizedQuery.length);
    return {
      faculty,
      matchType: 'partial',
      distance,
      score: 600 - distance,
    };
  }
  
  // 4. Fuzzy match using Levenshtein distance
  const fullNameDistance = levenshteinDistance(normalizedQuery, normalizedFullName);
  const shortNameDistance = levenshteinDistance(normalizedQuery, normalizedShortName);
  const emailDistance = levenshteinDistance(normalizedQuery, normalizedEmail);
  
  const minDistance = Math.min(fullNameDistance, shortNameDistance, emailDistance);
  
  // Only accept fuzzy matches with distance <= 2
  if (minDistance <= 2) {
    return {
      faculty,
      matchType: 'fuzzy',
      distance: minDistance,
      score: 400 - (minDistance * 50), // Score decreases with distance
    };
  }
  
  // 5. Check name parts (first name, last name)
  const queryParts = extractNameParts(query);
  const facultyParts = extractNameParts(faculty.faculty_name);
  
  if (queryParts.length > 0 && facultyParts.length > 0) {
    // Check if any query part matches any faculty part
    for (const qPart of queryParts) {
      for (const fPart of facultyParts) {
        if (qPart === fPart) {
          return {
            faculty,
            matchType: 'partial',
            distance: 1,
            score: 500,
          };
        }
        const partDistance = levenshteinDistance(qPart, fPart);
        if (partDistance <= 2) {
          return {
            faculty,
            matchType: 'fuzzy',
            distance: partDistance,
            score: 300 - (partDistance * 50),
          };
        }
      }
    }
  }
  
  return null;
}

/**
 * Find faculty by name with ranking
 */
export function findFacultyByName(
  query: string,
  faculties: ReadonlyArray<{
    short_name: string;
    faculty_name: string;
    email: string;
  }>
): NameMatchResult[] {
  const matches: NameMatchResult[] = [];
  
  for (const faculty of faculties) {
    const match = matchFacultyName(query, faculty);
    if (match) {
      matches.push(match);
    }
  }
  
  // Sort by score (higher is better), then by distance (lower is better)
  matches.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    return a.distance - b.distance;
  });
  
  return matches;
}

