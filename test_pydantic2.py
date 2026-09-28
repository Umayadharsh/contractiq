from pydantic import BaseModel, Field, field_validator, ValidationError
import json

class MyModel(BaseModel):
    parties: list[str]

    @field_validator("parties")
    @classmethod
    def validate_parties(cls, value):
        if len(value) == 0:
            raise ValueError("At least one party is required")
        return value

try:
    MyModel(parties=[])
except ValidationError as exc:
    print(exc.errors())
    try:
        json.dumps(exc.errors())
        print("JSON DUMPS SUCCEEDED")
    except Exception as e:
        print("JSON DUMPS FAILED:", type(e).__name__, e)
    
    print("USING JSON():", exc.json())
