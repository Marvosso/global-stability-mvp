# Confidence Engine Rules

- Base confidence score = sum of tier weights of all sources
- Unique Source Ecosystem Multiplier: Multiple sources from same ecosystem → count as 1
- Evidence Bonuses: Verified multimedia + Tier 1/2 sources → +10
- Contradiction Penalty: Conflicting reports → -5 per contradiction
- Time Decay: Reduce confidence of uncorroborated events over 24h
- Logging: All confidence updates must record reason and timestamp in confidence_audit_log