FROM python:3.13-slim
WORKDIR /app
COPY . .
# 仅用标准库，无需 pip install
EXPOSE 10000
CMD ["python", "app.py"]
