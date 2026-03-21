# Python Codebase Support — Change Review Guide

This document explains every change made to add Python and Python framework support. It is written for a reviewer who wants to verify correctness, spot regressions, and understand the rationale for each decision.

---

## Background: What Was Wrong

The tool worked well for TypeScript/JavaScript codebases. For Python codebases it would:
- Fail to detect frameworks (Django, FastAPI, Flask) — `frameworks: []` always
- Miss common Python entry points (`manage.py`, `app.py`, `wsgi.py`) — defaulting to no entry point
- Score Python entry points much lower than TS equivalents in the tour builder (4 Python patterns vs 8 JS/TS patterns)
- Miss Python's `__init__.py` as a barrel/entry-point equivalent (only `index.ts`/`index.js` were recognized)
- Have no layer guidance for FastAPI or Flask (only Django had a brief mention)
- Ignore `pyproject.toml` for project name extraction

The bias was **only in agent prompts** (markdown files). The graph schema, dashboard, search engine, and core plugin architecture are language-agnostic and required no changes.

---

## Files Changed

### 1. `project-scanner-prompt.md`

**What changed:**

**Step 5 (Framework Detection)** — Extended the Python manifest reading from "confirms Python project" to actually detecting frameworks:
- `requirements.txt`: now reads line-by-line, strips version specifiers, and matches against a Python framework keyword list: `django`, `djangorestframework`, `fastapi`, `flask`, `sqlalchemy`, `alembic`, `celery`, `pydantic`, `uvicorn`, `gunicorn`, `aiohttp`, `tornado`, `starlette`, `pytest`, `hypothesis`, `channels`
- `pyproject.toml`: now parses `[project].dependencies` and `[tool.poetry.dependencies]`, applies the same keyword matching, and also checks for `[tool.pytest.ini_options]` (pytest) and `[tool.django]` (Django)
- `setup.py`, `setup.cfg`, `Pipfile`: now apply the same Python framework keyword matching

**Step 7 (Project Name)** — Added `pyproject.toml` to the priority order between `go.mod` and directory name. Checks `[project].name` first, then `[tool.poetry].name`.

**Why:** Without framework detection, `frameworks: []` is passed to every downstream agent. The framework-specific guidance injected in Phase 2 and Phase 4 of SKILL.md is only useful when `frameworks` is non-empty.

**Regression risk:** None. The JS framework detection in `package.json` is unchanged. The Python additions are additive.

**How to verify:** Run `/understand` on a Django project with `requirements.txt` containing `django`. Check that `scan-result.json` has `frameworks: ["Django"]`.

---

### 2. `SKILL.md`

**What changed:**

**Phase 0 (entry point detection, line 57)** — Added Python entry points to the pattern list:
- Before: `src/index.ts`, `src/main.ts`, `src/App.tsx`, `main.py`, `main.go`, `src/main.rs`, `index.js`
- After: added `manage.py`, `app.py`, `wsgi.py`, `asgi.py`, `run.py`, `__main__.py`

**Why:** A Django project's real entry point is `manage.py`. A FastAPI/Flask project uses `app.py` or `run.py`. Without these, `$ENTRY_POINT` is empty for most Python projects, and the tour builder gets no starting hint.

**Phase 2 (file-analyzer framework guidance)** — Extended the inline framework hints:
- Django: added `serializers.py`, `signals.py`, `admin.py`, `migrations/` descriptions
- Added FastAPI: describes `@router` decorator files, Pydantic schemas, `Depends()` providers
- Added Flask: describes `@blueprint.route`, `blueprints/`, SQLAlchemy `models.py`
- Added addendum injection: if `Django` detected, reads `./django-analyzer-addendum.md` and appends to the file-analyzer prompt. If `FastAPI` or `Flask` detected, reads `./fastapi-analyzer-addendum.md` and appends.

**Phase 4 (architecture-analyzer framework hints)** — Extended the inline layer hints:
- Django: added `serializers.py`, `signals.py`, `migrations/` → specific layers
- Added FastAPI: router files → API, Pydantic schemas → Types, `dependencies.py` → Service, DB files → Data
- Added Flask: blueprint route files → API, `models.py` → Data, `forms.py` → UI, `extensions.py` → Config
- Added addendum injection: same logic as Phase 2

