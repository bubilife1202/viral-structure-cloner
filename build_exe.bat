@echo off
echo Installing PyInstaller...
pip install pyinstaller

echo Building Executable...
pyinstaller --noconfirm --onefile --windowed --name "YouTubePatternBenchmark" --add-data "static;static" --add-data "services;services" --hidden-import "uvicorn.logging" --hidden-import "uvicorn.loops" --hidden-import "uvicorn.loops.auto" --hidden-import "uvicorn.protocols" --hidden-import "uvicorn.protocols.http" --hidden-import "uvicorn.protocols.http.auto" --hidden-import "uvicorn.lifespan" --hidden-import "uvicorn.lifespan.on" main.py

echo Build Complete!
echo The executable is located in the 'dist' folder.
pause
