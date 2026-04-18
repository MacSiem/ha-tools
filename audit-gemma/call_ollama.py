#!/usr/bin/env python3
"""Native Ollama call with manual Phoenix/OpenInference span.

Talks to Ollama's native /api/chat endpoint (not OpenAI-compat). No openai
library is used — the request goes straight to http://localhost:11434/api/chat
via httpx, and we emit an OpenInference-conformant span so Phoenix can render
it with prompt / response / token counts / latency.

Args:
  $1 = system prompt file
  $2 = user prompt file
  $3 = output file (where assistant content is written)
  $4 = span label, e.g. "pass1:ha-yaml-checker.js"

Env:
  MODEL, NUM_CTX, TEMPERATURE, TOP_P
  OLLAMA_URL        (default http://localhost:11434)
  OLLAMA_TIMEOUT    (default 3600, in seconds — per-request read timeout)
  PHOENIX_ENDPOINT  (default http://localhost:6006/v1/traces)
  PHOENIX_PROJECT   (default ha-tools-gemma-audit)

Stdout: completion token count (eval_count).
"""
import contextlib
import json
import os
import sys
import time

import httpx

from phoenix.otel import register
from opentelemetry import trace
from opentelemetry.trace.status import Status, StatusCode

if len(sys.argv) != 5:
    sys.stderr.write(__doc__)
    sys.exit(2)

system_file, user_file, output_file, label = sys.argv[1:5]
system = open(system_file).read()
user = open(user_file).read()

pass_name, _, file_tag = label.partition(":")

model = os.environ["MODEL"]
num_ctx = int(os.environ["NUM_CTX"])
temperature = float(os.environ["TEMPERATURE"])
top_p = float(os.environ["TOP_P"])

ollama_url = os.environ.get("OLLAMA_URL", "http://localhost:11434")
timeout_s = float(os.environ.get("OLLAMA_TIMEOUT", "3600"))

# Phoenix tracer — no auto-instrumentation, we emit the LLM span ourselves.
# register() prints a setup banner to stdout; the bash caller reads our stdout
# as the completion-token count, so redirect the banner to stderr.
with contextlib.redirect_stdout(sys.stderr):
    tracer_provider = register(
        project_name=os.environ.get("PHOENIX_PROJECT", "ha-tools-gemma-audit"),
        endpoint=os.environ.get("PHOENIX_ENDPOINT", "http://localhost:6006/v1/traces"),
        protocol="http/protobuf",
        set_global_tracer_provider=True,
        auto_instrument=False,
    )
tracer = trace.get_tracer("ha-tools-audit")

payload = {
    "model": model,
    "stream": False,
    "options": {
        "temperature": temperature,
        "top_p": top_p,
        "num_ctx": num_ctx,
    },
    "messages": [
        {"role": "system", "content": system},
        {"role": "user", "content": user},
    ],
}

with tracer.start_as_current_span(label) as span:
    # OpenInference semantic conventions so Phoenix renders this as an LLM call.
    span.set_attribute("openinference.span.kind", "LLM")
    span.set_attribute("llm.provider", "ollama")
    span.set_attribute("llm.system", "ollama")
    span.set_attribute("llm.model_name", model)
    span.set_attribute(
        "llm.invocation_parameters",
        json.dumps({"temperature": temperature, "top_p": top_p, "num_ctx": num_ctx}),
    )
    span.set_attribute("llm.input_messages.0.message.role", "system")
    span.set_attribute("llm.input_messages.0.message.content", system)
    span.set_attribute("llm.input_messages.1.message.role", "user")
    span.set_attribute("llm.input_messages.1.message.content", user)
    span.set_attribute("input.value", json.dumps(payload["messages"]))
    span.set_attribute("input.mime_type", "application/json")

    # Audit-specific attrs for filtering in Phoenix.
    span.set_attribute("audit.pass", pass_name)
    span.set_attribute("audit.file", file_tag)
    span.set_attribute("audit.num_ctx", num_ctx)

    t0 = time.monotonic()
    try:
        with httpx.Client(timeout=httpx.Timeout(timeout_s, connect=10.0)) as client:
            r = client.post(f"{ollama_url}/api/chat", json=payload)
            r.raise_for_status()
            resp = r.json()
    except Exception as exc:
        span.record_exception(exc)
        span.set_status(Status(StatusCode.ERROR, str(exc)))
        tracer_provider.force_flush()
        raise

    elapsed = time.monotonic() - t0

    content = resp.get("message", {}).get("content", "") or ""
    prompt_tokens = resp.get("prompt_eval_count", 0)
    completion_tokens = resp.get("eval_count", 0)

    span.set_attribute("llm.output_messages.0.message.role", "assistant")
    span.set_attribute("llm.output_messages.0.message.content", content)
    span.set_attribute("output.value", content)
    span.set_attribute("output.mime_type", "text/plain")
    span.set_attribute("llm.token_count.prompt", prompt_tokens)
    span.set_attribute("llm.token_count.completion", completion_tokens)
    span.set_attribute("llm.token_count.total", prompt_tokens + completion_tokens)
    span.set_attribute("audit.elapsed_seconds", round(elapsed, 2))
    span.set_attribute("audit.completion_tokens", completion_tokens)
    span.set_status(Status(StatusCode.OK))

open(output_file, "w").write(content)

tracer_provider.force_flush()
print(completion_tokens)
