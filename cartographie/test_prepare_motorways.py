import unittest

import json
import tempfile
from pathlib import Path

from prepare_motorways import build, normalize_ref, read_ways, split_at_junctions


def way(way_id, coords, **props):
    return {"type": "Feature", "geometry": {"type": "LineString", "coordinates": coords},
            "properties": {"@id": way_id, "highway": "motorway", **props}}


class PrepareMotorwaysTest(unittest.TestCase):

    def test_reads_regional_exports_once_per_way(self):
        with tempfile.TemporaryDirectory() as folder:
            shared = way(7, [[0, 0], [0.01, 0]])
            Path(folder, "a.geojsonseq").write_text("\x1e" + json.dumps(shared) + "\n\x1e" + json.dumps(way(8, [[1, 1], [1.01, 1]])) + "\n", encoding="utf-8")
            Path(folder, "b.geojsonseq").write_text("\x1e" + json.dumps(shared) + "\n\x1e" + json.dumps(way(9, [[2, 2], [2.01, 2]])) + "\n", encoding="utf-8")

            ids = [w["properties"]["@id"] for w in read_ways(folder)]

        self.assertEqual(ids, [7, 8, 9])

    def test_normalizes_osm_and_rrn_references(self):
        self.assertEqual(normalize_ref("A 7;E 15"), {"A7"})
        self.assertEqual(normalize_ref("A0007N"), {"A7"})
        self.assertEqual(normalize_ref("N 104"), set())

    def test_splits_way_where_a_link_joins_an_interior_vertex(self):
        main = way(1, [[4.80, 45.70], [4.81, 45.71], [4.82, 45.72]], ref="A 7")
        link = way(2, [[4.81, 45.71], [4.815, 45.705]], highway="motorway_link")

        parts = [(w["properties"]["@id"], part, len(coords)) for w, part, coords in split_at_junctions([main, link])]

        self.assertEqual(parts, [(1, 0, 2), (1, 1, 2), (2, 0, 2)])

    def test_builds_graph_and_flags_conceded_segments(self):
        a7 = way(1, [[4.80, 45.70], [4.81, 45.71]], ref="A 7", maxspeed="110")
        a86 = way(2, [[2.30, 48.80], [2.31, 48.81]], ref="A 86")
        reference = {"A7": [(4.805, 45.705)], "A86": []}

        segments, graph = build([a7, a86], reference)

        self.assertEqual([s["properties"]["concede"] for s in segments], [True, False])
        self.assertEqual(len(graph["nodes"]), 4)
        self.assertEqual(graph["edges"][0]["speedKmh"], 110)
        self.assertEqual(graph["edges"][1]["speedKmh"], 130)
        self.assertAlmostEqual(graph["edges"][0]["lengthM"], 1361, delta=5)

    def test_edges_carry_normalized_axes_and_link_flag(self):
        _, graph = build([way(4, [[0, 0], [0.01, 0]], ref="A 7;E 15"), way(5, [[0.01, 0], [0.02, 0]], highway="motorway_link")], {})

        self.assertEqual(graph["edges"][0]["refs"], ["A7"])
        self.assertFalse(graph["edges"][0]["link"])
        self.assertTrue(graph["edges"][1]["link"])

    def test_bidirectional_way_creates_two_edges(self):
        _, graph = build([way(3, [[0, 0], [0.01, 0]], oneway="no")], {})

        self.assertEqual([(e["from"], e["to"]) for e in graph["edges"]], [(0, 1), (1, 0)])


if __name__ == "__main__":
    unittest.main()
