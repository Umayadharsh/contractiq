from fastapi.testclient import TestClient
from google.genai import errors as genai_errors
import pytest

import main

client = TestClient(main.app)
VALID_GEMINI_RESPONSE = '{"parties":["Acme Corp"],"contractValue":"$100,000","startDate":"2026-01-01","endDate":"2027-01-01","governingLaw":"New York","paymentTerms":"Net 30","liabilityLimit":"$100,000","clauses":[{"type":"termination","text":"Either party may terminate on thirty days notice."}]}'


def test_extract_accepts_valid_schema(monkeypatch):
    def fake_extract(raw_text):
        return {
            'parties': ['Acme Corp', 'Northwind LLC'],
            'contractValue': '$250,000.00',
            'startDate': '2024-01-01',
            'endDate': '2025-12-31',
            'governingLaw': 'Delaware',
            'paymentTerms': 'Net 30',
            'liabilityLimit': '$100,000',
            'clauses': [
                {'type': 'termination', 'text': 'Either party may terminate for material breach.', 'summary': 'Termination for breach.'},
                {'type': 'liability', 'text': 'Liability is capped at $100,000.', 'summary': 'Capped liability.'},
            ],
        }

    monkeypatch.setattr(main, '_extract_with_llm', fake_extract)
    response = client.post('/extract', json={'text': 'Acme Corp and Northwind LLC agree to a $250,000 contract effective 2024-01-01 through 2025-12-31 under Delaware law with net 30 payment terms and a $100,000 liability cap. Either party may terminate for material breach. Liability is capped at $100,000.'})
    assert response.status_code == 200
    payload = response.json()
    assert payload['parties'] == ['Acme Corp', 'Northwind LLC']
    assert payload['clauses'][0]['type'] == 'termination'


def test_extract_rejects_low_confidence_or_missing_fields(monkeypatch):
    def fake_extract(raw_text):
        return {
            'parties': ['unknown'],
            'contractValue': 'unknown',
            'startDate': None,
            'endDate': None,
            'governingLaw': None,
            'paymentTerms': None,
            'liabilityLimit': None,
            'clauses': [{'type': 'unknown', 'text': 'unknown'}],
        }

    monkeypatch.setattr(main, '_extract_with_llm', fake_extract)
    response = client.post('/extract', json={'text': 'Some contract language appears here with no specific details.'})
    assert response.status_code == 422
    assert 'low-confidence' in response.json()['detail']['message'].lower()


def test_extract_keeps_gemini_client_open_during_request(monkeypatch):
    class FakeModels:
        def __init__(self, owner):
            self.owner = owner

        def generate_content(self, **_kwargs):
            assert not self.owner.closed
            self.owner.request_completed = True
            return type('Response', (), {'text': '{"parties":["Acme Corp"],"contractValue":"$100,000","startDate":"2026-01-01","endDate":"2027-01-01","governingLaw":"New York","paymentTerms":"Net 30","liabilityLimit":"$100,000","clauses":[{"type":"termination","text":"Either party may terminate on thirty days notice."}]}'})()

    class FakeGeminiClient:
        def __init__(self, **_kwargs):
            self.closed = False
            self.request_completed = False
            self.models = FakeModels(self)

        def close(self):
            self.closed = True

    fake_client = FakeGeminiClient()
    monkeypatch.setattr(main.genai, 'Client', lambda **_kwargs: fake_client)
    monkeypatch.setattr(main, '_gemini_client_instance', None)
    monkeypatch.setenv('GEMINI_API_KEY', 'test-key')

    response = client.post('/extract', json={'text': 'A sufficiently long dummy contract text.'})

    assert response.status_code == 200
    assert fake_client.request_completed
    assert not fake_client.closed


def test_extract_uses_gemini_schema_without_additional_properties(monkeypatch):
    class FakeModels:
        def generate_content(self, **kwargs):
            schema = kwargs['config'].response_json_schema

            def assert_supported_schema(value):
                if isinstance(value, dict):
                    assert 'additionalProperties' not in value
                    assert 'additional_properties' not in value
                    for item in value.values():
                        assert_supported_schema(item)
                elif isinstance(value, list):
                    for item in value:
                        assert_supported_schema(item)

            assert_supported_schema(schema)
            return type('Response', (), {'text': '{"parties":["Acme Corp"],"contractValue":"$100,000","startDate":"2026-01-01","endDate":"2027-01-01","governingLaw":"New York","paymentTerms":"Net 30","liabilityLimit":"$100,000","clauses":[{"type":"termination","text":"Either party may terminate on thirty days notice."}]}'})()

    class FakeGeminiClient:
        models = FakeModels()

    monkeypatch.setattr(main, '_gemini_client', lambda: FakeGeminiClient())

    response = client.post('/extract', json={'text': 'A sufficiently long dummy contract text.'})

    assert response.status_code == 200
    assert response.json()['clauses'][0]['type'] == 'termination'


