import { getApiBaseUrl, checkServerHealth } from '../src/utils/serverHealth';

// Compute API base URL at runtime to ensure it's always current
const getApiBaseUrlRuntime = () => getApiBaseUrl();

interface ApiResponse<T> {
  data?: T;
  error?: string;
}

class ApiService {
  private getToken(): string | null {
    return localStorage.getItem('token');
  }

  private getRefreshToken(): string | null {
    return localStorage.getItem('refreshToken');
  }

  private async refreshAccessToken(): Promise<boolean> {
    try {
      const refreshToken = this.getRefreshToken();
      if (!refreshToken) {
        return false;
      }

      const API_BASE_URL = getApiBaseUrlRuntime();
      const response = await fetch(`${API_BASE_URL}/auth/refresh-token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refreshToken }),
        mode: 'cors',
        credentials: 'include',
      });

      if (response.ok) {
        const data = await response.json();
        localStorage.setItem('token', data.token);
        localStorage.setItem('refreshToken', data.refreshToken);
        return true;
      }
      return false;
    } catch (error) {
      console.error('Error refreshing token:', error);
      return false;
    }
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
    retryCount = 0
  ): Promise<ApiResponse<T>> {
    const maxRetries = 3;
    const token = this.getToken();
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    // Get API base URL at runtime
    const API_BASE_URL = getApiBaseUrlRuntime();
    const url = `${API_BASE_URL}${endpoint}`;
    console.log('[ApiService] Making request to:', url);
    console.log('[ApiService] Request headers:', headers);

    try {
      // Optional health check - log warning but don't block request
      // The actual fetch will handle connection errors properly
      if (retryCount === 0) {
        checkServerHealth({ maxRetries: 1, retryDelay: 500, timeout: 2000 })
          .then(isHealthy => {
            if (!isHealthy) {
              console.warn('[ApiService] Server health check failed, but proceeding with request');
            }
          })
          .catch(() => {
            // Ignore health check errors, proceed with request
          });
      }

      let response = await fetch(url, {
        ...options,
        headers,
        mode: 'cors', // Explicitly enable CORS
        credentials: 'include', // Include credentials (cookies, auth headers)
      });

      console.log('[ApiService] Response status:', response.status, 'for URL:', url);

      // If token expired, try to refresh
      if (response.status === 403 && token) {
        const refreshed = await this.refreshAccessToken();
        if (refreshed) {
          // Retry request with new token
          const newToken = this.getToken();
          headers['Authorization'] = `Bearer ${newToken}`;
          response = await fetch(url, {
            ...options,
            headers,
            mode: 'cors',
            credentials: 'include',
          });
        }
      }

      let data;
      const contentType = response.headers.get('content-type');
      
      if (contentType && contentType.includes('application/json')) {
        data = await response.json();
      } else {
        const text = await response.text();
        return { error: text || 'Request failed' };
      }

      if (!response.ok) {
        return { error: data.error || data.message || 'Request failed' };
      }

      return { data };
    } catch (error: any) {
      console.error('[ApiService] Fetch error for URL:', url, error);
      console.error('[ApiService] Error details:', {
        name: error.name,
        message: error.message,
        stack: error.stack,
      });
      
      // Check for CORS-specific errors
      if (error.message?.includes('CORS') || error.message?.includes('Access-Control') || error.name === 'TypeError') {
        const serverBase = API_BASE_URL.replace('/api', '');
        return { error: `CORS error: Cannot access server at ${serverBase}. Please check server CORS configuration and ensure the backend is running.` };
      }
      
      // Retry on network errors
      if ((error.message?.includes('Failed to fetch') || error.message?.includes('NetworkError')) && retryCount < maxRetries) {
        console.log(`[ApiService] Retrying request (${retryCount + 1}/${maxRetries})...`);
        await new Promise(resolve => setTimeout(resolve, 1000 * (retryCount + 1)));
        return this.request<T>(endpoint, options, retryCount + 1);
      }
      
      if (error.message?.includes('Failed to fetch') || error.message?.includes('NetworkError')) {
        const serverBase = API_BASE_URL.replace('/api', '');
        return { error: `Cannot connect to server at ${serverBase}. Please ensure the backend is running and CORS is configured correctly.` };
      }
      return { error: error.message || 'Network error. Please check your connection and try again.' };
    }
  }

  async login(email: string, password: string) {
    return this.request<{ token: string; refreshToken: string; user: any }>(
      '/auth/login',
      {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      }
    );
  }

  async logout() {
    const result = await this.request('/auth/logout', {
      method: 'POST',
    });
    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
    return result;
  }

  async getUserData(username: string) {
    return this.request<{ user: any; meetings: any[]; tasks: any[]; timetable: any[] }>(
      `/user/${username}`
    );
  }

  async changePassword(oldPassword: string, newPassword: string, confirmPassword: string) {
    return this.request<{ message: string }>('/auth/change-password', {
      method: 'PATCH',
      body: JSON.stringify({ oldPassword, newPassword, confirmPassword }),
    });
  }

  async createNotification(userIds: string[], type: string, title: string, message: string, groupId?: string, senderId?: string) {
    return this.request<{ message: string; count: number }>('/notifications', {
      method: 'POST',
      body: JSON.stringify({ userIds, type, title, message, groupId, senderId }),
    });
  }

  async getNotifications() {
    return this.request<{ notifications: any[] }>('/notifications');
  }

  async getUnreadCount() {
    return this.request<{ count: number }>('/notifications/unread');
  }

  async markAsRead(notificationId: string) {
    return this.request<{ notification: any }>(`/notifications/${notificationId}/read`, {
      method: 'PATCH',
    });
  }

  async markAllAsRead() {
    return this.request<{ message: string }>('/notifications/read-all', {
      method: 'PATCH',
    });
  }

  async deleteNotification(notificationId: string) {
    return this.request<{ message: string }>(`/notifications/${notificationId}`, {
      method: 'DELETE',
    });
  }
}

export const apiService = new ApiService();

