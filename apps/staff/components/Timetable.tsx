import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { io, Socket } from 'socket.io-client';
import { TimetableEntry, DayOfWeek, ActivityType, SemesterTimetable, SemesterClass } from '../types';
import { ACTIVITY_COLORS } from '../constants';
import { timetableApi, TimetableResponse } from '../services/timetableApi';
import { getFacultyTimetable, getFacultyByEmail, getFacultyByName, getAllTimeSlots, facultyTimetableData } from '../services/facultyTimetableService';

const DAYS: DayOfWeek[] = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// Get time slots from JSON data, fallback to default
const getTimeSlots = (): string[] => {
    try {
        const slots = getAllTimeSlots();
        if (slots && slots.length > 0) {
            return slots;
        }
    } catch (e) {
        console.warn('Could not load time slots from JSON, using defaults');
    }
    // Default time slots
    return [
        "08:30-09:25", "09:25-10:20", "10:20-10:40", "10:40-11:35", "11:35-12:30",
        "12:30-13:25", "13:25-14:10", "14:10-15:05", "15:05-16:00"
    ];
};

const TIME_SLOTS = getTimeSlots();

const SEMESTER_OPTIONS = [
  "1st Semester",
  "2nd Semester",
  "3rd Semester",
  "4th Semester",
  "5th Semester",
  "6th Semester",
  "7th Semester",
  "8th Semester"
];

// Dr. Dhivyasri G's 5th Semester timetable data
const DHIVYASRI_5TH_SEMESTER: SemesterTimetable = {
  faculty: "Dr. G Dhivyasri",
  designation: "Associate Professor",
  semester: "5th Semester – Odd 2025-2026",
  schedule: {
    Monday: [
      { 
        time: "08:30-09:25", 
        subject: "BCS502 Computer Networks (5th B)", 
        subjectCode: "BCS502", 
        courseName: "Computer Networks",
        classType: "Theory", 
        batch: "5th B" 
      },
      { 
        time: "10:40-11:35", 
        subject: "BCS502 Computer Networks (5th A)", 
        subjectCode: "BCS502", 
        courseName: "Computer Networks",
        classType: "Theory", 
        batch: "5th A" 
      },
    ],
    Tuesday: [
      { 
        time: "08:30-09:25", 
        subject: "BCS502 Computer Networks (5th A)", 
        subjectCode: "BCS502", 
        courseName: "Computer Networks",
        classType: "Theory", 
        batch: "5th A" 
      },
      { 
        time: "10:40-12:30", 
        subject: "BCS502 Computer Networks Lab (5th A)", 
        subjectCode: "BCS502", 
        courseName: "Computer Networks Lab",
        classType: "Lab", 
        batch: "5th A" 
      },
    ],
    Wednesday: [
      { 
        time: "09:25-10:20", 
        subject: "BCS502 Computer Networks (5th A)", 
        subjectCode: "BCS502", 
        courseName: "Computer Networks",
        classType: "Theory", 
        batch: "5th A" 
      },
    ],
    Thursday: [
      { 
        time: "09:25-10:20", 
        subject: "BCS502 Computer Networks (5th A)", 
        subjectCode: "BCS502", 
        courseName: "Computer Networks",
        classType: "Theory", 
        batch: "5th A" 
      },
      { 
        time: "10:40-12:30", 
        subject: "BCS502 Computer Networks Lab (5th B)", 
        subjectCode: "BCS502", 
        courseName: "Computer Networks Lab",
        classType: "Lab", 
        batch: "5th B" 
      },
    ],
    Friday: [
      { 
        time: "08:30-10:20", 
        subject: "BAIL504 Data Visualization Lab (5th A)", 
        subjectCode: "BAIL504", 
        courseName: "Data Visualization Lab",
        classType: "Lab", 
        batch: "5th A" 
      },
    ],
  },
};

