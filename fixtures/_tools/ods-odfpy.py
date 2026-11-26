#!/usr/bin/env python3
"""Writes fixtures/ods/from-odfpy.ods with odfpy, a library that knows nothing of Omsett.

    pip install odfpy==1.4.1     (in an environment of its own)
    python ods-odfpy.py           writes fixtures/ods/from-odfpy.ods

It holds the People sheet of sample.ods, written the way odfpy writes: its own prefixes, no
repeated empty cells, a hidden sheet by its style. The file is committed, so this is run only
to make it again.
"""
import os

from odf.opendocument import OpenDocumentSpreadsheet
from odf.style import Style, TableProperties
from odf.table import Table, TableCell, TableRow
from odf.text import P, Span
from odf.office import Annotation

FIXTURES = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

doc = OpenDocumentSpreadsheet()
hidden = Style(name="hidden", family="table")
hidden.addElement(TableProperties(display="false"))
doc.automaticstyles.addElement(hidden)


def cell(kind=None, words=None, **values):
    if kind is None:
        found = TableCell(valuetype="string") if words is not None else TableCell()
    else:
        found = TableCell(valuetype=kind, **values)
    for line in (words or "").split("\n") if words is not None else []:
        found.addElement(P(text=line))
    return found


secret = Table(name="Secret", stylename=hidden)
for words in ["not shown", "SECRET-HIDDEN-SHEET"]:
    r = TableRow()
    r.addElement(cell(words=words))
    secret.addElement(r)
doc.spreadsheet.addElement(secret)

people = Table(name="People")
rows = [
    [cell(words=w) for w in ["id", "name", "born", "joined", "salary", "note", "postcode", "active"]],
    [cell(kind="float", value=1), cell(words="Ada Lovelace"), cell(kind="date", datevalue="1815-12-10"), cell(kind="date", datevalue="2026-11-23"),
     cell(kind="currency", value=1234.5, currency="GBP"), cell(words="Wrote the first program, & said so <plainly>\nin two lines"), cell(words="01234"),
     cell(kind="boolean", booleanvalue="true")],
    [cell(kind="float", value=2, formula="of:=[.A2]+1"), None, cell(kind="date", datevalue="1906-12-06"), cell(kind="date", datevalue="2026-11-23T14:30:00"),
     cell(kind="percentage", value=0.1), cell(), cell(kind="float", value=10001), cell(kind="boolean", booleanvalue="false")],
]
for values in rows:
    r = TableRow()
    for found in values:
        if found is None:
            # Text in two runs, with a comment on the cell that is not its text.
            found = TableCell(valuetype="string")
            note = Annotation()
            note.addElement(P(text="SECRET-COMMENT on a cell"))
            found.addElement(note)
            p = P()
            p.addElement(Span(text="Grace "))
            p.addText("Hopper")
            found.addElement(p)
        r.addElement(found)
    people.addElement(r)
doc.spreadsheet.addElement(people)

out = os.path.join(FIXTURES, "ods", "from-odfpy.ods")
doc.save(out)
print(f"ods/from-odfpy.ods: {os.path.getsize(out)} bytes")
