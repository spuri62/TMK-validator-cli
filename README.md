# TMK Model JSON Validator (CLI)

A command-line tool to validate **Task.json**, **Method.json**, and **Knowledge.json** files against their respective JSON schemata using **Ajv** (JSON schema validator) with **ajv-formats** for extended format support. Includes scoring, stats aggregation, and optional auto-fixes.

---

## Suggested Usage
From the project root:
```bash
npm install # Install dependencies
node src/validator.js path/to/models/dir --detailed --stats # Show detailed checks and aggregated stats
```

**Example:**
```bash
node src/validator.js Models --detailed --stats
```

Here, `(project_root)/Models/` contains the TMK models to be evaluated.

---

## Models Directory
- A folder containing **Task.json**, **Method.json**, and **Knowledge.json**
- OR a folder containing multiple such subfolders

---

## Full List of Supported CLI Flags
- `--detailed` : Displays validation results per-field instead of the default per-component  
- `--raw`      : Raw validation results (useful for debugging some errors, when detailed mode fails)  
- `--stats`    : Displays aggregated schema compliance stats  
- `--fix`      : Fixes trivial errors  

---
