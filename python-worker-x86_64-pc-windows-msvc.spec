# -*- mode: python ; coding: utf-8 -*-


a = Analysis(
    ['client\\detection\\ipc_worker.py'],
    pathex=['.'],
    binaries=[],
    datas=[('client/detection/assets/yolo/best.onnx', 'client/detection/assets/yolo'), ('client/detection/assets/yolo/champMap.json', 'client/detection/assets/yolo'), ('client/capture/assets/anchor_whole_L.png', 'client/capture/assets'), ('client/capture/assets/anchor_whole_R.png', 'client/capture/assets')],
    hiddenimports=['client', 'client.capture', 'client.capture.screen_capture', 'client.capture.live_client_api', 'client.capture.lcu_connector', 'client.detection', 'client.detection.worker', 'client.detection.yolo_matcher'],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name='python-worker-x86_64-pc-windows-msvc',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
