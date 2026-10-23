import sys
from pathlib import Path

# Los módulos del bot se importan como en `python bot/actualizar.py`.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "bot"))
