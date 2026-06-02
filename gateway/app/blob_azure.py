"""Azure Blob Storage implementation of BlobStore protocol."""

from azure.storage.blob.aio import BlobServiceClient


class AzureBlobStore:
    """BlobStore backed by Azure Blob Storage."""

    def __init__(self, client: BlobServiceClient, *, container: str = "jobs"):
        self._client = client
        self._container = container
        self._container_ensured = False

    async def _ensure_container(self) -> None:
        if self._container_ensured:
            return
        try:
            await self._client.create_container(self._container)
        except Exception:
            pass  # already exists
        self._container_ensured = True

    async def put(self, key: str, data: bytes) -> None:
        await self._ensure_container()
        blob = self._client.get_blob_client(self._container, key)
        await blob.upload_blob(data, overwrite=True)

    async def get(self, key: str) -> bytes | None:
        blob = self._client.get_blob_client(self._container, key)
        try:
            stream = await blob.download_blob()
            return await stream.readall()
        except Exception as e:
            if "BlobNotFound" in str(e) or "404" in str(e):
                return None
            raise

    async def delete(self, key: str) -> None:
        blob = self._client.get_blob_client(self._container, key)
        try:
            await blob.delete_blob()
        except Exception as e:
            if "BlobNotFound" not in str(e) and "404" not in str(e):
                raise

    async def delete_prefix(self, prefix: str) -> int:
        container = self._client.get_container_client(self._container)
        count = 0
        async for blob in container.list_blobs(name_starts_with=prefix):
            await container.delete_blob(blob.name)
            count += 1
        return count

    async def close(self) -> None:
        await self._client.close()
