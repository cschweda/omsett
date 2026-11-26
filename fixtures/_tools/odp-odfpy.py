#!/usr/bin/env python3
"""Writes fixtures/odp/from-odfpy.odp with odfpy, a library that knows nothing of Omsett.

    pip install odfpy==1.4.1     (in an environment of its own)
    python odp-odfpy.py           writes fixtures/odp/from-odfpy.odp

Two slides of sample.odp, written the way odfpy writes: a title slide, and a slide of bullets at
two levels with speaker notes. The file is committed, so this is run only to make it again.
"""
import os

from odf.draw import Frame, Page, TextBox
from odf.namespaces import PRESENTATIONNS
from odf.opendocument import OpenDocumentPresentation
from odf.presentation import Notes
from odf.style import MasterPage, PageLayout
from odf.text import List, ListItem, P

FIXTURES = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

doc = OpenDocumentPresentation()
layout = PageLayout(name="Layout")
doc.automaticstyles.addElement(layout)
master = MasterPage(name="Default", pagelayoutname=layout)
doc.masterstyles.addElement(master)


def frame(kind=None):
    found = Frame(width="20cm", height="3cm", x="1cm", y="1cm")
    if kind:
        found.setAttrNS(PRESENTATIONNS, "class", kind)
    box = TextBox()
    found.addElement(box)
    return found, box


one = Page(name="Title", masterpagename=master)
f, b = frame("title")
b.addElement(P(text="Omsett"))
one.addElement(f)
f, b = frame("subtitle")
b.addElement(P(text="Drop a file. Pick a format."))
one.addElement(f)
doc.presentation.addElement(one)

two = Page(name="Converts", masterpagename=master)
f, b = frame("title")
b.addElement(P(text="What it converts"))
two.addElement(f)
f, b = frame("outline")
outer = List()
for words, inner in [("Pictures", None), ("Data", ["Workbooks", "Contacts"]), ("Subtitles", None)]:
    item = ListItem()
    item.addElement(P(text=words))
    if inner:
        nested = List()
        for w in inner:
            i = ListItem()
            i.addElement(P(text=w))
            nested.addElement(i)
        item.addElement(nested)
    outer.addElement(item)
b.addElement(outer)
two.addElement(f)
notes = Notes()
f, b = frame("notes")
b.addElement(P(text="SECRET-SPEAKER-NOTES from odfpy"))
notes.addElement(f)
two.addElement(notes)
doc.presentation.addElement(two)

out = os.path.join(FIXTURES, "odp", "from-odfpy.odp")
doc.save(out)
print(f"odp/from-odfpy.odp: {os.path.getsize(out)} bytes")
