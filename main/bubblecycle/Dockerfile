# RECYCL IT! server + app, one container. Nothing here is published automatically.
#   docker build -t bubblecycle .
#   docker run -p 8080:8080 -v bubblecycle-data:/data --env-file .env bubblecycle
FROM python:3.12-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .
RUN useradd --create-home app && mkdir -p /data && chown app /data
USER app

# The database lives on a volume. BC_MODE, BC_ORIGIN, BC_RP_ID, BC_ADMIN_TOKEN and BC_RECEIPT_SECRET come from the
# environment (see .env.example); no secret is baked into the image or shipped to the browser.
ENV BC_HOST=0.0.0.0 BC_PORT=8080 BC_DB=/data/bubblecycle.db
EXPOSE 8080
CMD ["python", "-m", "server"]
