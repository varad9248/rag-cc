from celery import Celery
import logging
import os
import psycopg2
from pgvector.psycopg2 import register_vector
from langchain_text_splitters import RecursiveCharacterTextSplitter
from services.embeddings import get_embedding

logger = logging.getLogger(__name__)

celery_app = Celery("rag_tasks", broker=os.getenv("REDIS_BROKER_URL", "redis://redis:6379/0"))
celery_app.conf.update(
    task_track_started=True,
    worker_prefetch_multiplier=1,
)

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

@celery_app.task(
    name="process_document",
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_jitter=True,
    retry_kwargs={"max_retries": 3},
)
def process_document(workspace_id: int, source_name: str, raw_text: str):
    # UPGRADE 1: Increased chunk size and smarter semantic separators
    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size=1500,
        chunk_overlap=200,
        length_function=len,
        separators=["\n\n", "\n", ".", "!", "?", " ", ""],
        is_separator_regex=False
    )
    chunks = text_splitter.split_text(raw_text)
    
    if not chunks:
        logger.warning("Skipping document processing because no chunks were produced for %s", source_name)
        return

    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        for i, chunk in enumerate(chunks):
            # UPGRADE 2: Metadata enrichment. Prepend the filename so the embedding captures context.
            enriched_chunk_text = f"Document Source: {source_name}\n\nContent: {chunk}"
            
            # Generate the embedding based on the ENRICHED text
            vector = get_embedding(enriched_chunk_text)
            
            # Store the original chunk for the LLM context, but use the enriched vector
            cursor.execute(
                """INSERT INTO document_chunks (workspace_id, source_name, chunk_index, content, embedding) 
                   VALUES (%s, %s, %s, %s, %s)""",
                (workspace_id, source_name, i, chunk, vector)
            )
        conn.commit()
        logger.info("Processed %s chunks for workspace_id=%s source_name=%s", len(chunks), workspace_id, source_name)
    except Exception:
        conn.rollback()
        logger.exception("Worker failed while processing workspace_id=%s source_name=%s", workspace_id, source_name)
        raise
    finally:
        cursor.close()
        conn.close()