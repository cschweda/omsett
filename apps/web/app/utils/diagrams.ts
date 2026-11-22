// Mermaid source for the diagrams on the Technical details page. They describe how a
// conversion works, not which formats exist, so they change only when the process does.

export const pipeline = `flowchart TD
  drop["File dropped, chosen, or pasted"] --> identify["Identify by contents<br/>(first bytes, never the name)"]
  identify -->|not recognized| unsupported["Shown as: Unsupported format"]
  identify -->|recognized| guard["Read the size from the header<br/>(nothing is decoded yet)"]
  guard -->|too large| refused["Refused, with the reason"]
  guard -->|fine| route["Look up a route in the registry"]
  route -->|none| none["Target is dimmed, with the reason"]
  route -->|found| fits["Will the target hold a picture this size?"]
  fits -->|no| refused
  fits -->|yes| verify["Is the file sound?<br/>(its structure is checked,<br/>or a strict engine reads it)"]
  verify -->|damaged| failed
  verify -->|sound| engine["Convert in a background worker"]
  engine -->|fails| failed["Shown as: couldn't be converted"]
  engine -->|runs past its time limit| stopped["Worker stopped;<br/>shown as: took too long"]
  engine -->|succeeds| result["Result: download and compare"]
`

export const engines = `flowchart TD
  ask["A conversion is needed"] --> probe{"Is the file a PNG that passes<br/>the structure check, and can the<br/>browser's encoder write the target?"}
  probe -->|"yes, and the picture is<br/>within the canvas limit"| canvas["Canvas engine<br/>nothing to download"]
  probe -->|no| vips["libvips engine<br/>fetched once, then cached"]
  canvas -->|"fails, or returns<br/>the wrong format"| vips
  canvas --> done["Output checked, then returned"]
  vips --> done
`

export const boundaries = `flowchart LR
  subgraph device["Your device: one browser tab"]
    page["The page<br/>shows files and results"]
    thumb["Preview worker<br/>decodes pictures for display"]
    work["Engine worker<br/>does the conversion"]
    page <-->|"files and results,<br/>in memory"| thumb
    page <-->|"files and results,<br/>in memory"| work
  end
  site["omsett.com<br/>static files only"] -->|"the app and its engines,<br/>downloaded once"| device
  device -. "your files: never sent,<br/>and blocked by policy" .-x site
`
