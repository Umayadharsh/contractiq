from fastapi import FastAPI
from starlette.exceptions import HTTPException
import uvicorn
import asyncio
from httpx import AsyncClient

app = FastAPI()

@app.get("/")
def test():
    raise HTTPException(status_code=500, detail={"message": "hello"})

async def main():
    config = uvicorn.Config(app, port=8003, log_level="warning")
    server = uvicorn.Server(config)
    task = asyncio.create_task(server.serve())
    await asyncio.sleep(1)
    async with AsyncClient() as client:
        r = await client.get("http://127.0.0.1:8003/")
        print("STATUS:", r.status_code)
        print("BODY:", r.text)
    task.cancel()

asyncio.run(main())
