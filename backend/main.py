from fastapi import FastAPI, Depends, HTTPException, File, UploadFile, Form
from fastapi.responses import StreamingResponse
from fastapi.security import OAuth2PasswordRequestForm
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import psycopg2
from pgvector.psycopg2 import register_vector
import json
import google.generativeai as genai
from google.api_core.exceptions import ResourceExhausted
import os
import fitz  
from abc import ABC, abstractmethod
from contextlib import contextmanager
import logging

from utils.auth import create_access_token, get_current_user, get_password_hash, verify_password
from worker import process_document
from services.embeddings import get_embedding

from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.prompts import PromptTemplate
from langchain_core.output_parsers import StrOutputParser

app = FastAPI()
logger = logging.getLogger(__name__)

CORS_ORIGINS = [origin.strip() for origin in os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",") if origin.strip()]
ALLOW_CREDENTIALS = "*" not in CORS_ORIGINS
MAX_FILE_SIZE_BYTES = int(os.getenv("MAX_FILE_SIZE_MB", "10")) * 1024 * 1024

# UPGRADE: Increased retrieval size to leverage Gemini's context window
RETRIEVAL_TOP_K = int(os.getenv("RAG_TOP_K", "15"))

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=ALLOW_CREDENTIALS,
    allow_methods=["*"],
    allow_headers=["*"],
)

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if not GEMINI_API_KEY:
    raise RuntimeError("GEMINI_API_KEY environment variable is required")

genai.configure(api_key=GEMINI_API_KEY)
model = genai.GenerativeModel('gemini-2.5-flash')

def get_db_connection():
    conn = psycopg2.connect(
        dbname=os.getenv("POSTGRES_DB", "rag_db"),
        user=os.getenv("POSTGRES_USER", "rag_user"),
        password=os.getenv("POSTGRES_PASSWORD", "rag_password"),
        host=os.getenv("POSTGRES_HOST", "db"),
        port=int(os.getenv("POSTGRES_PORT", "5432")),
    )
    register_vector(conn)
    return conn

@contextmanager
def get_db_cursor():
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        yield conn, cursor
    finally:
        cursor.close()
        conn.close()

class DocumentParser(ABC):
    """Abstract base class for all document parsers."""
    @abstractmethod
    def extract_text(self, file_content: bytes) -> str:
        pass

class PDFParser(DocumentParser):
    def extract_text(self, file_content: bytes) -> str:
        raw_text = ""
        doc = fitz.open(stream=file_content, filetype="pdf")
        for page in doc:
            raw_text += page.get_text()
        return raw_text

class TextParser(DocumentParser):
    def extract_text(self, file_content: bytes) -> str:
        return file_content.decode("utf-8")

class ParserRegistry:
    """Registry to map file extensions to their specific parser."""
    _parsers = {
        ".pdf": PDFParser(),
        ".txt": TextParser(),
        ".md": TextParser(),
        ".csv": TextParser(),
    }

    @classmethod
    def get_parser(cls, filename: str) -> DocumentParser:
        _, ext = os.path.splitext(filename.lower())
        parser = cls._parsers.get(ext)
        if not parser:
            raise ValueError(f"Unsupported file format: {ext}. Supported formats: {', '.join(cls._parsers.keys())}")
        return parser

class UserCreate(BaseModel):
    username: str = Field(min_length=3, max_length=50, pattern=r"^[A-Za-z0-9_.-]+$")
    password: str = Field(min_length=8, max_length=128)

class WorkspaceCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)

class QueryRequest(BaseModel):
    workspace_id: int = Field(gt=0)
    query: str = Field(min_length=1, max_length=4000)

@app.post("/register")
def register_user(user: UserCreate):
    hashed_pw = get_password_hash(user.password)
    with get_db_cursor() as (conn, cursor):
        try:
            cursor.execute("INSERT INTO users (username, hashed_password) VALUES (%s, %s) RETURNING id", (user.username, hashed_pw))
            user_id = cursor.fetchone()[0]
            conn.commit()
            return {"status": "User created", "user_id": user_id}
        except psycopg2.IntegrityError:
            conn.rollback()
            raise HTTPException(status_code=400, detail="Username already exists")

@app.post("/token")
def login(form_data: OAuth2PasswordRequestForm = Depends()):
    with get_db_cursor() as (_, cursor):
        cursor.execute("SELECT id, hashed_password FROM users WHERE username = %s", (form_data.username,))
        user = cursor.fetchone()

    if not user or not verify_password(form_data.password, user[1]):
        raise HTTPException(status_code=400, detail="Incorrect username or password")
    
    token = create_access_token(data={"sub": str(user[0])})
    return {"access_token": token, "token_type": "bearer"}

