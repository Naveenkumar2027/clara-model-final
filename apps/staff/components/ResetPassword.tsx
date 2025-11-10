import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { apiService } from '../services/api';

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

const ResetPassword: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [email, setEmail] = useState(() => searchParams.get('email') || '');
  const [token, setToken] = useState(() => searchParams.get('token') || '');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [strength, setStrength] = useState<StrengthLabel>('Weak');
  const [validationMessage, setValidationMessage] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

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
    setValidationMessage(passwordRegex.test(value) ? '' : POLICY_MESSAGE);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const nextErrors: Record<string, string> = {};

    if (!email) {
      nextErrors.email = 'Email is required';
    }
    if (!token) {
      nextErrors.token = 'Reset token is required';
    }
    if (!passwordRegex.test(newPassword)) {
      nextErrors.newPassword = POLICY_MESSAGE;
    }
    if (newPassword !== confirmPassword) {
      nextErrors.confirmPassword = 'Passwords do not match';
    }

    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      return;
    }

    setLoading(true);
    setErrors({});

    try {
      const response = await apiService.resetPassword(email, token, newPassword, confirmPassword);
      if (response.data) {
        setSuccessMessage(response.data.message);
        setTimeout(() => navigate('/login'), 1500);
        return;
      }
      setErrors({ submit: response.error || 'Failed to reset password. Please try again.' });
    } catch (err: any) {
      console.error('Reset password error:', err);
      setErrors({ submit: err.message || 'Failed to reset password. Please try again.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0f172a] to-[#1e1b4b] flex items-center justify-center px-4 py-16 text-white">
      <div className="w-full max-w-lg bg-slate-900/85 border border-white/10 rounded-2xl p-8 shadow-2xl backdrop-blur-lg">
        <h1 className="text-2xl font-semibold mb-6">Reset Password</h1>
        <p className="text-slate-400 text-sm mb-6">
          Provide the email associated with your staff account, the reset token or code sent to you, and choose a new secure password.
        </p>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2" htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full bg-slate-900/80 border border-slate-700 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-purple-500 transition"
              placeholder="staff@example.edu"
              required
            />
            {errors.email && <p className="text-red-400 text-sm mt-1">{errors.email}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2" htmlFor="token">Reset Token / Code</label>
            <input
              id="token"
              type="text"
              value={token}
              onChange={(event) => setToken(event.target.value)}
              className="w-full bg-slate-900/80 border border-slate-700 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-purple-500 transition"
              placeholder="Paste the token from your email"
              required
            />
            {errors.token && <p className="text-red-400 text-sm mt-1">{errors.token}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2" htmlFor="newPassword">New Password</label>
            <input
              id="newPassword"
              type="password"
              value={newPassword}
              onChange={(event) => handleNewPasswordChange(event.target.value)}
              className="w-full bg-slate-900/80 border border-slate-700 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-purple-500 transition"
              autoComplete="new-password"
              required
            />
            <div className="mt-3">
              <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
                <span className="uppercase tracking-wide">Strength: <span className={`font-semibold ${STRENGTH_CONFIG[strength].text}`}>{strength}</span></span>
                <span>{validationMessage || POLICY_MESSAGE}</span>
              </div>
              <div className="h-2 w-full bg-slate-800/80 rounded-full overflow-hidden">
                <motion.div
                  key={strength}
                  initial={{ width: 0 }}
                  animate={{ width: `${STRENGTH_CONFIG[strength].percent}%` }}
                  transition={{ duration: 0.35, ease: 'easeOut' }}
                  className={`h-full bg-gradient-to-r ${STRENGTH_CONFIG[strength].gradient}`}
                />
              </div>
            </div>
            {errors.newPassword && <p className="text-red-400 text-sm mt-1">{errors.newPassword}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2" htmlFor="confirmPassword">Confirm New Password</label>
            <input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(event) => {
                setConfirmPassword(event.target.value);
                setErrors((prev) => ({ ...prev, confirmPassword: '', submit: '' }));
              }}
              className="w-full bg-slate-900/80 border border-slate-700 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-purple-500 transition"
              autoComplete="new-password"
              required
            />
            {errors.confirmPassword && <p className="text-red-400 text-sm mt-1">{errors.confirmPassword}</p>}
          </div>

          {errors.submit && (
            <div className="bg-red-500/20 border border-red-500/50 text-red-300 px-4 py-3 rounded-lg">
              {errors.submit}
            </div>
          )}

          {successMessage && (
            <div className="bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 px-4 py-3 rounded-lg">
              {successMessage}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-r from-emerald-500 to-sky-500 hover:from-emerald-600 hover:to-sky-600 text-white font-semibold py-3 rounded-lg transition-transform transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Resetting…' : 'Reset Password'}
          </button>
          <button
            type="button"
            onClick={() => navigate('/login')}
            className="w-full border border-slate-600 text-slate-200 hover:bg-slate-800/70 font-semibold py-3 rounded-lg transition"
          >
            Back to Login
          </button>
        </form>
      </div>
    </div>
  );
};

export default ResetPassword;
