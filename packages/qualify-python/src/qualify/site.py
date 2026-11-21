"""Sites: the repository-relative ``path:line`` of a declaration, a check or a failure."""

from __future__ import annotations

import os
import sys
from types import FrameType, TracebackType

_OWN = os.path.dirname(os.path.abspath(__file__)) + os.sep


def format_site(path: str, line: int, root: str) -> str:
    """``path:line``, relative to ``root`` with forward slashes.

    A path that cannot be made relative without leaving ``root`` keeps its base
    name, so a site never names a folder outside the repository.
    """
    absolute = os.path.abspath(path)
    try:
        relative = os.path.relpath(absolute, root)
    except ValueError:
        relative = ""
    if relative == "" or relative.startswith(".."):
        relative = os.path.basename(absolute) or "unknown"
    text = relative.replace(os.sep, "/").replace(":", "_").replace("\n", "_")
    return f"{text}:{line}"


def is_own(path: str) -> bool:
    """Whether a file belongs to qualify itself."""
    return os.path.abspath(path).startswith(_OWN)


def caller(root: str) -> str | None:
    """The site of the first frame on the stack outside qualify's own code."""
    frame: FrameType | None = sys._getframe(1)
    while frame is not None:
        path = frame.f_code.co_filename
        if not is_own(path) and not path.startswith("<"):
            return format_site(path, frame.f_lineno, root)
        frame = frame.f_back
    return None


def in_file(traceback: TracebackType | None, path: str, root: str) -> str | None:
    """The site of the innermost traceback frame that lies in ``path``."""
    wanted = os.path.normcase(os.path.abspath(path))
    found: str | None = None
    while traceback is not None:
        code = traceback.tb_frame.f_code
        if os.path.normcase(os.path.abspath(code.co_filename)) == wanted:
            found = format_site(code.co_filename, traceback.tb_lineno, root)
        traceback = traceback.tb_next
    return found
