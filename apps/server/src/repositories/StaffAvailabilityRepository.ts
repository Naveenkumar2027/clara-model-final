/**
 * Staff Availability Repository
 * Manages staff availability status for call routing
 */
import { Pool, QueryResult } from 'pg';
import { StaffAvailability } from '../models/Call.js';
import dotenv from 'dotenv';

dotenv.config();

export class StaffAvailabilityRepository {
  private pool: Pool | null = null;
  private memoryStore: Map<string, StaffAvailability> = new Map();
  private useMemory = false;

  constructor() {
    const dbUrl = process.env.DATABASE_URL;
    if (dbUrl && dbUrl.startsWith('postgres')) {
      try {
        this.pool = new Pool({ connectionString: dbUrl });
        this.initDb().catch(console.error);
      } catch (e) {
        console.warn('Failed to connect to Postgres, using in-memory store:', e);
        this.useMemory = true;
      }
    } else {
      this.useMemory = true;
      console.log('Using in-memory store for availability (no DATABASE_URL)');
    }
  }

  private async initDb() {
    if (!this.pool) return;
    
    try {
      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS staff_availability (
          user_id VARCHAR(255) NOT NULL,
          org_id VARCHAR(255) NOT NULL,
          status VARCHAR(50) NOT NULL,
          updated_at BIGINT NOT NULL,
          skills JSONB,
          PRIMARY KEY (user_id, org_id)
        );
      `);

      await this.pool.query(`
        CREATE INDEX IF NOT EXISTS idx_staff_availability_status 
        ON staff_availability(status) WHERE status = 'available';
      `);

      console.log('✅ Staff availability schema initialized');
    } catch (e) {
      console.error('Failed to initialize availability DB:', e);
      this.useMemory = true;
      this.pool = null;
    }
  }

  async setAvailability(availability: StaffAvailability): Promise<void> {
    if (this.useMemory || !this.pool) {
      const key = `${availability.userId}:${availability.orgId}`;
      this.memoryStore.set(key, { ...availability });
      return;
    }

    try {
      await this.pool.query(
        `INSERT INTO staff_availability (user_id, org_id, status, updated_at, skills)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (user_id, org_id) 
         DO UPDATE SET status = $3, updated_at = $4, skills = $5`,
        [
          availability.userId,
          availability.orgId,
          availability.status,
          availability.updatedAt,
          availability.skills ? JSON.stringify(availability.skills) : null,
        ]
      );
    } catch (e) {
      console.error('Failed to set availability:', e);
      const key = `${availability.userId}:${availability.orgId}`;
      this.memoryStore.set(key, { ...availability });
    }
  }

  /**
   * Find available staff for call routing
   * Returns staff sorted by lastSeenAt (most recent first)
   */
  async findAvailableStaff(orgId: string, skills?: string[]): Promise<StaffAvailability[]> {
    if (this.useMemory || !this.pool) {
      return Array.from(this.memoryStore.values())
        .filter(a => a.orgId === orgId && a.status === 'available')
        .sort((a, b) => b.updatedAt - a.updatedAt);
    }

    try {
      let query = `
        SELECT * FROM staff_availability 
        WHERE org_id = $1 AND status = 'available'
        ORDER BY updated_at DESC
      `;
      const params: any[] = [orgId];

      // TODO: Add skills filtering if needed
      if (skills && skills.length > 0) {
        query = `
          SELECT * FROM staff_availability 
          WHERE org_id = $1 
            AND status = 'available'
            AND skills @> $2::jsonb
          ORDER BY updated_at DESC
        `;
        params.push(JSON.stringify(skills));
      }

      const result: QueryResult = await this.pool.query(query, params);
      
      return result.rows.map(row => ({
        userId: row.user_id,
        orgId: row.org_id,
        status: row.status as 'available' | 'busy' | 'away' | 'offline',
        updatedAt: row.updated_at,
        skills: row.skills,
      }));
    } catch (e) {
      console.error('Failed to find available staff:', e);
      return Array.from(this.memoryStore.values())
        .filter(a => a.orgId === orgId && a.status === 'available')
        .sort((a, b) => b.updatedAt - a.updatedAt);
    }
  }

  async getAvailability(userId: string, orgId: string): Promise<StaffAvailability | null> {
    if (this.useMemory || !this.pool) {
      const key = `${userId}:${orgId}`;
      return this.memoryStore.get(key) || null;
    }

    try {
      const result: QueryResult = await this.pool.query(
        'SELECT * FROM staff_availability WHERE user_id = $1 AND org_id = $2',
        [userId, orgId]
      );

      if (result.rows.length === 0) return null;

      const row = result.rows[0];
      return {
        userId: row.user_id,
        orgId: row.org_id,
        status: row.status as 'available' | 'busy' | 'away' | 'offline',
        updatedAt: row.updated_at,
        skills: row.skills,
      };
    } catch (e) {
      console.error('Failed to get availability:', e);
      const key = `${userId}:${orgId}`;
      return this.memoryStore.get(key) || null;
    }
  }

  async close() {
    if (this.pool) {
      await this.pool.end();
    }
  }
}

