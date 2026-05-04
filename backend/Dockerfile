FROM python:3.10-slim

# Prevent Python from buffering stdout/stderr and writing .pyc files
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

WORKDIR /app

# Install ONLY the runtime requirement for PostgreSQL connections.
# Skipping 'build-essential' saves a massive amount of build time.
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    && rm -rf /var/lib/apt/lists/*

# Copy ONLY requirements first. 
# Docker caches this step, so if you change your code (main.py), 
# it WON'T re-download all your pip packages.
COPY requirements.txt .

# Install dependencies quickly using pre-built binaries
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Copy the rest of your application code
COPY . .

# Default command to run the API
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]