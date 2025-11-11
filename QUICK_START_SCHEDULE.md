# Quick Start - Faculty Schedule & Availability System

## 🚀 Ready to Go!

Everything is configured and ready. Just run:

```bash
npm install
npm run dev
```

That's it! The system will:
1. Automatically build the shared-schedule package
2. Start all servers (server, client, staff)
3. Load faculty data on server startup
4. Enable NLQ in the client interface
5. Show availability badges in the staff dashboard

## 🧪 Test It

### In Client Interface (http://localhost:5173)
Ask CLARA:
- "Is Anitha ma'am free now?"
- "When is LDN free?"
- "Is JK free at 11?"

### In Staff Dashboard (http://localhost:5174)
1. Log in with any faculty email (e.g., `anithacs@gmail.com`)
2. Go to Timetable view
3. See your weekly schedule and availability badge

### API Endpoints (http://localhost:8080)
```bash
# Search for faculty
curl http://localhost:8080/api/faculty/search?q=anitha

# Get schedule
curl http://localhost:8080/api/faculty/acs/schedule

# Check availability
curl http://localhost:8080/api/faculty/acs/availability/now
```

## ✅ Verification

Run the verification script to check everything:
```bash
npm run verify:schedule
```

## 📝 Configuration

All configuration is in `.env`:
- `FEATURE_SCHEDULE_V1=true` - Server feature flag
- `VITE_FEATURE_SCHEDULE_V1=true` - Client feature flag
- `VITE_API_BASE=http://localhost:8080` - API base URL

## 📚 Documentation

For detailed documentation, see:
- `docs/schedule-availability.md` - Complete system documentation
- `SETUP_SCHEDULE_FEATURE.md` - Detailed setup guide

## 🎯 Available Faculty

You can query any of these faculty members:
- **LDN** - Prof. Lakshmi Durga N
- **ACS** - Prof. Anitha C S
- **GD** - Dr. G Dhivyasri
- **NSK** - Prof. Nisha S K
- **ABP** - Prof. Amarnath B Patil
- **NN** - Dr. Nagashree N
- **JK** - Prof. Jyoti Kumari
- **VR** - Prof. Vidyashree R
- **BA** - Dr. Bhavana A
- **BTN** - Prof. Bhavya T N

## 🐛 Troubleshooting

If something doesn't work:
1. Check server logs for "Faculty data loaded successfully"
2. Verify `.env` has `FEATURE_SCHEDULE_V1=true`
3. Run `npm run verify:schedule` to check setup
4. Make sure all servers are running (check ports 8080, 5173, 5174)

## 🎉 That's It!

The system is fully configured and ready to use. Just run `npm run dev` and start testing!

