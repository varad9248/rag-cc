'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { apiFetch } from '@/lib/api';

export default function LoginPage() {
  const router = useRouter();
  const { setToken, token, initAuth } = useAuthStore();
  
  const [isRegister, setIsRegister] = useState(false);
  const [formData, setFormData] = useState({ username: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    initAuth();
    if (token) router.push('/dashboard');
  }, [token, router, initAuth]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isRegister) {
        await apiFetch('/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData)
        });
        setIsRegister(false);
        setError('Registration successful! Please log in.');
      } else {
        const urlEncoded = new URLSearchParams(formData);
        const res = await apiFetch('/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: urlEncoded.toString()
        });
        
        const data = await res.json();
        setToken(data.access_token);
        router.push('/dashboard');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-screen items-center justify-center bg-gray-50">
      <div className="bg-white p-10 rounded-2xl shadow-xl w-[400px] border border-gray-100">
        <h1 className="text-3xl font-extrabold mb-8 text-center text-gray-900">
          {isRegister ? 'Create Account' : 'Welcome Back'}
        </h1>
        
        {error && <p className={`mb-6 text-sm text-center font-medium ${error.includes('successful') ? 'text-green-600 bg-green-50 p-2 rounded' : 'text-red-500 bg-red-50 p-2 rounded'}`}>{error}</p>}
        
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <input 
            className="border border-gray-300 p-3 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all" 
            type="text" 
            placeholder="Username" 
            value={formData.username} 
            onChange={(e) => setFormData({...formData, username: e.target.value})} 
            required 
          />
          <input 
            className="border border-gray-300 p-3 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all" 
            type="password" 
            placeholder="Password" 
            value={formData.password} 
            onChange={(e) => setFormData({...formData, password: e.target.value})} 
            required 
          />
          <button disabled={loading} type="submit" className="bg-blue-600 text-white p-3 rounded-lg font-semibold hover:bg-blue-700 transition-all disabled:opacity-70">
            {loading ? 'Processing...' : (isRegister ? 'Sign Up' : 'Log In')}
          </button>
        </form>
        
        <button 
          onClick={() => {setIsRegister(!isRegister); setError(''); setFormData({username: '', password: ''})}} 
          className="w-full mt-6 text-sm text-gray-500 hover:text-blue-600 transition-colors"
        >
          {isRegister ? 'Already have an account? Log in' : "Don't have an account? Sign up"}
        </button>
      </div>
    </div>
  );
}