// Calculate workload summary
// Based on the requirement: Theory: 8 hrs, Lab: 6 hrs, Total: 14 hrs
const calculateWorkload = (schedule: SemesterTimetable['schedule']) => {
  let theoryHours = 0;
  let labHours = 0;

  Object.values(schedule).forEach(dayClasses => {
    if (!dayClasses) return;
    dayClasses.forEach(cls => {
      const [start, end] = cls.time.split('-');
      const startTime = parseTime(start);
      const endTime = parseTime(end);
      const duration = (endTime - startTime) / 60; // duration in hours
      
      if (cls.classType === "Theory") {
        theoryHours += duration;
      } else if (cls.classType === "Lab") {
        labHours += duration;
      }
      // "Free" classType doesn't count towards workload
    });
  });

  // Round to nearest hour for display (as per requirement: 8 hrs, 6 hrs, 14 hrs)
  return {
    theory: Math.round(theoryHours),
    lab: Math.round(labHours),
    total: Math.round(theoryHours + labHours)
  };
};

// Helper to parse time string to minutes
const parseTime = (timeStr: string): number => {
  const [hours, minutes] = timeStr.split(':').map(Number);
  return hours * 60 + minutes;
};

// Check if time slot is break time
// Helper to check if a time slot is a break (Coffee Break or Lunch Break)
const isBreakTime = (time: string): boolean => {
  // Check against known break times from JSON data
  try {
    const breakSlots = facultyTimetableData.classSchedule.timeSlots
      .filter(slot => slot.type === "Coffee Break" || slot.type === "Lunch Break")
      .map(slot => slot.time);
    return breakSlots.includes(time);
  } catch (e) {
    // Fallback to hardcoded break times
    return time === "10:20-10:40" || time === "12:30-13:25" || time === "09:25-10:20";
  }
};

interface TimetableProps {
    initialTimetable: TimetableEntry[];
    onTimetableUpdate: (newTimetable: TimetableEntry[]) => void;
    user?: { name: string; email: string; id: string };
}

