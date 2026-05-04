import os
import logging
from huggingface_hub import InferenceClient

HF_TOKEN = os.getenv("HF_TOKEN")
HF_EMBEDDING_MODEL = os.getenv("HF_EMBEDDING_MODEL", "sentence-transformers/all-MiniLM-L6-v2")
logger = logging.getLogger(__name__)

# Initialize the official client using the free serverless provider
client = InferenceClient(provider="hf-inference", api_key=HF_TOKEN) if HF_TOKEN else None

def get_embedding(text: str) -> list[float]:
    if not HF_TOKEN or client is None:
        raise RuntimeError("HF_TOKEN is missing")

    try:
        # The SDK automatically handles the correct endpoint routing and cold-start waits!
        result = client.feature_extraction(
            text,
            model=HF_EMBEDDING_MODEL
        )
        
        # Ensure the output is a flat list of floats for pgvector
        vector = result.tolist() if hasattr(result, "tolist") else list(result)
        
        # Some models return nested lists (e.g., [[0.1, 0.2...]]), so we flatten it if needed
        while isinstance(vector, list) and len(vector) > 0 and isinstance(vector[0], list):
            vector = vector[0]
            
        if not vector:
            raise RuntimeError("Received an empty embedding vector")
        
        return vector

    except Exception as e:
        logger.exception("Hugging Face embedding request failed")
        raise RuntimeError(f"HF API Error: {str(e)}") from e
