#!/usr/bin/env python3
"""Writes the sample Word document, part by part, the way Word writes one.

    python3 fixtures/_tools/make-docs.py

Standard library only, and the same bytes every time. It uses what real documents use: styles
that are headings by name, a list defined in a numbering part, a table whose first row is
marked as headers, a link and a picture named through the relationships part, a picture with a
description, text deleted and inserted with changes tracked, hidden text, and a comment.
"""
import os
import zipfile

FIXTURES = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
PKG = "http://schemas.openxmlformats.org/package/2006/relationships"
LINK_STYLE = '<w:rStyle w:val="Hyperlink"/>'


def run(text, props=""):
    return f'<w:r>{"<w:rPr>" + props + "</w:rPr>" if props else ""}<w:t xml:space="preserve">{text}</w:t></w:r>'


def para(inner, style=None, num=None):
    props = (f'<w:pStyle w:val="{style}"/>' if style else "") + (f'<w:numPr><w:ilvl w:val="{num[1]}"/><w:numId w:val="{num[0]}"/></w:numPr>' if num else "")
    return f'<w:p>{"<w:pPr>" + props + "</w:pPr>" if props else ""}{inner}</w:p>'


def cell(text):
    return f"<w:tc><w:tcPr><w:tcW w:w=\"0\" w:type=\"auto\"/></w:tcPr>{para(run(text))}</w:tc>"


PICTURE = (
    '<w:r><w:drawing><wp:inline xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><wp:extent cx="952500" cy="952500"/>'
    '<wp:docPr id="1" name="Picture 1" descr="The Omsett mark: a word in white with a blue square"/>'
    '<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">'
    '<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:blipFill><a:blip r:embed="rId5"/></pic:blipFill></pic:pic>'
    "</a:graphicData></a:graphic></wp:inline></w:drawing></w:r>"
)

BODY = "".join([
    para(run("Omsett"), "Title"),
    para(run("What it does"), "Heading1"),
    para(
        run("Drop a file. Pick a format. ") + run("Nothing leaves your device.", "<w:b/>") + run(" It is ") + run("free", "<w:i/>") + run(" and ") + run("open", "<w:b/><w:i/>")
        + run(" source, see ") + '<w:hyperlink r:id="rId4" w:history="1">' + run("omsett.com", LINK_STYLE) + "</w:hyperlink>" + run(".")
    ),
    # Changes tracked: the deleted words must not come back, and the inserted ones must stay.
    para(
        run("Files are ") + '<w:del w:id="1" w:author="Ada"><w:r><w:delText>uploaded to a server</w:delText></w:r></w:del>'
        + f'<w:ins w:id="2" w:author="Ada">{run("converted in the tab")}</w:ins>' + run(".")
        + '<w:commentRangeStart w:id="0"/><w:commentRangeEnd w:id="0"/><w:r><w:commentReference w:id="0"/></w:r>'
        + run(" SECRET-HIDDEN-TEXT", "<w:vanish/>")
    ),
    para(run("What it converts"), "Heading2"),
    para(run("Pictures"), "ListParagraph", (1, 0)),
    para(run("Data"), "ListParagraph", (1, 0)),
    para(run("JSON and CSV"), "ListParagraph", (1, 1)),
    para(run("Workbooks"), "ListParagraph", (1, 1)),
    para(run("Subtitles"), "ListParagraph", (1, 0)),
    para(run("Drop a file"), "ListParagraph", (2, 0)),
    para(run("Pick a format"), "ListParagraph", (2, 0)),
    "<w:tbl><w:tblPr><w:tblW w:w=\"0\" w:type=\"auto\"/></w:tblPr>"
    f"<w:tr><w:trPr><w:tblHeader/></w:trPr>{cell('Format')}{cell('Kind')}</w:tr>"
    f"<w:tr>{cell('PNG')}{cell('Picture')}</w:tr><w:tr>{cell('XLSX')}{cell('Workbook, café 字幕')}</w:tr></w:tbl>",
    para(run("A quotation, set apart."), "Quote"),
    para(PICTURE),
    para(run("E = mc") + run("2", '<w:vertAlign w:val="superscript"/>') + run(", and H") + run("2", '<w:vertAlign w:val="subscript"/>') + run("O, and ") + run("struck", "<w:strike/>") + run(".")),
    para(""),
])

