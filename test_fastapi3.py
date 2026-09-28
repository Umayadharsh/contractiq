from fastapi import FastAPI
import uvicorn
import asyncio
from httpx import AsyncClient

app = FastAPI()

@app.get("/")
def test():
    raise ValueError("Something broke!")

async def main():
    config = uvicorn.Config(app, port=8004, log_level="warning")
    server = uvicorn.Server(config)
    task = asyncio.create_task(server.serve())
    await asyncio.sleep(1)
    async with AsyncClient() as client:
        r = await client.get("http://127.0.0.1:8004/")
        print("STATUS:", r.status_code)
        print("BODY:", r.text)
    task.cancel()

asyncio.run(main())
