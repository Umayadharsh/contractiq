import mongoose
import os

mongoose_uri = os.environ.get('MONGO_URI', 'mongodb://localhost:27017/contractiq')
print(f"Connecting to {mongoose_uri}")

from pymongo import MongoClient
client = MongoClient(mongoose_uri)
db = client.get_database()
contracts = db.contracts

# Find all contracts that are Failed but have no complianceReport, and reset them to NeedsReview
result = contracts.update_many(
    {
        "status": "Failed",
        "complianceReport": None,
        "$or": [
            {"extractionError": {"$in": [None, ""]}},
            {"extractionError": {"$exists": False}}
        ]
    },
    {"$set": {"status": "NeedsReview", "evaluationError": None}}
)
print(f"Modified {result.modified_count} documents.")
