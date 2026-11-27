#!/usr/bin/env python3
"""Writes the sample PDFs, object by object.

    python3 fixtures/_tools/make-pdfs.py

Standard library only, and the same bytes every time. Two files with the same words:

- sample.pdf is tagged: its catalog has a structure tree that says which words are a heading, a
  paragraph, a list, a table with header cells, a picture with a description, and a link.
- untagged.pdf has no structure at all: only words at places on a page, in sizes.

And three-pages.pdf, for drawing pages as pictures: a US Letter page, an A4 page on its side, and
a small square page, each with a blue block in a corner. On the second, a red square sits in a
layer the file marks as hidden; it must not be drawn.
"""
import os

FIXTURES = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class Pdf:
    def __init__(self):
        self.objects = {}

    def add(self, number, body):
        self.objects[number] = body if isinstance(body, bytes) else body.encode("latin-1")

    def stream(self, number, data, extra=""):
        data = data if isinstance(data, bytes) else data.encode("latin-1")
        self.add(number, f"<< /Length {len(data)} {extra}>>\nstream\n".encode() + data + b"\nendstream")

    def save(self, path, root=1, info=None):
        out = bytearray(b"%PDF-1.7\n%\xe2\xe3\xcf\xd3\n")
        offsets = {}
        for number in sorted(self.objects):
            offsets[number] = len(out)
            out += f"{number} 0 obj\n".encode() + self.objects[number] + b"\nendobj\n"
        size = max(self.objects) + 1
        start = len(out)
        out += f"xref\n0 {size}\n".encode() + b"0000000000 65535 f \n"
        for number in range(1, size):
            out += (f"{offsets[number]:010d} 00000 n \n" if number in offsets else "0000000000 65535 f \n").encode()
        out += f"trailer\n<< /Size {size} /Root {root} 0 R{f' /Info {info} 0 R' if info else ''} >>\nstartxref\n{start}\n%%EOF\n".encode()
        full = os.path.join(FIXTURES, path)
        os.makedirs(os.path.dirname(full), exist_ok=True)
        with open(full, "wb") as f:
            f.write(out)
        print(f"{path}: {len(out)} bytes")


def text(x, y, size, words, font="F1"):
    safe = words.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
    return f"BT /{font} {size} Tf {x} {y} Td ({safe}) Tj ET\n"


FONTS = "<< /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >> /F2 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >> >>"

# What is on the page, in reading order: (tag, x, y, size, words, font).
LINES = [
    ("H1", 72, 720, 24, "About Omsett", "F2"),
    ("P", 72, 690, 11, "Drop a file. Pick a format. Nothing leaves your device,", "F1"),
    ("P", 72, 676, 11, "and nothing is uploaded. Caf\xe9 tables & <angle> brackets.", "F1"),
    ("H2", 72, 640, 16, "What it converts", "F2"),
    ("Lbl", 72, 616, 11, "\x95", "F1"),
    ("LBody", 90, 616, 11, "Pictures", "F1"),
    ("Lbl", 72, 602, 11, "\x95", "F1"),
    ("LBody", 90, 602, 11, "Documents and workbooks", "F1"),
    ("TH", 72, 570, 11, "Format", "F2"),
    ("TH", 200, 570, 11, "Kind", "F2"),
    ("TD", 72, 556, 11, "PNG", "F1"),
    ("TD", 200, 556, 11, "Picture", "F1"),
    ("TD", 72, 542, 11, "XLSX", "F1"),
    ("TD", 200, 542, 11, "Workbook", "F1"),
    ("Link", 72, 510, 11, "omsett.com", "F1"),
]

# --- tagged ---------------------------------------------------------------------------------------
pdf = Pdf()
content = ""
for mcid, (tag, x, y, size, words, font) in enumerate(LINES):
    content += f"/{tag} << /MCID {mcid} >> BDC\n" + text(x, y, size, words, font) + "EMC\n"
# A figure: a grey box, tagged, with the description a screen reader would speak.
FIGURE = len(LINES)
content += f"/Figure << /MCID {FIGURE} >> BDC\n0.8 g 72 430 120 60 re f 0 g\nEMC\n"
# Page furniture that is not content: marked as an artifact, and so left out.
content += "/Artifact << /Type /Pagination >> BDC\n" + text(290, 40, 9, "Page 1 SECRET-ARTIFACT") + "EMC\n"

CATALOG, PAGES, PAGE, CONTENT, INFO, TREE, PARENTS, LINK_ANNOT = 1, 2, 3, 4, 5, 6, 7, 8
FIRST = 10  # structure elements are numbered from here
elements = []  # (number, body)


def element(tag, parent, kids, extra=""):
    number = FIRST + len(elements)
    elements.append([number, tag, parent, kids, extra])
    return number


def mc(mcid):
    return f"<< /Type /MCR /Pg {PAGE} 0 R /MCID {mcid} >>"


