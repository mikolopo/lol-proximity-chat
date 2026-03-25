@echo off
echo ===================================================
echo   LoL Proximity Chat - Tauri Build Script
echo ===================================================
echo.

echo [1/3] Building Python Worker Sidecar (PyInstaller)...
call .venv_build\Scripts\pyinstaller.exe -y --onefile --log-level WARN ^
    --paths . ^
    --hidden-import client ^
    --hidden-import client.capture ^
    --hidden-import client.capture.screen_capture ^
    --hidden-import client.capture.live_client_api ^
    --hidden-import client.capture.lcu_connector ^
    --hidden-import client.detection ^
    --hidden-import client.detection.worker ^
    --hidden-import client.detection.yolo_matcher ^
    --add-data "client\detection\assets\yolo\best.onnx;client\detection\assets\yolo" ^
    --add-data "client\detection\assets\yolo\champMap.json;client\detection\assets\yolo" ^
    --add-data "client\capture\assets\anchor_whole_L.png;client\capture\assets" ^
    --add-data "client\capture\assets\anchor_whole_R.png;client\capture\assets" ^
    --name python-worker-x86_64-pc-windows-msvc ^
    client\detection\ipc_worker.py

move dist\python-worker-x86_64-pc-windows-msvc.exe desktop\src-tauri\
echo Sidecar moved to desktop\src-tauri\

echo.
echo [2/3] Building React Frontend and Rust native Core...
cd desktop
call npm install
call npm run build
call npm run tauri build

echo.
echo ===================================================
echo [3/3] Build Complete!
echo Your installer and executables are located in:
echo desktop\src-tauri\target\release\bundle\
echo ===================================================
pause
