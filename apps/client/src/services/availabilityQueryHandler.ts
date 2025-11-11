/**
 * Natural Language Query Handler for Faculty Availability
 * Handles queries like "Is Anitha ma'am free?" or "When is LDN free?"
 */

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8080';

/**
 * Check if a query is an availability query
 */
export function isAvailabilityQuery(text: string): boolean {
  const normalized = text.toLowerCase().trim();
  
  // Patterns for availability queries
  const patterns = [
    // "Is [name] [ma'am/sir] free [now/today]?"
    /^(is|are)\s+(mrs?\.?|ms\.?|dr\.?|mr\.?|prof\.?|professor\.?)?\s*([\w\s\.]+?)\s+(ma'?am|sir)?\s*(free|available)(\s+now|\s+today)?\??$/i,
    
    // "When is [name] [ma'am/sir] free?"
    /^when\s+is\s+(mrs?\.?|ms\.?|dr\.?|mr\.?|prof\.?|professor\.?)?\s*([\w\s\.]+?)\s+(ma'?am|sir)?\s*(free|available)(\s+(next|today|tomorrow))?\??$/i,
    
    // "Is [short_name] free?"
    /^is\s+([a-z]{2,4})\s+(free|available)(\s+now|\s+today)?\??$/i,
    
    // "Is [name] free at 11?"
    /^is\s+(mrs?\.?|ms\.?|dr\.?|mr\.?|prof\.?|professor\.?)?\s*([\w\s\.]+?)\s+(ma'?am|sir)?\s*free\s+at\s+(\d{1,2})(:(\d{2}))?\s*(am|pm)?\??$/i,
    
    // "[name] free?"
    /^(mrs?\.?|ms\.?|dr\.?|mr\.?|prof\.?|professor\.?)?\s*([\w\s\.]+?)\s+(ma'?am|sir)?\s*(free|available)(\s+now|\s+today)?\??$/i,
    
    // "free [name]"
    /^(free|available)\s+(mrs?\.?|ms\.?|dr\.?|mr\.?|prof\.?|professor\.?)?\s*([\w\s\.]+?)\s+(ma'?am|sir)?\??$/i,
  ];
  
  return patterns.some(pattern => pattern.test(normalized));
}

/**
 * Extract faculty name from query
 */
function extractFacultyName(text: string): string | null {
  const normalized = text.toLowerCase().trim();
  
  // Remove common words
  const cleaned = normalized
    .replace(/^(is|are|when|free|available|now|today|tomorrow|next|at|ma'?am|sir)\s+/g, '')
    .replace(/\s+(is|are|when|free|available|now|today|tomorrow|next|at|ma'?am|sir)$/g, '')
    .replace(/\s+(mrs?|ms|dr|mr|prof|professor)\.?\s+/g, ' ')
    .replace(/\s+(ma'?am|sir)\s+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  
  // Extract potential name (everything after honorifics, before "free/available")
  const match = cleaned.match(/^([\w\s\.]+?)(?:\s+(?:free|available|at))?/);
  if (match) {
    return match[1].trim();
  }
  
  return null;
}

/**
 * Extract time from query (e.g., "free at 11" or "free at 11:30")
 */
function extractTime(text: string): string | null {
  const match = text.match(/(?:at|@)\s*(\d{1,2})(:(\d{2}))?\s*(am|pm)?/i);
  if (!match) return null;
  
  let hours = parseInt(match[1], 10);
  const minutes = match[3] ? parseInt(match[3], 10) : 0;
  const ampm = match[4]?.toLowerCase();
  
  // Convert to 24-hour format
  if (ampm === 'pm' && hours !== 12) {
    hours += 12;
  } else if (ampm === 'am' && hours === 12) {
    hours = 0;
  }
  
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
}

/**
 * Search for faculty by name
 */
async function searchFaculty(query: string): Promise<{ short_name: string; faculty_name: string } | null> {
  try {
    const response = await fetch(`${API_BASE}/api/faculty/search?q=${encodeURIComponent(query)}`);
    if (!response.ok) {
      return null;
    }
    
    const data = await response.json();
    if (data.results && data.results.length > 0) {
      return {
        short_name: data.results[0].short_name,
        faculty_name: data.results[0].faculty_name,
      };
    }
    
    return null;
  } catch (error) {
    console.error('[Availability Query] Search error:', error);
    return null;
  }
}

/**
 * Handle availability query and return response
 */
export async function handleAvailabilityQuery(text: string): Promise<string> {
  try {
    // Extract faculty name
    const facultyName = extractFacultyName(text);
    if (!facultyName) {
      return "Please specify which faculty member you're asking about.";
    }
    
    // Search for faculty
    const faculty = await searchFaculty(facultyName);
    if (!faculty) {
      return `I couldn't find a faculty member matching "${facultyName}". Please specify the faculty name or short code.`;
    }
    
    // Check if query asks for specific time
    const timeStr = extractTime(text);
    if (timeStr) {
      // Check availability at specific time
      const response = await fetch(
        `${API_BASE}/api/faculty/${faculty.short_name}/availability/at?time=${encodeURIComponent(timeStr)}`
      );
      
      if (!response.ok) {
        return `I couldn't check availability for ${faculty.faculty_name} at ${timeStr}. Please try again.`;
      }
      
      const data = await response.json();
      if (data.free) {
        return `Yes, ${faculty.faculty_name} is free at ${timeStr}.`;
      } else {
        const subject = data.currentSlot?.subject_name || 'a class';
        const endTime = data.currentSlot?.end_time || '';
        return `No, ${faculty.faculty_name} is engaged teaching ${subject} until ${endTime}.`;
      }
    }
    
    // Check if query asks "when is X free?"
    const isWhenQuery = /^when\s+is/i.test(text);
    if (isWhenQuery) {
      // Get next free window and today's free intervals
      const [nextResponse, dayResponse] = await Promise.all([
        fetch(`${API_BASE}/api/faculty/${faculty.short_name}/availability/next`),
        fetch(`${API_BASE}/api/faculty/${faculty.short_name}/availability/day`),
      ]);
      
      if (!nextResponse.ok || !dayResponse.ok) {
        return `I couldn't check availability for ${faculty.faculty_name}. Please try again.`;
      }
      
      const nextData = await nextResponse.json();
      const dayData = await dayResponse.json();
      
      if (dayData.free_intervals && dayData.free_intervals.length > 0) {
        const intervals = dayData.free_intervals
          .map((interval: { start: string; end: string }) => `${interval.start}–${interval.end}`)
          .join(', ');
        return `${faculty.faculty_name} is free today at: ${intervals}.`;
      } else if (nextData.next_free) {
        const next = nextData.next_free;
        return `${faculty.faculty_name} is next free on ${next.day} from ${next.start} to ${next.end}.`;
      } else {
        return `${faculty.faculty_name} has no free slots available in the next 7 days.`;
      }
    }
    
    // Default: check if free now
    const response = await fetch(`${API_BASE}/api/faculty/${faculty.short_name}/availability/now`);
    if (!response.ok) {
      return `I couldn't check availability for ${faculty.faculty_name}. Please try again.`;
    }
    
    const data = await response.json();
    if (data.free) {
      // Get next free window for more context
      const nextResponse = await fetch(`${API_BASE}/api/faculty/${faculty.short_name}/availability/next`);
      if (nextResponse.ok) {
        const nextData = await nextResponse.json();
        if (nextData.next_free) {
          const next = nextData.next_free;
          return `Yes, ${faculty.faculty_name} is free now. Next free window: ${next.start}–${next.end} on ${next.day}.`;
        }
      }
      return `Yes, ${faculty.faculty_name} is free now.`;
    } else {
      const subject = data.currentSlot?.subject_name || 'a class';
      const endTime = data.currentSlot?.end_time || '';
      
      // Get next free window
      const nextResponse = await fetch(`${API_BASE}/api/faculty/${faculty.short_name}/availability/next`);
      if (nextResponse.ok) {
        const nextData = await nextResponse.json();
        if (nextData.next_free) {
          const next = nextData.next_free;
          return `No, ${faculty.faculty_name} is currently engaged teaching ${subject} until ${endTime}. Next free: ${next.start}–${next.end} on ${next.day}.`;
        }
      }
      return `No, ${faculty.faculty_name} is currently engaged teaching ${subject} until ${endTime}.`;
    }
  } catch (error) {
    console.error('[Availability Query] Error:', error);
    return "I'm sorry, I couldn't process your availability query. Please try again.";
  }
}

