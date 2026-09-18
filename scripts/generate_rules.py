from __future__ import annotations

import json
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "Uyghur.xlsx"
OUTPUT = ROOT / "rules.js"
SCRIPTS = ("UEY", "ULY", "UYY", "UHY", "UTY", "UXY", "UKY")
NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
M = f"{{{NS}}}"


def shared_strings(archive: zipfile.ZipFile) -> list[str]:
    if "xl/sharedStrings.xml" not in archive.namelist():
        return []
    root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
    return [
        "".join(node.text or "" for node in item.iter(M + "t"))
        for item in root.findall(M + "si")
    ]


def cell_value(cell: ET.Element, shared: list[str]) -> str:
    cell_type = cell.attrib.get("t", "")
    value = cell.find(M + "v")
    inline = cell.find(M + "is")
    if cell_type == "s" and value is not None:
        return shared[int(value.text)]
    if cell_type == "inlineStr" and inline is not None:
        return "".join(node.text or "" for node in inline.iter(M + "t"))
    return value.text if value is not None else ""


def read_rows() -> list[dict[str, str]]:
    with zipfile.ZipFile(SOURCE) as archive:
        shared = shared_strings(archive)
        root = ET.fromstring(archive.read("xl/worksheets/sheet1.xml"))
        rows: list[dict[str, str]] = []
        for row in root.findall(f".//{M}sheetData/{M}row"):
            values: dict[str, str] = {}
            for cell in row.findall(M + "c"):
                reference = cell.attrib.get("r", "")
                column = "".join(ch for ch in reference if ch.isalpha())
                value = cell_value(cell, shared).strip()
                if value:
                    values[column] = value
            if values:
                rows.append(values)
    return rows


def main() -> None:
    rows = read_rows()
    if not rows or [rows[0].get(chr(65 + index)) for index in range(len(SCRIPTS))] != list(SCRIPTS):
        raise SystemExit("Uyghur.xlsx must expose UEY, ULY, UYY, UHY, UTY, UXY and UKY.")

    rules: list[dict[str, str]] = []
    for row in rows[1:]:
        uey = row.get("A", "").strip()
        if not uey or len(uey) > 2 or "\u81ea\u52a8" in uey or "\u5982\u9047" in uey:
            continue
        rule = {"uey": uey}
        for index, column in enumerate(SCRIPTS[1:], start=1):
            rule[column] = row.get(chr(65 + index), "").strip()
        if uey == 'تس':
            continue
        rules.append(rule)

    payload = json.dumps(rules, ensure_ascii=False, indent=2)
    output = f"""// Generated from Uyghur.xlsx by scripts/generate_rules.py.\n(function (root) {{\n  'use strict';\n  const rules = {payload};\n  root.UYGHUR_RULES = rules;\n  if (typeof module !== 'undefined' && module.exports) module.exports = rules;\n}})(typeof globalThis !== 'undefined' ? globalThis : this);\n"""
    OUTPUT.write_text(output, encoding="utf-8")
    print(f"Generated {OUTPUT.name} with {len(rules)} mapping rows.")


if __name__ == "__main__":
    main()
