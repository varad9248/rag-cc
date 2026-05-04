'use client';
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { apiFetch, ApiError } from '@/lib/api';

export default function Sidebar() {
  const router = useRouter();
  const params = useParams();
  const { token, logout } = useAuthStore();
  const [workspaces, setWorkspaces] = useState<{id: number, name: string}[]>([]);
  const [newWsName, setNewWsName] = useState('');

  const fetchWorkspaces = useCallback(async () => {
    if (!token) return;
    try {
      const res = await apiFetch('/workspaces', { token });
      setWorkspaces(await res.json());
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        logout();
        return;
      }
      setWorkspaces([]);
    }
  }, [token, logout]);

  useEffect(() => {
    fetchWorkspaces();
  }, [fetchWorkspaces]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWsName.trim() || !token) return;
    
    try {
      const res = await apiFetch('/workspaces', {
        method: 'POST',
        token,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newWsName })
      });
      const data = await res.json();
      const newWs = { id: data.workspace_id, name: data.name };
      setWorkspaces(prev => [...prev, newWs]);
      setNewWsName('');
      router.push(`/dashboard/${newWs.id}`);
    } catch {
      // keep the current state and let user retry
    }
  };

  return (
    <div className="w-72 bg-slate-900 text-slate-300 flex flex-col h-full border-r border-slate-800 shadow-xl">
      <div className="p-6 border-b border-slate-800">
        <h2 className="text-2xl font-bold text-white tracking-tight">Secure <span className="text-blue-500">RAG</span></h2>
      </div>
      
      <div className="p-4 border-b border-slate-800 bg-slate-800/30">
        <form onSubmit={handleCreate} className="flex flex-col gap-3">
          <input 
            className="bg-slate-800 text-white border border-slate-700 p-2.5 rounded-lg text-sm outline-none focus:border-blue-500 transition-colors placeholder:text-slate-500" 
            placeholder="New Workspace Name..." 
            value={newWsName} 
            onChange={(e) => setNewWsName(e.target.value)} 
          />
          <button type="submit" className="bg-blue-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-blue-500 transition-colors">
            + Create
          </button>
        </form>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-1">
        <p className="text-xs text-slate-500 uppercase font-bold tracking-wider mb-4 px-2">Workspaces</p>
        {workspaces.map(ws => {
          const isActive = Number(params.workspaceId) === ws.id;
          return (
            <Link 
              key={ws.id} 
              href={`/dashboard/${ws.id}`}
              className={`block px-4 py-2.5 rounded-lg text-sm truncate transition-all ${isActive ? 'bg-blue-600 text-white shadow-md' : 'hover:bg-slate-800 hover:text-white'}`}
            >
              <span className="mr-2 opacity-70">📁</span> {ws.name}
            </Link>
          )
        })}
      </div>

      <div className="p-4 border-t border-slate-800">
        <button onClick={() => { logout(); router.push('/login'); }} className="w-full flex items-center justify-center gap-2 text-red-400 bg-red-400/10 hover:bg-red-400/20 py-2.5 rounded-lg text-sm font-medium transition-colors">
          Log Out
        </button>
      </div>
    </div>
  );
}