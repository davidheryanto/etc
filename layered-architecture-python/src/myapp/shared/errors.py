"""shared.errors — base error types shared across features.

Domain-specific errors (TooManyOpenBugs, EmailAlreadyRegistered, ...) live in each
feature's service.py and subclass DomainError. The boundary catches DomainError
subclasses and maps them to HTTP status codes; the domain itself stays ignorant of HTTP.
"""


class DomainError(Exception):
    """A business-rule violation, expressed in domain terms — NOT an HTTP error.

    A service raises this; a boundary (HTTP, CLI, queue worker) decides what it
    means on the wire. That separation is why the same service works behind any
    delivery mechanism.
    """
