#!/usr/bin/env python3
"""Banc de charge du flux SSE : N clients simultanés sur /api/v1/stream.

Mesure, par message « delta » reçu : le retard entre l'heure de données (watermark) et l'arrivée, ainsi que le nombre de
messages, de resynchronisations (client trop lent) et de clients refusés (429). Bibliothèque standard seule.

  python3 scripts/bench_sse.py --url http://localhost:8080 --clients 400 --duration 60

Le résultat dépend de la machine (cœurs, réseau) : ce n'est une mesure de référence que sur le poste de référence (Q20).
"""
import argparse
import asyncio
import json
import statistics
import sys
import time
from datetime import datetime
from urllib.parse import urlparse


async def client(host, port, path, stop_at, stats):
    try:
        reader, writer = await asyncio.open_connection(host, port, limit=4 * 1024 * 1024)
    except OSError:
        stats["connect_errors"] += 1
        return
    writer.write(f"GET {path} HTTP/1.0\r\nHost: {host}:{port}\r\nAccept: text/event-stream\r\n\r\n".encode())
    await writer.drain()
    status = (await reader.readline()).decode(errors="replace").split()
    if len(status) < 2 or status[1] != "200":
        stats["refused"] += 1
        writer.close()
        return
    stats["connected"] += 1
    # HTTP/1.0 : réponse sans découpage « chunked », les lignes SSE arrivent entières.
    event = None
    try:
        while time.time() < stop_at:
            line = await asyncio.wait_for(reader.readline(), timeout=max(1, stop_at - time.time()) + 5)
            if not line:
                stats["closed"] += 1
                return
            text = line.decode(errors="replace").rstrip("\r\n")
            if text.startswith("event:"):
                event = text[6:].strip()
            elif text.startswith("data:") and event is not None:
                stats["messages"][event] = stats["messages"].get(event, 0) + 1
                if event == "delta":
                    try:
                        watermark = json.loads(text[5:]).get("watermark")
                    except ValueError:
                        # Ligne coupée par l'annulation de la lecture à l'échéance : fin de mesure, rien à compter.
                        continue
                    if watermark:
                        lag = time.time() - datetime.fromisoformat(watermark.replace("Z", "+00:00")).timestamp()
                        stats["lags"].append(lag)
    except (asyncio.TimeoutError, ConnectionError):
        stats["closed"] += 1
    finally:
        writer.close()


def percentile(values, p):
    ordered = sorted(values)
    return ordered[min(len(ordered) - 1, int(len(ordered) * p))] if ordered else float("nan")


async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", default="http://localhost:8080")
    parser.add_argument("--clients", type=int, default=400)
    parser.add_argument("--duration", type=int, default=60)
    args = parser.parse_args()
    target = urlparse(args.url)
    stats = {"connected": 0, "refused": 0, "connect_errors": 0, "closed": 0, "messages": {}, "lags": []}
    stop_at = time.time() + args.duration
    await asyncio.gather(*(client(target.hostname, target.port or 80, "/api/v1/stream", stop_at, stats) for _ in range(args.clients)))
    lags = stats["lags"]
    print(f"clients demandés={args.clients} connectés={stats['connected']} refusés={stats['refused']} "
          f"erreurs de connexion={stats['connect_errors']} coupés={stats['closed']}")
    print(f"messages={stats['messages']}")
    if lags:
        print(f"retard des deltas (s) : p50={statistics.median(lags):.2f} p95={percentile(lags, 0.95):.2f} "
              f"p99={percentile(lags, 0.99):.2f} max={max(lags):.2f} sur {len(lags)} messages")
    return 0 if stats["connected"] == args.clients and stats["messages"].get("resync", 0) == 0 else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
