# Python stage — lightweight for Cloud Run
FROM python:3.11-slim

WORKDIR /app

# Install minimal system dependencies (no browser, no display server)
RUN apt-get update && apt-get install -y \
    gcc \
    python3-dev \
    libgl1 \
    libpng-dev \
    procps \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements
COPY requirements.txt ./

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy source code
COPY . .

# Environment variables
ENV PYTHONUNBUFFERED=1
ENV PORT=8000
# Add /app to PYTHONPATH so imports work correctly
ENV PYTHONPATH=/app
# Mark as Docker environment
ENV IS_DOCKER=true

# Expose ports for all agent servers
EXPOSE 8000 3002 3003 3004 3005

# Make script executable
RUN chmod +x agents/start-docker.sh

# Start command
CMD ["./agents/start-docker.sh"]
