FROM python:3.11-slim

WORKDIR /app

COPY ml-service/requirements.txt /app/ml-service/requirements.txt
RUN pip install --no-cache-dir -r /app/ml-service/requirements.txt

COPY . /app

RUN mkdir -p /app/ml-service/data && cp /app/src/data/diseases.json /app/ml-service/data/diseases.json

ENV PYTHONPATH=/app/ml-service

EXPOSE 8001

CMD ["python3", "-m", "uvicorn", "ml-service.app:app", "--host", "0.0.0.0", "--port", "8001"]
