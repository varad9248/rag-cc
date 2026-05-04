'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import Sidebar from '@/components/Sidebar';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { initAuth, token } = useAuthStore();

  useEffect(() => {
    initAuth();
    if (!localStorage.getItem('token')) router.push('/login');
  }, [initAuth, router]);

  if (!token) return null; // Prevent hydration flash

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden font-sans">
      <Sidebar />
      <div className="flex-1 overflow-hidden relative shadow-[-10px_0_15px_-3px_rgba(0,0,0,0.1)] z-10 bg-white">
        {children}
      </div>
    </div>
  );
}