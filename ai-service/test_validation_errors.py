"""Regression tests for the request-validation error handler.

A Pydantic v2 validator that raises ValueError puts the exception object itself
in `ctx`. FastAPI's built-in handler passed that straight to json.dumps, so a
client's 422 became a 500 with no usable detail. `main.validation_exception_handler`
coerces every ctx value to str, which keeps the response valid JSON and 422.
"""
from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.testclient import TestClient
from pydantic import BaseModel, field_validator

import main


class _ProbeRequest(BaseModel):
    """Mimics the models that actually trigger the reported crash: a custom
    validator raising ValueError, which lands a raw ValueError in ctx."""

    contractId: str

    @field_validator("contractId")
    @classmethod
    def reject_unknown_contract(cls, value: str) -> str:
        if not value:
            raise ValueError("contractId must not be empty")
        return value


def test_valueerror_in_ctx_returns_422_instead_of_500():
    # A throwaway app carrying the very handler main.py registers, so the test
    # never mutates the shared main.app instance.
    probe = FastAPI()
    probe.add_exception_handler(RequestValidationError, main.validation_exception_handler)

    @probe.post("/probe")
    def _endpoint(payload: _ProbeRequest):  # pragma: no cover - never reached
        return {"ok": True}

    client = TestClient(probe, raise_server_exceptions=False)
    response = client.post("/probe", json={"contractId": ""})

    assert response.status_code == 422, f"expected 422, got {response.status_code}: {response.text}"
    assert "not JSON serializable" not in response.text

    detail = response.json()["detail"]
    assert len(detail) == 1
    assert detail[0]["type"] == "value_error"
    assert detail[0]["loc"] == ["body", "contractId"]
    # The whole point: the ValueError is now a string rather than an object.
    ctx = detail[0]["ctx"]
    assert set(ctx) == {"error"}
    assert isinstance(ctx["error"], str)
    assert "must not be empty" in ctx["error"]


def test_extract_validation_failure_returns_422_with_serializable_detail():
    # The real endpoint from the bug report, with its schema untouched.
    client = TestClient(main.app, raise_server_exceptions=False)
    response = client.post("/extract", json={"text": "short"})

    assert response.status_code == 422, f"expected 422, got {response.status_code}: {response.text}"

    detail = response.json()["detail"]
    assert detail[0]["type"] == "string_too_short"
    assert detail[0]["loc"] == ["body", "text"]
    assert all(isinstance(value, str) for value in detail[0]["ctx"].values())


def test_malformed_json_body_still_returns_422():
    client = TestClient(main.app, raise_server_exceptions=False)
    response = client.post("/extract", data="{not json")

    assert response.status_code == 422, f"expected 422, got {response.status_code}: {response.text}"
    assert response.json()["detail"][0]["type"] == "json_invalid"
    assert isinstance(response.json()["detail"][0]["ctx"]["error"], str)


def test_app_registers_exactly_one_request_validation_error_handler():
    # Guards against a duplicate handler being added later, which would silently
    # shadow this one.
    matches = [key for key in main.app.exception_handlers if key is RequestValidationError]
    assert len(matches) == 1
    assert main.app.exception_handlers[RequestValidationError] is main.validation_exception_handler
