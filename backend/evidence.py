"""Question-focused source excerpts with validated reference numbers."""
from __future__ import annotations

import re

STOP_WORDS = set("a an the is are was were be been being of for to in on at by from with and or but what which who whom when where why how can could would should do does did tell me about explain describe define please it its this that those these they them their i you we my your our more also give example work works know using use used uses".split())
ATTRIBUTE_GROUPS = [
    ["old", "age", "formed", "formation", "billion", "million", "years"],
    ["far", "distance", "away", "kilometer", "kilometres", "kilometers", "km", "miles"],
    ["big", "large", "size", "radius", "diameter", "mass", "area", "kilometers"],
    ["invented", "inventor", "created", "creator", "developed", "designed", "founded", "conceived"],
    ["built", "constructed", "commissioned", "builder"],
    ["born", "birth", "birthplace"],
    ["hot", "temperature", "kelvin", "celsius"],
    ["discovered", "discovery", "discoverer"],
    ["capital", "city", "tokyo", "delhi"],
    ["long", "period", "orbit", "days", "year", "hours"],
    ["benefits", "advantages", "applications", "uses"],
]


def tokens(value: str) -> list[str]:
    return list(dict.fromkeys(token for token in re.findall(r"\w+", value.lower(), re.U) if len(token) > 1 and token not in STOP_WORDS))


def source_score(title: str, query: str, topic: str = "") -> float:
    words, title_words = tokens(query), tokens(title)
    score = sum(token in title_words for token in words) * 5
    if title.lower() in (topic.lower(), query.lower()):
        score += 30
    if re.search(r"\b(disambiguation|list of|surname)\b", title, re.I):
        score -= 50
    score -= max(0, sum(word not in tokens(topic or query) for word in title_words) - 1) * 4
    if re.search("programming|code|coding|software", query, re.I) and "programming" in title.lower():
        score += 15
    return score


def extract_answer(query: str, sources: list[tuple[object, str]]) -> tuple[str, bool]:
    words = tokens(query)
    attributes = set()
    for group in ATTRIBUTE_GROUPS:
        if any(word in group for word in words):
            attributes.update(group)
    general = bool(re.match(r"^(?:what (?:is|are)|who (?:is|was)|tell me about|explain|describe|define)\b", query, re.I)) and not attributes
    focus = None
    if re.search(r"\b(?:hot|temperature)\b", query, re.I):
        focus = r"\btemperature\b.*\d|\d[\d,.]*\s*(?:K\b|°[CF]|kelvins?|degrees)"
    elif re.search(r"\bwhere\b.*\bborn\b", query, re.I):
        focus = r"\bborn\s+(?:in|at)\b|\bbirthplace\b"
    elif re.search(r"\bwho\b.*\b(?:created|invented|developed|designed)\b", query, re.I):
        focus = r"\b(?:conceived|created|designed|developed|invented)\b.{0,150}\bby\b|\bbegan (?:working|developing)\b"
    elif re.search(r"\bwhen\b.*\bborn\b", query, re.I):
        focus = r"\bborn\b.*\b\d{4}\b|\(\d{1,2}\s+\w+\s+\d{4}\b"
    candidates = []
    for source_index, (result, content) in enumerate(sources[:1]):
        sentences = re.split(r"(?<=[.!?])\s+(?=[A-Z\d\"“])", re.sub(r"\s+", " ", content or result.snippet).strip())
        for index, sentence in enumerate(sentences):
            if not 35 <= len(sentence) <= 900 or "[citation needed]" in sentence.lower():
                continue
            if focus and not re.search(focus, sentence, re.I):
                continue
            if re.search(r"\bwho\b.*\b(?:created|invented|developed|designed)\b", query, re.I) and not re.search(r"\bby\s+[A-Z][a-z]+|\b[A-Z][a-z]+(?:\s+[A-Za-z]+){0,3}\s+began (?:working|developing)\b", sentence):
                continue
            sentence_words = set(tokens(sentence))
            matches = sum(word in sentence_words for word in words)
            attribute_matches = len(attributes & sentence_words)
            specificity = (25 + (5 if re.search(r"\b(?:surface|core)\b", sentence, re.I) else 0)) if focus else 0
            score = matches * 2 + attribute_matches * 5 + specificity + (3 if source_index == 0 else 0) + (8 if general and index < 2 else 0) - index * .015
            candidates.append((score, source_index, index, sentence, attribute_matches))
    selected = sorted(candidates, reverse=True)
    if attributes:
        selected = [candidate for candidate in selected if candidate[4] > 0]
    selected = selected[:3 if general else 2]
    if attributes and not selected:
        return "I found relevant sources, but couldn't locate a passage that directly answers that detail. The sources below may help you refine the question.", False
    if not selected:
        return "I couldn't find enough readable evidence to answer reliably. Please make your question more specific or try again.", False
    seen = set()
    paragraphs = []
    for _, source_index, index, sentence, _ in sorted(selected, key=lambda item: (item[1], item[2])):
        if sentence not in seen:
            paragraphs.append(f"{sentence} [{source_index + 1}]")
            seen.add(sentence)
    return "\n\n".join(paragraphs), True
