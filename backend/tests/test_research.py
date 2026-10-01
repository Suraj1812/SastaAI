import os
import unittest
from unittest.mock import AsyncMock, patch
from fastapi.testclient import TestClient
from pydantic import ValidationError
from backend.main import SearchRequest, SearchResult, app
from backend.evidence import extract_answer
from backend.research_context import conversation_answer, resolve_question


class ResearchTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)
        self.history = [{"question": "What is Earth?", "answer": "Earth is a planet. [1]", "topic": "Earth"}]

    def test_follow_up_keeps_topic(self):
        resolved = resolve_question("How old is it?", self.history)
        self.assertEqual(resolved["topic"], "Earth")
        self.assertEqual(resolved["query"], "How old is Earth?")

    def test_new_topic_does_not_inherit_previous_subject(self):
        self.assertEqual(resolve_question("What about Mars?", self.history)["topic"], "Mars")
        self.assertFalse(resolve_question("Explain photosynthesis and its benefits", self.history)["context_used"])

    def test_ambiguous_question_requests_clarification(self):
        self.assertEqual(resolve_question("How old is it?")["intent"], "clarify")

    def test_personal_memory_is_session_scoped(self):
        history = [{"question": "My name is Rahul", "answer": "Noted."}]
        self.assertIn("Rahul", conversation_answer("What is my name?", history, "recall"))
        self.assertNotIn("Rahul", conversation_answer("What is my name?", [], "recall"))

    def test_arithmetic_and_zero_division(self):
        self.assertIn("20", conversation_answer("What is 12 + 8?", [], "calculate"))
        self.assertIn("undefined", conversation_answer("Calculate 12 / 0", [], "calculate"))

    def test_query_and_history_bounds(self):
        for request in [{"query": " "}, {"query": "x" * 281}, {"query": "hello", "history": self.history * 13}]:
            with self.assertRaises(ValidationError):
                SearchRequest(**request)

    def test_unsafe_history_source_urls_rejected(self):
        for url in ["javascript:alert(1)", "file:///etc/passwd", "https://user:password@example.com"]:
            with self.assertRaises(ValidationError):
                SearchResult(title="source", url=url, source="example", snippet="")

    def test_specific_birthplace_not_generic_born_intro(self):
        source = SearchResult(title="Scientist", url="https://example.com", source="example", snippet="")
        answer, supported = extract_answer("Where was Scientist born?", [(source, "Scientist was a German-born theoretical physicist known for important discoveries. Scientist was born in Ulm on 14 March 1879.")])
        self.assertTrue(supported)
        self.assertIn("Ulm", answer)

    def test_temperature_needs_numerical_evidence(self):
        source = SearchResult(title="Sun", url="https://example.com", source="example", snippet="")
        answer, supported = extract_answer("How hot is Sun?", [(source, "The Sun is a massive sphere of hot plasma heated by nuclear fusion in its core. The Sun's surface temperature is about 5800 K.")])
        self.assertTrue(supported)
        self.assertIn("5800", answer)
        self.assertNotIn("sphere of hot", answer)

    def test_creator_relationship_not_unrelated_design(self):
        source = SearchResult(title="Python", url="https://example.com", source="example", snippet="")
        answer, supported = extract_answer("Who created Python?", [(source, "Functions are created in Python by using the def keyword. It was designed as a successor to ABC, which was inspired by SETL and other languages. Python was conceived in the late 1980s by Guido van Rossum in the Netherlands.")])
        self.assertTrue(supported)
        self.assertIn("Guido", answer)
        self.assertNotIn("def keyword", answer)

    def test_unavailable_evidence_is_not_invented(self):
        answer, supported = extract_answer("How old is Planet?", [])
        self.assertFalse(supported)
        self.assertNotRegex(answer, r"\[\d+\]")

    def test_endpoint_conversation_has_no_network(self):
        with patch("backend.main.search_wikipedia", new_callable=AsyncMock) as provider:
            response = self.client.post("/search", json={"query": "How old is it?"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["answer_mode"], "clarification")
        provider.assert_not_awaited()

    def test_shortener_retains_citation_without_reverified_claim(self):
        source = {"title": "Earth", "url": "https://en.wikipedia.org/wiki/Earth", "source": "wikipedia.org", "snippet": "Earth is a planet.", "verified": True}
        history = [{**self.history[0], "sources": [source]}]
        response = self.client.post("/search", json={"query": "In one sentence", "history": history}).json()
        self.assertIn("[1]", response["answer"])
        self.assertEqual(response["verified_sources"], 0)
        self.assertFalse(response["results"][0]["verified"])

    def test_full_pipeline_uses_resolved_question(self):
        source = SearchResult(title="Earth", url="https://en.wikipedia.org/wiki/Earth", source="wikipedia.org", snippet="Earth formed about 4.5 billion years ago.", verified=True)
        with patch.dict(os.environ, {"OPENAI_API_KEY": "", "SERPAPI_API_KEY": ""}), patch("backend.main.search_wikipedia", new_callable=AsyncMock, return_value=([source], [])) as provider, patch("backend.main.enrich_result", new_callable=AsyncMock, return_value=(source, source.snippet)):
            response = self.client.post("/search", json={"query": "How old is it?", "history": self.history})
        self.assertEqual(response.status_code, 200)
        self.assertIn("4.5 billion", response.json()["answer"])
        self.assertTrue(response.json()["context_used"])
        self.assertEqual(provider.call_args.args[0], "Earth")


if __name__ == "__main__":
    unittest.main()
