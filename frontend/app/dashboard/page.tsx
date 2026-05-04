'use client';

export default function DashboardHome() {
  return (
    <div className="flex flex-col items-center justify-center h-full bg-slate-50 p-6 relative overflow-hidden">
      {/* Subtle background decoration */}
      <div className="absolute top-1/4 right-1/4 w-72 h-72 bg-blue-100 rounded-full mix-blend-multiply filter blur-[80px] opacity-50"></div>
      
      <div className="text-center max-w-lg p-10 bg-white border border-slate-100 rounded-3xl shadow-xl z-10 relative">
        <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center text-3xl mx-auto mb-6 shadow-inner">
          👋
        </div>
        <h1 className="text-3xl font-extrabold mb-4 text-slate-800 tracking-tight">Select a Workspace</h1>
        <p className="text-slate-500 mb-8 leading-relaxed">
          Your secure environment for querying proprietary documents. Create a new workspace in the sidebar or select an existing one to begin.
        </p>
        
        <div className="bg-slate-50 text-slate-600 p-5 rounded-xl text-sm border border-slate-100 text-left">
          <p className="font-bold text-slate-700 mb-2 uppercase tracking-wider text-xs">Security Notice</p>
          <p>Documents uploaded to a workspace are cryptographically isolated. The LLM cannot access data outside of your active workspace.</p>
        </div>
      </div>
    </div>
  );
}