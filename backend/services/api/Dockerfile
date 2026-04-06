FROM python:3.11-slim

WORKDIR /app

# Install system dependencies for asyncpg compilation if needed
RUN apt-get update && apt-get install -y gcc && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY src/ ./src/

EXPOSE 3000

# Run uvicorn on port 3000 to maintain docker-compose compatibility
CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "3000"]
