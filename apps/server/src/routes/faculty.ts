import { Router, Request, Response } from 'express';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';
import {
  loadFacultyData,
  resolveFacultyId,
  getFacultyByNameLike,
  getWeeklySchedule,
  isFreeNow,
  nextFreeWindow,
  freeIntervalsOnDay,
  isFreeAtTime,
  getCurrentTimeInTimezone,
  formatTimeFromDate,
  getDayOfWeek,
} from '@clara/shared-schedule';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load faculty data on module initialization
let facultyDataLoaded = false;

function loadFacultyDataIfNeeded(): void {
  if (facultyDataLoaded) return;

  try {
    // Try multiple path resolutions to find the data file
    // This works in both development (tsx) and production (node dist)
    const possiblePaths = [
      // Production: from server dist folder
      join(__dirname, '../../../packages/shared-schedule/data/faculty-timetables.json'),
      // Development: from server src folder (when running with tsx)
      join(__dirname, '../../../../packages/shared-schedule/data/faculty-timetables.json'),
      // Alternative: resolve from process.cwd() (works in monorepo root)
      resolve(process.cwd(), 'packages/shared-schedule/data/faculty-timetables.json'),
      // Alternative: resolve from __dirname
      resolve(__dirname, '../../../packages/shared-schedule/data/faculty-timetables.json'),
      // Fallback: try from node_modules workspace
      resolve(process.cwd(), 'node_modules/@clara/shared-schedule/data/faculty-timetables.json'),
    ];

    let dataPath: string | null = null;
    for (const path of possiblePaths) {
      try {
        // Check if file exists and is readable
        const stats = readFileSync(path, 'utf-8');
        if (stats) {
          dataPath = path;
          break;
        }
      } catch (err) {
        // File doesn't exist or can't be read, try next path
        continue;
      }
    }

    if (!dataPath) {
      console.warn(`[Faculty Routes] Could not find faculty-timetables.json. Tried paths: ${possiblePaths.join(', ')}`);
      console.warn(`[Faculty Routes] Current working directory: ${process.cwd()}`);
      console.warn(`[Faculty Routes] __dirname: ${__dirname}`);
      // Don't throw - routes will return errors if data not loaded
      return;
    }

    const rawData = JSON.parse(readFileSync(dataPath, 'utf-8'));
    loadFacultyData(rawData);
    facultyDataLoaded = true;
    console.log(`[Faculty Routes] Faculty data loaded successfully from: ${dataPath}`);
  } catch (error) {
    console.error('[Faculty Routes] Failed to load faculty data:', error);
    if (error instanceof Error) {
      console.error('[Faculty Routes] Error details:', error.message);
      console.error('[Faculty Routes] Stack:', error.stack);
    }
    // Don't throw - routes will return errors if data not loaded
  }
}

// Load data on module load
loadFacultyDataIfNeeded();

