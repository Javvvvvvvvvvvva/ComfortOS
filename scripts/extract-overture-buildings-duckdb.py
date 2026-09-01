#!/usr/bin/env python3
import argparse
import json
import sys
import time
import urllib.request
from pathlib import Path
from urllib.parse import urljoin

import duckdb


STAC_ROOT = "https://stac.overturemaps.org/catalog.json"


def main():
    args = parse_args()
    region = json.loads(Path(args.region_config).read_text())
    west, south, east, north = region["bbox"]
    started_at = time.perf_counter()

    release, collection_url = resolve_release(args.release)
    if collection_url:
        item_urls = collection_item_urls(collection_url)
        assets = intersecting_assets(item_urls, (west, south, east, north))
        source_access_method = "DuckDB httpfs+spatial reading official Overture cloud-hosted GeoParquet assets resolved from STAC"
    else:
        assets = intersecting_assets_from_parquet_metadata(
            release_glob(release),
            (west, south, east, north),
        )
        source_access_method = "DuckDB httpfs+spatial reading official Overture cloud-hosted GeoParquet release glob after STAC catalog lookup was unavailable"
    if not assets:
        raise RuntimeError("Real Overture extraction failed. No intersecting building assets were found. No fixture fallback was used.")

    output_path = Path(args.output_geojsonseq)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    stats = extract_buildings(
        assets=[asset["href"] for asset in assets],
        bbox=(west, south, east, north),
        output_path=output_path,
    )
    metadata = {
        "provider": "Overture Maps",
        "release": release,
        "theme": "buildings",
        "type": "building",
        "region": region["id"],
        "bbox": [west, south, east, north],
        "stacRoot": STAC_ROOT,
        "collectionUrl": collection_url,
        "assetCount": len(assets),
        "assets": assets,
        "sourceUrl": f"s3://overturemaps-us-west-2/release/{release}/theme=buildings/type=building/*",
        "sourceAccessMethod": source_access_method,
        "license": "ODbL-1.0",
        "requiredDuckDbExtensions": ["httpfs", "spatial"],
        "extractedAt": utc_now(),
        "extractionSeconds": round(time.perf_counter() - started_at, 3),
        **stats,
    }

    Path(args.metadata_output).write_text(json.dumps(metadata, indent=2) + "\n")
    print(json.dumps(metadata, indent=2))


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--region-config", required=True)
    parser.add_argument("--output-geojsonseq", required=True)
    parser.add_argument("--metadata-output", required=True)
    parser.add_argument("--release", default="latest")
    return parser.parse_args()


def resolve_release(release):
    try:
        catalog = fetch_json(STAC_ROOT)
    except Exception:
        if release == "latest":
            raise
        return release, None
    resolved = catalog["latest"] if release == "latest" else release
    release_href = None
    for link in catalog.get("links", []):
        if link.get("rel") == "child" and resolved in link.get("href", ""):
            release_href = urljoin(STAC_ROOT, link["href"])
            break
    if not release_href:
        release_href = urljoin(STAC_ROOT, f"./{resolved}/catalog.json")

    release_catalog = fetch_json(release_href)
    buildings_href = next(
        link["href"]
        for link in release_catalog.get("links", [])
        if link.get("rel") == "child" and link.get("title") == "buildings"
    )
    buildings_catalog_url = urljoin(release_href, buildings_href)
    buildings_catalog = fetch_json(buildings_catalog_url)
    building_href = next(
        link["href"]
        for link in buildings_catalog.get("links", [])
        if link.get("rel") == "child" and link.get("title") == "building"
    )
    return resolved, urljoin(buildings_catalog_url, building_href)


def release_glob(release):
    return f"s3://overturemaps-us-west-2/release/{release}/theme=buildings/type=building/*"


def collection_item_urls(collection_url):
    collection = fetch_json(collection_url)
    return [
        urljoin(collection_url, link["href"])
        for link in collection.get("links", [])
        if link.get("rel") == "item"
    ]


def intersecting_assets(item_urls, bbox):
    assets = []
    for item_url in item_urls:
        item = fetch_json(item_url)
        item_bbox = item["bbox"]
        if not intersects(item_bbox, bbox):
            continue
        aws_asset = item["assets"]["aws"]
        assets.append(
            {
                "itemId": item["id"],
                "bbox": item_bbox,
                "href": aws_asset["href"],
                "s3Href": aws_asset.get("alternate", {}).get("s3", {}).get("href"),
            }
        )
    return assets


