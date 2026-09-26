#!/usr/bin/env python3
"""
Official Dogfood 2026 Acceptance Checker.
Stdlib-only runner for verifying portal submissions and judging compliance.
Usage:
  python3 run.py <path_to_config.toml>
"""

import sys
import os
import json
import urllib.request
import urllib.error
import urllib.parse

try:
    import tomllib
except ImportError:
    # Minimal fallback TOML parser for older Python 3 without tomllib
    class MinimalToml:
        @staticmethod
        def loads(s):
            res = {}
            curr = res
            for line in s.splitlines():
                line = line.strip()
                if not line or line.startswith("#"):
                    continue
                if line.startswith("[") and line.endswith("]"):
                    sec = line[1:-1].strip()
                    res[sec] = {}
                    curr = res[sec]
                elif "=" in line:
                    k, v = line.split("=", 1)
                    k = k.strip()
                    v = v.strip()
                    if v.startswith('"') and v.endswith('"'):
                        v = v[1:-1]
                    elif v.startswith("['") or v.startswith('["'):
                        # array of strings
                        items = v[1:-1].replace('"', "").replace("'", "").split(",")
                        v = [i.strip() for i in items if i.strip()]
                    curr[k] = v
            return res
    tomllib = MinimalToml()


def parse_header(raw_header):
    if not raw_header or not isinstance(raw_header, str):
        return {}
    parts = raw_header.split(":", 1)
    if len(parts) == 2:
        return {parts[0].strip(): parts[1].strip()}
    return {}


def request(url, method="GET", headers=None, data=None):
    hdrs = headers or {}
    req = urllib.request.Request(url, method=method, headers=hdrs)
    if data is not None:
        if isinstance(data, dict):
            req.data = json.dumps(data).encode("utf-8")
            req.add_header("Content-Type", "application/json")
        elif isinstance(data, (bytes, bytearray)):
            req.data = data
        else:
            req.data = str(data).encode("utf-8")
    try:
        with urllib.request.urlopen(req) as resp:
            body = resp.read().decode("utf-8", errors="replace")
            return resp.status, body, resp.headers
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        return e.code, body, e.headers
    except Exception as e:
        return 0, str(e), {}


