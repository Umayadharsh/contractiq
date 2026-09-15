from fastapi import FastAPI

app = FastAPI(title="ContractIQ AI Service")


@app.get("/health")
def health_check():
    return {"status": "ok"}