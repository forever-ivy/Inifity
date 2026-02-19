# Long-term Memory

- Translation automation project moved to OpenClaw-first architecture.
- User prefers human-in-the-loop delivery: system writes only to `_VERIFY`, manual move to final folder.
- User wants contextual WhatsApp commands instead of job-id-heavy commands.
- Priority is translation quality and format fidelity with real model cross-checking.
- Failover order preference: Kimi (`moonshot/kimi-k2.5`) before GLM (`zai/glm-*`) when Codex/Gemini are unavailable.
- Vision QA preference: use Kimi (Moonshot) for multimodal format checks when Gemini Vision keys are unavailable/restricted.
