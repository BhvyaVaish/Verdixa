# Acceptance Tools

This directory contains the official Dogfood 2026 acceptance script (`run.py`) and standard dataset (`fixtures.json`).

**TODO:** Download `run.py` and `fixtures.json` from the published spec URLs once they are confirmed reachable, and place them in this directory.

## Usage

The official checker is a single stdlib-only Python script.

```bash
# Run against the local portal
python3 run.py ../../.dogfood.toml > acceptance-report.txt
```

## `.dogfood.toml` Configuration

The script reads auth headers from `.dogfood.toml` in the repository root. These headers must be deterministic across clean `docker compose up --build` runs. The `prisma/seed.ts` script handles loading `fixtures.json` and generating the deterministic session tokens for the organizer, judges, and participant.