**Regression risk:** Low. The addendum injection only triggers when those frameworks are in the detected list. The inline guidance additions are additive strings — they don't change the structure of the injected context.

**How to verify:**
- Run on a FastAPI project: check `layers.json` has a `layer:types` or `layer:api` with Pydantic schema files assigned correctly
- Run on a TS project: check that no Django/FastAPI addendum content appears in the analysis (it shouldn't, since `frameworks` won't contain those values)

---

### 3. `architecture-analyzer-prompt.md`

**What changed:**

**Directory pattern table** — Added Python-specific directory names:

| Added | Pattern Label | Why |
|-------|---------------|-----|
| `migrations` | `data` | Django/Alembic migration directories hold schema history — Data Layer |
| `management`, `commands` | `config` | Django management command directories |
| `templatetags` | `utility` | Django custom template tag directories |
| `signals` | `service` | Signal handler modules — cross-cutting service logic |
| `serializers` | `api` | DRF serializer directories |

**File-level pattern matching** — Three changes:
1. Added `test_*.py` to the test pattern (Python's `pytest` naming convention)
2. Added `__init__.py` at a directory root → `entry` pattern (Python package barrel equivalent of `index.ts`)
3. Added `manage.py` → `entry` and `wsgi.py`/`asgi.py` → `config`
4. Clarified `*.d.ts → types` with "(TypeScript declaration files only)" — making it explicit this is TS-specific so an LLM doesn't misapply it to Python

**Why:** Without `__init__.py → entry`, the architecture analyzer would never recognize any Python file as an entry point via file-level patterns. The `hooks` pattern label was left as-is (it won't trigger on Python projects since they don't conventionally have a `hooks/` directory).

**Note on Node.js script:** The architecture analyzer's structural analysis script is hardcoded to `node`. This is correct to leave as-is — the script processes the JSON graph structure (file nodes, import edges), not the source language of the codebase being analyzed. The script's input/output is always JSON regardless of whether the project is Python or TypeScript.

**Regression risk:** Very low. Added rows to the directory pattern table and clarified file-level pattern descriptions. No existing patterns were removed or modified.

**How to verify:** Run on a Django project. Check that `migrations/` directory files land in `layer:data` and that `manage.py` gets tagged `entry`.

---

### 4. `tour-builder-prompt.md`

**What changed:**

**Entry point candidate scoring (Section C)** — Added Python entry points to the +3 filename list:
- Added: `manage.py`, `app.py`, `wsgi.py`, `asgi.py`, `run.py`, `__main__.py`

Before this change, the entry point scoring had 8 TS/JS patterns vs 4 for all other languages. After: 8 TS/JS + 6 Python + 4 others.

**Why:** The tour builder uses entry point scores to decide Step 1 of the tour. For a Django project where `manage.py` exists, it should score highly. Without this, the tour might start from a random high-fan-in utility file instead of the actual entry point.

**The `languageLesson` example** was left as-is (TypeScript barrel files). This is just an illustrative example in the output format section — it does not affect how Python tours are generated. The language lessons section already lists Python-specific patterns (decorators, generators, context managers, metaclasses, protocols).

**Regression risk:** None. The scoring list is additive. TS/JS entry points retain their +3 scores.

**How to verify:** Run on a Django project. Check that `tour.json` starts from `manage.py` or `apps.py`/`wsgi.py` rather than a utility file.

---

### 5. `file-analyzer-prompt.md`

**What changed:**

**Tags indicators — barrel/entry-point detection** — Extended the `index.ts` rule:
- Before: `Named index.ts at a directory root with re-exports = entry-point`
- After: Added `__init__.py` at a package root with imports or re-exports = `entry-point`, and `manage.py` = `entry-point`

**Script execution example** — Added the Python equivalent command alongside the Node.js example. The base prompt already says "Choose the best language for this task — Node.js is recommended for TypeScript/JavaScript projects, Python for Python projects" (line 15), but the execution example only showed `node`. This created a contradiction. Now both are shown.

**Regression risk:** None. Additive changes only.

**How to verify:** Run on a Python project with a package structure. Check that `__init__.py` files at package roots get the `entry-point` or `barrel` tag rather than being treated as empty boilerplate files.

---

## New Files Created

### `django-analyzer-addendum.md`

A detailed reference injected into the file-analyzer and architecture-analyzer when Django is detected. Contains:
- Canonical file roles table (15+ Django file types with appropriate tags)
- Edge patterns to look for (URL routing graph, signal wiring, ORM relationships, serializer→model binding)
- Layer assignment guide (7 layers: api, data, service, ui, middleware, config, test)
- Notable `languageLesson` patterns (fat models, ORM lazy evaluation, CBV mixins, signal anti-patterns, app isolation)

**How it's injected:** SKILL.md reads this file and appends it to the base `file-analyzer-prompt.md` and `architecture-analyzer-prompt.md` content when `Django` appears in the detected frameworks list.

### `fastapi-analyzer-addendum.md`

A detailed reference for FastAPI and Flask projects, injected when either framework is detected. Contains two sections:

**FastAPI section:**
- Canonical file roles (router files, Pydantic schemas, CRUD, dependencies, database session)
- Edge patterns (router inclusion chain, DI tree, Pydantic inheritance, CRUD→model binding)
- Layer assignment guide (7 layers)
- Notable `languageLesson` patterns (DI as composition, Pydantic validation, async vs sync, route order)

**Flask section:**
- Canonical file roles (blueprints, application factory, WTForms, Marshmallow)
- Edge patterns (blueprint registration, extension coupling, before/after request hooks)
- Layer assignment guide
- Notable `languageLesson` patterns (factory pattern, blueprint modularity, extension `init_app` protocol)

**How it's injected:** Same mechanism as the Django addendum — SKILL.md appends it when `FastAPI` or `Flask` is in the detected frameworks list.

---

## What Was NOT Changed (And Why)

| Component | Rationale |
|-----------|-----------|
| Graph schema (`types.ts`, `schema.ts`) | Already language-agnostic. All 18 edge types work for Python patterns. |
| `packages/core/src/plugins/tree-sitter-plugin.ts` | Still TS/JS only. Adding Python tree-sitter support is Phase 3 (separate PR). |
| `packages/core/src/plugins/registry.ts` | Extension map already has `.py → python`. A Python plugin will register here in Phase 3. |
| `packages/core/src/analyzer/language-lesson.ts` | Concept detection patterns. Phase 3 work. |
| Dashboard, search engine, skills | Already language-agnostic. |
| `tour-builder-prompt.md` language lessons example | The TypeScript barrel file example is illustrative only. Python tours will produce Python-specific `languageLesson` strings based on the language-lessons list (which already includes Python patterns). |
| Architecture analyzer `node` script execution | The script analyzes the graph JSON, not the source language. `node` is always correct here. |
| `hooks` directory pattern label | React-specific but harmless — Python projects don't conventionally have `hooks/` directories, so this label will never trigger on Python codebases. |

---

## Testing Checklist for Reviewer

For a Django project (e.g., a real Django app with `requirements.txt`):
- [ ] `scan-result.json` has `frameworks: ["Django"]` (or similar)
- [ ] `manage.py` is detected as `$ENTRY_POINT` in SKILL.md Phase 0
- [ ] `manage.py` node gets tags including `entry-point`
- [ ] `urls.py` files get `api-handler`, `routing` tags
- [ ] `models.py` files get `data-model` tag
- [ ] `migrations/` directory files land in `layer:data`
- [ ] Tour Step 1 starts from `manage.py` or `wsgi.py`
- [ ] No TypeScript-specific guidance appears in the analysis output

For a FastAPI project:
- [ ] `scan-result.json` has `frameworks: ["FastAPI"]`
- [ ] Router files get `api-handler`, `routing` tags
- [ ] Pydantic schema files get `type-definition`, `serialization` tags
- [ ] `dependencies.py` or `deps.py` gets `service` tag
- [ ] `depends_on` edges appear between router files and their dependencies
- [ ] `layer:types` exists with schema files

For an existing TypeScript project (regression check):
- [ ] No Django/FastAPI addendum content appears in analysis
- [ ] `frameworks: ["React"]` (or whatever was there before) unchanged
- [ ] `src/index.ts` still detected as entry point
- [ ] All existing layer assignments and tour steps unchanged
