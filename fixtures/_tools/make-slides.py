#!/usr/bin/env python3
"""Writes the sample presentation, part by part, the way PowerPoint writes one.

    python3 fixtures/_tools/make-slides.py

Standard library only, and the same bytes every time. Four slides: a title slide; bullets at two
levels with emphasis and a link; a picture with a description and a table; and a hidden slide.
The second slide has speaker notes. Neither the hidden slide nor the notes may be carried across.
"""
import os
import zipfile

FIXTURES = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
A = "http://schemas.openxmlformats.org/drawingml/2006/main"
P = "http://schemas.openxmlformats.org/presentationml/2006/main"
R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
PKG = "http://schemas.openxmlformats.org/package/2006/relationships"
NS = f'xmlns:a="{A}" xmlns:p="{P}" xmlns:r="{R}"'


def run(text, props=""):
    return f'<a:r><a:rPr lang="en-GB"{props}/><a:t>{text}</a:t></a:r>'


def para(inner, level=None, plain=False):
    props = (f' lvl="{level}"' if level else "")
    return f'<a:p><a:pPr{props}>{"<a:buNone/>" if plain else ""}</a:pPr>{inner}</a:p>'


def shape(kind, paragraphs, number):
    holder = f'<p:ph type="{kind}"/>' if kind else '<p:ph idx="1"/>'
    return f'<p:sp><p:nvSpPr><p:cNvPr id="{number}" name="Shape {number}"/><p:cNvSpPr/><p:nvPr>{holder}</p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/>{paragraphs}</p:txBody></p:sp>'


def slide(shapes, show=True):
    return f'<p:sld {NS}{"" if show else " show=\"0\""}><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>{shapes}</p:spTree></p:cSld></p:sld>'


def cell(text):
    return f"<a:tc><a:txBody><a:bodyPr/>{para(run(text))}</a:txBody><a:tcPr/></a:tc>"


LINK = '><a:hlinkClick r:id="rId2"/></a:rPr><a:t>omsett.com</a:t></a:r>'
SLIDES = [
    slide(shape("ctrTitle", para(run("Omsett")), 2) + shape("subTitle", para(run("Drop a file. Pick a format."), plain=True), 3)),
    slide(
        shape("title", para(run("What it converts")), 2)
        + shape(None, para(run("Pictures")) + para(run("Data, such as ") + run("JSON", ' b="1"') + run(" and ") + run("CSV", ' i="1"'))
                + para(run("Workbooks"), 1) + para(run("Contacts"), 1) + para(run("See ") + '<a:r><a:rPr lang="en-GB"' + LINK), 3)
        # A box drawn by hand, and the slide's number: one is content, the other is furniture.
        + '<p:sp><p:nvSpPr><p:cNvPr id="4" name="TextBox 4"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/>' + para(run("Nothing leaves your device.")) + "</p:txBody></p:sp>"
        + shape("sldNum", para(run("2")), 5)
    ),
    slide(
        shape("title", para(run("A picture and a table, café 字幕")), 2)
        + '<p:pic><p:nvPicPr><p:cNvPr id="3" name="Picture 3" descr="The Omsett mark: a word in white with a blue square"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr>'
        '<p:blipFill><a:blip r:embed="rId2"/></p:blipFill><p:spPr/></p:pic>'
        '<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="4" name="Table 4"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr><p:xfrm/>'
        f'<a:graphic><a:graphicData uri="{A.replace("main", "table")}"><a:tbl><a:tblPr firstRow="1"/><a:tblGrid/>'
        f'<a:tr h="0">{cell("Format")}{cell("Kind")}</a:tr><a:tr h="0">{cell("PNG")}{cell("Picture")}</a:tr><a:tr h="0">{cell("XLSX")}{cell("Workbook")}</a:tr>'
        "</a:tbl></a:graphicData></a:graphic></p:graphicFrame>"
    ),
    slide(shape("title", para(run("SECRET-HIDDEN-SLIDE")), 2) + shape(None, para(run("Figures not for the audience")), 3), show=False),
]


def rels(*links):
    return f'<Relationships xmlns="{PKG}">' + "".join(f'<Relationship Id="{i}" Type="{R}/{t}" Target="{target}"{" TargetMode=\"External\"" if ext else ""}/>' for i, t, target, ext in links) + "</Relationships>"


PARTS = {
    "[Content_Types].xml": '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>'
    '<Default Extension="png" ContentType="image/png"/>'
    '<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>'
    + "".join(f'<Override PartName="/ppt/slides/slide{i}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>' for i in range(1, 5))
    + '<Override PartName="/ppt/notesSlides/notesSlide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.notesSlide+xml"/>'
    '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>',
    "_rels/.rels": rels(("rId1", "officeDocument", "ppt/presentation.xml", False)),
    # The slides are listed out of the order of their file names: the list is what counts.
    "ppt/presentation.xml": f'<p:presentation {NS}><p:sldIdLst><p:sldId id="256" r:id="rId1"/><p:sldId id="257" r:id="rId2"/><p:sldId id="259" r:id="rId4"/><p:sldId id="258" r:id="rId3"/></p:sldIdLst></p:presentation>',
    "ppt/_rels/presentation.xml.rels": rels(("rId1", "slide", "slides/slide1.xml", False), ("rId2", "slide", "slides/slide2.xml", False), ("rId3", "slide", "slides/slide3.xml", False), ("rId4", "slide", "slides/slide4.xml", False)),
    "ppt/slides/slide1.xml": SLIDES[0],
    "ppt/slides/slide2.xml": SLIDES[1],
    "ppt/slides/slide3.xml": SLIDES[2],
    "ppt/slides/slide4.xml": SLIDES[3],
    "ppt/slides/_rels/slide2.xml.rels": rels(("rId1", "notesSlide", "../notesSlides/notesSlide1.xml", False), ("rId2", "hyperlink", "https://omsett.com", True)),
    "ppt/slides/_rels/slide3.xml.rels": rels(("rId2", "image", "../media/image1.png", False)),
    "ppt/notesSlides/notesSlide1.xml": f'<p:notes {NS}><p:cSld><p:spTree>{shape("body", para(run("SECRET-SPEAKER-NOTES: do not read this part out")), 2)}</p:spTree></p:cSld></p:notes>',
    "docProps/core.xml": '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/">'
    "<dc:title>About Omsett</dc:title><dc:creator>SECRET-AUTHOR Ada Lovelace</dc:creator></cp:coreProperties>",
}

path = os.path.join(FIXTURES, "pptx/sample.pptx")
os.makedirs(os.path.dirname(path), exist_ok=True)
with open(os.path.join(FIXTURES, "_cases/tiny-1x1.png"), "rb") as f:
    picture = f.read()
with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as archive:
    for name, body in PARTS.items():
        info = zipfile.ZipInfo(name, (2026, 11, 23, 12, 0, 0))
        info.compress_type = zipfile.ZIP_DEFLATED
        archive.writestr(info, (HEAD + body).encode("utf-8"))
    archive.writestr(zipfile.ZipInfo("ppt/media/image1.png", (2026, 11, 23, 12, 0, 0)), picture)
print(f"pptx/sample.pptx: {os.path.getsize(path)} bytes")
