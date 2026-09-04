import importlib.util
import io
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
    def test_fetch_json_retries_transient_disconnects(self):
        responses = [
            ConnectionResetError("reset"),
            ConnectionResetError("reset"),
            io.BytesIO(b'{"ok":true}'),
        ]

        with (
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
        with (
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


if __name__ == "__main__":
    unittest.main()
