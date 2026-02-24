from __future__ import annotations

import re
from collections import defaultdict
from typing import Dict, List, Set, Tuple

from wordfreq import iter_wordlist

# -----------------------------
# Contractions + variants (common)
# -----------------------------
CONTRACTIONS: Dict[str, List[str]] = {
    "i'm": ["i am"],
    "you're": ["you are"],
    "he's": ["he is", "he has"],
    "she's": ["she is", "she has"],
    "it's": ["it is", "it has"],
    "we're": ["we are"],
    "they're": ["they are"],
    "i've": ["i have"],
    "you've": ["you have"],
    "we've": ["we have"],
    "they've": ["they have"],
    "i'd": ["i would", "i had"],
    "you'd": ["you would", "you had"],
    "he'd": ["he would", "he had"],
    "she'd": ["she would", "she had"],
    "we'd": ["we would", "we had"],
    "they'd": ["they would", "they had"],
    "i'll": ["i will"],
    "you'll": ["you will"],
    "he'll": ["he will"],
    "she'll": ["she will"],
    "we'll": ["we will"],
    "they'll": ["they will"],
    "can't": ["cannot"],
    "won't": ["will not"],
    "don't": ["do not"],
    "doesn't": ["does not"],
    "didn't": ["did not"],
    "isn't": ["is not"],
    "aren't": ["are not"],
    "wasn't": ["was not"],
    "weren't": ["were not"],
    "haven't": ["have not"],
    "hasn't": ["has not"],
    "hadn't": ["had not"],
    "wouldn't": ["would not"],
    "shouldn't": ["should not"],
    "couldn't": ["could not"],
    "mustn't": ["must not"],
    "there's": ["there is", "there has"],
    "that's": ["that is", "that has"],
    "what's": ["what is", "what has"],
    "who's": ["who is", "who has"],
    "let's": ["let us"],
}

APOSTROPHES = {"’": "'", "‘": "'", "´": "'", "`": "'"}

# -----------------------------
# Common MWEs (starter pack; extend from your own data)
# -----------------------------
MWES: List[str] = [
    "a lot",
    "as well",
    "in fact",
    "at least",
    "at most",
    "right now",
    "for example",
    "for real",
    "kind of",
    "sort of",
    "as soon as",
    "no way",
    "of course",
    "by the way",
    "on the way",
    "in the middle",
    "in the end",
    "in case",
    "instead of",
    "make sense",
    "figure out",
    "find out",
    "turn out",
    "set up",
    "pick up",
    "look up",
    "run into",
    "get back",
    "come on",
    "hang out",
    "check out",
    "shut up",
    "wake up",
]

# -----------------------------
# Token rules
# -----------------------------
WORD_RE = re.compile(r"^[a-z][a-z'\-]*$")


def normalize_token(t: str) -> str:
    t = t.strip().lower()
    for k, v in APOSTROPHES.items():
        t = t.replace(k, v)
    return t.strip("'-")


# -----------------------------
# Inflectional lemmatizer (small, rule-based)
# -----------------------------
IRREGULAR: Dict[str, str] = {
    # be/have/do
    "am": "be",
    "is": "be",
    "are": "be",
    "was": "be",
    "were": "be",
    "been": "be",
    "being": "be",
    "has": "have",
    "had": "have",
    "having": "have",
    "does": "do",
    "did": "do",
    "done": "do",
    "doing": "do",
    # irregular verbs (common)
    "went": "go",
    "gone": "go",
    "goes": "go",
    "saw": "see",
    "seen": "see",
    "took": "take",
    "taken": "take",
    "came": "come",
    "got": "get",
    "gotten": "get",
    "gave": "give",
    "given": "give",
    "made": "make",
    "knew": "know",
    "known": "know",
    "thought": "think",
    "told": "tell",
    "found": "find",
    "left": "leave",
    "felt": "feel",
    "kept": "keep",
    "bought": "buy",
    "brought": "bring",
    "wrote": "write",
    "written": "write",
    "said": "say",
    "ran": "run",
    "ate": "eat",
    "eaten": "eat",
    "drank": "drink",
    "drunk": "drink",
    "slept": "sleep",
    "stood": "stand",
    "sat": "sit",
}


def inflection_lemma(token: str) -> str:
    t = normalize_token(token)
    if not t:
        return ""
    if t in IRREGULAR:
        return IRREGULAR[t]

    # plural -> singular (naive)
    if len(t) > 3 and t.endswith("ies"):
        return t[:-3] + "y"  # parties -> party
    if len(t) > 4 and t.endswith("sses"):
        return t[:-2]  # classes -> class
    if len(t) > 3 and t.endswith("s") and not t.endswith(("ss", "us", "is")):
        return t[:-1]  # cars -> car

    # -ing
    if len(t) > 5 and t.endswith("ing"):
        base = t[:-3]
        if len(base) > 2 and base[-1] == base[-2]:
            base = base[:-1]  # running -> run
        return base

    # -ed
    if len(t) > 4 and t.endswith("ed"):
        base = t[:-2]
        if base.endswith("i"):
            base = base[:-1] + "y"  # studied -> study
        if len(base) > 2 and base[-1] == base[-2]:
            base = base[:-1]  # stopped -> stop
        return base

    return t