DOC = element("Document", TREE, [])
leaf = {}
leaf[0] = element("H1", DOC, [mc(0)])
leaf[1] = leaf[2] = element("P", DOC, [mc(1), mc(2)])
leaf[3] = element("H2", DOC, [mc(3)])
LIST = element("L", DOC, [])
for first in (4, 6):
    item = element("LI", LIST, [])
    leaf[first] = element("Lbl", item, [mc(first)])
    leaf[first + 1] = element("LBody", item, [mc(first + 1)])
TABLE = element("Table", DOC, [])
for row in (8, 10, 12):
    tr = element("TR", TABLE, [])
    for cell in (row, row + 1):
        leaf[cell] = element(LINES[cell][0], tr, [mc(cell)])
PARA = element("P", DOC, [])
leaf[14] = element("Link", PARA, [mc(14), f"<< /Type /OBJR /Obj {LINK_ANNOT} 0 R /Pg {PAGE} 0 R >>"])
leaf[FIGURE] = element("Figure", DOC, [mc(FIGURE)], " /Alt (The Omsett mark: a word in white with a blue square)")

children = {}
for number, tag, parent, kids, extra in elements:
    children.setdefault(parent, []).append(f"{number} 0 R")
for number, tag, parent, kids, extra in elements:
    inner = kids + children.get(number, [])
    pdf.add(number, f"<< /Type /StructElem /S /{tag} /P {parent} 0 R /Pg {PAGE} 0 R /K [{' '.join(inner)}]{extra} >>")

pdf.add(CATALOG, f"<< /Type /Catalog /Pages {PAGES} 0 R /Lang (en-GB) /MarkInfo << /Marked true >> /StructTreeRoot {TREE} 0 R /ViewerPreferences << /DisplayDocTitle true >> >>")
pdf.add(PAGES, f"<< /Type /Pages /Kids [{PAGE} 0 R] /Count 1 >>")
pdf.add(PAGE, f"<< /Type /Page /Parent {PAGES} 0 R /MediaBox [0 0 612 792] /Resources << /Font {FONTS} >> /Contents {CONTENT} 0 R /StructParents 0 /Tabs /S /Annots [{LINK_ANNOT} 0 R] >>")
pdf.stream(CONTENT, content)
pdf.add(INFO, "<< /Title (About Omsett) /Author (SECRET-AUTHOR Ada Lovelace) /Producer (make-pdfs.py) >>")
pdf.add(TREE, f"<< /Type /StructTreeRoot /K [{DOC} 0 R] /ParentTree {PARENTS} 0 R /ParentTreeNextKey 2 >>")
pdf.add(PARENTS, f"<< /Nums [0 [{' '.join(f'{leaf[i]} 0 R' for i in range(FIGURE + 1))}] 1 {leaf[14]} 0 R] >>")
pdf.add(LINK_ANNOT, f"<< /Type /Annot /Subtype /Link /Rect [72 506 140 522] /Border [0 0 0] /StructParent 1 /A << /S /URI /URI (https://omsett.com) >> /Contents (omsett.com) >>")
pdf.save("pdf/sample.pdf", info=INFO)

# --- untagged -------------------------------------------------------------------------------------
plain = Pdf()
body = "".join(text(x, y, size, words, font) for _, x, y, size, words, font in LINES)
body += text(290, 40, 9, "1")
plain.add(1, "<< /Type /Catalog /Pages 2 0 R >>")
plain.add(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>")
plain.add(3, f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font {FONTS} >> /Contents 4 0 R >>")
plain.stream(4, body)
plain.save("pdf/untagged.pdf")

# --- three pages, of three sizes, one with a hidden layer ------------------------------------------
three = Pdf()
SIZES = [(612, 792), (842, 595), (288, 288)]
three.add(1, "<< /Type /Catalog /Pages 2 0 R /OCProperties << /OCGs [20 0 R] /D << /OFF [20 0 R] /Order [20 0 R] >> >> >>")
three.add(2, f"<< /Type /Pages /Kids [{' '.join(f'{3 + i * 2} 0 R' for i in range(3))}] /Count 3 >>")
three.add(20, "<< /Type /OCG /Name (Hidden notes) >>")
for i, (width, height) in enumerate(SIZES):
    page, content = 3 + i * 2, 4 + i * 2
    # A blue block in the top left corner, and the page's number in words.
    body = f"0 0.4 1 rg 0 {height - 72} 72 72 re f\n" + text(90, height - 50, 18, f"Page {i + 1} of 3")
    resources = f"/Font {FONTS}"
    if i == 1:
        # Red, in the hidden layer, in the bottom right corner.
        body += f"/OC /Hidden BDC 1 0 0 rg {width - 144} 0 144 144 re f EMC\n"
        resources += " /Properties << /Hidden 20 0 R >>"
    three.add(page, f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {width} {height}] /Resources << {resources} >> /Contents {content} 0 R >>")
    three.stream(content, body)
three.save("pdf/three-pages.pdf")
