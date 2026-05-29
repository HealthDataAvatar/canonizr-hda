"""Azure credential helper.

Production: ManagedIdentityCredential with explicit client_id (no fallback chain).
Tests: None (connection strings used instead).
"""

import os


def get_credential():
    """Return a ManagedIdentityCredential if AZURE_CLIENT_ID is set, else None."""
    client_id = os.environ.get("AZURE_CLIENT_ID", "")
    if not client_id:
        return None
    from azure.identity import ManagedIdentityCredential

    return ManagedIdentityCredential(client_id=client_id)


def get_async_credential():
    """Async version for blob storage."""
    client_id = os.environ.get("AZURE_CLIENT_ID", "")
    if not client_id:
        return None
    from azure.identity.aio import ManagedIdentityCredential

    return ManagedIdentityCredential(client_id=client_id)
