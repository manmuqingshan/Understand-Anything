# FastAPI / Flask Framework Addendum

> Injected into file-analyzer and architecture-analyzer prompts when FastAPI or Flask is detected.
> Do NOT use as a standalone prompt — always appended to the base prompt template.

## FastAPI Project Structure

When analyzing a FastAPI project, apply these additional conventions on top of the base analysis rules.

### Canonical File Roles — FastAPI

| File / Pattern | Role | Tags |
|---|---|---|
| `main.py`, `app.py` | Application factory — creates and configures the `FastAPI()` instance | `entry-point`, `config` |
| `*/routers/*.py`, `*/api/*.py` | `APIRouter` modules — group related endpoints by domain | `api-handler`, `routing` |
| `*/schemas.py`, `*/schemas/*.py` | Pydantic request/response models | `type-definition`, `serialization` |
| `*/models.py`, `*/models/*.py` | SQLAlchemy ORM models or other DB models | `data-model` |
| `*/dependencies.py`, `*/deps.py` | `Depends()` provider functions — shared logic injected into routes | `service`, `middleware` |
| `*/crud.py`, `*/repository.py` | Database access layer — CRUD operations | `data-model`, `service` |
| `*/database.py`, `*/db.py` | DB engine, session factory, connection management | `config`, `data-model` |
| `*/config.py`, `*/settings.py` | `pydantic-settings` / `BaseSettings` config classes | `config` |
| `*/middleware.py` | Starlette middleware classes | `middleware` |
| `*/exceptions.py` | Custom exception classes and exception handlers | `utility` |
| `*/security.py`, `*/auth.py` | Auth utilities — JWT decoding, password hashing, OAuth helpers | `service`, `middleware` |
| `*/tasks.py` | Background tasks or Celery task definitions | `service`, `event-handler` |
| `*/tests/*.py`, `test_*.py` | pytest test files | `test` |
| `conftest.py` | pytest fixtures and test configuration | `test`, `config` |

### Edge Patterns to Look For — FastAPI

**Router inclusion chain** — When `app.include_router(some_router, prefix="/api")` appears in `main.py` or a router aggregator, create `imports` + `depends_on` edges from the main app file to each router module. This builds the URL hierarchy graph.

**Dependency injection tree** — When a route function or another `Depends()` provider imports and calls `Depends(some_function)`, create `depends_on` edges from the caller to the dependency provider. Trace these chains — they often span multiple files (e.g., route → auth dependency → DB session dependency).

**Pydantic model inheritance** — When a schema class inherits from another (e.g., `class UserCreate(UserBase)`), create `inherits` edges between the schema class nodes.

**ORM model relationships** — When SQLAlchemy models use `relationship()`, `ForeignKey`, create `depends_on` edges between the model classes.

**CRUD-to-model binding** — When a `crud.py` function takes a model type as an argument or directly references a model class, create `depends_on` edges from the CRUD file to the model file.

### Architectural Layers for FastAPI

| Layer ID | Layer Name | What Goes Here |
|---|---|---|
| `layer:api` | API Layer | Router files, endpoint functions with `@router.get/post/...` decorators |
| `layer:types` | Types Layer | Pydantic schema files, request/response models |
| `layer:service` | Service Layer | `dependencies.py`, `crud.py`, business logic modules |
| `layer:data` | Data Layer | ORM models, `database.py`, migrations |
| `layer:config` | Config Layer | `main.py` / `app.py` factory, `settings.py`, `config.py` |
| `layer:middleware` | Middleware Layer | `middleware.py`, `security.py`, `auth.py`, exception handlers |
| `layer:test` | Test Layer | `tests/`, `conftest.py` |

### Notable Patterns to Capture in languageLesson

- **Dependency injection as composition**: FastAPI's `Depends()` is a first-class DI system — a route can declare any number of dependencies, each of which can have their own dependencies, forming a tree resolved at request time
- **Pydantic for validation**: Request bodies, query params, and path params are automatically validated by Pydantic — invalid input raises `422 Unprocessable Entity` before your code runs
- **Async endpoints**: `async def` routes run in the event loop; `def` routes run in a threadpool — mixing them incorrectly can cause performance issues
- **Path operation order**: FastAPI matches routes in declaration order; a catch-all route before a specific one will shadow it

---

## Flask Project Structure

When analyzing a Flask project, apply these additional conventions on top of the base analysis rules.

### Canonical File Roles — Flask

| File / Pattern | Role | Tags |
|---|---|---|
| `app.py`, `__init__.py` (in app package) | Application factory (`create_app()`) or direct `Flask(__name__)` instance | `entry-point`, `config` |
| `run.py`, `wsgi.py` | Production/dev server entry point | `entry-point`, `config` |
| `*/views.py`, `*/routes.py` | Route handler functions with `@app.route` or `@blueprint.route` | `api-handler`, `routing` |
| `*/blueprints/*.py`, `*/api/*.py` | Blueprint modules — group routes by feature | `api-handler`, `routing` |
| `*/models.py` | SQLAlchemy models or other ORM models | `data-model` |
| `*/forms.py` | WTForms form classes | `validation`, `ui` |
| `*/schemas.py` | Marshmallow serialization schemas | `serialization`, `type-definition` |
| `*/config.py` | Config classes (`DevelopmentConfig`, `ProductionConfig`) | `config` |
| `*/extensions.py` | Flask extension initialization (`db = SQLAlchemy()`, `login_manager = LoginManager()`) | `config`, `singleton` |
| `*/decorators.py` | Custom route decorators (auth guards, rate limiting) | `middleware`, `utility` |
| `*/utils.py`, `*/helpers.py` | Shared utility functions | `utility` |
| `*/templates/**/*.html` | Jinja2 templates | `ui` |
| `*/static/` | CSS, JS, and asset files | `assets` |
| `*/tests/*.py`, `test_*.py` | pytest or unittest test files | `test` |

### Edge Patterns to Look For — Flask

**Blueprint registration** — When `app.register_blueprint(bp, url_prefix='/api')` appears in the application factory, create `depends_on` edges from the app factory to each blueprint module.

**Extension coupling** — When a view imports from `extensions.py` (e.g., `from .extensions import db, login_manager`), create `imports` edges to show which views depend on which extensions.

**Before/after request hooks** — When `@app.before_request` or `@blueprint.before_request` decorates a function, create `middleware` edges from those functions to the app/blueprint they attach to.

### Architectural Layers for Flask

| Layer ID | Layer Name | What Goes Here |
|---|---|---|
| `layer:api` | API Layer | Blueprint route files, view functions |
| `layer:data` | Data Layer | `models.py`, database migration files |
| `layer:service` | Service Layer | Business logic modules, `schemas.py`, service classes |
| `layer:ui` | UI Layer | `templates/`, `forms.py`, `static/` |
| `layer:config` | Config Layer | `app.py` factory, `config.py`, `extensions.py` |
| `layer:middleware` | Middleware Layer | `decorators.py`, before/after request hooks |
| `layer:test` | Test Layer | Test files, `conftest.py` |

### Notable Patterns to Capture in languageLesson

- **Application factory pattern**: `create_app()` functions allow multiple app instances (e.g., for testing) and delay extension initialization — avoids circular imports
- **Blueprint modularity**: Blueprints group related routes, templates, and static files; they are registered on the app with a URL prefix, making them independently testable
- **Flask extension protocol**: Extensions follow `init_app(app)` for lazy initialization — the extension object is created globally but bound to an app instance later
