# Faculty Schedule & Availability System

## Overview

The Faculty Schedule & Availability System provides persistent storage and natural language query (NLQ) support for faculty timetable data. It enables users to ask questions like "Is Anitha ma'am free now?" and get accurate, real-time availability information.

## Architecture

### Components

1. **Shared Schedule Package** (`packages/shared-schedule`)
   - Schema validation with Zod
   - Data store with indexing
   - Availability computation engine
   - Name matching with fuzzy search

2. **Server API** (`apps/server/src/routes/faculty.ts`)
   - REST endpoints for schedule and availability queries
   - Faculty search with fuzzy matching
   - Cached in-memory data store

3. **Client NLQ Handler** (`apps/client/src/services/availabilityQueryHandler.ts`)
   - Pattern matching for availability queries
   - Integration with client chat interface
   - API calls to server endpoints

4. **Staff Dashboard** (`apps/staff/components/Timetable.tsx`)
   - Weekly timetable display
   - Real-time availability badge
   - Integration with shared schedule API

## Data Contract

### Faculty JSON Schema

```typescript
{
  faculty_name: string;        // e.g., "Ms. Lakshmi Durga N"
  email: string;               // e.g., "lakshmidurgan@gmail.com"
  route: string;               // e.g., "/ldn"
  short_name: string;          // e.g., "ldn"
  designation: string;         // e.g., "Assistant Professor"
  academic_year: string;       // e.g., "2025-2026"
  semester_type: string;       // e.g., "Odd"
  workload: {
    theory_hours: number;
    lab_hours: number;
    total_units: number;
  };
  courses_taught: Array<{
    subject_code: string;
    subject_name: string;
  }>;
  timetable: Array<{
    day: "Monday" | "Tuesday" | "Wednesday" | "Thursday" | "Friday" | "Saturday";
    slots: Array<{
      start_time: string;      // HH:MM format (24-hour)
      end_time: string;        // HH:MM format (24-hour)
      subject_code?: string | null;
      subject_name: string;
      class_details?: string | null;
    }>;
  }>;
}
```

### Time Format

- **Format**: `HH:MM` (24-hour)
- **Examples**: `08:30`, `13:15`, `16:30`
- **Validation**: Strict format validation, OCR typo detection and correction
- **Timezone**: All times in Asia/Kolkata

### Validation Rules

1. **Time Validation**:
   - Must match `HH:MM` format (24-hour)
   - Hours: 0-23, Minutes: 0-59
   - `end_time` must be after `start_time`
   - OCR typos like "13:1t5" are auto-corrected to "13:15" if unambiguous

2. **Name Normalization**:
   - Trim whitespace
   - Title case (first letter uppercase, rest lowercase)
   - Collapse multiple spaces

3. **Subject Code Normalization**:
   - Uppercase
   - Trim whitespace

## API Endpoints

### GET /api/faculty/search?q=name

Search for faculty by name with fuzzy matching.

**Query Parameters**:
- `q` (required): Search query (name, short_name, or partial name)

**Response**:
```json
{
  "query": "anitha",
  "results": [
    {
      "short_name": "acs",
      "faculty_name": "Mrs. Anitha C S (ACS)",
      "email": "anithacs@gmail.com",
      "route": "/acs",
      "designation": "Assistant Professor"
    }
  ],
  "count": 1
}
```

### GET /api/faculty/:id/schedule

Get weekly schedule for a faculty member.

**Parameters**:
- `:id`: Faculty identifier (short_name, route suffix, email, or fuzzy name match)

**Response**:
```json
{
  "faculty": {
    "short_name": "acs",
    "faculty_name": "Mrs. Anitha C S (ACS)",
    "email": "anithacs@gmail.com",
    "designation": "Assistant Professor"
  },
  "schedule": [
    {
      "day": "Monday",
      "slots": [
        {
          "start_time": "09:25",
          "end_time": "10:20",
          "subject_code": "BRMK557",
          "subject_name": "Research Methodology and IPR",
          "class_details": "5th A"
        }
      ]
    }
  ],
  "academic_year": "2025-2026",
  "semester_type": "Odd"
}
```

### GET /api/faculty/:id/availability/now

Check if faculty is free right now.

**Response**:
```json
{
  "faculty": {
    "short_name": "acs",
    "faculty_name": "Mrs. Anitha C S (ACS)"
  },
  "free": false,
  "currentSlot": {
    "start_time": "09:25",
    "end_time": "10:20",
    "subject_code": "BRMK557",
    "subject_name": "Research Methodology and IPR",
    "class_details": "5th A"
  },
  "reason": "Teaching Research Methodology and IPR (09:25–10:20)",
  "checked_at": "09:30"
}
```

