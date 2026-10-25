import pytest
import sys
from pathlib import Path
import json

sys.path.insert(0, str(Path(__file__).resolve().parent))
from evaluate_system import compare_field, normalize_date, normalize_text

def test_normalize_text():
    assert normalize_text("  hello   WORLD ") == "hello world"
    assert normalize_text(None) == ""

def test_normalize_date():
    assert normalize_date("2026-09-30") == "2026-09-30"
    assert normalize_date("September 30, 2026") == "2026-09-30"
    assert normalize_date("") == ""

def test_compare_field():
    assert compare_field("2026-09-30", "September 30, 2026", "startDate") == True
    assert compare_field("2026-09-30", "2026-09-29", "startDate") == False
    assert compare_field("Acme Corp", "acme  corp", "parties") == True
    assert compare_field(["Acme", "Beta"], ["beta", "acme"], "parties") == True
    assert compare_field(["Acme", "Beta"], ["alpha"], "parties") == False
    assert compare_field("Net 30", "net 30", "paymentTerms") == True

def test_malformed_inputs_graceful():
    assert compare_field(None, "val", "type") == False
    assert compare_field(None, None, "type") == True
    assert compare_field(["val"], "val", "parties") == False
