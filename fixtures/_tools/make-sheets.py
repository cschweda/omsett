#!/usr/bin/env python3
"""Writes the sample workbooks, part by part, the way Excel writes them.

    python3 fixtures/_tools/make-sheets.py

Standard library only, and the same bytes every time. sample.xlsx uses what real workbooks use
and Omsett's own writer does not: text shared between cells, text in runs of differing style, a
date kept as a number with a date format, a formula beside the value it last showed, a hidden
sheet in front of the visible one, and a second sheet after it.
"""
import os
import zipfile

FIXTURES = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
PKG = "http://schemas.openxmlformats.org/package/2006/relationships"
STATE = ' state="hidden"'


def workbook(path, sheets, shared, styles, hidden=()):
    """sheets: [(name, sheetData XML)]. Written in the order Excel writes its parts."""
    parts = {
        "[Content_Types].xml": '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        '<Default Extension="xml" ContentType="application/xml"/>'
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
        + "".join(
            f'<Override PartName="/xl/worksheets/sheet{i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
            for i in range(len(sheets))
        )
        + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
        '<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>'
        "</Types>",
        "_rels/.rels": f'<Relationships xmlns="{PKG}"><Relationship Id="rId1" Type="{REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>',
        "xl/workbook.xml": f'<workbook xmlns="{MAIN}" xmlns:r="{REL}"><workbookPr/><sheets>'
        + "".join(
            f'<sheet name="{name}" sheetId="{i + 1}"{STATE if name in hidden else ""} r:id="rId{i + 1}"/>'
            for i, (name, _) in enumerate(sheets)
        )
        + "</sheets></workbook>",
        "xl/_rels/workbook.xml.rels": f'<Relationships xmlns="{PKG}">'
        + "".join(f'<Relationship Id="rId{i + 1}" Type="{REL}/worksheet" Target="worksheets/sheet{i + 1}.xml"/>' for i in range(len(sheets)))
        + f'<Relationship Id="rId{len(sheets) + 1}" Type="{REL}/styles" Target="styles.xml"/>'
        f'<Relationship Id="rId{len(sheets) + 2}" Type="{REL}/sharedStrings" Target="sharedStrings.xml"/></Relationships>',
        "xl/styles.xml": styles,
        "xl/sharedStrings.xml": f'<sst xmlns="{MAIN}" count="{len(shared)}" uniqueCount="{len(shared)}">' + "".join(shared) + "</sst>",
    }
    for i, (_, data) in enumerate(sheets):
        parts[f"xl/worksheets/sheet{i + 1}.xml"] = f'<worksheet xmlns="{MAIN}"><sheetData>{data}</sheetData></worksheet>'
    full = os.path.join(FIXTURES, path)
    os.makedirs(os.path.dirname(full), exist_ok=True)
    with zipfile.ZipFile(full, "w", zipfile.ZIP_DEFLATED) as archive:
        for name, body in parts.items():
            info = zipfile.ZipInfo(name, (2026, 11, 23, 12, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            archive.writestr(info, (HEAD + body).encode("utf-8"))
    print(f"{path}: {os.path.getsize(full)} bytes")


# Style 0 is plain; 1 shows a number as a date (Excel's own format 14); 2 is a date and time in
# a format someone wrote; 3 is money, which has a "d"-less pattern and is not a date.
STYLES = (
    f'<styleSheet xmlns="{MAIN}"><numFmts count="2"><numFmt numFmtId="164" formatCode="yyyy\\-mm\\-dd\\ hh:mm"/>'
    '<numFmt numFmtId="165" formatCode="&quot;$&quot;#,##0.00"/></numFmts>'
    '<fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>'
    '<fills count="1"><fill><patternFill patternType="none"/></fill></fills>'
    '<borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
    '<cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
    '<xf numFmtId="14" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>'
    '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>'
    '<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs></styleSheet>'
)


def s(i):
    return f't="s"><v>{i}</v></c>'


SHARED = [
    "<si><t>id</t></si>",  # 0
    "<si><t>name</t></si>",  # 1
    "<si><t>born</t></si>",  # 2
    "<si><t>joined</t></si>",  # 3
    "<si><t>salary</t></si>",  # 4
    "<si><t>note</t></si>",  # 5
    "<si><t>postcode</t></si>",  # 6
    "<si><t>Ada Lovelace</t></si>",  # 7
    "<si><r><t>Grace </t></r><r><rPr><b/></rPr><t>Hopper</t></r><rPh sb=\"0\" eb=\"1\"><t>pronounced</t></rPh></si>",  # 8
    "<si><t xml:space=\"preserve\">Wrote the first program, &amp; said so &lt;plainly&gt;\nin two lines</t></si>",  # 9
    "<si><t>01234</t></si>",  # 10
    "<si><t>Caf\u00e9 \u5b57\u5e55</t></si>",  # 11
    "<si><t>active</t></si>",  # 12
    "<si><t>not shown</t></si>",  # 13
]
PEOPLE = (
    f'<row r="1"><c r="A1" {s(0)}<c r="B1" {s(1)}<c r="C1" {s(2)}<c r="D1" {s(3)}<c r="E1" {s(4)}<c r="F1" {s(5)}<c r="G1" {s(6)}<c r="H1" {s(12)}</row>'
    # 1815-12-10 is before Excel's calendar begins, so real workbooks hold such dates as text.
    f'<row r="2"><c r="A2"><v>1</v></c><c r="B2" {s(7)}<c r="C2" t="inlineStr"><is><t>1815-12-10</t></is></c>'
    f'<c r="D2" s="1"><v>46349</v></c><c r="E2" s="3"><v>1234.5</v></c><c r="F2" {s(9)}<c r="G2" {s(10)}<c r="H2" t="b"><v>1</v></c></row>'
    # A formula, with the value it last showed; a date and time; an empty cell skipped over.
    f'<row r="3"><c r="A3"><f>A2+1</f><v>2</v></c><c r="B3" {s(8)}<c r="C3" s="1"><v>2532</v></c>'
    f'<c r="D3" s="2"><v>46349.604166666664</v></c><c r="E3" s="3"><v>0.1</v></c><c r="G3"><v>10001</v></c><c r="H3" t="b"><v>0</v></c></row>'
    f'<row r="4"><c r="A4"><v>3</v></c><c r="B4" {s(11)}<c r="F4" t="str"><f>CONCATENATE("a","b")</f><v>ab</v></c><c r="H4" t="e"><f>1/0</f><v>#DIV/0!</v></c></row>'
)
workbook(
    "xlsx/sample.xlsx",
    [("Secret", f'<row r="1"><c r="A1" {s(13)}</row><row r="2"><c r="A2"><v>42</v></c></row>'), ("People", PEOPLE), ("Totals", '<row r="1"><c r="A1" t="inlineStr"><is><t>total</t></is></c></row><row r="2"><c r="A2"><v>3</v></c></row>')],
    SHARED,
    STYLES,
    hidden=("Secret",),
)

EVENTS = ["summary", "start", "end", "location", "Planning meeting, room 4", "Springfield", "Holiday", "Release", "2026-12-25", "2026-12-26"]
workbook(
    "xlsx/events.xlsx",
    [(
        "Events",
        f'<row r="1"><c r="A1" {s(0)}<c r="B1" {s(1)}<c r="C1" {s(2)}<c r="D1" {s(3)}</row>'
        # Dates and times as Excel holds them: numbers, shown as dates.
        f'<row r="2"><c r="A2" {s(4)}<c r="B2" s="2"><v>46349.375</v></c><c r="C2" s="2"><v>46349.416666666664</v></c><c r="D2" {s(5)}</row>'
        f'<row r="3"><c r="A3" {s(6)}<c r="B3" {s(8)}<c r="C3" {s(9)}</row>'
        f'<row r="4"><c r="A4" {s(7)}<c r="B4" s="1"><v>46391</v></c></row>',
    )],
    [f"<si><t>{text}</t></si>" for text in EVENTS],
    STYLES,
)