### GET /api/faculty/:id/availability/next

Get next free window for faculty.

**Query Parameters**:
- `from` (optional): ISO date string to start search from (default: now)

**Response**:
```json
{
  "faculty": {
    "short_name": "acs",
    "faculty_name": "Mrs. Anitha C S (ACS)"
  },
  "next_free": {
    "start": "10:20",
    "end": "10:40",
    "durationMin": 20,
    "day": "Monday"
  }
}
```

### GET /api/faculty/:id/availability/day?date=YYYY-MM-DD

Get free intervals for a specific day.

**Query Parameters**:
- `date` (optional): Date in YYYY-MM-DD format (default: today)

**Response**:
```json
{
  "faculty": {
    "short_name": "acs",
    "faculty_name": "Mrs. Anitha C S (ACS)"
  },
  "date": "2025-01-06",
  "day": "Monday",
  "free_intervals": [
    {
      "start": "08:30",
      "end": "09:25"
    },
    {
      "start": "10:20",
      "end": "10:40"
    }
  ]
}
```

### GET /api/faculty/:id/availability/at?time=HH:MM&date=YYYY-MM-DD

Check if faculty is free at a specific time.

**Query Parameters**:
- `time` (required): Time in HH:MM format
- `date` (optional): Date in YYYY-MM-DD format (default: today)

**Response**:
```json
{
  "faculty": {
    "short_name": "acs",
    "faculty_name": "Mrs. Anitha C S (ACS)"
  },
  "time": "10:00",
  "date": "2025-01-06",
  "free": true,
  "reason": "No class at this time"
}
```

## Natural Language Queries

### Supported Patterns

1. **"Is [name] [ma'am/sir] free [now/today]?"**
   - Examples:
     - "Is Anitha ma'am free now?"
     - "Is LDN free?"
     - "Is Dr. Nagashree free today?"

2. **"When is [name] [ma'am/sir] free?"**
   - Examples:
     - "When is Anitha ma'am free?"
     - "When is Lakshmi Durga free next?"

3. **"Is [name] free at [time]?"**
   - Examples:
     - "Is ACS free at 11?"
     - "Is Anitha ma'am free at 2:30 PM?"

### Name Matching

- **Case-insensitive**: "anitha" matches "Anitha"
- **Short names**: "ACS", "LDN", "JK" work
- **Full names**: "Anitha C S", "Lakshmi Durga N"
- **Partial names**: "Anita" matches "Anitha" (fuzzy, distance ≤2)
- **Honorifics**: "ma'am", "sir", "Dr.", "Mrs.", "Ms." are ignored in matching

### Response Format

**Free Now**:
```
Yes, Mrs. Anitha C S is free now. Next free window: 10:20–10:40 on Monday.
```

**Busy Now**:
```
No, Mrs. Anitha C S is currently engaged teaching Research Methodology and IPR until 10:20. Next free: 10:20–10:40 on Monday.
```

**When Free**:
```
Mrs. Anitha C S is free today at: 08:30–09:25, 10:20–10:40, 12:30–13:15.
```

## Edge Cases

### Invalid Times

If data contains invalid times (e.g., "13:1t5"):
- System attempts to auto-correct if unambiguous
- Otherwise, validation fails with clear error message:
  ```
  Schedule has an invalid time for Mrs. Jyoti Kumari on Thursday (value: '13:1t5'). Please fix data.
  ```

### Multiple Name Matches

If query matches multiple faculty members:
- Returns top 3 suggestions with full name and short_name
- User is prompted to be more specific

### Unrecognized Name

If faculty name is not found:
```
I couldn't find a faculty member matching "Unknown". Please specify the faculty name or short code.
```

### Empty Days

Days with no slots are treated as free all day (within working hours 08:30–16:30).

### Overlapping Slots

Overlapping slots are treated as busy union (faculty is busy during the entire overlapping period).

### Back-to-Back Slots

Slots that end exactly when the next starts are treated as continuous busy period (no gap).

### Weekend/Holiday

- If no slots exist for Saturday, faculty is free all day
- If slots exist, they are respected

### Working Hours

- Default: 08:30–16:30 (configurable)
- Times outside working hours are considered unavailable
- Empty days are free within working hours only

### Time-Specific Queries

Queries like "free at 11?" check availability at 11:00 today (unless day is specified).

## Timezone Handling

- **All computations**: Asia/Kolkata timezone
- **Current time**: Uses `getCurrentTimeInTimezone()` which returns current time in Asia/Kolkata
- **Date queries**: All date/time parameters are interpreted in Asia/Kolkata

