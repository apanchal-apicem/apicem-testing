import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, ChevronLeft, PartyPopper } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import {
  sourceTypes,
  type SourceTypeMeta,
} from "@/features/sources/source-meta";
import { connectFields } from "@/features/sources/connect-fields";
import { SchemaTablesList } from "@/features/sources/schema-tables-list";
import { useCreateDataSource, useDataSourceSchema } from "@/api/hooks";
import { isMockMode } from "@/api/client";
import type { DataSourceType } from "@apicem/api-contract";

const categories = ["Warehouse", "Commerce", "Finance", "Spreadsheet"] as const;

function TypeGrid({ onSelect }: { onSelect: (type: SourceTypeMeta) => void }) {
  return (
    <div className="space-y-7">
      {categories.map((category) => {
        // Shopify is the only type currently backed by both this web
        // contract and a real connector. Mock mode intentionally keeps the
        // complete fixture catalogue for design/demo coverage.
        const items = sourceTypes.filter(
          (s) => s.category === category && (isMockMode || s.type === "shopify"),
        );
        if (!items.length) return null;
        return (
          <div key={category}>
            <p className="mb-2.5 text-[11.5px] font-semibold uppercase tracking-[0.12em] text-ink-faint">
              {category}
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((item) => (
                <button
                  key={item.type}
                  onClick={() => onSelect(item)}
                  aria-label={`${item.label}: ${item.description}`}
                  className="flex items-start gap-3 rounded-(--radius-lg) border border-border bg-surface p-4 text-left transition-colors hover:border-accent hover:bg-surface-2/60"
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-(--radius-sm) bg-surface-2 text-ink-soft">
                    <item.icon className="size-4.5" strokeWidth={1.75} />
                  </span>
                  <span>
                    <span className="block text-[13.5px] font-medium text-ink">
                      {item.label}
                    </span>
                    <span className="mt-0.5 block text-[12px] text-ink-faint">
                      {item.description}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function ConnectSourcePage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<"type" | "credentials" | "confirm">("type");
  const [selected, setSelected] = useState<SourceTypeMeta | null>(null);
  const [name, setName] = useState("");
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [createdSourceId, setCreatedSourceId] = useState<string>();
  const createSource = useCreateDataSource();
  const schemaQuery = useDataSourceSchema(
    step === "confirm" ? createdSourceId : undefined,
  );

  const fields = selected ? connectFields[selected.type as DataSourceType] : [];
  const previewTables = schemaQuery.data?.tables ?? [];
  const stepNumber = step === "type" ? 1 : step === "credentials" ? 2 : 3;

  async function handleConnect() {
    if (!selected) return;
    const source = await createSource.mutateAsync({
      type: selected.type,
      name: name || `New ${selected.label} connection`,
      credentials,
    });
    setCreatedSourceId(source.id);
    setStep("confirm");
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        eyebrow={`Data · Step ${stepNumber} of 3`}
        title={
          step === "type"
            ? "Connect a source"
            : step === "credentials"
              ? `Connect ${selected?.label}`
              : "Here's what we found"
        }
        description={
          step === "type"
            ? "Pick where Apicem Engine should read from. You can add more later."
            : step === "credentials"
              ? "Credentials are used read-only, and never leave this workspace's isolated environment."
              : undefined
        }
      />

      {step === "type" && (
        <TypeGrid
          onSelect={(t) => {
            setSelected(t);
            setStep("credentials");
          }}
        />
      )}

      {step === "credentials" && selected && (
        <div className="rounded-(--radius-lg) border border-border bg-surface p-6">
          <div className="mb-5">
            <Label htmlFor="conn-name">Connection name</Label>
            <Input
              id="conn-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={`${selected.label} (production)`}
            />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {fields.map((field) => (
              <div
                key={field.key}
                className={
                  fields.length % 2 !== 0 && field === fields[fields.length - 1]
                    ? "sm:col-span-2"
                    : ""
                }
              >
                <Label htmlFor={field.key}>{field.label}</Label>
                <Input
                  id={field.key}
                  type={field.secret ? "password" : "text"}
                  placeholder={field.placeholder}
                  value={credentials[field.key] ?? ""}
                  onChange={(e) =>
                    setCredentials((c) => ({
                      ...c,
                      [field.key]: e.target.value,
                    }))
                  }
                />
              </div>
            ))}
          </div>
          <div className="mt-6 flex items-center justify-between">
            <Button variant="ghost" onClick={() => setStep("type")}>
              <ChevronLeft className="size-4" />
              Back
            </Button>
            <Button
              withArrow
              loading={createSource.isPending}
              onClick={handleConnect}
            >
              Connect
            </Button>
          </div>
        </div>
      )}

      {step === "confirm" && selected && (
        <div className="space-y-6">
          <div className="flex items-center gap-3 rounded-(--radius-lg) border border-success/30 bg-success-soft px-5 py-4">
            <span className="flex size-9 items-center justify-center rounded-full bg-success text-primary-ink">
              <Check className="size-4.5" strokeWidth={2.5} />
            </span>
            <div>
              <p className="text-[14px] font-semibold text-ink">
                {name || `New ${selected.label} connection`} is connected
              </p>
              <p className="text-[12.5px] text-ink-soft">
                {schemaQuery.isLoading
                  ? "Loading the scanned schema…"
                  : schemaQuery.isError
                    ? "The connection was created, but its schema could not be loaded."
                    : `We scanned ${previewTables.length} table${previewTables.length === 1 ? "" : "s"}. Review below, then head to the data explorer.`}
              </p>
            </div>
          </div>

          {schemaQuery.isError ? (
            <p role="alert" className="text-[13px] text-danger">
              Could not load the source schema. You can review it later from
              Connections.
            </p>
          ) : schemaQuery.data ? (
            <SchemaTablesList tables={previewTables} />
          ) : null}

          <div className="flex items-center justify-end gap-2">
            <Button variant="outline" onClick={() => navigate("/connections")}>
              View all connections
            </Button>
            <Button withArrow onClick={() => navigate("/explore")}>
              <PartyPopper className="size-4" />
              Explore this data
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
