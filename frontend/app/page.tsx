import Link from 'next/link';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex flex-col items-center justify-center p-6 relative overflow-hidden">
      {/* Decorative Blur */}
      <div className="absolute top-[-10%] left-[-10%] w-96 h-96 bg-blue-400 rounded-full mix-blend-multiply filter blur-[128px] opacity-30 animate-blob"></div>
      
      <main className="z-10 text-center max-w-3xl">
        <h1 className="text-5xl md:text-7xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-blue-700 to-indigo-900 mb-6 tracking-tight">
          Enterprise Intelligence, <br /> Secured.
        </h1>
        <p className="text-lg md:text-xl text-gray-600 mb-10 leading-relaxed max-w-2xl mx-auto">
          Deploy a production-grade Retrieval-Augmented Generation (RAG) system. Chat with your proprietary documents in isolated, secure workspaces without hallucination.
        </p>
        
        <div className="flex gap-4 justify-center">
          <Link href="/login" className="bg-blue-600 text-white px-8 py-4 rounded-full font-semibold shadow-lg shadow-blue-500/30 hover:bg-blue-700 hover:-translate-y-1 transition-all">
            Get Started
          </Link>
          <Link href="/dashboard" className="bg-white text-blue-600 px-8 py-4 rounded-full font-semibold shadow-md border border-gray-200 hover:border-blue-300 transition-all">
            Open Dashboard
          </Link>
        </div>
      </main>
    </div>
  );
}