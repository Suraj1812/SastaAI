"""Conservative keyless conversation resolution; never a substitute for an LLM."""
from __future__ import annotations

import re

REFERENCE = re.compile(r"\b(it|its|itself|this|that|these|those|they|them|their|he|she|his|her|uska|uske|iski|iske|iska|woh)\b", re.I)
ELLIPTICAL = re.compile(r"^(?:and\b|also\b|what about\b|how (?:old|big|large|far|long|tall|fast|much|many)(?:\s*\?|$)|why\s*\??$|tell me more\b|explain more\b|give (?:me )?an example\b|pros and cons\b)", re.I)
ARITHMETIC = re.compile(r"^(?:(?:what is|calculate|solve|compute)\s+)?(-?\d+(?:\.\d+)?)\s*([+*/×÷-])\s*(-?\d+(?:\.\d+)?)[?\s]*$", re.I)


def normalize(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def topic_from_question(question: str) -> str:
    topic = re.sub(r"^(?:what (?:is|are)|who (?:is|was)|tell me about|explain|describe|define|what about|and what about|how does)\s+", "", question, flags=re.I)
    return re.sub(r"[?!.]+$", "", re.sub(r"^(?:the|a|an)\s+", "", topic, flags=re.I)).strip()[:300]


def resolve_question(query: str, history: list[dict] | None = None) -> dict:
    history = history or []
    question = normalize(query)
    latest = history[-1] if history else None
    previous_topic = (latest.get("topic") or topic_from_question(latest["question"])) if latest else ""
    intent = "search"
    if ARITHMETIC.fullmatch(question):
        intent = "calculate"
    elif re.fullmatch(r"(?:hi|hello|hey|namaste|thanks|thank you)[!.\s]*", question, re.I):
        intent = "greeting"
    elif re.search(r"\b(?:my name|what did (?:i|we) (?:ask|discuss)|what was (?:my|our) (?:first|last|previous) question|remember (?:my|that i)|i (?:am called|am named)|my name is)\b", question, re.I):
        intent = "recall"
    elif re.fullmatch(r"(?:summari[sz]e(?: (?:it|that|this|the answer))?|make (?:it|that|this) shorter|shorter(?: please)?|in one sentence|bullet points)[.!?\s]*", question, re.I):
        intent = "shorten" if latest else "clarify"
    elif re.search(r"\b(?:how much|what dose|dosage|should i take|can i take)\b.*\b(?:medicine|medication|drug|insulin|antibiotic|paracetamol|ibuprofen)\b", question, re.I):
        intent = "sensitive"
    elif re.search(r"\b(?:ignore (?:all |previous )?instructions|system prompt|api key|password|access token)\b", question, re.I):
        intent = "unsupported"
    named = re.match(r"^(?:and )?what about\s+(.+)", question, re.I)
    new_topic = bool(named and not REFERENCE.search(named[1]))
    subject = re.match(r"^(?:tell me about|explain|describe|define|what (?:is|are)|who (?:is|was))\s+(.+)", question, re.I)
    standalone = bool(subject and not re.match(r"^(?:it|its|this|that|these|those|they|them|their|he|she|his|her)\b", subject[1], re.I))
    uses_reference = not standalone and bool(REFERENCE.search(question) or ELLIPTICAL.search(question))
    context_used = bool(latest and not new_topic and (uses_reference or intent in ("shorten", "recall")))
    if intent == "search" and uses_reference and not latest and not new_topic:
        intent = "clarify"
    topic = topic_from_question(question) if new_topic or not context_used else previous_topic
    resolved = question
    if context_used and intent == "search":
        resolved = re.sub(r"\bits\b", lambda _: previous_topic + "'s", question, flags=re.I)
        resolved = re.sub(r"\b(?:it|this|that|they|them|these|those|he|she|his|her|uska|uske|iski|iske|iska|woh)\b", lambda _: previous_topic, resolved, flags=re.I)
        if resolved == question or previous_topic.lower() not in resolved.lower():
            resolved = f"{previous_topic}: {question}"
    return {"query": resolved[:600], "topic": topic or previous_topic, "context_used": context_used, "intent": intent}


def conversation_answer(query: str, history: list[dict], intent: str) -> str:
    if intent == "calculate":
        match = ARITHMETIC.fullmatch(query)
        a, operator, b = float(match[1]), match[2], float(match[3])
        if operator in ("/", "÷") and b == 0:
            return "Division by zero is undefined."
        value = a + b if operator == "+" else a - b if operator == "-" else a * b if operator in ("*", "×") else a / b
        import math
        if not math.isfinite(value):
            return "That calculation is outside the supported number range."
        return f"{a:g} {operator} {b:g} = {value:.12g}"
    if intent == "greeting":
        return "You're welcome! Ask another question whenever you're ready." if re.search("thank", query, re.I) else "Hi! Ask me a question and I'll find relevant sources for you."
    if intent == "clarify":
        return "Which topic do you mean? Add its name, or ask a first question so I can understand your follow-up."
    if intent == "sensitive":
        return "I can't recommend a personal medicine dose from web excerpts. Please ask a qualified doctor or pharmacist who knows your circumstances."
    if intent == "unsupported":
        return "I can't reveal credentials or private system instructions. Ask a research question instead."
    if intent == "shorten":
        answer = history[-1]["answer"] if history else "Please ask a first question."
        sentences = re.findall(r"[^.!?]+[.!?](?:\s*\[\d+\])?", answer)
        count = 1 if re.search("one sentence", query, re.I) else 2
        if re.search("bullet", query, re.I):
            return "• " + "\n• ".join(sentence.strip() for sentence in sentences[:count]) if sentences else answer
        return " ".join(sentences[:count]).strip() if sentences else answer
    name_pattern = re.compile(r"(?:my name is|i am called|i am named)\s+([^.!?\d]{1,60})", re.I)
    new_name = name_pattern.search(query)
    if new_name:
        return f"Got it — I'll call you {new_name[1].strip()} during this conversation."
    if re.search("my name", query, re.I):
        names = [name_pattern.search(turn["question"]) for turn in reversed(history)]
        known = next((name[1].strip() for name in names if name), None)
        return f"You told me your name is {known}." if known else "You haven't told me your name in this conversation yet."
    if not history:
        return "We haven't discussed anything yet. Ask your first question to get started."
    if re.search("first", query, re.I):
        return f"Your first available question was: “{history[0]['question']}”."
    if re.search("last|previous", query, re.I):
        return f"Your previous question was: “{history[-1]['question']}”."
    return "We've discussed:\n" + "\n".join(f"{index + 1}. {turn['question']}" for index, turn in enumerate(history))
