# Sub-Agent Mapping

| Sub-Agent | Responsibility | Reference Files |
|-----------|----------------|----------------|
| Schema Agent | Generate tables, relationships, enums | taxonomy_actors.json, governance.md |
| API Agent | Backend endpoints, validation, role enforcement | taxonomy_actors.json, confidence_rules.md, governance.md |
| Confidence Engine Agent | Confidence calculation | confidence_rules.md, adversarial_audit.md |
| Admin Dashboard Agent | Review dashboard, tiered workflow | taxonomy_actors.json, governance.md, adversarial_audit.md |
| AI Ingestion Agent | Connect AI feed | ai_ingestion.md, governance.md |
| Monitoring Agent | Post-publish recalculation & alerts | confidence_rules.md, adversarial_audit.md |
| Documentation Agent | README + API docs | governance.md, taxonomy_actors.json, confidence_rules.md |