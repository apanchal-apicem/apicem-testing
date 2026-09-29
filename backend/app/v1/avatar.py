"""Deterministic avatar color for the new frontend's User.avatarColor -- a pure function of
user_id, not a stored value (nothing to migrate/backfill, never drifts from the id it's
derived from). Uses hashlib, not Python's built-in hash() -- that's randomized per-process
(PYTHONHASHSEED) unless explicitly disabled, so the "same" user would get a different color
every time the backend restarts if hash() were used here.
"""
import hashlib

# A small, deliberately distinct palette -- avoids two near-identical colors landing next to
# each other in a member list, more than an exact color choice matters here.
AVATAR_PALETTE = [
    "#F97066", "#F79009", "#F5B93E", "#84CC16", "#22C55E",
    "#14B8A6", "#0EA5E9", "#6366F1", "#A855F7", "#EC4899",
]


def avatar_color_for(user_id: str) -> str:
    digest = hashlib.sha256(user_id.encode("utf-8")).digest()
    index = digest[0] % len(AVATAR_PALETTE)
    return AVATAR_PALETTE[index]
