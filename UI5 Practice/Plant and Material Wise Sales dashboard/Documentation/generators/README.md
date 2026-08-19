# Documentation generators

The three `.docx` in the parent directory are **generated**, not hand-edited. Editing the Word
files directly is a dead end: the next regeneration overwrites them.

| Script | Produces |
|---|---|
| `gen_fs.py` | `PMS_Dashboard_Functional_Documentation.docx` |
| `gen_ts.py` | `PMS_Dashboard_Technical_Documentation.docx` |
| `gen_um.py` | `PMS_Dashboard_User_Manual.docx` |
| `docbuild.py` | Shared builder — styles, headings, tables, code blocks, callouts |
| `dumpdoc.py` | Dumps a `.docx` back to plain text, for diffing and for checking that a change actually landed |

## Regenerating

Needs `python-docx`. Each generator takes its output path as the single argument:

```sh
export PYTHONIOENCODING=utf-8          # the documents contain the rupee sign
python gen_fs.py ../PMS_Dashboard_Functional_Documentation.docx
python gen_ts.py ../PMS_Dashboard_Technical_Documentation.docx
python gen_um.py ../PMS_Dashboard_User_Manual.docx
```

`PYTHONIOENCODING` matters on Windows: without it the console defaults to cp1252 and any script
that prints a rupee sign dies with a `UnicodeEncodeError` partway through.

## Verifying a change landed

Regenerating silently is the failure mode to guard against — a patch that missed its anchor leaves
the old text in place and the script still reports success. Dump and grep:

```sh
python dumpdoc.py ../PMS_Dashboard_Technical_Documentation.docx > /tmp/ts.txt
grep -n "the phrase you expected to remove" /tmp/ts.txt   # should be empty
```

## Where the content comes from

These scripts hold the prose. The source of truth for the *facts* is the code and, for decisions,
`../CONTEXT_LOG.md` §6 (the OD-n list) and `../ABAP_Backend_Plan.md` Part D. When a decision is
made, record it there first and then reflect it here — the numbered OD-n IDs are what tie a line
of ABAP comment to its rationale.
