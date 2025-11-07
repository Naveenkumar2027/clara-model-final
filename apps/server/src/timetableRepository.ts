import { Pool, QueryResult } from 'pg';
import dotenv from 'dotenv';

type SemesterClass = {
  time: string;
  subject: string;
  subjectCode?: string;
  courseName?: string;
  classType?: 'Theory' | 'Lab' | 'Free' | 'Busy';
  batch?: string;
  room?: string;
};

type TimetableSchedule = {
  Monday?: SemesterClass[];
  Tuesday?: SemesterClass[];
  Wednesday?: SemesterClass[];
  Thursday?: SemesterClass[];
  Friday?: SemesterClass[];
  Saturday?: SemesterClass[];
};

export type FacultyTimetable = {
  facultyId: string;
  faculty: string;
  designation?: string;
  semester: string;
  schedule: TimetableSchedule;
  workload?: {
    theory: number;
    lab: number;
    totalUnits: number;
  };
  updatedAt: string;
  editHistory?: Array<{
    editedBy: string;
    date: string;
    fieldChanged: string;
  }>;
};

dotenv.config();

export class TimetableRepository {
  private pool: Pool | null = null;
  private memoryStore: Map<string, FacultyTimetable> = new Map();
  private useMemory = false;

  constructor() {
    const dbUrl = process.env.DATABASE_URL;
    if (dbUrl && dbUrl.startsWith('postgres')) {
      try {
        this.pool = new Pool({ connectionString: dbUrl });
        this.initDb().catch(console.error);
      } catch (e) {
        console.warn('Failed to connect to Postgres for timetables, using in-memory store:', e);
        this.useMemory = true;
      }
    } else {
      this.useMemory = true;
      console.log('Using in-memory store for timetables (no DATABASE_URL)');
    }
  }

  private async initDb() {
    if (!this.pool) return;
    
    try {
      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS faculty_timetables (
          id VARCHAR(255) PRIMARY KEY,
          faculty_id VARCHAR(255) NOT NULL,
          semester VARCHAR(100) NOT NULL,
          faculty VARCHAR(255) NOT NULL,
          designation VARCHAR(255),
          schedule JSONB NOT NULL,
          workload JSONB,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          edit_history JSONB DEFAULT '[]'::jsonb,
          UNIQUE(faculty_id, semester)
        );
      `);
      console.log('Timetable database initialized');
    } catch (e) {
      console.error('Failed to initialize timetable database:', e);
      this.useMemory = true;
      this.pool = null;
    }
  }

  private getKey(facultyId: string, semester: string): string {
    return `${facultyId}_${semester}`;
  }

  async get(facultyId: string, semester: string): Promise<FacultyTimetable | null> {
    const key = this.getKey(facultyId, semester);
    
    if (this.useMemory || !this.pool) {
      const timetable = this.memoryStore.get(key);
      return timetable ? { ...timetable } : null;
    }

    try {
      const result: QueryResult = await this.pool.query(
        'SELECT * FROM faculty_timetables WHERE faculty_id = $1 AND semester = $2',
        [facultyId, semester]
      );
      
      if (result.rows.length === 0) return null;
      
      const row = result.rows[0];
      return {
        facultyId: row.faculty_id,
        faculty: row.faculty,
        designation: row.designation,
        semester: row.semester,
        schedule: row.schedule,
        workload: row.workload,
        updatedAt: row.updated_at.toISOString(),
        editHistory: row.edit_history || [],
      };
    } catch (e) {
      console.error('Failed to get timetable from DB:', e);
      const timetable = this.memoryStore.get(key);
      return timetable ? { ...timetable } : null;
    }
  }

  async createOrUpdate(
    timetable: FacultyTimetable,
    editedBy: string,
    fieldChanged?: string
  ): Promise<FacultyTimetable> {
    const key = this.getKey(timetable.facultyId, timetable.semester);
    const now = new Date().toISOString();
    
    // Add edit history entry
    const editHistory = timetable.editHistory || [];
    if (fieldChanged) {
      editHistory.push({
        editedBy,
        date: now,
        fieldChanged,
      });
    }

    const updatedTimetable: FacultyTimetable = {
      ...timetable,
      updatedAt: now,
      editHistory: editHistory.slice(-50), // Keep last 50 edits
    };

    if (this.useMemory || !this.pool) {
      this.memoryStore.set(key, { ...updatedTimetable });
      return updatedTimetable;
    }

    try {
      await this.pool.query(
        `INSERT INTO faculty_timetables (id, faculty_id, semester, faculty, designation, schedule, workload, updated_at, edit_history)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (faculty_id, semester)
         DO UPDATE SET
           faculty = EXCLUDED.faculty,
           designation = EXCLUDED.designation,
           schedule = EXCLUDED.schedule,
           workload = EXCLUDED.workload,
           updated_at = EXCLUDED.updated_at,
           edit_history = EXCLUDED.edit_history`,
        [
          key,
          timetable.facultyId,
          timetable.semester,
          timetable.faculty,
          timetable.designation || null,
          JSON.stringify(timetable.schedule),
          timetable.workload ? JSON.stringify(timetable.workload) : null,
          now,
          JSON.stringify(editHistory),
        ]
      );
      return updatedTimetable;
    } catch (e) {
      console.error('Failed to save timetable to DB:', e);
      this.memoryStore.set(key, { ...updatedTimetable });
      return updatedTimetable;
    }
  }

  async getAllForSemester(semester: string): Promise<FacultyTimetable[]> {
    if (this.useMemory || !this.pool) {
      return Array.from(this.memoryStore.values())
        .filter(t => t.semester === semester);
    }

    try {
      const result: QueryResult = await this.pool.query(
        'SELECT * FROM faculty_timetables WHERE semester = $1 ORDER BY faculty',
        [semester]
      );
      
      return result.rows.map(row => ({
        facultyId: row.faculty_id,
        faculty: row.faculty,
        designation: row.designation,
        semester: row.semester,
        schedule: row.schedule,
        workload: row.workload,
        updatedAt: row.updated_at.toISOString(),
        editHistory: row.edit_history || [],
      }));
    } catch (e) {
      console.error('Failed to get timetables from DB:', e);
      return Array.from(this.memoryStore.values())
        .filter(t => t.semester === semester);
    }
  }

  async close() {
    if (this.pool) {
      await this.pool.end();
    }
  }
}