@app.post("/workspaces")
def create_workspace(ws: WorkspaceCreate, user_id: int = Depends(get_current_user)):
    with get_db_cursor() as (conn, cursor):
        cursor.execute("INSERT INTO workspaces (user_id, name) VALUES (%s, %s) RETURNING id", (user_id, ws.name))
        ws_id = cursor.fetchone()[0]
        conn.commit()
    return {"workspace_id": ws_id, "name": ws.name}

@app.get("/workspaces")
def get_workspaces(user_id: int = Depends(get_current_user)):
    with get_db_cursor() as (_, cursor):
        cursor.execute("SELECT id, name, created_at FROM workspaces WHERE user_id = %s", (user_id,))
        workspaces = [{"id": row[0], "name": row[1], "created_at": row[2]} for row in cursor.fetchall()]
    return workspaces

@app.get("/workspaces/{workspace_id}/documents")
def get_documents(workspace_id: int, user_id: int = Depends(get_current_user)):
    with get_db_cursor() as (_, cursor):
        cursor.execute("SELECT id FROM workspaces WHERE id = %s AND user_id = %s", (workspace_id, user_id))
        if not cursor.fetchone():
            raise HTTPException(status_code=403, detail="Unauthorized")
            
        cursor.execute("SELECT DISTINCT source_name FROM document_chunks WHERE workspace_id = %s", (workspace_id,))
        docs = [row[0] for row in cursor.fetchall()]
    return {"documents": docs}

@app.delete("/workspaces/{workspace_id}/documents")
def delete_document(workspace_id: int, source_name: str, user_id: int = Depends(get_current_user)):
    with get_db_cursor() as (conn, cursor):
        cursor.execute("SELECT id FROM workspaces WHERE id = %s AND user_id = %s", (workspace_id, user_id))
        if not cursor.fetchone():
            raise HTTPException(status_code=403, detail="Unauthorized")
            
        cursor.execute("DELETE FROM document_chunks WHERE workspace_id = %s AND source_name = %s", (workspace_id, source_name))
        conn.commit()
    return {"status": "Document deleted"}

@app.post("/ingest")
async def ingest_documents(
    workspace_id: int = Form(...),
    file: UploadFile = File(...),
    user_id: int = Depends(get_current_user)
):
    with get_db_cursor() as (_, cursor):
        cursor.execute("SELECT id FROM workspaces WHERE id = %s AND user_id = %s", (workspace_id, user_id))
        if not cursor.fetchone():
            raise HTTPException(status_code=403, detail="Unauthorized workspace access")

    if not file.filename:
        raise HTTPException(status_code=400, detail="Missing filename")
    
    content = await file.read()
    if len(content) > MAX_FILE_SIZE_BYTES:
        raise HTTPException(status_code=413, detail=f"File too large. Limit is {MAX_FILE_SIZE_BYTES // (1024 * 1024)} MB.")
    
    try:
        parser = ParserRegistry.get_parser(file.filename)
        raw_text = parser.extract_text(content)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to parse document: {str(e)}")

    if not raw_text.strip():
        raise HTTPException(status_code=400, detail="Could not extract text from file. Is it an image-based PDF?")
    
    try:
        process_document.delay(workspace_id, file.filename, raw_text)
    except Exception:
        logger.exception("Failed to enqueue document processing for workspace_id=%s file=%s", workspace_id, file.filename)
        raise HTTPException(status_code=500, detail="Failed to enqueue document processing job")
    
    return {"status": "Processing started in background"}


# UPGRADE: Helper function to rewrite the query for better vector search
def rewrite_query_for_search(user_query: str) -> str:
    prompt = f"Rewrite the following user question into a clear, detailed, and descriptive statement optimized for retrieving relevant documents from a vector database. Do not answer the question, only rewrite it. Keep it under 2 sentences.\n\nOriginal query: {user_query}"
    try:
        response = model.generate_content(prompt)
        return response.text.strip()
    except ResourceExhausted:
        logger.warning("Gemini API rate limit exceeded during query rewrite. Falling back to original query.")
        return user_query
    except Exception as e:
        logger.warning(f"Query rewriting failed, falling back to original query. Error: {e}")
        return user_query