export function createFacultyRoutes(): Router {
  const router = Router();

  // Middleware to ensure data is loaded
  router.use((_req, _res, next) => {
    loadFacultyDataIfNeeded();
    next();
  });

  /**
   * GET /api/faculty/search?q=name
   * Search for faculty by name (fuzzy matching)
   */
  router.get('/faculty/search', (req: Request, res: Response) => {
    try {
      const query = req.query.q as string;
      if (!query || typeof query !== 'string') {
        return res.status(400).json({
          error: 'Query parameter "q" is required',
        });
      }

      const matches = getFacultyByNameLike(query);
      if (matches.length === 0) {
        return res.status(404).json({
          error: 'No faculty found matching the query',
          query,
        });
      }

      // Return top 3 matches with basic info
      const results = matches.slice(0, 3).map(faculty => ({
        short_name: faculty.short_name,
        faculty_name: faculty.faculty_name,
        email: faculty.email,
        route: faculty.route,
        designation: faculty.designation,
      }));

      res.json({
        query,
        results,
        count: results.length,
      });
    } catch (error) {
      console.error('[Faculty Routes] Search error:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * GET /api/faculty/:id/schedule
   * Get weekly schedule for a faculty member
   */
  router.get('/faculty/:id/schedule', (req: Request, res: Response) => {
    try {
      const id = req.params.id;
      console.log(`[Faculty Routes] GET /faculty/${id}/schedule`);
      
      const faculty = resolveFacultyId(id);

      if (!faculty) {
        console.warn(`[Faculty Routes] Faculty not found: ${id}`);
        return res.status(404).json({
          error: `Faculty not found: ${id}`,
          suggestion: 'Try searching with ?q=name parameter',
        });
      }
      
      console.log(`[Faculty Routes] Found faculty: ${faculty.short_name} (${faculty.faculty_name})`);

      const schedule = getWeeklySchedule(faculty.short_name);
      console.log(`[Faculty Routes] Schedule retrieved: ${schedule?.length || 0} days`);
      
      if (!schedule || schedule.length === 0) {
        console.warn(`[Faculty Routes] No schedule found for faculty: ${faculty.short_name}`);
        return res.status(404).json({
          error: 'Schedule not found for faculty',
          faculty: {
            short_name: faculty.short_name,
            faculty_name: faculty.faculty_name,
          },
        });
      }

      res.json({
        faculty: {
          short_name: faculty.short_name,
          faculty_name: faculty.faculty_name,
          email: faculty.email,
          designation: faculty.designation,
        },
        schedule,
        academic_year: faculty.academic_year,
        semester_type: faculty.semester_type,
      });
    } catch (error) {
      console.error('[Faculty Routes] Schedule error:', error);
      if (error instanceof Error) {
        console.error('[Faculty Routes] Error stack:', error.stack);
      }
      res.status(500).json({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * GET /api/faculty/:id/availability/now
   * Check if faculty is free right now
   */
  router.get('/faculty/:id/availability/now', (req: Request, res: Response) => {
    try {
      const id = req.params.id;
      console.log(`[Faculty Routes] GET /faculty/${id}/availability/now`);
      
      const faculty = resolveFacultyId(id);

      if (!faculty) {
        console.warn(`[Faculty Routes] Faculty not found for availability: ${id}`);
        return res.status(404).json({
          error: `Faculty not found: ${id}`,
        });
      }
      
      console.log(`[Faculty Routes] Found faculty: ${faculty.short_name} (${faculty.faculty_name})`);

      const now = getCurrentTimeInTimezone();
      console.log(`[Faculty Routes] Current time (Asia/Kolkata): ${now.toISOString()}`);
      
      const availability = isFreeNow(faculty.short_name, now);
      console.log(`[Faculty Routes] Availability: free=${availability.free}, currentSlot=${availability.currentSlot?.subject_name || 'none'}`);

      res.json({
        free: availability.free,
        currentSlot: availability.currentSlot || undefined,
        faculty: {
          short_name: faculty.short_name,
          faculty_name: faculty.faculty_name,
        },
        reason: availability.reason,
        checked_at: formatTimeFromDate(now),
      });
    } catch (error) {
      console.error('[Faculty Routes] Availability now error:', error);
      if (error instanceof Error) {
        console.error('[Faculty Routes] Error stack:', error.stack);
      }
      res.status(500).json({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * GET /api/faculty/:id/availability/next
   * Get next free window for faculty
   */
  router.get('/faculty/:id/availability/next', (req: Request, res: Response) => {
    try {
      const id = req.params.id;
      const faculty = resolveFacultyId(id);

      if (!faculty) {
        return res.status(404).json({
          error: `Faculty not found: ${id}`,
        });
      }

      const fromDateTime = req.query.from
        ? new Date(req.query.from as string)
        : getCurrentTimeInTimezone();

      const nextFree = nextFreeWindow(faculty.short_name, fromDateTime);

      if (!nextFree) {
        return res.json({
          faculty: {
            short_name: faculty.short_name,
            faculty_name: faculty.faculty_name,
          },
          next_free: null,
          message: 'No free window found in the next 7 days',
        });
      }

      res.json({
        faculty: {
          short_name: faculty.short_name,
          faculty_name: faculty.faculty_name,
        },
        next_free: nextFree,
      });
    } catch (error) {
      console.error('[Faculty Routes] Next free error:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * GET /api/faculty/:id/availability/day?date=YYYY-MM-DD
   * Get free intervals for a specific day
   */
  router.get('/faculty/:id/availability/day', (req: Request, res: Response) => {
    try {
      const id = req.params.id;
      const faculty = resolveFacultyId(id);

      if (!faculty) {
        return res.status(404).json({
          error: `Faculty not found: ${id}`,
        });
      }

      const date = req.query.date
        ? new Date(req.query.date as string)
        : getCurrentTimeInTimezone();

      const freeIntervals = freeIntervalsOnDay(faculty.short_name, date);

      res.json({
        faculty: {
          short_name: faculty.short_name,
          faculty_name: faculty.faculty_name,
        },
        date: date.toISOString().split('T')[0],
        day: getDayOfWeek(date),
        free_intervals: freeIntervals,
      });
    } catch (error) {
      console.error('[Faculty Routes] Day availability error:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * GET /api/faculty/:id/availability/at?time=HH:MM&date=YYYY-MM-DD
   * Check if faculty is free at a specific time
   */
  router.get('/faculty/:id/availability/at', (req: Request, res: Response) => {
    try {
      const id = req.params.id;
      const timeStr = req.query.time as string;

      if (!timeStr) {
        return res.status(400).json({
          error: 'Query parameter "time" is required (format: HH:MM)',
        });
      }

      const faculty = resolveFacultyId(id);
      if (!faculty) {
        return res.status(404).json({
          error: `Faculty not found: ${id}`,
        });
      }

      const date = req.query.date
        ? new Date(req.query.date as string)
        : getCurrentTimeInTimezone();

      const availability = isFreeAtTime(faculty.short_name, timeStr, date);

      res.json({
        faculty: {
          short_name: faculty.short_name,
          faculty_name: faculty.faculty_name,
        },
        time: timeStr,
        date: date.toISOString().split('T')[0],
        ...availability,
      });
    } catch (error) {
      console.error('[Faculty Routes] Availability at time error:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  return router;
}