def main():
    if len(sys.argv) < 2:
        print("Usage: python3 run.py <path_to_config.toml>")
        sys.exit(1)

    toml_path = sys.argv[1]
    if not os.path.exists(toml_path):
        print(f"Error: Config file not found: {toml_path}")
        sys.exit(1)

    with open(toml_path, "r", encoding="utf-8") as f:
        config = tomllib.loads(f.read())

    portal = config.get("portal", {})
    tiers = config.get("tiers", {})
    auth = config.get("auth", {})
    routes = config.get("routes", {})

    base_url = portal.get("base_url", "http://localhost:3000").rstrip("/")
    claimed = tiers.get("claimed", [])
    if isinstance(claimed, str):
        claimed = [claimed]

    print("================================================================================")
    print("DOGFOOD 2026 — ACCEPTANCE VERIFICATION REPORT")
    print("================================================================================")
    print(f"Portal Base URL: {base_url}")
    print(f"Claimed Tiers  : {', '.join(claimed)}")
    print(f"Pitch          : {tiers.get('pitch', 'N/A')}")
    print("--------------------------------------------------------------------------------\n")

    fixtures_path = os.path.join(os.path.dirname(__file__), "fixtures.json")
    fixture_title = "Fixture Project Title"
    if os.path.exists(fixtures_path):
        try:
            with open(fixtures_path, "r", encoding="utf-8") as f:
                f_data = json.load(f)
                if f_data.get("projects") and len(f_data["projects"]) > 0:
                    fixture_title = f_data["projects"][0].get("title", fixture_title)
        except Exception:
            pass

    results = []

    # ---------------------------------------------------------
    # T1 Checks
    # ---------------------------------------------------------
    print("RUNNING TIER 1 CHECKS:")

    # 1. Gallery Public (200, no auth)
    gallery_url = f"{base_url}{routes.get('gallery', '/gallery')}"
    code, body, _ = request(gallery_url, method="GET")
    pass_1 = (code == 200)
    results.append(("T1.1 Gallery is public (200, no auth)", pass_1, f"Status: {code}"))
    print(f"  [{'PASS' if pass_1 else 'FAIL'}] T1.1 Public gallery returned HTTP {code}")

    # 2. Gallery Contains Fixture Project Title
    pass_2 = pass_1 and (fixture_title.lower() in body.lower())
    results.append((f"T1.2 Gallery contains fixture project ('{fixture_title}')", pass_2, f"Found: {pass_2}"))
    print(f"  [{'PASS' if pass_2 else 'FAIL'}] T1.2 Fixture project '{fixture_title}' found in gallery")

    # 3. Submit refused after deadline (4xx as participant)
    submit_url = f"{base_url}{routes.get('submit', '/api/v1/projects')}"
    part_hdrs = parse_header(auth.get("participant", ""))
    code, body, _ = request(submit_url, method="POST", headers=part_hdrs, data={"title": "Late Project"})
    pass_3 = (400 <= code < 500)
    results.append(("T1.3 Submit refused post-deadline (4xx)", pass_3, f"Status: {code}"))
    print(f"  [{'PASS' if pass_3 else 'FAIL'}] T1.3 Post-deadline submission refused with HTTP {code}")

    t1_verified = pass_1 and pass_2 and pass_3

    # ---------------------------------------------------------
    # T2 Checks
    # ---------------------------------------------------------
    print("\nRUNNING TIER 2 CHECKS:")

    # 4. Judge A can GET their own scores (200)
    judge_a_url = f"{base_url}{routes.get('judge_scores', '/api/v1/scores/me')}"
    ja_hdrs = parse_header(auth.get("judge_a", ""))
    code, body, _ = request(judge_a_url, method="GET", headers=ja_hdrs)
    pass_4 = (code == 200)
    results.append(("T2.1 Judge A can read their own scores (200)", pass_4, f"Status: {code}"))
    print(f"  [{'PASS' if pass_4 else 'FAIL'}] T2.1 Judge A score retrieval returned HTTP {code}")

    # 5. Judge B hitting Judge A's score URL gets 401 or 403 (ROLE ISOLATION)
    jb_hdrs = parse_header(auth.get("judge_b", ""))
    code, body, _ = request(judge_a_url, method="GET", headers=jb_hdrs)
    pass_5 = (code in [401, 403])
    results.append(("T2.2 Judge B isolated from Judge A scores (401/403)", pass_5, f"Status: {code}"))
    print(f"  [{'PASS' if pass_5 else 'FAIL'}] T2.2 Judge B isolation check returned HTTP {code}")

    # 6. Participant hitting judge-scores gets 401 or 403
    code, body, _ = request(judge_a_url, method="GET", headers=part_hdrs)
    pass_6 = (code in [401, 403])
    results.append(("T2.3 Participant isolated from judge scores (401/403)", pass_6, f"Status: {code}"))
    print(f"  [{'PASS' if pass_6 else 'FAIL'}] T2.3 Participant isolation check returned HTTP {code}")

    # 7. Organizer can GET CSV export (200, comma present in first line)
    export_url = f"{base_url}{routes.get('csv_export', '/api/v1/export/scores.csv')}"
    org_hdrs = parse_header(auth.get("organizer", ""))
    code, body, _ = request(export_url, method="GET", headers=org_hdrs)
    first_line = body.splitlines()[0] if body else ""
    pass_7 = (code == 200 and "," in first_line)
    results.append(("T2.4 Organizer CSV export valid (200, comma in line 1)", pass_7, f"Status: {code}, Comma: {',' in first_line}"))
    print(f"  [{'PASS' if pass_7 else 'FAIL'}] T2.4 Organizer CSV export returned HTTP {code} with valid CSV header")

    t2_verified = t1_verified and (pass_4 and pass_5 and pass_6 and pass_7)

    print("\n================================================================================")
    print("VERIFICATION SUMMARY")
    print("================================================================================")
    for name, ok, detail in results:
        status_str = "PASS" if ok else "FAIL"
        print(f"  [{status_str:4s}] {name:60s} ({detail})")

    print("\nTIER STATUS:")
    print(f"  Tier 1 (Submissions & Gallery): {'VERIFIED' if t1_verified else 'FAILED'}")
    print(f"  Tier 2 (Judging & Isolation)  : {'VERIFIED' if t2_verified else 'FAILED (Waterfall-gated)'}")
    print("================================================================================")


if __name__ == "__main__":
    main()
