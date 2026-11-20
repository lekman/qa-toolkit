"""qualify for pytest: qualification tests that write redacted JSON evidence.

Declare a test with :func:`iq`, :func:`oq`, :func:`pq` or :func:`iu`; it
receives the ``ctx`` fixture (a :class:`Context`). The plugin writes one
record per test, and ``qualify merge`` (or ``pytest --qualify-merge``) builds
the run file. See ``spec/qualify/README.md`` in the source repository for the
contract every language follows.
"""

from qualify.api import iq, iu, oq, pq
from qualify.context import (
    Assertion,
    AttachmentTooLarge,
    Check,
    CheckFailed,
    Context,
    Secret,
    SecretNotFound,
)
from qualify.declaration import DeclarationError
from qualify.envelope import tool_version
from qualify.redaction import RedactionWarning
from qualify.runtime import configure
from qualify.settings import ConfigurationError, NotApplicable

__version__ = tool_version()

__all__ = [
    "Assertion",
    "AttachmentTooLarge",
    "Check",
    "CheckFailed",
    "ConfigurationError",
    "Context",
    "DeclarationError",
    "NotApplicable",
    "RedactionWarning",
    "Secret",
    "SecretNotFound",
    "__version__",
    "configure",
    "iq",
    "iu",
    "oq",
    "pq",
]
