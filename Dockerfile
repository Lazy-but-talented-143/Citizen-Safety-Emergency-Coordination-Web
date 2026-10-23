# Multi-stage production Dockerfile for Citizen Safety Platform
FROM python:3.12-slim

# Prevent Python from writing .pyc files & enable unbuffered stdout/stderr
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install dependencies
COPY requirements.txt /app/
RUN pip install --no-cache-dir -r requirements.txt

# Copy application source code
COPY . /app/

# Expose Daphne/Uvicorn ASGI server port
EXPOSE 8000

CMD ["sh", "-c", "python manage.py migrate --noinput && python manage.py seed_demo && python manage.py collectstatic --noinput --clear && (python manage.py process_escalations --interval 2.0 &) && exec uvicorn rescue.asgi:application --host 0.0.0.0 --port ${PORT:-8000}"]
