'use client';
import { useState, useRef } from 'react';
import { apiFetch } from '@/lib/api';

export default function DocumentUploader({ workspaceId, token, onUploadSuccess }: { workspaceId: number, token: string, onUploadSuccess: (filename: string) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [uploadStatus, setUploadStatus] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleIngest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !file) return;
    
    setIsUploading(true);
    setUploadStatus('Uploading and parsing document...');
    
    const formData = new FormData();
    formData.append('workspace_id', workspaceId.toString());
    formData.append('file', file);
    
    try {
      await apiFetch('/ingest', {
        method: 'POST',
        token,
        body: formData
      });
      setUploadStatus('Document securely processed.');
      onUploadSuccess(file.name); // Optimistic UI update trigger
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      setTimeout(() => setUploadStatus(''), 5000);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Upload failed. Ensure it is a valid PDF or TXT.';
      setUploadStatus(message);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="border-b border-slate-200 bg-white p-5 shadow-sm z-10 relative">
      <h3 className="text-xs font-bold text-slate-500 mb-3 uppercase tracking-wider">Upload New Document (PDF/TXT)</h3>
      <form onSubmit={handleIngest} className="flex gap-3 items-center">
        <input 
          type="file"
          accept=".pdf,.txt,.md,.csv"
          ref={fileInputRef}
          onChange={(e) => setFile(e.target.files ? e.target.files[0] : null)}
          className="border border-slate-300 p-2 text-sm rounded-lg flex-1 bg-slate-50 transition-all text-slate-600 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
          required 
          disabled={isUploading}
        />
        <button 
          type="submit" 
          disabled={isUploading || !file}
          className="bg-slate-900 text-white px-6 py-2.5 rounded-lg text-sm font-medium hover:bg-slate-800 transition-colors shadow-sm disabled:opacity-50"
        >
          {isUploading ? 'Processing...' : 'Upload File'}
        </button>
      </form>
      {uploadStatus && <p className={`text-xs mt-3 font-medium ${uploadStatus.includes('✅') ? 'text-emerald-600' : 'text-blue-600'}`}>{uploadStatus}</p>}
    </div>
  );
}