#!/usr/bin/env python3
"""Writes RTF documents.

    python3 fixtures/_tools/rtf.py        writes fixtures/rtf/sample.rtf

Standard library only, and the same bytes every time. sample.rtf is laid out as Word lays one
out: headings by their level in the outline, bold and slanted words, a link as a field, a footnote, a list
of bullets with a list inside it, a numbered list, a table whose first row repeats as its
heading, a picture, and letters beyond those of Western Europe given by number.

It also holds what must not come out: words deleted with changes tracked, hidden words, a
comment, a field that would include a file from the computer, an embedded object,
and the author's name. One made by another program is beside it (from-macos.rtf, written by
macOS's textutil).

It is also how the traps for this format are made (make-traps.py).
"""
import os

FIXTURES = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def letters(text):
    """Text as RTF writes it: braces and backslashes marked, and every letter past 127 by its number."""
    out = ""
    for char in text:
        code = ord(char)
        if char in "\\{}":
            out += "\\" + char
        elif code < 128:
            out += char
        elif code < 0x10000:
            out += "\\u%d?" % (code if code < 32768 else code - 65536)
        else:
            # Past the first plane, a letter is written as the two halves UTF-16 makes of it.
            code -= 0x10000
            for half in (0xD800 + (code >> 10), 0xDC00 + (code & 0x3FF)):
                out += "\\u%d?" % (half - 65536)
    return out


def para(inner, *settings):
    return "{\\pard %s %s\\par}\n" % ("".join(settings), inner)


def heading(text, level):
    return para("\\b\\fs%d %s" % (36 - 4 * level, letters(text)), "\\outlinelevel%d" % level)


def link(text, address):
    return '{\\field{\\*\\fldinst{HYPERLINK "%s"}}{\\fldrslt{\\ul %s}}}' % (address, letters(text))


LISTS = ("{\\*\\listtable"
         "{\\list\\listtemplateid1\\listhybrid{\\listlevel\\levelnfc23\\levelstartat1{\\leveltext\\'01\\u8226 ?;}{\\levelnumbers;}\\fi-360\\li720}"
         "{\\listlevel\\levelnfc23\\levelstartat1{\\leveltext\\'01\\u9702 ?;}{\\levelnumbers;}\\fi-360\\li1440}\\listid1}"
         "{\\list\\listtemplateid2\\listhybrid{\\listlevel\\levelnfc0\\levelstartat1{\\leveltext\\'02\\'00.;}{\\levelnumbers\\'01;}\\fi-360\\li720}\\listid2}}\n"
         "{\\*\\listoverridetable{\\listoverride\\listid1\\listoverridecount0\\ls1}{\\listoverride\\listid2\\listoverridecount0\\ls2}}\n")


def item(text, listed, level=0, mark="\\u8226 ?"):
    return "{\\pard\\ls%d\\ilvl%d\\fi-360\\li%d {\\listtext\\tab %s\\tab}%s\\par}\n" % (listed, level, 720 * (level + 1), mark, letters(text))


def table(rows, headed=True):
    out = ""
    for n, row in enumerate(rows):
        out += "\\trowd%s" % ("\\trhdr" if headed and n == 0 else "") + "".join("\\cellx%d" % (2880 * (i + 1)) for i in range(len(row)))
        out += "".join("\\pard\\intbl %s\\cell" % (("\\b " if headed and n == 0 else "") + letters(cell)) for cell in row) + "\\row\n"
    return out + "\\pard\n"


def picture(path):
    with open(path, "rb") as f:
        data = f.read().hex()
    return "{\\pict\\pngblip\\picw16\\pich8 %s}" % data


def document(body, title="About Omsett", author="SECRET-AUTHOR", language=2057, extra_head=""):
    head = "{\\rtf1\\ansi\\ansicpg1252\\deff0\\deflang%d{\\fonttbl{\\f0\\fswiss Helvetica;}}\n" % language
    info = "{\\info{\\title %s}{\\author %s}{\\operator %s}}\n" % (letters(title), letters(author), letters(author))
    return (head + info + LISTS + extra_head + body + "}\n").encode("latin-1")


def sample():
    body = "".join([
        heading("What it does", 0),
        para("{\\b Nothing leaves your device.} It is {\\i free} and {\\b\\i open} source; see " + link("omsett.com", "https://omsett.com") + "."),
        # A deletion with changes tracked, hidden words, a comment, a footnote: none comes out.
        para("Files are converted {\\deleted SECRET-DELETED }in the tab.{\\v  SECRET-HIDDEN-WORDS}"
             "{\\*\\annotation{\\*\\atnid SA}SECRET-COMMENT}{\\super\\chftn{\\footnote\\pard\\plain\\chftn A footnote, which is kept.}}"),
        para("{\\field{\\*\\fldinst INCLUDETEXT \"C:\\\\\\\\secrets.txt\"}{\\fldrslt Included words.}}"),
        para("{\\object\\objemb{\\*\\objclass Package}{\\*\\objdata 01050000020000000800000050616e6b616765SECRET-OBJECT}}"),
        heading("What it converts", 1),
        item("Pictures", 1),
        item("Data", 1),
        item("JSON and CSV", 1, 1, "\\u9702 ?"),
        item("Workbooks", 1, 1, "\\u9702 ?"),
        item("Subtitles", 1),
        item("Drop a file", 2, 0, "1."),
        item("Pick a format", 2, 0, "2."),
        table([["Format", "Kind"], ["PNG", "Picture"], ["XLSX", "Workbook"]]),
        para(picture(os.path.join(FIXTURES, "png", "sample.png"))),
        para(letters("Café 字幕, and a line") + "\\line " + letters("broken in two.")),
    ])
    return document(body)


if __name__ == "__main__":
    full = os.path.join(FIXTURES, "rtf", "sample.rtf")
    os.makedirs(os.path.dirname(full), exist_ok=True)
    with open(full, "wb") as out:
        out.write(sample())
    print(f"rtf/sample.rtf: {os.path.getsize(full)} bytes")
