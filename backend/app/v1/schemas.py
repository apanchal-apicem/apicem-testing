"""Hand-ported from the new frontend's `packages/api-contract/src/{entities,requests}.ts` --
there's no automatic zod-to-Pydantic bridge, so this is a careful, field-by-field port, not a
generated one. One Pydantic model per TS interface; zod's extra validation (`.min()`/`.max()`/
closed enums) becomes Pydantic `Field(...)`/`Literal[...]` constraints, same job, different
language. Grows one phase at a time -- only what each phase actually needs is added here, not
the whole contract up front (matching this app's own "no speculative abstraction" convention).

Field names stay camelCase (matching the TS contract exactly) via `alias_generator` + populate-
by-name, since the frontend never changes to accommodate the backend -- this is the one place
Python's usual snake_case convention deliberately loses.
"""
from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


class ContractModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


# entities.ts: Role = "owner" | "admin" | "editor" | "viewer" -- Phase 1's real per-membership
# roles (app.workspace_memberships.role) use this exact 4-value set; nothing maps to "admin"
# anymore. Kept as a plain str (not Literal) since the DB CHECK constraint is the actual
# source of truth for validity, same as the old role column's relationship to ROLE_RANK.
Role = str


class User(ContractModel):
    id: str
    name: str
    email: str
    role: Role
    avatar_color: str


class Workspace(ContractModel):
    id: str
    name: str
    slug: str
    plan: str
    member_count: int


class WorkspaceSummary(ContractModel):
    id: str
    name: str
    slug: str
    plan: str
    my_role: Role


# requests.ts: createWorkspaceInputSchema = z.object({ name: z.string().min(1).max(80) }).
class CreateWorkspaceInput(ContractModel):
    name: str = Field(min_length=1, max_length=80)
