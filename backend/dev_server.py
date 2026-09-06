#!/usr/bin/env python3
"""
Django dev server with file watching via watchfiles (polling mode).
Works on Windows + Docker volumes where inotify doesn't propagate.
"""
import os
import subprocess
import sys
import time
import signal

def main():
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
    
    # Run migrations first
    subprocess.run([sys.executable, "manage.py", "migrate", "--noinput"], check=False)
    
    # Import watchfiles filter
    from watchfiles import DefaultFilter, watch
    from watchfiles.run import detect_target_type
    
    # Watch for .py file changes only
    watch_dir = os.path.dirname(os.path.abspath(__file__))
    
    print(f"[dev_server] Watching {watch_dir} for changes (polling mode)...")
    
    process = None
    
    def start_server():
        nonlocal process
        print("[dev_server] Starting Django dev server...")
        process = subprocess.Popen(
            [sys.executable, "manage.py", "runserver", "0.0.0.0:8000"],
            cwd=watch_dir,
        )
    
    def stop_server():
        nonlocal process
        if process:
            print("[dev_server] Stopping Django dev server...")
            process.terminate()
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
            process = None
    
    start_server()
    
    try:
        # Use watchfiles with polling - DefaultFilter ignores .pyc, __pycache__, etc.
        for changes in watch(watch_dir, filter=DefaultFilter(), poll_delay_ms=1000):
            # Filter for .py files only
            py_changes = [(change, path) for change, path in changes if path.endswith('.py')]
            if py_changes:
                print(f"[dev_server] Detected {len(py_changes)} file change(s), restarting...")
                stop_server()
                time.sleep(0.5)
                start_server()
    except KeyboardInterrupt:
        stop_server()
        print("[dev_server] Shutting down.")

if __name__ == "__main__":
    main()