def test_extract_retries_transient_gemini_error_then_succeeds(monkeypatch):
    class FakeModels:
        def __init__(self):
            self.calls = 0

        def generate_content(self, **_kwargs):
            self.calls += 1
            if self.calls == 1:
                raise genai_errors.ServerError(503, {'error': {'message': 'temporarily busy', 'status': 'UNAVAILABLE'}})
            return type('Response', (), {'text': VALID_GEMINI_RESPONSE})()

    models = FakeModels()
    monkeypatch.setattr(main, '_gemini_client', lambda: type('Client', (), {'models': models})())
    monkeypatch.setattr(main.time, 'sleep', lambda _delay: None)
    monkeypatch.setattr(main.random, 'uniform', lambda _start, _end: 0)

    response = client.post('/extract', json={'text': 'A sufficiently long dummy contract text.'})

    assert response.status_code == 200
    assert models.calls == 2


def test_extract_returns_503_after_all_transient_retries(monkeypatch):
    class FakeModels:
        calls = 0

        def generate_content(self, **_kwargs):
            self.calls += 1
            raise genai_errors.ServerError(503, {'error': {'message': 'temporarily busy', 'status': 'UNAVAILABLE'}})

    models = FakeModels()
    monkeypatch.setattr(main, '_gemini_client', lambda: type('Client', (), {'models': models})())
    monkeypatch.setattr(main.time, 'sleep', lambda _delay: None)
    monkeypatch.setattr(main.random, 'uniform', lambda _start, _end: 0)

    response = client.post('/extract', json={'text': 'A sufficiently long dummy contract text.'})

    assert response.status_code == 503
    assert models.calls == 3
    assert response.json()['detail']['message'] == 'Gemini extraction service is unavailable.'


@pytest.mark.parametrize('status_code', [400, 404])
def test_extract_does_not_retry_permanent_gemini_error(monkeypatch, status_code):
    class FakeModels:
        calls = 0

        def generate_content(self, **_kwargs):
            self.calls += 1
            raise genai_errors.ClientError(status_code, {'error': {'message': 'permanent failure', 'status': 'INVALID_ARGUMENT'}})

    models = FakeModels()
    monkeypatch.setattr(main, '_gemini_client', lambda: type('Client', (), {'models': models})())
    monkeypatch.setattr(main.time, 'sleep', lambda _delay: (_ for _ in ()).throw(AssertionError('permanent errors must not sleep')))

    response = client.post('/extract', json={'text': 'A sufficiently long dummy contract text.'})

    assert response.status_code == 503
    assert models.calls == 1


def test_search_clauses_keeps_rrf_enabled_by_default(monkeypatch):
    vector_results = [{'clauseId': 'vector-1', 'score': 0.9}]
    keyword_results = [{'clauseId': 'keyword-1', 'score': 0.8}]

    class FakeCollection:
        def aggregate(self, pipeline):
            return vector_results if '$vectorSearch' in pipeline[0] else keyword_results

    class FakeClient:
        def close(self):
            pass

    monkeypatch.delenv('RRF_ENABLED', raising=False)
    monkeypatch.setattr(main, '_mongo_collection', lambda: (FakeClient(), FakeCollection()))
    monkeypatch.setattr(main, '_create_embeddings', lambda _texts: [[0.1]])
    monkeypatch.setattr(main, '_reciprocal_rank_fusion', lambda vector, keyword: [('rrf', vector, keyword)])

    assert main._search_clauses('contract-1', 'question') == [('rrf', vector_results, keyword_results)]


def test_search_clauses_bypasses_rrf_when_disabled(monkeypatch):
    vector_results = [{'clauseId': f'vector-{index}'} for index in range(6)]
    keyword_results = [{'clauseId': f'keyword-{index}'} for index in range(6)]

    class FakeCollection:
        def aggregate(self, pipeline):
            return vector_results if '$vectorSearch' in pipeline[0] else keyword_results

    class FakeClient:
        def close(self):
            pass

    monkeypatch.setenv('RRF_ENABLED', 'false')
    monkeypatch.setattr(main, '_mongo_collection', lambda: (FakeClient(), FakeCollection()))
    monkeypatch.setattr(main, '_create_embeddings', lambda _texts: [[0.1]])
    monkeypatch.setattr(main, '_reciprocal_rank_fusion', lambda *_args: (_ for _ in ()).throw(AssertionError('RRF should be bypassed')))

    results = main._search_clauses('contract-1', 'question')

    assert results == vector_results + keyword_results[:2]
    assert len(results) == 8
