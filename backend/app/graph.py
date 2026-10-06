from datetime import timezone
import hashlib
import networkx as nx
from sqlalchemy import select
from .db import Report, Source, ThreatRecord, utcnow
from .entities import entity, mask_value, redact_text

NOTE = "ความเชื่อมโยงเป็นหลักฐานว่ารายการปรากฏร่วมกัน ไม่ใช่ข้อยืนยันว่าเป็นการโกง / Connections are co-occurrence evidence, not a fraud verdict."

def build_graph(db, roots=None, include_sample=False, masked=True, input_context=False):
    graph = nx.MultiGraph()
    sources = {s.id:s for s in db.scalars(select(Source).where(Source.enabled.is_(True))).all()}
    def add_entity(item, sample=False, status="no_data"):
        if item["id"] in graph and status == "no_data": return
        graph.add_node(item["id"], id=item["id"], type=item["type"], label=item["masked_value"] if masked else item["value"], value=item["masked_value"] if masked else item["value"], is_sample=sample, status=status)
    def add_edge(left, right, relation, source, evidence, date, sample):
        eid = hashlib.sha256(f"{left}:{right}:{source}:{relation}".encode()).hexdigest()[:20]
        graph.add_edge(left, right, key=eid, id=eid, source=left, target=right, relation=relation, provenance=source, evidence=redact_text(evidence), retrieved_at=date.isoformat(), is_sample=sample)
    for record in db.scalars(select(ThreatRecord)).all():
        source = sources.get(record.source_id)
        if not source or (source.is_sample and not include_sample): continue
        main = entity(record.entity_type, record.value)
        add_entity(main, source.is_sample, record.status)
        report_id = "source-record:"+record.id
        graph.add_node(report_id, id=report_id, type="report", label=source.name, value=source.name, is_sample=source.is_sample, status=record.status)
        add_edge(main["id"], report_id, "listed_in_source", source.name, record.evidence, record.retrieved_at, source.is_sample)
        for related in record.related_entities:
            other = entity(related["type"], related["value"])
            add_entity(other, source.is_sample)
            add_edge(main["id"], other["id"], "co_occurs_in_source", source.name, record.evidence, record.retrieved_at, source.is_sample)
    # Pending and rejected community reports do not enter the public graph.
    for report in db.scalars(select(Report).where(Report.status == "verified")).all():
        report_id = "report:"+report.id
        graph.add_node(report_id, id=report_id, type="report", label="Verified community report", value="Verified community report", is_sample=False, status="verified")
        for item in report.entities:
            add_entity(item, False, "reported")
            add_edge(item["id"], report_id, "appears_in_reviewed_report", "community moderation", "ผู้ดูแลตรวจหลักฐานรายงานแล้ว / Reviewed report evidence", report.reviewed_at or report.created_at, False)
    root_ids = {e["id"] for e in roots or []}
    if roots is not None:
        for item in roots:
            if item["id"] not in graph: add_entity(item)
        selected = set(root_ids)
        for rid in root_ids:
            selected.update(nx.single_source_shortest_path_length(graph, rid, cutoff=2))
        graph = graph.subgraph(selected).copy()
    # Compute features from deduplicated nodes/edges, not repeated source rows.
    simple = nx.Graph(graph)
    features = {"connection_count": len({n for r in root_ids if r in simple for n in simple.neighbors(r)}) if root_ids else simple.number_of_edges(),
        "reported_neighbors": len({n for r in root_ids if r in simple for n in simple.neighbors(r) if graph.nodes[n].get("status") in ("verified", "confirmed", "reported")}),
        "cluster_size": max((len(nx.node_connected_component(simple,r)) for r in root_ids if r in simple), default=max((len(c) for c in nx.connected_components(simple)),default=0)),
        "risk_used": False}
    if input_context and roots:
        input_edges=0;timestamp=utcnow();root_map={e["id"]:e for e in roots}
        for item in roots:
            if item["type"]=="url":
                domain=entity("domain",item["value"])
                if domain["id"] in root_map:
                    add_edge(item["id"],domain["id"],"url_has_domain","provided input","ชื่อเว็บไซต์ถอดจาก URL ในข้อมูลที่ส่งครั้งนี้ / Host extracted from this submitted URL",timestamp,False)
                    input_edges+=1
        anchor=roots[0]
        for other in roots[1:]:
            if anchor["type"]=="url" and other["type"]=="domain" and entity("domain",anchor["value"])["id"]==other["id"]: continue
            add_edge(anchor["id"],other["id"],"co_occurs_in_input","provided input","รายการทั้งสองปรากฏใน input เดียวกัน ไม่ยืนยันว่ามีเจ้าของคนเดียวกัน / Same input co-occurrence; common ownership is not established",timestamp,False)
            input_edges+=1
        features.update({"input_edge_count":input_edges,"feature_basis":"source/reviewed-report relationships; submitted-input edges are excluded from risk features"})
    return {"nodes": list(dict(graph.nodes).values()), "edges": [d for _,_,d in graph.edges(data=True)], "features": features, "is_sample": any(n.get("is_sample") for _,n in graph.nodes(data=True)), "note": NOTE}

def lookup_history(db, entities):
    matches = []
    sources = {s.id:s for s in db.scalars(select(Source).where(Source.enabled.is_(True))).all()}
    keys = {(e["type"],e["value"]) for e in entities}
    for record in db.scalars(select(ThreatRecord)).all():
        source = sources.get(record.source_id)
        if source and (record.entity_type,record.value) in keys:
            matches.append({"entity_type": record.entity_type, "value": mask_value(record.value,record.entity_type), "status": "confirmed_source" if record.status == "confirmed" else "reported", "provenance_type":"source_confirmed" if record.status=="confirmed" else "source_reported", "source": source.name, "source_url": source.url, "retrieved_at": record.retrieved_at.isoformat(), "evidence": redact_text(record.evidence), "is_sample": source.is_sample})
    for report in db.scalars(select(Report).where(Report.status == "verified")).all():
        for item in report.entities:
            if (item["type"],item["value"]) in keys:
                matches.append({"entity_type": item["type"],"value": item["masked_value"],"status":"reported","provenance_type":"community_reviewed","source":"Reviewed community report", "source_url":None,"retrieved_at": (report.reviewed_at or report.created_at).isoformat(), "evidence":"ผ่านการตรวจหลักฐานโดยผู้ดูแล แต่ไม่ใช่คำตัดสินทางกฎหมาย", "is_sample":False})
    status = "confirmed_source" if any(m["status"] == "confirmed_source" and not m["is_sample"] for m in matches) else "reported" if matches else "no_data"
    return {"status": status, "matches": matches, "note": "ไม่พบประวัติไม่ได้หมายความว่าปลอดภัย / No history does not mean safe."}
