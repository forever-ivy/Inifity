import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAppStore } from "@/stores/appStore";
import { useState, useEffect } from "react";
import * as tauri from "@/lib/tauri";
import { Save, RotateCcw, FolderOpen, CheckCircle2, AlertCircle, RefreshCw } from "lucide-react";

interface ConfigField {
  key: string;
  label: string;
  type: "text" | "path" | "number" | "boolean";
  value: string | number | boolean;
  description?: string;
  required?: boolean;
}

const configSections: { name: string; fields: ConfigField[] }[] = [
  {
    name: "Paths",
    fields: [
      {
        key: "workRoot",
        label: "Work Root",
        type: "path",
        value: "",
        required: true,
      },
      {
        key: "kbRoot",
        label: "Knowledge Base Root",
        type: "path",
        value: "",
        required: true,
      },
    ],
  },
  {
    name: "Routing",
    fields: [
      {
        key: "strictRouter",
        label: "Strict Router",
        type: "boolean",
        value: true,
        description: "Enforce new/run protocol",
      },
      {
        key: "requireNew",
        label: "Require New",
        type: "boolean",
        value: true,
        description: "Require 'new' before 'run'",
      },
    ],
  },
  {
    name: "RAG",
    fields: [
      {
        key: "ragBackend",
        label: "RAG Backend",
        type: "text",
        value: "clawrag",
      },
    ],
  },
];

export function Settings() {
  const { config, isLoading, error, fetchConfig, saveConfig } = useAppStore();
  const [localConfig, setLocalConfig] = useState<Record<string, string | number | boolean>>({});
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  useEffect(() => {
    if (config) {
      setLocalConfig({
        workRoot: config.workRoot,
        kbRoot: config.kbRoot,
        strictRouter: config.strictRouter,
        requireNew: config.requireNew,
        ragBackend: config.ragBackend,
      });
    }
  }, [config]);

  const updateConfig = (key: string, value: string | number | boolean) => {
    setLocalConfig((prev) => ({ ...prev, [key]: value }));
    setHasChanges(true);
  };

  const handleSave = async () => {
    await saveConfig({
      workRoot: String(localConfig.workRoot || ""),
      kbRoot: String(localConfig.kbRoot || ""),
      strictRouter: Boolean(localConfig.strictRouter),
      requireNew: Boolean(localConfig.requireNew),
      ragBackend: String(localConfig.ragBackend || "local"),
    });
    setHasChanges(false);
  };

  const handleReset = () => {
    if (config) {
      setLocalConfig({
        workRoot: config.workRoot,
        kbRoot: config.kbRoot,
        strictRouter: config.strictRouter,
        requireNew: config.requireNew,
        ragBackend: config.ragBackend,
      });
      setHasChanges(false);
    }
  };

  const handleBrowse = async (key: string) => {
    // For now, just open finder - in future could use a file dialog
    const currentValue = localConfig[key];
    if (typeof currentValue === "string" && currentValue) {
      try {
        await tauri.openInFinder(currentValue);
      } catch (err) {
        console.error("Failed to open folder:", err);
      }
    }
  };

  const validateField = (key: string): "valid" | "invalid" | "unknown" => {
    const value = localConfig[key];
    if (value === undefined || value === "") return "unknown";
    if (key === "workRoot" || key === "kbRoot") {
      // Basic path validation
      return String(value).startsWith("/") ? "valid" : "invalid";
    }
    return "valid";
  };

  return (
    <div className="p-6 space-y-6">
      {/* Error Banner */}
      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/50 rounded-lg flex items-center gap-3">
          <AlertCircle className="h-5 w-5 text-red-500" />
          <span className="text-sm">{error}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Settings</h2>
          <p className="text-muted-foreground">Configure system parameters</p>
        </div>
        <div className="flex gap-2">
          {hasChanges && (
            <Badge variant="warning" className="flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />
              Unsaved changes
            </Badge>
          )}
          <Button variant="outline" onClick={handleReset} disabled={!hasChanges || isLoading}>
            <RotateCcw className="h-4 w-4 mr-2" />
            Reset
          </Button>
          <Button onClick={handleSave} disabled={!hasChanges || isLoading}>
            <Save className="h-4 w-4 mr-2" />
            Save Changes
          </Button>
        </div>
      </div>

      {/* Config Sections */}
      {configSections.map((section) => (
        <Card key={section.name}>
          <CardHeader>
            <CardTitle className="text-sm">{section.name}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {section.fields.map((field) => {
              const validation = validateField(field.key);

              return (
                <div key={field.key} className="flex items-start gap-4">
                  <div className="flex-1">
                    <label className="block text-sm font-medium mb-1">
                      {field.label}
                      {field.required && <span className="text-red-500 ml-1">*</span>}
                    </label>
                    {field.description && (
                      <p className="text-xs text-muted-foreground mb-2">{field.description}</p>
                    )}
                    {field.type === "boolean" ? (
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={Boolean(localConfig[field.key])}
                          onChange={(e) => updateConfig(field.key, e.target.checked)}
                          className="rounded"
                        />
                        <span className="text-sm">Enabled</span>
                      </label>
                    ) : field.type === "path" ? (
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={String(localConfig[field.key] || "")}
                          onChange={(e) => updateConfig(field.key, e.target.value)}
                          className="flex-1 px-3 py-2 border rounded-lg text-sm"
                        />
                        <Button variant="outline" size="icon" onClick={() => handleBrowse(field.key)}>
                          <FolderOpen className="h-4 w-4" />
                        </Button>
                      </div>
                    ) : (
                      <input
                        type={field.type === "number" ? "number" : "text"}
                        value={String(localConfig[field.key] || "")}
                        onChange={(e) =>
                          updateConfig(field.key, field.type === "number" ? Number(e.target.value) : e.target.value)
                        }
                        className="w-full px-3 py-2 border rounded-lg text-sm"
                      />
                    )}
                  </div>
                  <div className="pt-6">
                    {validation === "valid" && <CheckCircle2 className="h-4 w-4 text-green-500" />}
                    {validation === "invalid" && <AlertCircle className="h-4 w-4 text-red-500" />}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      ))}

      {/* Effect Notice */}
      {hasChanges && (
        <Card className="border-yellow-500/50 bg-yellow-500/5">
          <CardContent className="flex items-center gap-3 p-4">
            <AlertCircle className="h-5 w-5 text-yellow-500" />
            <div>
              <p className="font-medium text-sm">Some changes require service restart</p>
              <p className="text-xs text-muted-foreground">
                RAG and routing settings will take effect after restarting services
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Advanced Note */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Advanced Configuration</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-2">
            Additional settings can be configured by editing the .env.v4.local file directly.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              await tauri.openInFinder("/Users/Code/workflow/translation/.env.v4.local");
            }}
          >
            <FolderOpen className="h-4 w-4 mr-2" />
            Open Config File
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
