import sys, docx
d = docx.Document(sys.argv[1])
def cells(t):
    for r in t.rows:
        yield " | ".join(c.text.strip().replace("\n"," ") for c in r.cells)
body = d.element.body
from docx.table import Table
from docx.text.paragraph import Paragraph
for child in body.iterchildren():
    if child.tag.endswith('}p'):
        p = Paragraph(child, d)
        t = p.text.strip()
        if t: print(("[%s] " % p.style.name) + t)
    elif child.tag.endswith('}tbl'):
        for line in cells(Table(child, d)): print("    TBL: " + line)
