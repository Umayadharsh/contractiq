import os
import sys

# Setup environment
os.environ["GEMINI_API_KEY"] = "AIzaSyDummyKey"
os.environ["GEMINI_MODEL"] = "gemini-3.6-flash"
sys.path.append(os.path.abspath("ai-service"))

import main

req = main.ExtractionRequest(text='SERVICE AGREEMENT\n\nThe Client shall pay all invoices within sixty (60) days of receiving the invoice.\n\nThe agreement shall be governed by the laws of New York.')
try:
    print(main.extract_contract(req))
except Exception as e:
    import traceback
    traceback.print_exc()
