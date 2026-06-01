"""Unit tests for the tracing module."""

from datetime import datetime

from app.tracing import Span, Trace


def test_trace_creates_root_span():
    t = Trace("request", mime_type="application/pdf")
    t.finish()
    d = t.to_dict()
    assert d["name"] == "request"
    assert d["attributes"]["mime_type"] == "application/pdf"
    assert "duration_ms" in d


def test_nested_spans():
    t = Trace("request")
    with t.span("docling") as docling_span:
        with docling_span.span("http_request", payload_bytes=1000) as http_span:
            http_span.set(status_code=200)
    t.finish()
    d = t.to_dict()
    assert len(d["children"]) == 1
    assert d["children"][0]["name"] == "docling"
    http = d["children"][0]["children"][0]
    assert http["name"] == "http_request"
    assert http["attributes"]["payload_bytes"] == 1000
    assert http["attributes"]["status_code"] == 200
    assert "duration_ms" in http


def test_span_set_merges_attributes():
    t = Trace("request")
    with t.span("step", a=1) as s:
        s.set(b=2, c=3)
    d = t.to_dict()
    attrs = d["children"][0]["attributes"]
    assert attrs == {"a": 1, "b": 2, "c": 3}


def test_empty_children_omitted():
    t = Trace("request")
    t.finish()
    d = t.to_dict()
    assert "children" not in d


def test_empty_attributes_omitted():
    t = Trace("request")
    with t.span("bare"):
        pass
    t.finish()
    d = t.to_dict()
    child = d["children"][0]
    assert "attributes" not in child


# ---------------------------------------------------------------------------
# Wall-clock timestamps
# ---------------------------------------------------------------------------


def test_child_span_captures_wall_start():
    parent = Span(name="root", _start=0.0)
    with parent.span("child") as child:
        pass
    assert isinstance(child._wall_start, datetime)


def test_trace_root_captures_wall_start():
    trace = Trace("test")
    assert isinstance(trace.root._wall_start, datetime)


# ---------------------------------------------------------------------------
# to_steps() flattening
# ---------------------------------------------------------------------------


def test_to_steps_single_service():
    trace = Trace("worker")
    with trace.span("docling", input_bytes=100, pages=3):
        pass
    trace.finish()
    steps = trace.to_steps()

    assert len(steps) == 1
    step = steps[0]
    assert step.service == "docling"
    assert step.attributes["input_bytes"] == 100
    assert step.attributes["pages"] == 3
    assert step.duration_ms >= 0
    assert step.started_at


def test_to_steps_multiple_sorted():
    trace = Trace("worker")
    with trace.span("gotenberg"):
        pass
    with trace.span("docling"):
        pass
    trace.finish()
    steps = trace.to_steps()

    assert len(steps) == 2
    assert steps[0].service == "gotenberg"
    assert steps[1].service == "docling"
    assert steps[0].started_at <= steps[1].started_at


def test_to_steps_skips_internal_spans():
    trace = Trace("worker")
    with trace.span("docling") as d:
        with d.span("http_request"):
            pass
    trace.finish()
    steps = trace.to_steps()

    assert len(steps) == 1
    assert steps[0].service == "docling"


def test_to_steps_empty():
    trace = Trace("worker")
    trace.finish()
    assert trace.to_steps() == []


def test_to_steps_service_attribute_overrides_name():
    trace = Trace("worker")
    with trace.span("captioning", service="openai/gpt-4o", images=2):
        pass
    trace.finish()
    steps = trace.to_steps()

    assert len(steps) == 1
    assert steps[0].service == "openai/gpt-4o"
    assert steps[0].attributes["images"] == 2


def test_to_steps_passthrough():
    trace = Trace("worker")
    with trace.span("passthrough"):
        pass
    trace.finish()
    steps = trace.to_steps()

    assert len(steps) == 1
    assert steps[0].service == "passthrough"
