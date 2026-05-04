'use client';
import { useState } from 'react';

export type DocItem = { name: string; status: 'pending' | 'ready' };

type DocumentManagerProps = {
  documents: DocItem[];
  onDelete: (docName: string) => void;
};

export default function DocumentManager({ documents, onDelete }: DocumentManagerProps) {
  const [deletingDoc, setDeletingDoc] = useState<string | null>(null);

  const handleDelete = async (docName: string) => {
    if (!confirm(`Are you sure you want to delete "${docName}"? The bot will no longer be able to answer questions about it.`)) return;
    
    setDeletingDoc(docName);
    await onDelete(docName);
    setDeletingDoc(null);
  };

  if (documents.length === 0) return null;

  return (
    <div className="bg-white border-b border-slate-200 p-5 shadow-sm">
      <h3 className="text-xs font-bold text-slate-500 mb-3 uppercase tracking-wider flex items-center gap-2">
        <span>📂 Active Workspace Files</span>
        <span className="bg-slate-100 text-slate-600 py-0.5 px-2 rounded-full text-[10px]">
          {documents.length}
        </span>
      </h3>
      
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
        {documents.map(doc => (
          <div 
            key={doc.name} 
            className={`flex items-center justify-between bg-slate-50 border border-slate-200 p-3 rounded-lg transition-all group ${doc.status === 'pending' ? 'opacity-80 border-blue-200 bg-blue-50/30' : 'hover:border-blue-300 hover:shadow-md'}`}
          >
            <div className="flex items-center gap-3 overflow-hidden">
              {doc.status === 'pending' ? (
                <div className="w-8 h-8 bg-blue-100 text-blue-500 rounded flex items-center justify-center flex-shrink-0">
                  <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                </div>
              ) : (
                <div className="w-8 h-8 bg-blue-100 text-blue-600 rounded flex items-center justify-center flex-shrink-0 font-bold text-[10px]">
                  {doc.name.toLowerCase().endsWith('.pdf') ? 'PDF' : 'TXT'}
                </div>
              )}
              
              <div className="flex flex-col truncate">
                <span className="text-sm font-medium text-slate-700 truncate" title={doc.name}>
                  {doc.name}
                </span>
                {doc.status === 'pending' && (
                  <span className="text-[10px] font-bold text-blue-500 uppercase tracking-widest animate-pulse">Processing...</span>
                )}
              </div>
            </div>
            
            <button 
              onClick={() => handleDelete(doc.name)}
              disabled={deletingDoc === doc.name || doc.status === 'pending'}
              className="text-slate-400 hover:text-red-500 p-2 rounded-md hover:bg-red-50 transition-colors disabled:opacity-30 disabled:hover:bg-transparent flex-shrink-0"
              title={doc.status === 'pending' ? "Processing..." : "Remove File"}
            >
              {deletingDoc === doc.name ? '⏳' : '🗑️'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}