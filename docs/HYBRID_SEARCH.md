# Browse hybrid searches

When enabled in regular Browse, Hydrus and ComfyUI searches run independently. Each provider publishes into the same result list as it becomes available. Slow Hydrus searches use the regular search lifetime; the hybrid provider no longer abandons them after 15 seconds. The status remains active until both providers finish.

When Hydrus results arrive after the local catalogue, matching local copies are replaced by their Hydrus IDs instead of appearing twice. An unavailable local catalogue or a failed media-ticket request does not discard successful Hydrus results. Actual Hydrus HTTP failures display their status rather than silently appearing as a successful ComfyUI-only search. Unsupported local system predicates still exclude local files with an explanation.

Unchanged result IDs are not republished, avoiding unnecessary grid reloads while the other provider is working. Prefix and provenance filters use the shared library and accumulate metadata from both providers.

Validation: the hybrid provider tests cover both arrival orders, late deduplication, source failures and cancellation. The native hybrid browser regression deliberately delays a Hydrus query for 16 seconds and checks that the combined grid eventually contains both sources.