## Feature Flag

The entire system is behind the `FEATURE_SCHEDULE_V1` feature flag:

- **Server**: Set `FEATURE_SCHEDULE_V1=true` in environment variables
- **Client**: Set `VITE_FEATURE_SCHEDULE_V1=true` in environment variables (defaults to enabled if not set)

When disabled, the system falls back to existing timetable functionality without breaking changes.

## Examples

### Example 1: Check Availability Now

**Query**: "Is Anitha ma'am free now?"

**Process**:
1. Extract "Anitha" from query
2. Search for faculty: "Anitha" → "Mrs. Anitha C S (ACS)" (short_name: "acs")
3. Call `/api/faculty/acs/availability/now`
4. Server computes: Current time is 09:30 (Asia/Kolkata), Monday
5. Check timetable: Slot 09:25–10:20 (BRMK557) is active
6. Return: "No, Mrs. Anitha C S is currently engaged teaching Research Methodology and IPR until 10:20. Next free: 10:20–10:40 on Monday."

### Example 2: Find Next Free Window

**Query**: "When is LDN free?"

**Process**:
1. Extract "LDN" from query
2. Match short_name: "ldn" → "Ms. Lakshmi Durga N"
3. Call `/api/faculty/ldn/availability/next`
4. Server computes: Current time is 09:00, Monday
5. Check timetable: Next free window is 09:25–10:40 (after first slot, before second slot)
6. Return: "Ms. Lakshmi Durga N is next free on Monday from 09:25 to 10:40."

### Example 3: Time-Specific Query

**Query**: "Is JK free at 11?"

**Process**:
1. Extract "JK" and "11" from query
2. Match short_name: "jk" → "Mrs. Jyoti Kumari"
3. Call `/api/faculty/jk/availability/at?time=11:00`
4. Server computes: Monday at 11:00
5. Check timetable: Slot 10:40–12:30 (BAD702 Lab) is active at 11:00
6. Return: "No, Mrs. Jyoti Kumari is engaged teaching Statistical Machine Learning for Data Science Lab (10:40–12:30)."

## Error Handling

### Invalid Data

If faculty data contains invalid times or malformed entries:
- Validation fails with detailed error message
- Error includes exact field path (e.g., "timetable[6].slots[2].start_time")
- System never silently produces wrong answers

### API Errors

- **404**: Faculty not found → "Faculty not found: [id]"
- **500**: Server error → "Internal server error"
- **Network errors**: Client shows user-friendly error message

### Name Matching Errors

- **No match**: "Please specify which faculty."
- **Multiple matches**: Returns top 3 suggestions for user to choose from

## Testing

### Unit Tests

- Schema validation (including OCR typo detection)
- Time parsing and timezone handling
- Availability computation (boundary cases, overlaps, back-to-back)
- Name matching (fuzzy search, ranking)

### API Tests

- All endpoints with various IDs
- Query parameters
- Error cases

### NLQ Tests

- Common phrasings
- Typos in names
- Edge cases (empty queries, unrecognized names, etc.)

## Configuration

### Working Hours

Default: 08:30–16:30 (configurable in `packages/shared-schedule/src/utils/time.ts`)

```typescript
export const WORKING_HOURS = {
  start: '08:30',
  end: '16:30',
} as const;
```

### Timezone

All computations use Asia/Kolkata timezone (configured in `packages/shared-schedule/src/utils/time.ts`)

```typescript
export const TIMEZONE = 'Asia/Kolkata';
```

## Data Loading

Faculty data is loaded from `packages/shared-schedule/data/faculty-timetables.json` on server startup. The data is:
- Validated using Zod schemas
- Normalized (names, times, subject codes)
- Indexed for fast lookup
- Cached in memory
- Immutable (deep-frozen)

## Integration Points

### Client Interface

- NLQ handler intercepts availability queries before AI processing
- Queries are processed and responses are returned directly
- TTS is used to speak the response

### Staff Dashboard

- Fetches timetable from `/api/faculty/:id/schedule`
- Displays weekly timetable
- Shows real-time availability badge (updated every minute)

## Security

- Faculty routes don't require authentication for public availability queries
- Schedule updates (if added) would require authentication
- All data is validated and sanitized

## Performance

- In-memory cache for fast lookups
- Indexed by short_name, email, route, normalized name
- Fuzzy search limited to top 3 results
- Availability computations are O(n) where n is number of slots per day

## Future Enhancements

- Support for multiple semesters
- Recurring events and holidays
- Custom working hours per faculty
- Schedule update API (with authentication)
- Real-time schedule updates via WebSocket

