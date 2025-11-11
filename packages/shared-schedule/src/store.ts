import { validateFacultyData, deepFreeze, type Faculty, type TimetableDay, type Slot } from './schema.js';
import { findFacultyByName } from './utils/name-matching.js';
import { normalizeForMatching } from './utils/name-matching.js';
import { getDayOfWeek } from './utils/time.js';

/**
 * Indexes for fast faculty lookup
 */
interface FacultyIndexes {
  byShortName: Map<string, Faculty>;
  byEmail: Map<string, Faculty>;
  byRoute: Map<string, Faculty>;
  byNormalizedName: Map<string, Faculty>;
}

/**
 * Faculty data store
 */
class FacultyStore {
  private faculties: readonly Faculty[] = [];
  private indexes: FacultyIndexes = {
    byShortName: new Map(),
    byEmail: new Map(),
    byRoute: new Map(),
    byNormalizedName: new Map(),
  };

  /**
   * Load and validate faculty data from JSON
   */
  loadFacultyData(rawJson: unknown): Faculty[] {
    // Validate and normalize
    const validated = validateFacultyData(rawJson);
    
    // Deep freeze for immutability
    const frozen = validated.map(faculty => deepFreeze(faculty));
    
    // Build indexes
    this.buildIndexes(frozen);
    
    // Store
    this.faculties = frozen;
    
    return [...frozen]; // Return a copy
  }

  /**
   * Build indexes for fast lookup
   */
  private buildIndexes(faculties: readonly Faculty[]): void {
    this.indexes.byShortName.clear();
    this.indexes.byEmail.clear();
    this.indexes.byRoute.clear();
    this.indexes.byNormalizedName.clear();

    for (const faculty of faculties) {
      // Index by short name
      this.indexes.byShortName.set(faculty.short_name.toLowerCase(), faculty);
      
      // Index by email
      this.indexes.byEmail.set(faculty.email.toLowerCase(), faculty);
      
      // Index by route (remove leading /)
      const routeKey = faculty.route.replace(/^\/+/, '').toLowerCase();
      this.indexes.byRoute.set(routeKey, faculty);
      this.indexes.byRoute.set(faculty.route.toLowerCase(), faculty);
      
      // Index by normalized name
      const normalizedName = normalizeForMatching(faculty.faculty_name);
      this.indexes.byNormalizedName.set(normalizedName, faculty);
    }
  }

  /**
   * Get faculty by short name
   */
  getFacultyByShortName(shortName: string): Faculty | undefined {
    return this.indexes.byShortName.get(shortName.toLowerCase());
  }

  /**
   * Get faculty by email
   */
  getFacultyByEmail(email: string): Faculty | undefined {
    return this.indexes.byEmail.get(email.toLowerCase());
  }

  /**
   * Get faculty by route
   */
  getFacultyByRoute(route: string): Faculty | undefined {
    const routeKey = route.replace(/^\/+/, '').toLowerCase();
    return this.indexes.byRoute.get(routeKey) || this.indexes.byRoute.get(route.toLowerCase());
  }

  /**
   * Get faculty by name with fuzzy matching
   * Returns ranked candidates (exact > short_name > fuzzy)
   */
  getFacultyByNameLike(query: string): Faculty[] {
    if (this.faculties.length === 0) {
      return [];
    }

    // Try exact matches first (short name, route, email)
    const shortNameMatch = this.getFacultyByShortName(query);
    if (shortNameMatch) {
      return [shortNameMatch];
    }

    const routeMatch = this.getFacultyByRoute(query);
    if (routeMatch) {
      return [routeMatch];
    }

    const emailMatch = this.getFacultyByEmail(query);
    if (emailMatch) {
      return [emailMatch];
    }

    // Try fuzzy matching
    // Convert readonly array to regular array for the function
    const matches = findFacultyByName(query, [...this.faculties]);
    
    // Return top 3 matches
    return matches.slice(0, 3).map(match => match.faculty);
  }

  /**
   * Get all faculties
   */
  getAllFaculties(): readonly Faculty[] {
    return this.faculties;
  }

  /**
   * Get weekly schedule for a faculty
   */
  getWeeklySchedule(shortName: string): TimetableDay[] | null {
    const faculty = this.getFacultyByShortName(shortName);
    if (!faculty) {
      return null;
    }
    return [...faculty.timetable]; // Return a copy
  }

  /**
   * Get today's schedule for a faculty
   */
  getTodaySchedule(shortName: string, date: Date): Slot[] {
    const faculty = this.getFacultyByShortName(shortName);
    if (!faculty) {
      return [];
    }

    const dayOfWeek = getDayOfWeek(date);
    const daySchedule = faculty.timetable.find(day => day.day === dayOfWeek);
    
    if (!daySchedule) {
      return [];
    }

    return [...daySchedule.slots]; // Return a copy
  }

  /**
   * Resolve faculty ID (short_name, route, email, or fuzzy name)
   */
  resolveFacultyId(id: string): Faculty | null {
    // Try short name first
    let faculty = this.getFacultyByShortName(id);
    if (faculty) return faculty;

    // Try route
    faculty = this.getFacultyByRoute(id);
    if (faculty) return faculty;

    // Try email
    faculty = this.getFacultyByEmail(id);
    if (faculty) return faculty;

    // Try fuzzy match
    const matches = this.getFacultyByNameLike(id);
    if (matches.length > 0) {
      return matches[0];
    }

    return null;
  }
}

// Singleton instance
let storeInstance: FacultyStore | null = null;

/**
 * Get the faculty store instance
 */
export function getFacultyStore(): FacultyStore {
  if (!storeInstance) {
    storeInstance = new FacultyStore();
  }
  return storeInstance;
}

/**
 * Load faculty data into the store
 */
export function loadFacultyData(rawJson: unknown): Faculty[] {
  const store = getFacultyStore();
  return store.loadFacultyData(rawJson);
}

/**
 * Get faculty by short name
 */
export function getFacultyByShortName(shortName: string): Faculty | undefined {
  return getFacultyStore().getFacultyByShortName(shortName);
}

/**
 * Get faculty by name with fuzzy matching
 */
export function getFacultyByNameLike(query: string): Faculty[] {
  return getFacultyStore().getFacultyByNameLike(query);
}

/**
 * Get weekly schedule for a faculty
 */
export function getWeeklySchedule(shortName: string): TimetableDay[] | null {
  return getFacultyStore().getWeeklySchedule(shortName);
}

/**
 * Get today's schedule for a faculty
 */
export function getTodaySchedule(shortName: string, date: Date): Slot[] {
  return getFacultyStore().getTodaySchedule(shortName, date);
}

/**
 * Resolve faculty ID (short_name, route, email, or fuzzy name)
 */
export function resolveFacultyId(id: string): Faculty | null {
  return getFacultyStore().resolveFacultyId(id);
}

/**
 * Get all faculties
 */
export function getAllFaculties(): readonly Faculty[] {
  return getFacultyStore().getAllFaculties();
}

// Re-export types
export type { Faculty, TimetableDay, Slot } from './schema.js';