@app.post("/chat/stream")
def chat_stream(req: QueryRequest, user_id: int = Depends(get_current_user)):
    no_answer_message = "I do not have enough information in the provided documents to answer that."
    
    # 1. Rewrite the query for better retrieval
    optimized_query = rewrite_query_for_search(req.query)

    try:
        # 2. Get embedding of the optimized query
        query_vector = get_embedding(optimized_query)
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc))

    with get_db_cursor() as (_, cursor):
        cursor.execute("SELECT id FROM workspaces WHERE id = %s AND user_id = %s", (req.workspace_id, user_id))
        if not cursor.fetchone():
            raise HTTPException(status_code=403, detail="Unauthorized workspace access")
        
        # UPGRADE: Hybrid Search SQL Query with Reciprocal Rank Fusion (RRF)
        cursor.execute(
            """
            WITH vector_search AS (
                SELECT id, source_name, content,
                       ROW_NUMBER() OVER (ORDER BY embedding <=> %s::vector) as vector_rank
                FROM document_chunks
                WHERE workspace_id = %s
                ORDER BY embedding <=> %s::vector LIMIT 30
            ),
            keyword_search AS (
                SELECT id, source_name, content,
                       ROW_NUMBER() OVER (ORDER BY ts_rank_cd(fts, websearch_to_tsquery('english', %s)) DESC) as keyword_rank
                FROM document_chunks
                WHERE workspace_id = %s AND fts @@ websearch_to_tsquery('english', %s)
                ORDER BY keyword_rank LIMIT 30
            )
            SELECT id, source_name, content,
                   COALESCE(1.0 / (60 + vector_rank), 0.0) + COALESCE(1.0 / (60 + keyword_rank), 0.0) as rrf_score
            FROM vector_search
            FULL OUTER JOIN keyword_search USING (id, source_name, content)
            ORDER BY rrf_score DESC
            LIMIT %s;
            """,
            (str(query_vector), req.workspace_id, str(query_vector), req.query, req.workspace_id, req.query, RETRIEVAL_TOP_K)
        )
        results = cursor.fetchall()

    context_text = ""
    citations_metadata = []
    
    # Format the retrieved chunks for the prompt
    for idx, row in enumerate(results):
        chunk_id, source_name, content, _ = row
        context_text += f"\n--- Source [{idx + 1}]: {source_name} ---\n{content}\n"
        citations_metadata.append({"citation_number": idx + 1, "source": source_name, "chunk_id": chunk_id , "content": content})

    # 3. Initialize the LangChain Chat Model
    llm = ChatGoogleGenerativeAI(
        model="gemini-2.5-flash",
        temperature=0.0,
        google_api_key=GEMINI_API_KEY
    )

    # 4. Define a strict LangChain PromptTemplate
    template = """
    You are a helpful, factual enterprise AI assistant. You answer questions based ONLY on the provided Context.

    Context Rules:
    1. The Context contains excerpts from uploaded documents. The name of the document is provided in the source tags.
    2. If the user asks general questions about entities (like "What is"), you are allowed to logically infer basic information from the context (e.g., "GlobalCorp is the organization that issued the HR Remote Work Policy").
    3. If the answer cannot be logically deduced from the Context at all, you MUST reply verbatim: "I do not have enough information in the provided documents to answer that."
    4. When you provide an answer based on the context, append the source number in brackets to the end of the relevant sentence. Example: [1].
    
    Context:
    {context}

    Question: {question}
    """
    
    prompt = PromptTemplate.from_template(template)

    # 5. Build the LangChain Expression Language (LCEL) Chain
    chain = prompt | llm | StrOutputParser()

    # 6. Stream the output using LangChain's async streaming (.astream)
    async def stream_generator():
        if not results:
            yield f"data: {json.dumps({'type': 'text', 'content': no_answer_message})}\n\n"
            yield f"data: {json.dumps({'type': 'metadata', 'citations': []})}\n\n"
            return
            
        try:
            # LangChain natively supports async token streaming
            async for chunk_text in chain.astream({
                "context": context_text, 
                "question": req.query
            }):
                if chunk_text:
                    yield f"data: {json.dumps({'type': 'text', 'content': chunk_text})}\n\n"
                    
        except Exception:
            logger.exception("LangChain model streaming failed for workspace_id=%s", req.workspace_id)
            yield f"data: {json.dumps({'type': 'error', 'content': 'Failed to generate response from model.'})}\n\n"
        finally:
            # Yield your citations metadata at the end of the stream
            yield f"data: {json.dumps({'type': 'metadata', 'citations': citations_metadata})}\n\n"

    return StreamingResponse(stream_generator(), media_type="text/event-stream")
    no_answer_message = "I do not have enough information in the provided documents to answer that."
    
    # 1. Rewrite the query for better retrieval
    optimized_query = rewrite_query_for_search(req.query)

    try:
        # 2. Get embedding of the optimized query
        query_vector = get_embedding(optimized_query)
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc))

    with get_db_cursor() as (_, cursor):
        cursor.execute("SELECT id FROM workspaces WHERE id = %s AND user_id = %s", (req.workspace_id, user_id))
        if not cursor.fetchone():
            raise HTTPException(status_code=403, detail="Unauthorized workspace access")
        
        # UPGRADE: Hybrid Search SQL Query with Reciprocal Rank Fusion (RRF)
        # It searches both the vector space (embedding) and the full-text space (fts)
        cursor.execute(
            """
            WITH vector_search AS (
                SELECT id, source_name, content,
                       ROW_NUMBER() OVER (ORDER BY embedding <=> %s::vector) as vector_rank
                FROM document_chunks
                WHERE workspace_id = %s
                ORDER BY embedding <=> %s::vector LIMIT 30
            ),
            keyword_search AS (
                SELECT id, source_name, content,
                       ROW_NUMBER() OVER (ORDER BY ts_rank_cd(fts, websearch_to_tsquery('english', %s)) DESC) as keyword_rank
                FROM document_chunks
                WHERE workspace_id = %s AND fts @@ websearch_to_tsquery('english', %s)
                ORDER BY keyword_rank LIMIT 30
            )
            SELECT id, source_name, content,
                   COALESCE(1.0 / (60 + vector_rank), 0.0) + COALESCE(1.0 / (60 + keyword_rank), 0.0) as rrf_score
            FROM vector_search
            FULL OUTER JOIN keyword_search USING (id, source_name, content)
            ORDER BY rrf_score DESC
            LIMIT %s;
            """,
            (str(query_vector), req.workspace_id, str(query_vector), req.query, req.workspace_id, req.query, RETRIEVAL_TOP_K)
        )
        results = cursor.fetchall()

    context_text = ""
    citations_metadata = []
    
    # Format the retrieved chunks for the prompt
    for idx, row in enumerate(results):
        chunk_id, source_name, content, _ = row # Unpack the 4 columns returned by the CTE
        context_text += f"\n--- Source [{idx + 1}]: {source_name} ---\n{content}\n"
        citations_metadata.append({"citation_number": idx + 1, "source": source_name, "chunk_id": chunk_id , "content": content})

    # ... (Your existing RRF SQL Query and context_text building stays exactly the same) ...

    # 1. Initialize the LangChain Chat Model
    llm = ChatGoogleGenerativeAI(
        model="gemini-2.5-flash",
        temperature=0.0,
        google_api_key=GEMINI_API_KEY
    )

    # 2. Define a strict LangChain PromptTemplate
    template = """
    You are a helpful, factual enterprise AI assistant. You answer questions based ONLY on the provided Context.

    Context Rules:
    1. The Context contains excerpts from uploaded documents. The name of the document is provided in the source tags.
    2. If the user asks general questions about entities (like "What is"), you are allowed to logically infer basic information from the context (e.g., "GlobalCorp is the organization that issued the HR Remote Work Policy").
    3. If the answer cannot be logically deduced from the Context at all, you MUST reply verbatim: "I do not have enough information in the provided documents to answer that."
    4. When you provide an answer based on the context, append the source number in brackets to the end of the relevant sentence. Example: [1].
    
    Context:
    {context}

    Question: {question}
    """
    
    prompt = PromptTemplate.from_template(template)

    # 3. Build the LangChain Expression Language (LCEL) Chain
    # This pipes the prompt into the LLM, and outputs a clean string.
    chain = prompt | llm | StrOutputParser()

    # 4. Stream the output using LangChain's async streaming (.astream)
    async def stream_generator():
        if not results:
            yield f"data: {json.dumps({'type': 'text', 'content': no_answer_message})}\n\n"
            yield f"data: {json.dumps({'type': 'metadata', 'citations': []})}\n\n"
            return
            
        try:
            # LangChain natively supports async token streaming
            async for chunk_text in chain.astream({
                "context": context_text, 
                "question": req.query
            }):
                if chunk_text:
                    yield f"data: {json.dumps({'type': 'text', 'content': chunk_text})}\n\n"
                    
        except Exception:
            logger.exception("LangChain model streaming failed for workspace_id=%s", req.workspace_id)
            yield f"data: {json.dumps({'type': 'error', 'content': 'Failed to generate response from model.'})}\n\n"
        finally:
            # Yield your citations metadata at the end of the stream
            yield f"data: {json.dumps({'type': 'metadata', 'citations': citations_metadata})}\n\n"

    return StreamingResponse(stream_generator(), media_type="text/event-stream")