import java.awt.Rectangle;
import java.io.FileOutputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import org.apache.poi.hslf.usermodel.*;
import org.apache.poi.sl.usermodel.PictureData.PictureType;
import org.apache.poi.sl.usermodel.Placeholder;

// Writes fixtures/ppt/from-poi.ppt with Apache POI, a program that knows nothing of Omsett,
// holding what fixtures/pptx/sample.pptx holds. POI keeps a placeholder's text in its shape,
// where PowerPoint keeps it in a list beside the slides, so the two samples test both.
//
// POI 5.3.0 and what it needs, from Maven Central, in a folder named lib:
//   poi, poi-scratchpad, commons-io, commons-collections4, commons-math3, commons-codec,
//   log4j-api, SparseBitSet
//   java -cp "lib/*" fixtures/_tools/PptSample.java fixtures/png/sample.png fixtures/ppt/from-poi.ppt
//
// The file it writes is committed, so this is run only to make it again.
public class PptSample {
  public static void main(String[] args) throws Exception {
    HSLFSlideShow ppt = new HSLFSlideShow();

    HSLFSlide one = ppt.createSlide();
    HSLFTextBox t1 = one.addTitle();
    t1.setText("Omsett");
    HSLFTextBox sub = new HSLFTextBox();
    one.addShape(sub);
    sub.setPlaceholder(Placeholder.SUBTITLE);
    sub.setText("Drop a file. Pick a format.");
    sub.setAnchor(new Rectangle(100, 300, 500, 60));

    HSLFSlide two = ppt.createSlide();
    two.addTitle().setText("What it converts");
    HSLFTextBox body = new HSLFTextBox();
    two.addShape(body);
    body.setPlaceholder(Placeholder.BODY);
    body.setAnchor(new Rectangle(50, 120, 600, 300));
    body.setText("Pictures");
    HSLFTextRun data = body.appendText("Data, such as ", true);
    HSLFTextRun json = body.appendText("JSON", false);
    json.setBold(true);
    HSLFTextRun and = body.appendText(" and ", false);
    and.setBold(false);
    HSLFTextRun csv = body.appendText("CSV", false);
    csv.setBold(false);
    csv.setItalic(true);
    for (String w : new String[] {"Workbooks", "Contacts", "See "}) { HSLFTextRun r = body.appendText(w, true); r.setBold(false); r.setItalic(false); }
    HSLFTextRun site = body.appendText("omsett.com", false);
    site.createHyperlink().linkToUrl("https://omsett.com");
    java.util.List<HSLFTextParagraph> ps = body.getTextParagraphs();
    for (HSLFTextParagraph p : ps) p.setBullet(true);
    ps.get(2).setIndentLevel(1);
    ps.get(3).setIndentLevel(1);
    HSLFTextBox drawn = new HSLFTextBox();
    two.addShape(drawn);
    drawn.setText("Nothing leaves your device.");
    drawn.setAnchor(new Rectangle(50, 450, 400, 40));

    HSLFSlide hidden = ppt.createSlide();
    hidden.addTitle().setText("SECRET-HIDDEN-SLIDE");
    hidden.setHidden(true);

    HSLFSlide three = ppt.createSlide();
    three.addTitle().setText("A picture and a table, café 字幕");
    byte[] png = Files.readAllBytes(Path.of(args[0]));
    HSLFPictureData pd = ppt.addPicture(png, PictureType.PNG);
    HSLFPictureShape pic = three.createPicture(pd);
    pic.setAnchor(new Rectangle(50, 120, 100, 50));
    byte[] alt = ("The Omsett mark: a word in white with a blue square" + "\0").getBytes(java.nio.charset.StandardCharsets.UTF_16LE);
    org.apache.poi.ddf.EscherComplexProperty d = new org.apache.poi.ddf.EscherComplexProperty(org.apache.poi.ddf.EscherPropertyTypes.GROUPSHAPE__DESCRIPTION, false, alt.length);
    d.setComplexData(alt);
    pic.getEscherOptRecord().addEscherProperty(d);
    HSLFTable table = three.createTable(3, 2);
    String[][] cells = {{"Format", "Kind"}, {"PNG", "Picture"}, {"XLSX", "Workbook"}};
    for (int r = 0; r < 3; r++) for (int c = 0; c < 2; c++) table.getCell(r, c).setText(cells[r][c]);
    table.moveTo(50, 250);

    ppt.getSummaryInformation().setTitle("About Omsett");
    ppt.getSummaryInformation().setAuthor("SECRET-AUTHOR");
    try (FileOutputStream out = new FileOutputStream(args[1])) { ppt.write(out); }
  }
}