def intersecting_assets_from_parquet_metadata(parquet_glob, bbox):
    west, south, east, north = bbox
    con = duckdb.connect()
    con.execute("INSTALL httpfs; LOAD httpfs;")
    query = """
        WITH row_group_bounds AS (
          SELECT
            file_name,
            row_group_id,
            min(CASE WHEN path_in_schema = 'bbox, xmin' THEN CAST(stats_min_value AS DOUBLE) END) AS xmin_min,
            max(CASE WHEN path_in_schema = 'bbox, xmax' THEN CAST(stats_max_value AS DOUBLE) END) AS xmax_max,
            min(CASE WHEN path_in_schema = 'bbox, ymin' THEN CAST(stats_min_value AS DOUBLE) END) AS ymin_min,
            max(CASE WHEN path_in_schema = 'bbox, ymax' THEN CAST(stats_max_value AS DOUBLE) END) AS ymax_max
          FROM parquet_metadata(?)
          WHERE path_in_schema IN ('bbox, xmin', 'bbox, xmax', 'bbox, ymin', 'bbox, ymax')
          GROUP BY file_name, row_group_id
        )
        SELECT DISTINCT file_name
        FROM row_group_bounds
        WHERE xmax_max >= ?
          AND xmin_min <= ?
          AND ymax_max >= ?
          AND ymin_min <= ?
        ORDER BY file_name
    """
    rows = con.execute(query, [parquet_glob, west, east, south, north]).fetchall()
    return [
        {
            "itemId": f"metadata-filter-{index + 1}",
            "bbox": [west, south, east, north],
            "href": row[0],
            "s3Href": row[0],
        }
        for index, row in enumerate(rows)
    ]


def extract_buildings(assets, bbox, output_path):
    west, south, east, north = bbox
    envelope_wkt = f"POLYGON(({west} {south},{east} {south},{east} {north},{west} {north},{west} {south}))"
    con = duckdb.connect()
    con.execute("INSTALL httpfs; LOAD httpfs; INSTALL spatial; LOAD spatial;")
    query = """
        SELECT
          id,
          height,
          min_height,
          num_floors,
          subtype,
          class,
          has_parts,
          sources,
          ST_AsGeoJSON(geometry) AS geometry_json,
          bbox,
          ST_IsValid(geometry) AS geometry_valid
        FROM read_parquet(?)
        WHERE bbox.xmax >= ?
          AND bbox.xmin <= ?
          AND bbox.ymax >= ?
          AND bbox.ymin <= ?
          AND COALESCE(is_underground, false) = false
          AND ST_Intersects(geometry, ST_GeomFromText(?))
    """
    cursor = con.execute(query, [assets, west, east, south, north, envelope_wkt])
    columns = [description[0] for description in cursor.description]
    count = 0
    explicit_height_count = 0
    floor_count_available = 0
    has_parts_count = 0
    invalid_geometry_count = 0
    source_datasets = set()

    with output_path.open("w") as output:
        while True:
            rows = cursor.fetchmany(5000)
            if not rows:
                break
            for row in rows:
                record = dict(zip(columns, row))
                geometry = json.loads(record.pop("geometry_json"))
                geometry_valid = bool(record.pop("geometry_valid"))
                if not geometry_valid:
                    invalid_geometry_count += 1
                    continue
                sources = record.get("sources") or []
                for source in sources:
                    dataset = source.get("dataset") if isinstance(source, dict) else None
                    if dataset:
                        source_datasets.add(dataset)
                properties = {
                    key: value
                    for key, value in record.items()
                    if key != "bbox" and value is not None
                }
                feature = {
                    "type": "Feature",
                    "id": record["id"],
                    "properties": properties,
                    "geometry": geometry,
                }
                output.write(json.dumps(feature, separators=(",", ":")) + "\n")
                count += 1
                if record.get("height") is not None:
                    explicit_height_count += 1
                if record.get("num_floors") is not None:
                    floor_count_available += 1
                if record.get("has_parts"):
                    has_parts_count += 1

    return {
        "extractedBuildingCount": count,
        "duckDbExplicitHeightCount": explicit_height_count,
        "duckDbFloorCountAvailable": floor_count_available,
        "buildingPartCount": has_parts_count,
        "invalidGeometryCount": invalid_geometry_count,
        "sourceDatasets": sorted(source_datasets),
    }


def fetch_json(url):
    with urllib.request.urlopen(url) as response:
        return json.load(response)


def intersects(left, right):
    return not (
        left[2] < right[0]
        or left[0] > right[2]
        or left[3] < right[1]
        or left[1] > right[3]
    )


def utc_now():
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"Real Overture extraction failed. {error} No fixture fallback was used.", file=sys.stderr)
        sys.exit(1)
