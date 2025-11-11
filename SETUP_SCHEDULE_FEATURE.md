# Faculty Schedule & Availability System - Setup Guide

## Quick Start

Everything is already configured! Just run:

```bash
npm install
npm run dev
```

## What's Configured

### 1. Environment Variables
- `FEATURE_SCHEDULE_V1=true` - Enables the feature on the server
- `VITE_FEATURE_SCHEDULE_V1=true` - Enables the feature on the client
- `VITE_API_BASE=http://localhost:8080` - API base URL for client

### 2. Package Dependencies
- `@clara/shared-schedule` package is added to server dependencies
- All required packages (zod, date-fns-tz) are installed

### 3. Build Process
- `predev` script automatically builds the shared-schedule package before starting dev servers
- TypeScript compilation is handled automatically

### 4. API Routes
- Faculty routes are mounted at `/api/faculty/*` when `FEATURE_SCHEDULE_V1=true`
- Routes are available without authentication for public queries

## Testing

### 1. Test NLQ in Client Interface
1. Start the dev servers: `npm run dev`
2. Open http://localhost:5173 (client interface)
3. Ask: "Is Anitha ma'am free now?"
4. Or: "When is LDN free?"
5. Or: "Is JK free at 11?"

### 2. Test API Endpoints
```bash
# Search for faculty
curl http://localhost:8080/api/faculty/search?q=anitha

# Get schedule
curl http://localhost:8080/api/faculty/acs/schedule

# Check availability now
curl http://localhost:8080/api/faculty/acs/availability/now

# Get next free window
curl http://localhost:8080/api/faculty/acs/availability/next
```

### 3. Test Staff Dashboard
1. Start the dev servers: `npm run dev`
2. Open http://localhost:5174 (staff interface)
3. Log in with any faculty email (e.g., anithacs@gmail.com)
4. Go to Timetable view
5. You should see:
   - Weekly timetable loaded from the new API
   - Availability badge showing current status (updates every minute)

## Troubleshooting

### Issue: "Could not find faculty-timetables.json"
**Solution**: The data file should be at `packages/shared-schedule/data/faculty-timetables.json`. Make sure:
1. The file exists
2. The `predev` script builds the shared-schedule package
3. Check server logs for the exact path it's trying

### Issue: "Faculty not found" errors
**Solution**: Check that:
1. Faculty data is loaded (check server logs for "Faculty data loaded successfully")
2. You're using the correct short_name (e.g., "acs", "ldn", "gd")
3. The faculty email matches the data file

### Issue: Feature flag not working
**Solution**: 
1. Check `.env` file has `FEATURE_SCHEDULE_V1=true`
2. Restart the dev servers after changing `.env`
3. Check server logs for "[Server] Faculty schedule routes enabled"

### Issue: Client NLQ not working
**Solution**:
1. Check browser console for errors
2. Verify `VITE_FEATURE_SCHEDULE_V1` is set in `.env`
3. Check that API calls are reaching the server (check Network tab)
4. Verify the server is running on port 8080

## Data File Location

The faculty timetable data is located at:
- `packages/shared-schedule/data/faculty-timetables.json`

This file is loaded by the server on startup when `FEATURE_SCHEDULE_V1=true`.

## Feature Flags

To disable the feature:
1. Set `FEATURE_SCHEDULE_V1=false` in `.env` (server)
2. Set `VITE_FEATURE_SCHEDULE_V1=false` in `.env` (client)
3. Restart all servers

## Available Faculty

The system includes the following faculty members:
- **LDN** - Prof. Lakshmi Durga N (lakshmidurgan@gmail.com)
- **ACS** - Prof. Anitha C S (anithacs@gmail.com)
- **GD** - Dr. G Dhivyasri (gdhivyasri@gmail.com)
- **NSK** - Prof. Nisha S K (nishask@gmail.com)
- **ABP** - Prof. Amarnath B Patil (amarnathbpatil@gmail.com)
- **NN** - Dr. Nagashree N (nagashreen@gmail.com)
- **JK** - Prof. Jyoti Kumari (jyotikumari@gmail.com)
- **VR** - Prof. Vidyashree R (vidyashreer@gmail.com)
- **BA** - Dr. Bhavana A (bhavanaa@gmail.com)
- **BTN** - Prof. Bhavya T N (bhavyatn@gmail.com)

## Next Steps

1. Run `npm install` to install all dependencies
2. Run `npm run dev` to start all servers
3. Test the NLQ in the client interface
4. Check the staff dashboard for availability badge
5. Test API endpoints directly

For more information, see `docs/schedule-availability.md`.

