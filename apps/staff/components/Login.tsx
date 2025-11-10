import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiService } from '../services/api';
import { useServerReady } from '../src/hooks/useServerReady';

const Login: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const [showForgot, setShowForgot] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetMessage, setResetMessage] = useState('');
  const [resetError, setResetError] = useState('');
  const [resetLoading, setResetLoading] = useState(false);

  const navigate = useNavigate();

  const { isReady, isChecking } = useServerReady({
    maxRetries: 20,
    retryDelay: 500,
  });

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await apiService.login(email, password);

      if (response.data && response.data.token) {
        const { token, refreshToken, user, metadata } = response.data;
        localStorage.setItem('token', token);
        if (refreshToken) {
          localStorage.setItem('refreshToken', refreshToken);
        }
        const userPayload = metadata ? { ...user, metadata } : user;
        localStorage.setItem('user', JSON.stringify(userPayload));

        const username = userPayload.shortName?.toLowerCase() || userPayload.name?.toLowerCase().replace(/\s+/g, '');
        navigate(`/${username}`);
        return;
      }

      setError(response.error || 'Invalid email or password. Please check your credentials.');
    } catch (err: any) {
      console.error('Login error:', err);
      setError(err.message || 'An error occurred. Please ensure the backend server is running.');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setResetError('');
    setResetMessage('');
    setResetLoading(true);

    try {
      const response = await apiService.requestPasswordReset(resetEmail || email);
      if (response.data) {
        setResetMessage(response.data.message);
      } else {
        setResetError(response.error || 'Unable to start password reset. Please try again.');
      }
    } catch (err: any) {
      console.error('Reset request error:', err);
      setResetError(err.message || 'Unable to start password reset. Please try again.');
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/55 backdrop-blur-sm flex items-center justify-center font-sans px-4">
      <div className="w-full max-w-md bg-slate-900/80 border border-white/10 rounded-2xl p-8 text-white shadow-2xl">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold">Staff Login</h1>
          <p className="text-slate-400 mt-2">Welcome back! Please sign in to continue</p>
        </div>
        <form onSubmit={handleLogin} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2" htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="Enter your email"
              className="w-full bg-slate-900/80 border border-slate-700 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-purple-500 transition"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2" htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Enter your password"
              className="w-full bg-slate-900/80 border border-slate-700 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-purple-500 transition"
              required
            />
            <div className="mt-2 flex items-center justify-between text-xs text-slate-400">
              {!isReady && isChecking ? (
                <span>Checking server status…</span>
              ) : (
                <span>Need help accessing your account?</span>
              )}
              <button
                type="button"
                onClick={() => {
                  setResetEmail(email);
                  setShowForgot(true);
                  setResetError('');
                  setResetMessage('');
                }}
                className="text-purple-300 hover:text-purple-200 font-medium"
              >
                Forgot password?
              </button>
            </div>
          </div>
          {error && (
            <p className="text-red-400 text-sm text-center">{error}</p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-bold py-3 rounded-lg transition-transform transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
          <p className="text-center text-xs text-slate-500">
            Having trouble? <Link to="/reset-password" className="text-purple-300 hover:text-purple-200">Reset with a code</Link>
          </p>
        </form>
      </div>

      {showForgot && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center px-4">
          <div className="w-full max-w-md bg-slate-900/90 border border-white/10 rounded-2xl p-6 text-white relative shadow-2xl">
            <button
              type="button"
              onClick={() => setShowForgot(false)}
              className="absolute top-3 right-3 text-slate-400 hover:text-white"
              aria-label="Close forgot password dialog"
            >
              ✕
            </button>
            <h2 className="text-xl font-semibold mb-2">Forgot Password</h2>
            <p className="text-slate-400 text-sm mb-4">
              Enter your registered staff email. We will send a secure link and one-time code to reset your password.
            </p>
            <form onSubmit={handleForgotSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2" htmlFor="resetEmail">
                  Staff Email
                </label>
                <input
                  id="resetEmail"
                  type="email"
                  value={resetEmail}
                  onChange={(event) => setResetEmail(event.target.value)}
                  placeholder="staff@example.edu"
                  className="w-full bg-slate-900/80 border border-slate-700 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-purple-500 transition"
                  required
                />
              </div>
              {resetError && <p className="text-red-400 text-sm">{resetError}</p>}
              {resetMessage && <p className="text-emerald-400 text-sm">{resetMessage}</p>}
              <div className="flex gap-3">
                <button
                  type="submit"
                  disabled={resetLoading}
                  className="flex-1 bg-gradient-to-r from-purple-500 to-indigo-500 hover:from-purple-600 hover:to-indigo-600 text-white font-semibold py-3 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {resetLoading ? 'Sending…' : 'Send Reset Link'}
                </button>
                <Link
                  to={`/reset-password${resetEmail ? `?email=${encodeURIComponent(resetEmail)}` : ''}`}
                  className="px-4 py-3 rounded-lg border border-slate-600 text-slate-200 hover:bg-slate-800/80 transition"
                  onClick={() => setShowForgot(false)}
                >
                  Enter Code
                </Link>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Login;
