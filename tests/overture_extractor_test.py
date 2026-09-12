import importlib.util
import io
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


SCRIPT_PATH = (
    Path(__file__).resolve().parents[1]
    / "scripts"
    / "extract-overture-buildings-duckdb.py"
)
SPEC = importlib.util.spec_from_file_location("overture_extractor", SCRIPT_PATH)
EXTRACTOR = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(EXTRACTOR)


class OvertureExtractorRetryTest(unittest.TestCase):
    def test_extract_buildings_records_stac_confirmed_empty_region(self):
        with tempfile.TemporaryDirectory() as output_dir:
            output_path = Path(output_dir) / "buildings.geojsonseq"

            result = EXTRACTOR.extract_buildings(
                [],
                (179.75, 51.75, 180.0, 52.0),
                output_path,
            )

            self.assertEqual(output_path.read_text(), "")
            self.assertEqual(
                result,
                {
                    "extractedBuildingCount": 0,
                    "duckDbExplicitHeightCount": 0,
                    "duckDbFloorCountAvailable": 0,
                    "buildingPartCount": 0,
                    "invalidGeometryCount": 0,
                    "sourceDatasets": [],
                },
            )

    def test_fetch_json_retries_transient_disconnects(self):
        responses = [
            ConnectionResetError("reset"),
            ConnectionResetError("reset"),
            io.BytesIO(b'{"ok":true}'),
        ]

        with tempfile.TemporaryDirectory() as cache_dir:
            with (
                patch.object(EXTRACTOR, "STAC_CACHE_DIR", Path(cache_dir)),
                patch.object(EXTRACTOR.urllib.request, "urlopen", side_effect=responses) as open_url,
                patch.object(EXTRACTOR.time, "sleep") as sleep,
                patch.object(EXTRACTOR.sys, "stderr", io.StringIO()),
            ):
                result = EXTRACTOR.fetch_json("https://example.invalid/catalog.json")

        self.assertEqual(result, {"ok": True})
        self.assertEqual(open_url.call_count, 3)
        self.assertEqual([call.args[0] for call in sleep.call_args_list], [1, 2])
        request = open_url.call_args_list[0].args[0]
        self.assertEqual(request.get_header("User-agent"), "ComfortOS-Overture-Ingestion/1.0")
        self.assertEqual(
            open_url.call_args_list[0].kwargs["timeout"],
            EXTRACTOR.STAC_FETCH_TIMEOUT_SECONDS,
        )

    def test_fetch_json_stops_after_bounded_attempts(self):
        with tempfile.TemporaryDirectory() as cache_dir:
            with (
                patch.object(EXTRACTOR, "STAC_CACHE_DIR", Path(cache_dir)),
                patch.object(
                    EXTRACTOR.urllib.request,
                    "urlopen",
                    side_effect=ConnectionResetError("reset"),
                ) as open_url,
                patch.object(EXTRACTOR.time, "sleep") as sleep,
                patch.object(EXTRACTOR.sys, "stderr", io.StringIO()),
            ):
                with self.assertRaises(ConnectionResetError):
                    EXTRACTOR.fetch_json("https://example.invalid/catalog.json")

        self.assertEqual(open_url.call_count, EXTRACTOR.STAC_FETCH_ATTEMPTS)
        self.assertEqual(
            [call.args[0] for call in sleep.call_args_list],
            [1, 2, 4, 8],
        )

    def test_fetch_json_reuses_successful_cached_response(self):
        url = "https://example.invalid/2026-08-19.0/item.json"

        with tempfile.TemporaryDirectory() as cache_dir:
            with (
                patch.object(EXTRACTOR, "STAC_CACHE_DIR", Path(cache_dir)),
                patch.object(
                    EXTRACTOR.urllib.request,
                    "urlopen",
                    return_value=io.BytesIO(b'{"ok":true}'),
                ) as open_url,
            ):
                first = EXTRACTOR.fetch_json(url)
                second = EXTRACTOR.fetch_json(url)

        self.assertEqual(first, {"ok": True})
        self.assertEqual(second, {"ok": True})
        self.assertEqual(open_url.call_count, 1)

    def test_fetch_json_replaces_corrupt_cache_entry(self):
        url = "https://example.invalid/2026-08-19.0/item.json"

        with tempfile.TemporaryDirectory() as cache_dir:
            with patch.object(EXTRACTOR, "STAC_CACHE_DIR", Path(cache_dir)):
                cache_path = EXTRACTOR.stac_cache_path(url)
                cache_path.write_text("not-json")
                with patch.object(
                    EXTRACTOR.urllib.request,
                    "urlopen",
                    return_value=io.BytesIO(b'{"fresh":true}'),
                ) as open_url:
                    result = EXTRACTOR.fetch_json(url)

                self.assertEqual(
                    json.loads(cache_path.read_text()),
                    {"fresh": True},
                )

        self.assertEqual(result, {"fresh": True})
        self.assertEqual(open_url.call_count, 1)


if __name__ == "__main__":
    unittest.main()
