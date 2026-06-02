"""Centralised Azure client construction.

Single place that decides: managed identity (prod) vs connection string (Azurite/tests).
All services receive pre-built clients — they never read env vars or construct credentials.
"""

import os

from azure.data.tables import TableServiceClient
from azure.storage.blob.aio import BlobServiceClient


def get_table_service() -> TableServiceClient:
    """Build a TableServiceClient from env vars. Prefer endpoint + managed identity."""
    endpoint = os.environ.get("TABLE_STORAGE_URL", "")
    conn_str = os.environ.get("TABLE_STORAGE_CONNECTION_STRING", "")

    if endpoint:
        from .azure_auth import get_credential

        credential = get_credential()
        if credential is None:
            raise ValueError("AZURE_CLIENT_ID required when using TABLE_STORAGE_URL")
        return TableServiceClient(endpoint, credential=credential)
    elif conn_str:
        return TableServiceClient.from_connection_string(conn_str)
    else:
        raise ValueError("Set TABLE_STORAGE_URL or TABLE_STORAGE_CONNECTION_STRING")


def get_blob_service() -> BlobServiceClient:
    """Build an async BlobServiceClient from env vars. Prefer endpoint + managed identity."""
    endpoint = os.environ.get("BLOB_STORAGE_URL", "")
    conn_str = os.environ.get("BLOB_STORAGE_CONNECTION_STRING", "")

    if endpoint:
        from .azure_auth import get_async_credential

        credential = get_async_credential()
        if credential is None:
            raise ValueError("AZURE_CLIENT_ID required when using BLOB_STORAGE_URL")
        return BlobServiceClient(endpoint, credential=credential)
    elif conn_str:
        return BlobServiceClient.from_connection_string(conn_str)
    else:
        raise ValueError("Set BLOB_STORAGE_URL or BLOB_STORAGE_CONNECTION_STRING")