const Timetable: React.FC<TimetableProps> = ({ initialTimetable, onTimetableUpdate, user }) => {
    const [selectedSemester, setSelectedSemester] = useState<string>("5th Semester");
    const [semesterData, setSemesterData] = useState<SemesterTimetable | null>(null);
    const [editableSemesterData, setEditableSemesterData] = useState<SemesterTimetable | null>(null);
    const [timetable, setTimetable] = useState<TimetableEntry[]>([]);
    const [isEditing, setIsEditing] = useState(false);
    const [showToast, setShowToast] = useState(false);
    const [toastMessage, setToastMessage] = useState<string>("");
    const [toastType, setToastType] = useState<'success' | 'error'>('success');
    const [editingCell, setEditingCell] = useState<{ day: string; time: string } | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [validationErrors, setValidationErrors] = useState<string[]>([]);
    const socketRef = useRef<Socket | null>(null);

    // Check if user can edit timetable (faculty can edit their own, admin can edit any)
    const canEdit = user && (user.id || user.email || user.name);
    // Extract faculty ID - use email prefix (before @) as facultyId, or use email/id directly
    const facultyId = user?.email?.split('@')[0] || user?.id || user?.email || '';
    
    // Check if user is admin (HOD or admin role)
    const isAdmin = user?.email?.toLowerCase() === 'nagashreen@gmail.com' ||
                   user?.name?.toLowerCase().includes('nagashreen') ||
                   user?.role === 'admin';
    
    // All logged-in staff can edit their own timetables
    const canEditTimetable = !!canEdit;

    useEffect(() => {
        setTimetable(initialTimetable);
    }, [initialTimetable]);

    // Load timetable from API or JSON data
    useEffect(() => {
        if (!user || !facultyId) return;
        
        const loadTimetable = async () => {
            setIsLoading(true);
            try {
                // Normalize facultyId - use email prefix (before @) or id directly
                const normalizedFacultyId = facultyId.includes('@') ? facultyId.split('@')[0] : facultyId;
                
                // Try to load from API first
                try {
                    const apiData = await timetableApi.getTimetable(normalizedFacultyId, selectedSemester);
                    
                    // Convert API response to SemesterTimetable format
                    const convertedData: SemesterTimetable = {
                        faculty: apiData.faculty,
                        designation: apiData.designation,
                        semester: apiData.semester,
                        schedule: apiData.schedule,
                    };
                    
                    setSemesterData(convertedData);
                    setEditableSemesterData(JSON.parse(JSON.stringify(convertedData)));
                    return;
                } catch (apiError: any) {
                    // If API fails, try loading from JSON data
                    console.log('API load failed, trying JSON data:', apiError.message);
                }
                
                // Try to load from JSON faculty timetable data
                let jsonTimetable: SemesterTimetable | null = null;
                
                // Try to find faculty by email or name
                if (user.email) {
                    const facultyByEmail = getFacultyByEmail(user.email);
                    if (facultyByEmail) {
                        jsonTimetable = getFacultyTimetable(facultyByEmail.id, selectedSemester);
                    }
                }
                
                // If not found by email, try by name
                if (!jsonTimetable && user.name) {
                    const facultyByName = getFacultyByName(user.name);
                    if (facultyByName) {
                        jsonTimetable = getFacultyTimetable(facultyByName.id, selectedSemester);
                    }
                }
                
                // Fallback to specific faculty checks (e.g., Dr. Dhivyasri G)
                if (!jsonTimetable) {
                    if (user.email?.toLowerCase() === 'gdhivyasri@gmail.com' || 
                        user.name?.toLowerCase().includes('dhivyasri')) {
                        jsonTimetable = getFacultyTimetable('FAC013', selectedSemester);
                    } else if (user.name?.toLowerCase().includes('nagashree') || 
                               user.email?.toLowerCase().includes('nagashree')) {
                        jsonTimetable = getFacultyTimetable('FAC005', selectedSemester);
                    }
                }
                
                if (jsonTimetable) {
                    setSemesterData(jsonTimetable);
                    setEditableSemesterData(JSON.parse(JSON.stringify(jsonTimetable)));
                    
                    // Auto-save to database
                    try {
                        const workload = calculateWorkload(jsonTimetable.schedule);
                        await timetableApi.updateTimetable(normalizedFacultyId, {
                            faculty: jsonTimetable.faculty,
                            designation: jsonTimetable.designation,
                            semester: jsonTimetable.semester,
                            schedule: jsonTimetable.schedule as any,
                            workload: {
                                theory: workload.theory,
                                lab: workload.lab,
                                totalUnits: workload.total,
                            },
                        });
                    } catch (saveError) {
                        console.warn('Failed to auto-save timetable to database:', saveError);
                    }
                } else {
                    // No data found - show empty state
                    setSemesterData(null);
                    setEditableSemesterData(null);
                }
            } catch (error: any) {
                console.error('Error loading timetable:', error);
                
                if (error.message?.includes('non-JSON') || error.message?.includes('<!DOCTYPE')) {
                    setToastMessage('Server error: Please check if the backend server is running');
                } else {
                    setToastMessage(error.message || 'Failed to load timetable');
                }
                setToastType('error');
                setShowToast(true);
                setTimeout(() => setShowToast(false), 5000);
            } finally {
                setIsLoading(false);
            }
        };

        loadTimetable();
        setIsEditing(false);
        setEditingCell(null);
    }, [selectedSemester, facultyId, user]);
    
    // Real-time sync via Socket.IO
    useEffect(() => {
        if (!user) return;
        
        const token = localStorage.getItem('token') || localStorage.getItem('clara-jwt-token');
        if (!token) return;
        
        const API_BASE = (import.meta as any).env?.VITE_API_BASE || 
          (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:8080');
        const SOCKET_PATH = (import.meta as any).env?.VITE_SOCKET_PATH || '/socket';
        const socketUrl = API_BASE.replace(/\/api$/, '');
        
        socketRef.current = io(`${socketUrl}/rtc`, {
          path: SOCKET_PATH,
          auth: { token },
        });
        
        const socket = socketRef.current;
        
        socket.on('connect', () => {
          console.log('Timetable socket connected for real-time updates');
        });
        
        // Listen for timetable updates
        socket.on('timetable:updated', (data: { facultyId: string; semester: string; timetable: TimetableResponse }) => {
          // Only update if it's for the current faculty and semester
          if (data.facultyId.toLowerCase() === facultyId.toLowerCase() && 
              data.semester === selectedSemester) {
            const convertedData: SemesterTimetable = {
              faculty: data.timetable.faculty,
              designation: data.timetable.designation,
              semester: data.timetable.semester,
              schedule: data.timetable.schedule,
            };
            
            // Only update if not currently editing
            if (!isEditing) {
              setSemesterData(convertedData);
              setEditableSemesterData(JSON.parse(JSON.stringify(convertedData)));
            }
          }
        });
        
        return () => {
          if (socket) {
            socket.disconnect();
          }
        };
    }, [user, facultyId, selectedSemester, isEditing]);

    // Convert semester data to timetable entries for display
    // Handles classes that span multiple time slots
    const getTimetableEntries = (data: SemesterTimetable | null): { [key: string]: SemesterClass } => {
        const entries: { [key: string]: SemesterClass } = {};
        
        if (!data) return entries;

        Object.entries(data.schedule).forEach(([day, classes]) => {
            classes?.forEach(cls => {
                const [start, end] = cls.time.split('-');
                const startTime = parseTime(start);
                const endTime = parseTime(end);
                
                // Find all time slots that overlap with this class
                TIME_SLOTS.forEach(timeSlot => {
                    const [slotStart, slotEnd] = timeSlot.split('-');
                    const slotStartTime = parseTime(slotStart);
                    const slotEndTime = parseTime(slotEnd);
                    
                    // Check if this time slot overlaps with the class
                    if (startTime < slotEndTime && endTime > slotStartTime) {
                        const key = `${day}-${timeSlot}`;
                        // Only add once per class, use the first matching slot as the primary entry
                        if (!entries[key]) {
                            entries[key] = cls;
                        }
                    }
                });
            });
        });

        return entries;
    };

    // Use editable data when editing, otherwise use original data
    const displayData = isEditing && editableSemesterData ? editableSemesterData : semesterData;
    const timetableEntries = getTimetableEntries(displayData);
    const workload = displayData ? calculateWorkload(displayData.schedule) : null;

    const handleSave = async () => {
        if (!editableSemesterData || !canEditTimetable || !facultyId) {
            setToastMessage('You do not have permission to edit this timetable');
            setToastType('error');
            setShowToast(true);
            setTimeout(() => setShowToast(false), 3000);
            return;
        }

        setIsSaving(true);
        setValidationErrors([]);
        
        try {
            // Calculate workload
            const workload = calculateWorkload(editableSemesterData.schedule);
            
            // Ensure faculty name is set
            const facultyName = editableSemesterData.faculty || user?.name || 'Faculty';
            
            // Prepare data for API
            const updateData = {
                faculty: facultyName,
                designation: editableSemesterData.designation || user?.name || '',
                semester: editableSemesterData.semester || selectedSemester,
                schedule: editableSemesterData.schedule,
                workload: {
                    theory: workload.theory,
                    lab: workload.lab,
                    totalUnits: workload.total,
                },
            };

            // Save to database via API - use normalized facultyId (email prefix)
            const normalizedFacultyId = facultyId.includes('@') ? facultyId.split('@')[0] : facultyId;
            const response = await timetableApi.updateTimetable(normalizedFacultyId, updateData);
            
            // Update local state with response
            const convertedData: SemesterTimetable = {
                faculty: response.timetable.faculty,
                designation: response.timetable.designation,
                semester: response.timetable.semester,
                schedule: response.timetable.schedule,
            };
            
            setSemesterData(convertedData);
            setEditableSemesterData(JSON.parse(JSON.stringify(convertedData)));
            setIsEditing(false);
            setEditingCell(null);
            
            // Show success toast
            setToastMessage('✅ Changes saved successfully');
            setToastType('success');
            setShowToast(true);
            setTimeout(() => setShowToast(false), 3000);
            
            // Trigger refresh in parent component if needed
            if (onTimetableUpdate) {
                onTimetableUpdate(timetable);
            }
        } catch (error: any) {
            console.error('Error saving timetable:', error);
            
            // Check for validation errors
            if (error.response?.data?.details || error.details) {
                const errors = error.response?.data?.details || error.details || [];
                setValidationErrors(Array.isArray(errors) ? errors : [errors]);
                setToastMessage(`Validation failed: ${Array.isArray(errors) ? errors.join(', ') : errors}`);
            } else {
                setValidationErrors([]);
                setToastMessage(error.message || 'Failed to save timetable. Please try again.');
            }
            
            setToastType('error');
            setShowToast(true);
            setTimeout(() => setShowToast(false), 5000);
        } finally {
            setIsSaving(false);
        }
    };

    const handleCancel = () => {
        if (semesterData) {
            setEditableSemesterData(JSON.parse(JSON.stringify(semesterData))); // Reset to original
        }
        setIsEditing(false);
        setEditingCell(null);
    };

    const handleAddClass = (day: DayOfWeek, timeSlot: string) => {
        // Ensure we're in edit mode
        if (!isEditing) {
            setIsEditing(true);
        }
        
        // Ensure editableSemesterData exists - create if it doesn't
        let updatedData = editableSemesterData;
        
        if (!updatedData) {
            // Create new semester data if it doesn't exist
            updatedData = {
                faculty: user?.name || 'Faculty',
                designation: '',
                semester: selectedSemester,
                schedule: {}
            };
        } else {
            // Create a deep copy to avoid mutation issues
            updatedData = { ...updatedData };
            updatedData.schedule = { ...updatedData.schedule };
        }
        
        // Ensure the day array exists
        if (!updatedData.schedule[day]) {
            updatedData.schedule[day] = [];
        } else {
            // Create a new array to avoid mutation
            updatedData.schedule[day] = [...updatedData.schedule[day]];
        }
        
        // Check if a class already exists for this exact time slot
        const existingIndex = updatedData.schedule[day].findIndex(cls => {
            const [start, end] = cls.time.split('-');
            const [slotStart, slotEnd] = timeSlot.split('-');
            return start === slotStart && end === slotEnd;
        });
        
        if (existingIndex === -1) {
            // Add new class if it doesn't exist
            const newClass: SemesterClass = {
                time: timeSlot,
                subject: "",
                subjectCode: "",
                courseName: "",
                classType: "Theory",
                batch: ""
            };
            updatedData.schedule[day] = [...updatedData.schedule[day], newClass];
        }
        
        // Update state and set editing cell immediately
        setEditableSemesterData(updatedData);
        setEditingCell({ day, time: timeSlot });
    };

    const handleUpdateClass = (day: DayOfWeek, timeSlot: string, field: keyof SemesterClass, value: any) => {
        if (!editableSemesterData) return;

        const updatedData = { ...editableSemesterData };
        const daySchedule = updatedData.schedule[day] || [];
        
        // Find the class that matches this time slot
        const classIndex = daySchedule.findIndex(cls => {
            const [start, end] = cls.time.split('-');
            const [slotStart, slotEnd] = timeSlot.split('-');
            return start === slotStart && end === slotEnd;
        });

        if (classIndex !== -1) {
            const updatedClass = { ...daySchedule[classIndex], [field]: value };
            // Update subject if courseName or subjectCode changes
            if (field === 'courseName' || field === 'subjectCode') {
                updatedClass.subject = `${updatedClass.subjectCode || ''} ${updatedClass.courseName || ''} ${updatedClass.batch ? `(${updatedClass.batch})` : ''}`.trim();
            }
            if (field === 'batch') {
                updatedClass.subject = `${updatedClass.subjectCode || ''} ${updatedClass.courseName || ''} ${value ? `(${value})` : ''}`.trim();
            }
            
            daySchedule[classIndex] = updatedClass;
            updatedData.schedule[day] = daySchedule;
            setEditableSemesterData(updatedData);
        }
    };

    const handleDeleteClass = (day: DayOfWeek, timeSlot: string) => {
        if (!editableSemesterData) return;

        const updatedData = { ...editableSemesterData };
        const daySchedule = updatedData.schedule[day] || [];
        
        updatedData.schedule[day] = daySchedule.filter(cls => {
            const [start, end] = cls.time.split('-');
            const [slotStart, slotEnd] = timeSlot.split('-');
            return !(start === slotStart && end === slotEnd);
        });
        
        setEditableSemesterData(updatedData);
        setEditingCell(null);
    };

    const handleEntryChange = (id: string, field: keyof TimetableEntry, value: any) => {
        setTimetable(currentTimetable => 
            currentTimetable.map(entry => 
                entry.id === id ? { ...entry, [field]: value } : entry
            )
        );
    };

    const handleAddEntry = (day: DayOfWeek, timeSlot: string) => {
        const [start, end] = timeSlot.split('-');
        const newEntry: TimetableEntry = {
            id: `${day}-${timeSlot}-${Date.now()}`,
            day,
            timeSlot: { start, end },
            activity: 'Free',
            subject: '',
            room: ''
        };
        setTimetable([...timetable, newEntry]);
    };

    const handleDeleteEntry = (id: string) => {
        setTimetable(timetable.filter(entry => entry.id !== id));
    };

    return (
        <div className="p-4 md:p-6 bg-slate-900/50 backdrop-blur-lg rounded-2xl border border-white/10 text-white h-full flex flex-col">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4 gap-4">
                <div className="flex flex-col md:flex-row items-start md:items-center gap-4">
                    <h2 className="text-xl font-bold">My Weekly Timetable</h2>
                    {canEdit && (
                        <div className="flex items-center gap-2">
                            <label className="text-sm text-slate-300">Select Semester:</label>
                            <select
                                value={selectedSemester}
                                onChange={(e) => setSelectedSemester(e.target.value)}
                                disabled={isLoading || isSaving}
                                className="bg-slate-800/70 border border-purple-500/50 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {SEMESTER_OPTIONS.map(sem => (
                                    <option key={sem} value={sem}>{sem}</option>
                                ))}
                            </select>
                            {semesterData && (
                                <span className="text-sm text-slate-400">
                                    {semesterData.semester}
                                </span>
                            )}
                            {isLoading && (
                                <span className="text-sm text-slate-400">
                                    <i className="fa-solid fa-spinner fa-spin"></i> Loading...
                                </span>
                            )}
                        </div>
                    )}
                </div>
                <div className="flex space-x-3">
                    {canEditTimetable && !isEditing && (
                        <button 
                            onClick={() => setIsEditing(true)} 
                            disabled={isLoading}
                            className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg flex items-center space-x-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            title="Edit Timetable"
                        >
                            <i className="fa-solid fa-pencil"></i>
                            <span>Edit</span>
                        </button>
                    )}
                    {isEditing && (
                        <>
                            <button 
                                onClick={handleSave} 
                                disabled={isSaving}
                                className="bg-green-600 hover:bg-green-700 px-4 py-2 rounded-lg flex items-center space-x-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isSaving ? (
                                    <>
                                        <i className="fa-solid fa-spinner fa-spin"></i>
                                        <span>Saving...</span>
                                    </>
                                ) : (
                                    <>
                                        <i className="fa-solid fa-save"></i>
                                        <span>Save Changes</span>
                                    </>
                                )}
                            </button>
                            <button 
                                onClick={handleCancel} 
                                disabled={isSaving}
                                className="bg-slate-600 hover:bg-slate-700 px-4 py-2 rounded-lg flex items-center space-x-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <i className="fa-solid fa-times"></i>
                                <span>Cancel</span>
                            </button>
                        </>
                    )}
                </div>
            </div>

            {semesterData && (
                <div className="mb-4 p-3 bg-slate-800/50 rounded-lg border border-slate-700/50">
                    <p className="text-lg font-bold text-white">{semesterData.faculty}</p>
                    {semesterData.designation && (
                        <p className="text-sm text-slate-400">
                            {semesterData.designation} • {semesterData.semester}
                        </p>
                    )}
                </div>
            )}
            
            {isLoading && !semesterData && (
                <div className="mb-4 p-4 text-center text-slate-400">
                    <i className="fa-solid fa-spinner fa-spin mr-2"></i>
                    Loading timetable...
                </div>
            )}
            
            {validationErrors.length > 0 && (
                <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mb-4 p-4 bg-red-900/30 border border-red-500/50 rounded-lg"
                >
                    <p className="text-red-400 font-semibold mb-2">Validation Errors:</p>
                    <ul className="list-disc list-inside text-sm text-red-300 space-y-1">
                        {validationErrors.map((error, idx) => (
                            <li key={idx}>{error}</li>
                        ))}
                    </ul>
                </motion.div>
            )}

            <div className="flex-grow overflow-auto">
                <div className="grid grid-cols-7 gap-1 text-center text-sm font-semibold min-w-[800px]">
                    <div className="sticky top-0 bg-slate-900/70 backdrop-blur-sm p-2 z-10 border-b border-slate-700">Time</div>
                    {DAYS.map(day => (
                        <div key={day} className="sticky top-0 bg-slate-900/70 backdrop-blur-sm p-2 z-10 border-b border-slate-700">
                            {day}
                        </div>
                    ))}

                    {TIME_SLOTS.map(time => (
                        <React.Fragment key={time}>
                            <div className="p-2 self-center text-xs text-slate-300">{time}</div>
                            {DAYS.map(day => {
                                const entryKey = `${day}-${time}`;
                                const semesterEntry = timetableEntries[entryKey];
                                const isBreak = isBreakTime(time);
                                
                                return (
                                    <motion.div
                                        key={`${day}-${time}`}
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ duration: 0.2 }}
                                        className={`min-h-[100px] rounded-lg p-2 flex flex-col justify-center items-center transition-all ${
                                            isBreak 
                                                ? 'bg-slate-700/30 backdrop-blur-sm' 
                                                : semesterEntry 
                                                    ? 'bg-gradient-to-br from-blue-500/30 to-purple-500/30 backdrop-blur-sm border border-blue-400/40 shadow-lg hover:shadow-xl' 
                                                    : isEditing 
                                                        ? 'bg-slate-800/50 hover:bg-slate-800/70' 
                                                        : 'bg-slate-800/40 backdrop-blur-sm border border-slate-700/30'
                                        }`}
                                    >
                                        {isBreak ? (
                                            <div className="text-xs text-slate-400 font-medium">
                                                {(() => {
                                                    try {
                                                        const breakSlot = facultyTimetableData.classSchedule.timeSlots.find(s => s.time === time);
                                                        if (breakSlot?.type) {
                                                            return breakSlot.type;
                                                        }
                                                    } catch (e) {
                                                        // Fallback
                                                    }
                                                    return time === "10:20-10:40" || time === "09:25-10:20" ? "Coffee Break" : "Lunch Break";
                                                })()}
                                            </div>
                                        ) : isEditing && canEditTimetable ? (
                                            editingCell?.day === day && editingCell?.time === time ? (
                                                <div className="w-full h-full flex flex-col justify-start text-xs p-1.5 space-y-1 overflow-auto">
                                                    <input
                                                        type="text"
                                                        placeholder="Subject Code"
                                                        value={semesterEntry?.subjectCode || ''}
                                                        onChange={(e) => handleUpdateClass(day, time, 'subjectCode', e.target.value)}
                                                        className="w-full bg-slate-700/80 text-white text-[10px] rounded px-1.5 py-1 border border-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                                        autoFocus
                                                    />
                                                    <input
                                                        type="text"
                                                        placeholder="Course Name"
                                                        value={semesterEntry?.courseName || ''}
                                                        onChange={(e) => handleUpdateClass(day, time, 'courseName', e.target.value)}
                                                        className="w-full bg-slate-700/80 text-white text-[10px] rounded px-1.5 py-1 border border-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                                    />
                                                    <select
                                                        value={semesterEntry?.classType || 'Theory'}
                                                        onChange={(e) => handleUpdateClass(day, time, 'classType', e.target.value)}
                                                        className="w-full bg-slate-700/80 text-white text-[10px] rounded px-1.5 py-1 border border-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                                    >
                                                        <option value="Theory">Theory</option>
                                                        <option value="Lab">Lab</option>
                                                        <option value="Free">Free</option>
                                                    </select>
                                                    <input
                                                        type="text"
                                                        placeholder="Batch (e.g., 5th A)"
                                                        value={semesterEntry?.batch || ''}
                                                        onChange={(e) => handleUpdateClass(day, time, 'batch', e.target.value)}
                                                        className="w-full bg-slate-700/80 text-white text-[10px] rounded px-1.5 py-1 border border-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                                    />
                                                    <div className="flex gap-1">
                                                        <button
                                                            onClick={() => handleDeleteClass(day, time)}
                                                            className="flex-1 bg-red-600/80 hover:bg-red-700 text-white text-[9px] rounded px-1.5 py-0.5 flex items-center justify-center space-x-1"
                                                        >
                                                            <i className="fa-solid fa-trash text-[8px]"></i>
                                                            <span>Delete</span>
                                                        </button>
                                                        <button
                                                            onClick={() => setEditingCell(null)}
                                                            className="flex-1 bg-slate-600/80 hover:bg-slate-700 text-white text-[9px] rounded px-1.5 py-0.5"
                                                        >
                                                            Done
                                                        </button>
                                                    </div>
                                                </div>
                                            ) : semesterEntry ? (
                                                (semesterEntry.classType as string) === 'Free' ? (
                                                    <div 
                                                        className="w-full h-full flex flex-col justify-center items-center cursor-pointer hover:opacity-80"
                                                        onClick={() => setEditingCell({ day, time })}
                                                    >
                                                        <p className="text-slate-400 text-base font-medium">Free</p>
                                                    </div>
                                                ) : (
                                                    <div 
                                                        className="w-full h-full flex flex-col justify-center text-xs p-2 space-y-1 cursor-pointer hover:opacity-80"
                                                        onClick={() => setEditingCell({ day, time })}
                                                    >
                                                        <p className="font-bold text-white text-lg leading-tight">
                                                            {semesterEntry.subjectCode || ''}
                                                        </p>
                                                        <p className="text-white text-sm leading-tight truncate" title={semesterEntry.courseName || semesterEntry.subject}>
                                                            {semesterEntry.courseName || semesterEntry.subject}
                                                        </p>
                                                        {semesterEntry.classType && (
                                                            <p className="text-blue-300 text-sm font-medium">
                                                                {semesterEntry.classType}
                                                            </p>
                                                        )}
                                                        {semesterEntry.batch && (
                                                            <p className="text-slate-300 text-xs" title={`Batch: ${semesterEntry.batch}`}>
                                                                {semesterEntry.batch}
                                                            </p>
                                                        )}
                                                    </div>
                                                )
                                            ) : (
                                                <button 
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleAddClass(day, time);
                                                    }} 
                                                    className="text-slate-400 hover:text-white transition-colors w-full h-full flex items-center justify-center cursor-pointer hover:scale-110"
                                                    title="Click to add a class"
                                                >
                                                    <i className="fa-solid fa-plus text-lg"></i>
                                                </button>
                                            )
                                            ) : semesterEntry ? (
                                                (semesterEntry.classType as string) === 'Free' ? (
                                                    <div className="w-full h-full flex flex-col justify-center items-center">
                                                        <p className="text-slate-400 text-base font-medium">Free</p>
                                                    </div>
                                                ) : (
                                                    <div className="w-full h-full flex flex-col justify-center text-xs p-2 space-y-1">
                                                        <p className="font-bold text-white text-lg leading-tight">
                                                            {semesterEntry.subjectCode || ''}
                                                        </p>
                                                        <p className="text-white text-sm leading-tight truncate" title={semesterEntry.courseName || semesterEntry.subject}>
                                                            {semesterEntry.courseName || semesterEntry.subject}
                                                        </p>
                                                        {semesterEntry.classType && (
                                                            <p className="text-blue-300 text-sm font-medium">
                                                                {semesterEntry.classType}
                                                            </p>
                                                        )}
                                                        {semesterEntry.batch && (
                                                            <p className="text-slate-300 text-xs" title={`Batch: ${semesterEntry.batch}`}>
                                                                {semesterEntry.batch}
                                                            </p>
                                                        )}
                                                    </div>
                                                )
                                            ) : (
                                                <div className="w-full h-full flex flex-col justify-center">
                                                    {/* Empty slot - no "Free" text, just empty */}
                                                </div>
                                            )}
                                    </motion.div>
                                );
                            })}
                        </React.Fragment>
                    ))}
                </div>
            </div>

            {workload && semesterData && (
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-4 p-4 bg-slate-800/50 backdrop-blur-sm rounded-lg border border-slate-700/50"
                >
                    <div className="flex flex-wrap gap-6 text-sm">
                        <div>
                            <span className="text-slate-400">Theory:</span>
                            <span className="font-semibold ml-2 text-white">{workload.theory} hrs</span>
                        </div>
                        <div>
                            <span className="text-slate-400">Lab:</span>
                            <span className="font-semibold ml-2 text-white">{workload.lab} hrs</span>
                        </div>
                        <div>
                            <span className="text-slate-400">Total Units:</span>
                            <span className="font-semibold ml-2 text-white">{workload.total} hrs</span>
                        </div>
                    </div>
                </motion.div>
            )}

            {showToast && (
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    className={`fixed bottom-5 right-5 ${
                        toastType === 'success' 
                            ? 'bg-green-600' 
                            : 'bg-red-600'
                    } text-white py-3 px-5 rounded-lg shadow-lg z-50 flex items-center space-x-2 max-w-md`}
                >
                    {toastType === 'success' ? (
                        <i className="fa-solid fa-check-circle"></i>
                    ) : (
                        <i className="fa-solid fa-exclamation-circle"></i>
                    )}
                    <span>{toastMessage}</span>
                </motion.div>
            )}
        </div>
    );
};

export default Timetable;
