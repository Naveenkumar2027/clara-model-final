// Timetable API service for fetching and updating timetables
// Determine API base URL - prefer env vars, otherwise use unified server
const getApiBaseUrl = () => {
  if ((import.meta as any).env?.VITE_API_BASE_URL || (import.meta as any).env?.VITE_API_BASE) {
    return `${(import.meta as any).env?.VITE_API_BASE_URL || (import.meta as any).env?.VITE_API_BASE}/api`;
  }
  // In development, always use the unified server on port 8080
  if (typeof window !== 'undefined') {
    // If accessed through unified server, use current origin
    if (window.location.port === '8080' || window.location.pathname.startsWith('/staff')) {
      return `${window.location.origin}/api`;
    }
    // Otherwise, use the unified server port
    return 'http://localhost:8080/api';
  }
  return 'http://localhost:8080/api';
};

const API_BASE = getApiBaseUrl();

export interface TimetableResponse {
  facultyId: string;
  faculty: string;
  designation?: string;
  semester: string;
  schedule: {
    Monday?: SemesterClass[];
    Tuesday?: SemesterClass[];
    Wednesday?: SemesterClass[];
    Thursday?: SemesterClass[];
    Friday?: SemesterClass[];
    Saturday?: SemesterClass[];
  };
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
}

export interface SemesterClass {
  time: string;
  subject: string;
  subjectCode?: string;
  courseName?: string;
  classType?: 'Theory' | 'Lab' | 'Free';
  batch?: string;
  room?: string;
}

export interface UpdateTimetableRequest {
  faculty: string;
  designation?: string;
  semester: string;
  schedule: TimetableResponse['schedule'];
  workload?: {
    theory: number;
    lab: number;
    totalUnits: number;
  };
}

class TimetableApiService {
  private getToken(): string | null {
    return localStorage.getItem('token') || localStorage.getItem('clara-jwt-token');
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const token = this.getToken();
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers,
    });

    // Get content type first
    const contentType = response.headers.get('content-type') || '';
    const isJson = contentType.includes('application/json');

    // Handle non-OK responses
    if (!response.ok) {
      // For 404, try JSON first (server should return JSON)
      if (response.status === 404) {
        if (isJson) {
          try {
            const errorData = await response.json();
            const error = new Error(errorData.error || errorData.message || 'Timetable not found');
            (error as any).status = 404;
            throw error;
          } catch (e: any) {
            // If error already has status, rethrow it
            if (e.status === 404) throw e;
            // Otherwise, it's a JSON parsing error
            throw new Error('Timetable not found');
          }
        } else {
          // If not JSON, it might be an HTML error page
          const text = await response.text();
          if (text.includes('<!DOCTYPE') || text.includes('<html')) {
            throw new Error('Timetable not found');
          }
          throw new Error(text || 'Timetable not found');
        }
      }

      // For other error status codes
      if (isJson) {
        try {
          const errorData = await response.json();
          const error = new Error(errorData.error || errorData.message || `HTTP ${response.status}`);
          // Attach validation details if available
          if (errorData.details) {
            (error as any).details = errorData.details;
          }
          throw error;
        } catch (e: any) {
          // If it's already an Error object, rethrow
          if (e instanceof Error) throw e;
          throw new Error(`HTTP ${response.status}`);
        }
      } else {
        // Non-JSON error response
        const text = await response.text();
        throw new Error(text || `Server returned non-JSON response. Status: ${response.status}`);
      }
    }

    // Successful response - parse JSON
    if (!isJson) {
      const text = await response.text();
      throw new Error(`Server returned non-JSON response. Status: ${response.status}`);
    }

    return response.json();
  }

  /**
   * Get timetable for a specific faculty and semester
   */
  async getTimetable(facultyId: string, semester: string): Promise<TimetableResponse> {
    return this.request<TimetableResponse>(`/api/timetables/${encodeURIComponent(facultyId)}/${encodeURIComponent(semester)}`);
  }

  /**
   * Update timetable for a faculty
   */
  async updateTimetable(
    facultyId: string,
    timetable: UpdateTimetableRequest
  ): Promise<{ success: boolean; timetable: TimetableResponse; message: string }> {
    return this.request(`/api/timetables/${encodeURIComponent(facultyId)}`, {
      method: 'PATCH',
      body: JSON.stringify(timetable),
    });
  }

  /**
   * Get all timetables for a semester (admin only)
   */
  async getAllTimetablesForSemester(semester: string): Promise<TimetableResponse[]> {
    return this.request<TimetableResponse[]>(`/api/timetables/semester/${encodeURIComponent(semester)}`);
  }
}

export const timetableApi = new TimetableApiService();

