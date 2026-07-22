#!/bin/bash
cd "$(dirname "$0")"
export DB_PATH="$(dirname "$0")/greenfun.db"
python3 app.py