PARTS = {
    "[Content_Types].xml": '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>'
    '<Default Extension="png" ContentType="image/png"/>'
    '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
    '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>'
    '<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>'
    '<Override PartName="/word/comments.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml"/>'
    '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>',
    "_rels/.rels": f'<Relationships xmlns="{PKG}"><Relationship Id="rId1" Type="{R}/officeDocument" Target="word/document.xml"/>'
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>',
    "word/document.xml": f'<w:document xmlns:w="{W}" xmlns:r="{R}"><w:body>{BODY}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/></w:sectPr></w:body></w:document>',
    "word/_rels/document.xml.rels": f'<Relationships xmlns="{PKG}"><Relationship Id="rId1" Type="{R}/styles" Target="styles.xml"/>'
    f'<Relationship Id="rId2" Type="{R}/numbering" Target="numbering.xml"/><Relationship Id="rId3" Type="{R}/comments" Target="comments.xml"/>'
    f'<Relationship Id="rId4" Type="{R}/hyperlink" Target="https://omsett.com" TargetMode="External"/>'
    f'<Relationship Id="rId5" Type="{R}/image" Target="media/image1.png"/></Relationships>',
    # Styles are headings by their names, as Word names them, whatever their ids are.
    "word/styles.xml": f'<w:styles xmlns:w="{W}"><w:docDefaults><w:rPrDefault><w:rPr><w:lang w:val="en-GB"/></w:rPr></w:rPrDefault></w:docDefaults>'
    '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>'
    '<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/></w:style>'
    '<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:pPr><w:outlineLvl w:val="0"/></w:pPr></w:style>'
    '<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:pPr><w:outlineLvl w:val="1"/></w:pPr></w:style>'
    '<w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/></w:style>'
    '<w:style w:type="paragraph" w:styleId="Quote"><w:name w:val="Quote"/></w:style></w:styles>',
    "word/numbering.xml": f'<w:numbering xmlns:w="{W}">'
    '<w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:numFmt w:val="bullet"/></w:lvl><w:lvl w:ilvl="1"><w:numFmt w:val="bullet"/></w:lvl></w:abstractNum>'
    '<w:abstractNum w:abstractNumId="1"><w:lvl w:ilvl="0"><w:numFmt w:val="decimal"/></w:lvl></w:abstractNum>'
    '<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num><w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num></w:numbering>',
    "word/comments.xml": f'<w:comments xmlns:w="{W}"><w:comment w:id="0" w:author="Ada"><w:p><w:r><w:t>SECRET-COMMENT for the editor</w:t></w:r></w:p></w:comment></w:comments>',
    "docProps/core.xml": '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/">'
    "<dc:title>About Omsett</dc:title><dc:creator>SECRET-AUTHOR Ada Lovelace</dc:creator></cp:coreProperties>",
}

path = os.path.join(FIXTURES, "docx/sample.docx")
os.makedirs(os.path.dirname(path), exist_ok=True)
with open(os.path.join(FIXTURES, "_cases/tiny-1x1.png"), "rb") as f:
    picture = f.read()
with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as archive:
    for name, body in PARTS.items():
        info = zipfile.ZipInfo(name, (2026, 11, 23, 12, 0, 0))
        info.compress_type = zipfile.ZIP_DEFLATED
        archive.writestr(info, (HEAD + body).encode("utf-8"))
    info = zipfile.ZipInfo("word/media/image1.png", (2026, 11, 23, 12, 0, 0))
    archive.writestr(info, picture)
print(f"docx/sample.docx: {os.path.getsize(path)} bytes")
