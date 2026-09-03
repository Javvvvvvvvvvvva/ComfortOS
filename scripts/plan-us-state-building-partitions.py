#!/usr/bin/env python3
import argparse
import json
import math
import tempfile
import urllib.request
import zipfile
from pathlib import Path

import duckdb


DEFAULT_BOUNDARY_URL = (
    "https://www2.census.gov/geo/tiger/GENZ2025/shp/"
    "cb_2025_us_state_500k.zip"
)
CATALOG_PATH = Path("config/data-regions/us-states.json")


def main():
    args = parse_args()
    catalog = json.loads(CATALOG_PATH.read_text())
    selected = select_jurisdictions(catalog["jurisdictions"], args.states)

    with tempfile.TemporaryDirectory(prefix="comfortos-state-boundaries-") as temp_dir:
        boundary_zip = Path(args.boundary_zip) if args.boundary_zip else Path(temp_dir) / "states.zip"
        if not args.boundary_zip:
            urllib.request.urlretrieve(args.boundary_url, boundary_zip)
        with zipfile.ZipFile(boundary_zip) as archive:
            archive.extractall(temp_dir)
        shapefile = next(Path(temp_dir).glob("*.shp"))

        connection = duckdb.connect()
        connection.execute("INSTALL spatial; LOAD spatial;")
        output_root = Path(args.output_root)
        output_root.mkdir(parents=True, exist_ok=True)

        summaries = []
        for jurisdiction in selected:
            summary = write_state_plan(
                connection=connection,
                shapefile=shapefile,
                jurisdiction=jurisdiction,
                catalog_source=catalog["source"],
                output_root=output_root,
                cell_size=args.cell_size_degrees,
            )
            summaries.append(summary)

    print(
        json.dumps(
            {
                "stateCount": len(summaries),
                "partitionCount": sum(item["partitionCount"] for item in summaries),
                "states": summaries,
                "outputRoot": str(Path(args.output_root).resolve()),
            },
            indent=2,
        )
    )


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--states",
        default="all",
        help="Comma-separated postal codes or 'all'.",
    )
    parser.add_argument(
        "--output-root",
        default="/tmp/comfortos-us-state-partitions",
    )
    parser.add_argument("--cell-size-degrees", type=float, default=0.25)
    parser.add_argument("--boundary-zip")
    parser.add_argument("--boundary-url", default=DEFAULT_BOUNDARY_URL)
    args = parser.parse_args()
    if args.cell_size_degrees <= 0 or args.cell_size_degrees > 0.25:
        parser.error("--cell-size-degrees must be greater than 0 and at most 0.25.")
    return args


def select_jurisdictions(jurisdictions, value):
    if value.lower() == "all":
        return jurisdictions
    requested = {code.strip().upper() for code in value.split(",") if code.strip()}
    selected = [item for item in jurisdictions if item["code"] in requested]
    missing = sorted(requested - {item["code"] for item in selected})
    if missing:
        raise ValueError(f"Unknown state code(s): {', '.join(missing)}")
    return selected


def write_state_plan(
    connection,
    shapefile,
    jurisdiction,
    catalog_source,
    output_root,
    cell_size,
):
    west, south, east, north = jurisdiction["bbox"]
    x_start = math.floor(west / cell_size)
    x_end = math.ceil(east / cell_size)
    y_start = math.floor(south / cell_size)
    y_end = math.ceil(north / cell_size)
    rows = connection.execute(
        """
        WITH target AS (
          SELECT geom
          FROM ST_Read(?)
          WHERE STUSPS = ?
        ),
        cells AS (
          SELECT x.range AS grid_x, y.range AS grid_y
          FROM range(?, ?) AS x
          CROSS JOIN range(?, ?) AS y
        )
        SELECT grid_x, grid_y
        FROM cells, target
        WHERE ST_Intersects(
          target.geom,
          ST_MakeEnvelope(
            grid_x * ?,
            grid_y * ?,
            (grid_x + 1) * ?,
            (grid_y + 1) * ?
          )
        )
        ORDER BY grid_x, grid_y
        """,
        [
            str(shapefile),
            jurisdiction["code"],
            x_start,
            x_end,
            y_start,
            y_end,
            cell_size,
            cell_size,
            cell_size,
            cell_size,
        ],
    ).fetchall()

    state_dir = output_root / jurisdiction["code"].lower()
    region_dir = state_dir / "regions"
    region_dir.mkdir(parents=True, exist_ok=True)
    partitions = []
    for grid_x, grid_y in rows:
        partition_id = partition_identifier(jurisdiction["code"], grid_x, grid_y)
        bbox = [
            round(grid_x * cell_size, 6),
            round(grid_y * cell_size, 6),
            round((grid_x + 1) * cell_size, 6),
            round((grid_y + 1) * cell_size, 6),
        ]
        config_path = region_dir / f"{partition_id}.json"
        config = {
            "id": partition_id,
            "label": f"{jurisdiction['name']} building partition {partition_id}",
            "bbox": bbox,
            "jurisdiction": {
                "fips": jurisdiction["fips"],
                "code": jurisdiction["code"],
                "name": jurisdiction["name"],
            },
            "partition": {
                "gridX": grid_x,
                "gridY": grid_y,
                "cellSizeDegrees": cell_size,
            },
        }
        config_path.write_text(json.dumps(config, indent=2) + "\n")
        partitions.append(
            {
                "id": partition_id,
                "bbox": bbox,
                "configPath": str(config_path.relative_to(state_dir)),
            }
        )

    plan = {
        "format": "comfortos-us-state-building-plan-v1",
        "jurisdiction": {
            "fips": jurisdiction["fips"],
            "code": jurisdiction["code"],
            "name": jurisdiction["name"],
        },
        "boundarySource": catalog_source,
        "cellSizeDegrees": cell_size,
        "partitionCount": len(partitions),
        "partitions": partitions,
    }
    plan_path = state_dir / "state-plan.json"
    plan_path.write_text(json.dumps(plan, indent=2) + "\n")
    return {
        "code": jurisdiction["code"],
        "name": jurisdiction["name"],
        "partitionCount": len(partitions),
        "planPath": str(plan_path.resolve()),
    }


def partition_identifier(code, grid_x, grid_y):
    longitude = f"{'w' if grid_x < 0 else 'e'}{abs(grid_x):04d}"
    latitude = f"{'s' if grid_y < 0 else 'n'}{abs(grid_y):04d}"
    return f"us-{code.lower()}-{longitude}-{latitude}"


if __name__ == "__main__":
    main()
