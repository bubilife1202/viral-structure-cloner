@echo off
echo Installing dependencies...
pip install -r requirements.txt
if %errorlevel% neq 0 (
    echo Failed to install dependencies.
    pause
    exit /b %errorlevel%
)

echo Starting FastAPI server...
python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
pause
