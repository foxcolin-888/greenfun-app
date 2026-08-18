# 绿趣全流程管理系统 - 生产镜像
# 纯 Python 标准库后端，无需 pip install；数据库与上传文件挂持久卷到 /data。
FROM python:3.13-slim

WORKDIR /app

# 仅复制运行时必需文件，避免把本地数据库/临时文件打进镜像
COPY app.py ./
COPY web/ ./web/
COPY requirements.txt ./

# 端口：容器内固定 8000（由 docker-compose 的 PORT 环境变量驱动，与 app.py 一致）
EXPOSE 8000

# 运行时通过环境变量注入 DB_PATH=/data/greenfun.db 与 UPLOAD_DIR=/data/uploads
# 由 docker-compose 的 greenfun_data 卷挂载到 /data 实现持久化
CMD ["python", "app.py"]
