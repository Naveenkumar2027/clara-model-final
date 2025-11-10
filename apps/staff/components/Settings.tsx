import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { apiService } from '../services/api';
import { useNotification } from './NotificationProvider';

const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*])[A-Za-z\d!@#$%^&*]{8,}$/;
const POLICY_MESSAGE = 'Password must be 8+ characters with uppercase, lowercase, number, and special character.';

const STRENGTH_CONFIG = {
  Weak: { percent: 33, gradient: 'from-red-500 to-rose-500', text: 'text-red-400' },
  Moderate: { percent: 66, gradient: 'from-yellow-400 to-orange-500', text: 'text-amber-400' },
  Strong: { percent: 100, gradient: 'from-green-500 to-emerald-500', text: 'text-emerald-400' },
} as const;

type StrengthLabel = keyof typeof STRENGTH_CONFIG;

const evaluateStrength = (password: string): StrengthLabel => {
  let score = 0;
  if (password.length >= 8) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[a-z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[!@#$%^&*]/.test(password)) score++;

  if (score <= 2) return 'Weak';
  if (score <= 4) return 'Moderate';
  return 'Strong';
};

const Settings: React.FC = () => {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [strength, setStrength] = useState<StrengthLabel>('Weak');
  const [validationMessage, setValidationMessage] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const { addNotification } = useNotification();

  const strengthConfig = useMemo(() => STRENGTH_CONFIG[strength], [strength]);

  const handleNewPasswordChange = (value: string) => {
    setNewPassword(value);
    setErrors((prev) => ({ ...prev, newPassword: '', submit: '' }));
    if (!value) {
      setValidationMessage('');
      setStrength('Weak');
      return;
    }

    const newStrength = evaluateStrength(value);
    setStrength(newStrength);

    if (!passwordRegex.test(value)) {
      setValidationMessage(POLICY_MESSAGE);
    } else {
      setValidationMessage('');
    }
  };

  const handleConfirmPasswordChange = (value: string) => {
    setConfirmPassword(value);
    setErrors((prev) => ({ ...prev, confirmPassword: '', submit: '' }));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const nextErrors: Record<string, string> = {};

    if (!passwordRegex.test(newPassword)) {
      nextErrors.newPassword = POLICY_MESSAGE;
    }

    if (newPassword !== confirmPassword) {
      nextErrors.confirmPassword = 'Passwords do not match';
    }

    if (!currentPassword) {
      nextErrors.currentPassword = 'Current password is required';
    }

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    setLoading(true);
    setErrors({});

    try {
      const response = await apiService.updatePassword(currentPassword, newPassword, confirmPassword);

      if (response.data) {
        addNotification({
          type: 'system',
          title: 'Password Updated',
          message: 'Your password was updated successfully. Please sign in again.',
        });

        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        setStrength('Weak');
        setValidationMessage('');

        localStorage.removeItem('token');
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('user');

        setTimeout(() => {
          window.location.href = '/login';
        }, 1200);
        return;
      }

      setErrors({ submit: response.error || 'Failed to update password' });
    } catch (error) {
      console.error('Error updating password:', error);
      setErrors({ submit: 'An unexpected error occurred. Please try again.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="text-white p-4 lg:p-6 rounded-2xl bg-slate-900/50 backdrop-blur-lg border border-white/10 max-w-2xl mx-auto w-full shadow-xl">
      <h2 className="text-2xl font-bold mb-6">Set / Change Password</h2>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2" htmlFor="currentPassword">
            Current Password
          </label>
          <input
            id="currentPassword"
            type="password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            className="w-full bg-slate-800/80 border border-slate-700 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-purple-500 transition"
            autoComplete="current-password"
            required
          />
          {errors.currentPassword && (
            <p className="text-red-400 text-sm mt-1">{errors.currentPassword}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2" htmlFor="newPassword">
            New Password
          </label>
          <input
            id="newPassword"
            type="password"
            value={newPassword}
            onChange={(event) => handleNewPasswordChange(event.target.value)}
            className="w-full bg-slate-800/80 border border-slate-700 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-purple-500 transition"
            autoComplete="new-password"
            required
          />
          <div className="mt-3">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
              <span className="uppercase tracking-wide">Strength: <span className={`font-semibold ${strengthConfig.text}`}>{strength}</span></span>
              <span>{validationMessage || POLICY_MESSAGE}</span>
            </div>
            <div className="h-2 w-full bg-slate-800/80 rounded-full overflow-hidden">
              <motion.div
                key={strength}
                initial={{ width: 0 }}
                animate={{ width: `${strengthConfig.percent}%` }}
                transition={{ duration: 0.35, ease: 'easeOut' }}
                className={`h-full bg-gradient-to-r ${strengthConfig.gradient}`}
              />
            </div>
          </div>
          {errors.newPassword && (
            <p className="text-red-400 text-sm mt-1">{errors.newPassword}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2" htmlFor="confirmPassword">
            Confirm New Password
          </label>
          <input
            id="confirmPassword"
            type="password"
            value={confirmPassword}
            onChange={(event) => handleConfirmPasswordChange(event.target.value)}
            className="w-full bg-slate-800/80 border border-slate-700 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-purple-500 transition"
            autoComplete="new-password"
            required
          />
          {errors.confirmPassword && (
            <p className="text-red-400 text-sm mt-1">{errors.confirmPassword}</p>
          )}
        </div>

        {errors.submit && (
          <div className="bg-red-500/20 border border-red-500/50 text-red-300 px-4 py-3 rounded-lg">
            {errors.submit}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-bold py-3 rounded-lg transition-transform transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Updating...' : 'Update Password'}
        </button>
      </form>
    </div>
  );
};

export default Settings;