# -----------------------------
# Derivational family key (approximate "word family")
# -----------------------------
DERIV_SUFFIXES: List[str] = [
    "ization",
    "isations",
    "isation",
    "ational",
    "ationally",
    "fulness",
    "lessness",
    "iveness",
    "fulness",
    "ability",
    "ibility",
    "ational",
    "tional",
    "isation",
    "ization",
    "fulness",
    "ousness",
    "iveness",
    "alness",
    "iveness",
    "iveness",
    "ment",
    "ments",
    "ness",
    "less",
    "ship",
    "ships",
    "hood",
    "hoods",
    "tion",
    "tions",
    "sion",
    "sions",
    "ity",
    "ities",
    "ism",
    "isms",
    "ist",
    "ists",
    "ize",
    "ises",
    "ize",
    "ized",
    "izing",
    "ise",
    "ised",
    "ising",
    "able",
    "ible",
    "ous",
    "ious",
    "al",
    "ally",
    "er",
    "ers",
    "or",
    "ors",
    "ful",
    "ly",
]

DERIV_PREFIXES: List[str] = [
    "un",
    "re",
    "in",
    "im",
    "ir",
    "il",
    "dis",
    "non",
    "mis",
    "pre",
    "post",
    "over",
    "under",
]


def strip_derivational_suffix(w: str) -> str:
    """Conservative suffix stripping with a minimum stem length guard."""
    for suf in DERIV_SUFFIXES:
        if w.endswith(suf) and len(w) - len(suf) >= 3:
            stem = w[: -len(suf)]

            # happiness -> happi -> happy
            if stem.endswith("i") and suf in ("ness", "ly", "ies", "ity", "ities"):
                stem = stem[:-1] + "y"

            return stem
    return w


def strip_derivational_prefix(w: str) -> str:
    """Very conservative prefix stripping."""
    for pre in DERIV_PREFIXES:
        if w.startswith(pre) and len(w) - len(pre) >= 3:
            return w[len(pre) :]
    return w


def family_key(token: str, strip_prefix: bool = False) -> str:
    """
    Family key = inflection lemma, then derivational normalization.
    """
    w = inflection_lemma(token)
    if not w:
        return ""

    cur = w
    for _ in range(2):
        prev = cur
        cur = strip_derivational_suffix(cur)
        if cur == prev:
            break

    if strip_prefix:
        cur = strip_derivational_prefix(cur)

    return cur


# -----------------------------
# Build top 8,000 families
# -----------------------------
def build_top_families(
    target_families: int = 8_000,
    oversample_tokens: int = 400_000,
    max_members_per_family: int = 12,
    strip_prefix: bool = False,
) -> Tuple[List[str], Dict[str, List[str]]]:
    """
    Iterate frequent tokens; map each token -> family_key.
    Keep families in the order they first appear.
    """
    families_order: List[str] = []
    family_members: Dict[str, List[str]] = defaultdict(list)
    seen_families: Set[str] = set()

    token_count = 0
    for tok in iter_wordlist("en", wordlist="best"):
        token_count += 1
        if token_count > oversample_tokens:
            break

        tok = normalize_token(tok)
        if not tok or not WORD_RE.match(tok):
            continue

        fk = family_key(tok, strip_prefix=strip_prefix)
        if not fk or not WORD_RE.match(fk):
            continue

        if fk not in seen_families:
            seen_families.add(fk)
            families_order.append(fk)

        mems = family_members[fk]
        if len(mems) < max_members_per_family and tok not in mems:
            mems.append(tok)

        if len(families_order) >= target_families:
            break

    return families_order, family_members


def write_outputs(
    families: List[str],
    members: Dict[str, List[str]],
    out_prefix: str = "en_families_top8000",
    chunk_size: int | None = None,
):
    with open(f"{out_prefix}_keys.txt", "w", encoding="utf-8") as f:
        for fk in families:
            f.write(fk + "\n")

    with open(f"{out_prefix}.tsv", "w", encoding="utf-8") as f:
        f.write("family_key\theadword\tmembers\n")
        for fk in families:
            mems = members.get(fk, [])
            head = mems[0] if mems else fk
            f.write(f"{fk}\t{head}\t" + " | ".join(mems) + "\n")

    if chunk_size:
        total = len(families)
        for i in range(0, total, chunk_size):
            idx = (i // chunk_size) + 1
            fn = f"{out_prefix}_keys_{idx:02d}.txt"
            with open(fn, "w", encoding="utf-8") as f:
                f.write("\n".join(families[i : i + chunk_size]) + "\n")
            print(f"Wrote {fn} ({min(chunk_size, total - i)} keys)")


def write_extras() -> None:
    with open("en_contractions.txt", "w", encoding="utf-8") as f:
        for c, expansions in sorted(CONTRACTIONS.items()):
            f.write(f"{c}\t" + " | ".join(expansions) + "\n")

    with open("en_mwe.txt", "w", encoding="utf-8") as f:
        for m in MWES:
            f.write(m + "\n")


def main() -> None:
    families, members = build_top_families(
        target_families=8_000,
        oversample_tokens=400_000,
        max_members_per_family=12,
        strip_prefix=False,
    )
    print(f"Built {len(families)} families")

    write_outputs(families, members, out_prefix="en_families_top8000", chunk_size=1000)
    write_extras()

    print("\n--- FIRST 1,000 FAMILY KEYS ---")
    for fk in families[:1000]:
        print(fk)


if __name__ == "__main__":
    main()
