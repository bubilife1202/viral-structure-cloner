import multiprocessing
import uvicorn
import webbrowser
import threading
import socket

import sys
import os
from application import app, CONFIG_DIR

if __name__ == "__main__":
    multiprocessing.freeze_support()

    # Fix for uvicorn logging in frozen app (no console) - Double safety
    if sys.stdout is None or sys.stderr is None:
        class NullWriter:
            def write(self, text): pass
            def flush(self): pass
            def isatty(self): return False
        
        if sys.stdout is None:
            sys.stdout = NullWriter()
        if sys.stderr is None:
            sys.stderr = NullWriter()

    # Define log file path
    log_file = CONFIG_DIR / "server.log"

    # Custom logging config to write to file instead of console
    log_config = {
        "version": 1,
        "disable_existing_loggers": False,
        "formatters": {
            "default": {
                "()": "uvicorn.logging.DefaultFormatter",
                "fmt": "%(levelprefix)s %(message)s",
                "use_colors": False,
            },
            "access": {
                "()": "uvicorn.logging.AccessFormatter",
                "fmt": '%(levelprefix)s %(client_addr)s - "%(request_line)s" %(status_code)s',
                "use_colors": False,
            },
        },
        "handlers": {
            "file": {
                "class": "logging.FileHandler",
                "filename": str(log_file),
                "formatter": "default",
                "encoding": "utf-8",
            },
            "access_file": {
                "class": "logging.FileHandler",
                "filename": str(log_file),
                "formatter": "access",
                "encoding": "utf-8",
            },
        },
        "loggers": {
            "uvicorn": {
                "handlers": ["file"],
                "level": "INFO",
            },
            "uvicorn.error": {
                "level": "INFO",
                "handlers": ["file"],
                "propagate": False,
            },
            "uvicorn.access": {
                "handlers": ["access_file"],
                "level": "INFO",
                "propagate": False,
            },
        },
    }

    def find_available_port(preferred: int = 8000) -> int:
        def _is_free(port: int) -> bool:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                try:
                    s.bind(("", port))
                    return True
                except OSError:
                    return False

        if preferred and _is_free(preferred):
            return preferred

        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.bind(("", 0))
            return s.getsockname()[1]

    preferred_port = int(os.getenv("PORT", "8000"))
    port = find_available_port(preferred_port)

    def _open_browser():
        webbrowser.open(f"http://localhost:{port}")

    threading.Timer(1.5, _open_browser).start()

    # Run with custom log config and no colors
    uvicorn.run(app, host="0.0.0.0", port=port, reload=False, log_config=log_config, use_colors=False)
