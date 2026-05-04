# 🚀 Secure Enterprise RAG System

A production-grade **Retrieval-Augmented Generation (RAG)** platform that enables users to chat with proprietary documents in **secure, isolated workspaces**. Built using a modern full-stack architecture with hybrid search, async processing, and real-time AI responses.

---

## ✨ Features

* 🔐 **Isolated Workspaces**
  Each workspace ensures strict data separation and security.

* 🔎 **Hybrid Search (Vector + Full-Text)**
  Combines `pgvector` and PostgreSQL Full-Text Search using Reciprocal Rank Fusion (RRF).

* ⚡ **Asynchronous Document Processing**
  Background ingestion using Celery + Redis.

* 📡 **Real-Time Streaming Responses**
  Low-latency AI responses using Server-Sent Events (SSE).

* 📚 **Verifiable Citations**
  Every answer includes source references.

* 🧠 **Smart Query Optimization**
  Automatically improves user queries before retrieval.

---

## 🛠️ Tech Stack

### Frontend

* Next.js 15 (App Router) + React 19
* Tailwind CSS v4
* Zustand (State Management)
* React Markdown

### Backend

* FastAPI (Python)
* Celery + Redis (Task Queue)
* PostgreSQL + pgvector
* LangChain (Chunking & Processing)
* HuggingFace API (Embeddings)
* Google Gemini 2.5 Flash (LLM)

---

## 📁 Project Structure

```
rag-app/
├── backend/
│   ├── services/
│   ├── utils/
│   ├── main.py
│   ├── worker.py
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── app/
│   ├── components/
│   ├── lib/
│   ├── store/
│   └── package.json
├── docker-compose.yaml
└── init.sql
```

---

## ⚙️ Prerequisites

* Docker & Docker Compose installed
* Google Gemini API Key
* HuggingFace Access Token

---

## 🔑 Environment Variables

Create a `.env` file in the root:

```env
# AI & Embeddings
GEMINI_API_KEY=your_api_key
HF_TOKEN=your_token
HF_EMBEDDING_MODEL=sentence-transformers/all-MiniLM-L6-v2

# Database
POSTGRES_USER=rag_user
POSTGRES_PASSWORD=rag_password
POSTGRES_DB=rag_db
POSTGRES_HOST=db
POSTGRES_PORT=5432

# Security
JWT_SECRET=your_secret_key
JWT_EXPIRE_MINUTES=1440

# App Config
REDIS_BROKER_URL=redis://redis:6379/0
CORS_ORIGINS=http://localhost:3000
MAX_FILE_SIZE_MB=10
RAG_TOP_K=15
```

Create `.env` inside `frontend/`:

```env
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
```

---

## 🚀 Getting Started (Docker)

1. **Clone Repository**

```bash
git clone https://github.com/yourusername/rag-app.git
cd rag-app
```

2. **Build & Run Containers**

```bash
docker-compose up -d --build
```

3. **Access Application**

* Frontend: http://localhost:3000
* API Docs: http://localhost:8000/docs

4. **Stop Application**

```bash
docker-compose down
```

> To reset database:

```bash
docker-compose down -v
```

---

## 📖 Usage Guide

1. **Register & Login**
   Create an account via frontend UI

2. **Create Workspace**
   Organize documents in isolated environments

3. **Upload Documents**
   Upload PDF/TXT → Processing handled asynchronously

4. **Chat with Documents**
   Ask questions → Hybrid search → AI response with citations

---

## 🧠 How It Works

1. Upload document
2. Text extraction + chunking
3. Embeddings generation
4. Stored in PostgreSQL (vector + text)
5. Query → Hybrid retrieval
6. Context passed to LLM
7. Streaming response returned

---

## 📌 Future Improvements

* Role-based access control (RBAC)
* Multi-modal document support
* Advanced analytics dashboard
* Fine-tuned custom embeddings

---

## 🤝 Contributing

Contributions are welcome!
Feel free to fork the repo and submit a PR.

---

## 📄 License

MIT License

---

## 💡 Author

Built with ❤️ for scalable AI-powered applications
