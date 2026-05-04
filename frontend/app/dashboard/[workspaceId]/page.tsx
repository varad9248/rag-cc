'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import DocumentUploader from '@/components/DocumentUploader';
import ChatMessage from '@/components/ChatMessage';
import DocumentManager, { DocItem } from '@/components/DocumentManager';
import { API_BASE_URL, apiFetch } from '@/lib/api';

type Citation = { citation_number: number; source: string; chunk_id: number , content?: string };
type Message = { role: 'user' | 'bot'; content: string; citations?: Citation[] };

export default function WorkspacePage() {
  const params = useParams();
  const workspaceId = Number(params.workspaceId);
  const { token } = useAuthStore();
  
  const [messages, setMessages] = useState<Message[]>([]);
  const [query, setQuery] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  
  // NEW: State now holds objects with status trackers
  const [documents, setDocuments] = useState<DocItem[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Smart Fetch: Merges pending documents with ready ones from the DB
  const fetchDocuments = useCallback(async () => {
    if (!token) return;
    try {
      const res = await apiFetch(`/workspaces/${workspaceId}/documents`, {
        token,
        cache: 'no-store',
      });
      const data = await res.json();
      const readyDocs: string[] = data.documents;

      setDocuments(prev => {
        const prevPending = prev.filter(d => d.status === 'pending');
        const newDocsList: DocItem[] = readyDocs.map(name => ({ name, status: 'ready' }));

        // Keep pending files in the list if the backend hasn't finished saving them yet
        prevPending.forEach(pendingDoc => {
          if (!readyDocs.includes(pendingDoc.name)) {
            newDocsList.push(pendingDoc);
          }
        });
        
        return newDocsList;
      });
    } catch {
      // keep current state; transient fetch failures should not clear optimistic pending items
    }
  }, [workspaceId, token]);

  // Initial Load
  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  // SMART POLLING: Check the backend every 2 seconds ONLY IF a document is pending
  useEffect(() => {
    const hasPending = documents.some(d => d.status === 'pending');
    if (hasPending) {
      const interval = setInterval(() => {
        fetchDocuments();
      }, 5000);
      return () => clearInterval(interval);
    }
  }, [documents, fetchDocuments]);

  // Auto-scroll chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Instantly push the file to the UI as 'pending'
  const handleUploadSuccess = (filename: string) => {
    setDocuments(prev => {
      if (!prev.find(d => d.name === filename)) {
        return [...prev, { name: filename, status: 'pending' }];
      }
      return prev;
    });
    // The useEffect above will automatically catch this new 'pending' state and start polling!
  };

  const handleDeleteDoc = async (docName: string) => {
    try {
      await apiFetch(`/workspaces/${workspaceId}/documents?source_name=${encodeURIComponent(docName)}`, {
        method: 'DELETE',
        token,
      });
      fetchDocuments();
    } catch {
      
    }
  };

  const handleAskStream = async () => {
    if (!query.trim() || !token || isStreaming) return;

    const currentQuery = query.trim();
    setQuery('');
    setIsStreaming(true);
    setMessages(prev => [...prev, { role: 'user', content: currentQuery }, { role: 'bot', content: '', citations: [] }]);
    const applyStreamData = (data: { type: string; content?: string; citations?: Citation[] }) => {
      setMessages(prev => {
        const newMessages = [...prev];
        const lastIndex = newMessages.length - 1;
        if (lastIndex < 0 || newMessages[lastIndex].role !== 'bot') return prev;

        const lastMessage = { ...newMessages[lastIndex] };
        if (data.type === 'text' && typeof data.content === 'string') {
          lastMessage.content += data.content;
        } else if (data.type === 'metadata') {
          if (lastMessage.content.includes('I do not have enough information')) {
            lastMessage.citations = [];
          } else {
            lastMessage.citations = Array.isArray(data.citations) ? data.citations : [];
          }
        } else if (data.type === 'error' && typeof data.content === 'string') {
          lastMessage.content = data.content;
          lastMessage.citations = [];
        }

        newMessages[lastIndex] = lastMessage;
        return newMessages;
      });
    };

    const processEventBlock = (eventBlock: string) => {
      const dataLines = eventBlock
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trim());

      if (!dataLines.length) return;
      try {
        const data = JSON.parse(dataLines.join('\n')) as { type: string; content?: string; citations?: Citation[] };
        applyStreamData(data);
      } catch {
        // ignore malformed stream events
      }
    };

    try {
    const res = await fetch('http://localhost:8000/chat/stream', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspace_id: workspaceId, query: currentQuery })
      });
      if (!res.ok) {
        let message = `Request failed with status ${res.status}`;
        try {
          const payload = await res.json();
          if (typeof payload?.detail === 'string' && payload.detail.trim()) {
            message = payload.detail;
          }
        } catch {
          // ignore parsing errors and keep fallback status message
        }
        throw new Error(message);
      }
      if (!res.body) {
        throw new Error('No stream received from server.');
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (value) {
          buffer += decoder.decode(value, { stream: true });
        }
        if (done) {
          buffer += decoder.decode();
        }

        const eventBlocks = buffer.split('\n\n');
        buffer = eventBlocks.pop() ?? '';
        for (const eventBlock of eventBlocks) {
          processEventBlock(eventBlock);
        }

        if (done) {
          if (buffer.trim()) {
            processEventBlock(buffer);
          }
          break;
        }
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to stream response.';
      setMessages(prev => {
        const newMessages = [...prev];
        const lastIndex = newMessages.length - 1;
        if (lastIndex < 0 || newMessages[lastIndex].role !== 'bot') return prev;
        newMessages[lastIndex] = {
          ...newMessages[lastIndex],
          content: message,
          citations: [],
        };
        return newMessages;
      });
    } finally {
      setIsStreaming(false);
    }
  };

  if (!token) return null;

  return (
    <div className="flex flex-col h-full bg-white relative">
      <DocumentUploader workspaceId={workspaceId} token={token} onUploadSuccess={handleUploadSuccess} />
      <DocumentManager documents={documents} onDelete={handleDeleteDoc} />

      <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-slate-50/50">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-slate-400 space-y-4">
            <div className="w-16 h-16 bg-blue-50 border border-blue-100 rounded-full flex items-center justify-center text-blue-500 text-2xl shadow-sm">🤖</div>
            <p>Upload a PDF or text file, then ask a question.</p>
          </div>
        )}
        {messages.map((msg, i) => <ChatMessage key={i} msg={msg} />)}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-5 bg-white border-t border-slate-200">
        <div className="flex gap-3 max-w-5xl mx-auto relative">
          <input 
            className="flex-1 border border-slate-300 bg-slate-50 p-4 pl-5 pr-24 rounded-full shadow-inner focus:ring-2 focus:ring-blue-500 outline-none transition-all text-slate-800" 
            value={query} 
            onChange={(e) => setQuery(e.target.value)} 
            onKeyDown={(e) => e.key === 'Enter' && handleAskStream()}
            placeholder="Ask a question about the active files..."
          />
          <button 
            className="absolute right-2 top-2 bottom-2 bg-blue-600 text-white px-6 rounded-full font-semibold hover:bg-blue-700 transition-colors shadow-md disabled:opacity-50" 
            onClick={handleAskStream}
            disabled={!query.trim()}
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}