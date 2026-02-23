import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAppStore } from "@/stores/appStore";
import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Save,
  RotateCcw,
  FolderOpen,
  CheckCircle2,
  AlertCircle,
  Check,
  Sun,
  Moon,
  Monitor,
  Search,
  Eye,
  EyeOff,
  Plus,
  Shield,
} from "lucide-react";
import * as tauri from "@/lib/tauri";

interface ConfigField {
  key: string;
  label: string;
  type: "text" | "path" | "number" | "boolean";
  description?: string;
  required?: boolean;
}

type EnvFieldType = "text" | "number" | "boolean" | "secret" | "select";

interface EnvFieldDef {
  key: string;
  label: string;
  group: string;
  type: EnvFieldType;
  description?: string;
  placeholder?: string;
  required?: boolean;
  options?: Array<{ label: string; value: string }>;
}

const configSections: { name: string; fields: ConfigField[] }[] = [
  {
    name: "Paths",
    fields: [
      { key: "workRoot", label: "Work Root", type: "path", required: true },
      { key: "kbRoot", label: "Knowledge Base Root", type: "path", required: true },
    ],
  },
  {
    name: "Routing",
    fields: [
      {
        key: "strictRouter",
        label: "Strict Router",
        type: "boolean",
        description: "Enforce new/run protocol",
      },
      {
        key: "requireNew",
        label: "Require New",
        type: "boolean",
        description: "Require 'new' before 'run'",
      },
    ],
  },
  {
    name: "RAG",
    fields: [
      { key: "ragBackend", label: "RAG Backend", type: "text" },
    ],
  },
];

const envFieldDefs: EnvFieldDef[] = [
  {
    key: "V4_WORK_ROOT",
    label: "Work Root",
    group: "Core Paths",
    type: "text",
    required: true,
    description: "Main workspace for translation runs",
  },
  {
    key: "V4_KB_ROOT",
    label: "Knowledge Base Root",
    group: "Core Paths",
    type: "text",
    required: true,
    description: "Knowledge base files root",
  },
  {
    key: "V4_PYTHON_BIN",
    label: "Python Binary",
    group: "Core Paths",
    type: "text",
    description: "Interpreter used by worker scripts",
  },
  {
    key: "OPENCLAW_PRIMARY_MODEL",
    label: "Primary Model",
    group: "Model Routing",
    type: "text",
    required: true,
  },
  {
    key: "OPENCLAW_FALLBACK_CHAIN",
    label: "Fallback Chain",
    group: "Model Routing",
    type: "text",
    description: "Comma-separated fallback model list",
  },
  {
    key: "OPENCLAW_IMAGE_MODEL",
    label: "Image Model",
    group: "Model Routing",
    type: "text",
  },
  {
    key: "OPENCLAW_VISION_BACKEND",
    label: "Vision Backend",
    group: "Vision",
    type: "select",
    options: [
      { label: "Auto", value: "auto" },
      { label: "Gemini", value: "gemini" },
      { label: "Moonshot", value: "moonshot" },
      { label: "OpenAI", value: "openai" },
    ],
  },
  {
    key: "OPENCLAW_GEMINI_VISION_MODEL",
    label: "Gemini Vision Model",
    group: "Vision",
    type: "text",
  },
  {
    key: "OPENCLAW_MOONSHOT_VISION_MODEL",
    label: "Moonshot Vision Model",
    group: "Vision",
    type: "text",
  },
  {
    key: "OPENCLAW_OPENAI_VISION_MODEL",
    label: "OpenAI Vision Model",
    group: "Vision",
    type: "text",
  },
  {
    key: "OPENCLAW_GLM_ENABLED",
    label: "GLM Enabled",
    group: "Routing Behavior",
    type: "boolean",
  },
  {
    key: "OPENCLAW_STRICT_ROUTER",
    label: "Strict Router",
    group: "Routing Behavior",
    type: "boolean",
  },
  {
    key: "OPENCLAW_REQUIRE_NEW",
    label: "Require NEW command",
    group: "Routing Behavior",
    type: "boolean",
  },
  {
    key: "OPENCLAW_RAG_BACKEND",
    label: "RAG Backend",
    group: "Routing Behavior",
    type: "select",
    options: [
      { label: "ClawRAG", value: "clawrag" },
      { label: "Local", value: "local" },
      { label: "Disabled", value: "none" },
    ],
  },
  {
    key: "OPENCLAW_RUN_WORKER_POLL_SECONDS",
    label: "Worker Poll Seconds",
    group: "Worker",
    type: "number",
  },
  {
    key: "OPENCLAW_RUN_WORKER_HEARTBEAT_SECONDS",
    label: "Worker Heartbeat Seconds",
    group: "Worker",
    type: "number",
  },
  {
    key: "OPENCLAW_RUN_WORKER_STUCK_SECONDS",
    label: "Worker Stuck Timeout Seconds",
    group: "Worker",
    type: "number",
  },
  {
    key: "OPENCLAW_NOTIFY_TARGET",
    label: "Notify Target",
    group: "Notifications",
    type: "text",
  },
  {
    key: "OPENCLAW_NOTIFY_CHANNEL",
    label: "Notify Channel",
    group: "Notifications",
    type: "text",
  },
  {
    key: "TELEGRAM_BOT_TOKEN",
    label: "Telegram Bot Token",
    group: "Secrets",
    type: "secret",
  },
  {
    key: "TELEGRAM_ALLOWED_CHAT_IDS",
    label: "Telegram Allowed Chat IDs",
    group: "Secrets",
    type: "text",
  },
  {
    key: "GOOGLE_API_KEY",
    label: "Google API Key",
    group: "Secrets",
    type: "secret",
  },
  {
    key: "OPENCLAW_KIMI_CODING_API_KEY",
    label: "Kimi API Key",
    group: "Secrets",
    type: "secret",
  },
  {
    key: "ANTHROPIC_AUTH_TOKEN",
    label: "Anthropic Auth Token",
    group: "Secrets",
    type: "secret",
  },
];

const themeOptions = [
  { value: "light" as const, label: "Light", icon: Sun },
  { value: "dark" as const, label: "Dark", icon: Moon },
  { value: "system" as const, label: "System", icon: Monitor },
];

function parseEnvBoolean(value: string | undefined): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function toEnvBoolean(value: boolean): string {
  return value ? "1" : "0";
}

export function Settings() {
  const config = useAppStore((s) => s.config);
  const isLoading = useAppStore((s) => s.isLoading);
  const fetchConfig = useAppStore((s) => s.fetchConfig);
  const saveConfig = useAppStore((s) => s.saveConfig);
  const theme = useAppStore((s) => s.theme);
  const setTheme = useAppStore((s) => s.setTheme);
  const addToast = useAppStore((s) => s.addToast);

  const [localConfig, setLocalConfig] = useState<Record<string, string | number | boolean>>({});
  const [hasChanges, setHasChanges] = useState(false);

  const [envOriginal, setEnvOriginal] = useState<Record<string, string>>({});
  const [envDraft, setEnvDraft] = useState<Record<string, string>>({});
  const [envMetaMap, setEnvMetaMap] = useState<Record<string, { isSecret: boolean }>>({});
  const [isEnvLoading, setIsEnvLoading] = useState(false);
  const [isEnvSaving, setIsEnvSaving] = useState(false);
  const [envSearch, setEnvSearch] = useState("");
  const [showSecrets, setShowSecrets] = useState(false);
  const [showAdvancedEnv, setShowAdvancedEnv] = useState(false);
  const [newEnvKey, setNewEnvKey] = useState("");
  const [newEnvValue, setNewEnvValue] = useState("");

  useEffect(() => {
    fetchConfig();
    void loadEnvSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const loadEnvSettings = async () => {
    setIsEnvLoading(true);
    try {
      const entries = await tauri.getEnvSettings();
      const values: Record<string, string> = {};
      const meta: Record<string, { isSecret: boolean }> = {};
      for (const entry of entries) {
        values[entry.key] = entry.value;
        meta[entry.key] = { isSecret: entry.is_secret };
      }
      setEnvOriginal(values);
      setEnvDraft(values);
      setEnvMetaMap(meta);
    } catch (err) {
      addToast("error", `Failed to load env settings: ${err}`);
    } finally {
      setIsEnvLoading(false);
    }
  };

  const updateConfig = (key: string, value: string | number | boolean) => {
    setLocalConfig((prev) => ({ ...prev, [key]: value }));
    setHasChanges(true);
  };

  const updateEnvValue = (key: string, value: string) => {
    setEnvDraft((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    try {
      await saveConfig({
        workRoot: String(localConfig.workRoot || ""),
        kbRoot: String(localConfig.kbRoot || ""),
        strictRouter: Boolean(localConfig.strictRouter),
        requireNew: Boolean(localConfig.requireNew),
        ragBackend: String(localConfig.ragBackend || "local"),
      });
      setHasChanges(false);
    } catch {
      // keep unsaved state
    }
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
      return String(value).startsWith("/") ? "valid" : "invalid";
    }
    return "valid";
  };

  const envKnownKeys = useMemo(() => new Set(envFieldDefs.map((f) => f.key)), []);

  const envChangedKeys = useMemo(() => {
    const keys = new Set<string>([...Object.keys(envDraft), ...Object.keys(envOriginal)]);
    return Array.from(keys).filter((key) => (envDraft[key] ?? "") !== (envOriginal[key] ?? ""));
  }, [envDraft, envOriginal]);

  const hasEnvChanges = envChangedKeys.length > 0;

  const envSearchNormalized = envSearch.trim().toLowerCase();

  const filteredKnownFields = useMemo(() => {
    return envFieldDefs.filter((field) => {
      if (!envSearchNormalized) return true;
      return (
        field.label.toLowerCase().includes(envSearchNormalized) ||
        field.key.toLowerCase().includes(envSearchNormalized) ||
        (field.description || "").toLowerCase().includes(envSearchNormalized)
      );
    });
  }, [envSearchNormalized]);

  const groupedFields = useMemo(() => {
    const grouped: Record<string, EnvFieldDef[]> = {};
    for (const field of filteredKnownFields) {
      if (!grouped[field.group]) grouped[field.group] = [];
      grouped[field.group].push(field);
    }
    return grouped;
  }, [filteredKnownFields]);

  const advancedEnvKeys = useMemo(() => {
    return Object.keys(envDraft)
      .filter((key) => !envKnownKeys.has(key))
      .filter((key) => !envSearchNormalized || key.toLowerCase().includes(envSearchNormalized))
      .sort((a, b) => a.localeCompare(b));
  }, [envDraft, envKnownKeys, envSearchNormalized]);

  const handleSaveEnv = async () => {
    if (!hasEnvChanges) return;
    setIsEnvSaving(true);
    try {
      const updates = envChangedKeys.map((key) => ({ key, value: envDraft[key] ?? "" }));
      await tauri.saveEnvSettings(updates);
      await loadEnvSettings();
      addToast("success", `${updates.length} env settings saved`);
    } catch (err) {
      addToast("error", `Failed to save env settings: ${err}`);
    } finally {
      setIsEnvSaving(false);
    }
  };

  const handleResetEnv = () => {
    setEnvDraft(envOriginal);
    setNewEnvKey("");
    setNewEnvValue("");
  };

  const addCustomEnvVar = () => {
    const key = newEnvKey.trim();
    if (!key) return;
    if (!/^[A-Z0-9_]+$/.test(key)) {
      addToast("error", "Env key must use uppercase letters, digits, and underscore only");
      return;
    }
    setEnvDraft((prev) => ({ ...prev, [key]: newEnvValue }));
    setEnvMetaMap((prev) => ({
      ...prev,
      [key]: { isSecret: key.includes("KEY") || key.includes("TOKEN") || key.includes("PASSWORD") || key.includes("SECRET") },
    }));
    setNewEnvKey("");
    setNewEnvValue("");
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Settings</h2>
          <p className="text-muted-foreground">Configure system parameters</p>
        </div>
        <div className="flex gap-2 items-center">
          <AnimatePresence>
            {hasChanges && (
              <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.8, opacity: 0 }}>
                <Badge variant="warning" className="flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  Unsaved changes
                </Badge>
              </motion.div>
            )}
          </AnimatePresence>
          <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
            <Button variant="outline" onClick={handleReset} disabled={!hasChanges || isLoading}>
              <RotateCcw className="h-4 w-4 mr-2" />
              Reset
            </Button>
          </motion.div>
          <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
            <Button onClick={handleSave} disabled={!hasChanges || isLoading}>
              <Save className="h-4 w-4 mr-2" />
              Save Changes
            </Button>
          </motion.div>
        </div>
      </div>

      {configSections.map((section, sectionIndex) => (
        <motion.div key={section.name} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: sectionIndex * 0.08 }}>
          <Card variant="glass">
            <CardHeader>
              <CardTitle className="text-sm">{section.name}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {section.fields.map((field, fieldIndex) => {
                const validation = validateField(field.key);
                return (
                  <motion.div
                    key={field.key}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: sectionIndex * 0.08 + fieldIndex * 0.04 }}
                    className="flex items-start gap-4"
                  >
                    <div className="flex-1">
                      <label className="block text-sm font-medium mb-1">
                        {field.label}
                        {field.required && <span className="text-red-500 ml-1">*</span>}
                      </label>
                      {field.description && <p className="text-xs text-muted-foreground mb-2">{field.description}</p>}

                      {field.type === "boolean" ? (
                        <label className="flex items-center gap-2 cursor-pointer">
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
                            className="flex-1 px-3 py-2 border rounded-lg text-sm bg-background text-foreground focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                          />
                          <Button variant="outline" size="icon" onClick={() => handleBrowse(field.key)}>
                            <FolderOpen className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : (
                        <input
                          type={field.type === "number" ? "number" : "text"}
                          value={String(localConfig[field.key] || "")}
                          onChange={(e) => updateConfig(field.key, field.type === "number" ? Number(e.target.value) : e.target.value)}
                          className="w-full px-3 py-2 border rounded-lg text-sm bg-background text-foreground focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                        />
                      )}
                    </div>
                    <div className="pt-6">
                      {validation === "valid" && <CheckCircle2 className="h-4 w-4 text-green-500" />}
                      {validation === "invalid" && <AlertCircle className="h-4 w-4 text-red-500" />}
                    </div>
                  </motion.div>
                );
              })}
            </CardContent>
          </Card>
        </motion.div>
      ))}

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
        <Card variant="glass">
          <CardHeader>
            <CardTitle className="text-sm">Appearance</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Theme</label>
                <p className="text-xs text-muted-foreground mb-3">Choose your preferred color scheme</p>
                <div className="flex gap-2">
                  {themeOptions.map((option) => {
                    const Icon = option.icon;
                    const isActive = theme === option.value;
                    return (
                      <button
                        key={option.value}
                        onClick={() => setTheme(option.value)}
                        className={`
                          flex items-center gap-2 px-4 py-2 rounded-full transition-all duration-200
                          ${isActive
                            ? "bg-primary text-primary-foreground shadow-md"
                            : "bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground"
                          }
                        `}
                      >
                        <Icon className="h-4 w-4" />
                        <span className="text-sm font-medium">{option.label}</span>
                        {isActive && <Check className="h-3 w-3" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.24 }}>
        <Card variant="glass">
          <CardHeader className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-sm">Environment Configuration</CardTitle>
              <div className="flex items-center gap-2">
                <Badge variant="outline">{Object.keys(envDraft).length} vars</Badge>
                <Badge variant={hasEnvChanges ? "warning" : "success"}>{hasEnvChanges ? `${envChangedKeys.length} changed` : "Synced"}</Badge>
                <Button variant="outline" size="sm" onClick={loadEnvSettings} disabled={isEnvLoading || isEnvSaving}>
                  <RotateCcw className={`h-4 w-4 mr-2 ${isEnvLoading ? "animate-spin" : ""}`} />
                  Reload
                </Button>
                <Button variant="outline" size="sm" onClick={handleResetEnv} disabled={!hasEnvChanges || isEnvSaving}>
                  Reset
                </Button>
                <Button size="sm" onClick={handleSaveEnv} disabled={!hasEnvChanges || isEnvSaving}>
                  <Save className="h-4 w-4 mr-2" />
                  {isEnvSaving ? "Saving..." : "Save Env"}
                </Button>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <div className="relative min-w-[220px] flex-1">
                <Search className="h-4 w-4 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={envSearch}
                  onChange={(e) => setEnvSearch(e.target.value)}
                  placeholder="Search env key or label"
                  className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm bg-background text-foreground"
                />
              </div>
              <Button variant={showSecrets ? "secondary" : "outline"} size="sm" onClick={() => setShowSecrets((v) => !v)}>
                {showSecrets ? <EyeOff className="h-4 w-4 mr-2" /> : <Eye className="h-4 w-4 mr-2" />}
                {showSecrets ? "Hide Secrets" : "Show Secrets"}
              </Button>
              <Button variant={showAdvancedEnv ? "secondary" : "outline"} size="sm" onClick={() => setShowAdvancedEnv((v) => !v)}>
                <Shield className="h-4 w-4 mr-2" />
                {showAdvancedEnv ? "Hide Advanced" : "Show Advanced"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  await tauri.openInFinder("/Users/Code/workflow/Inifity/.env.v4.local");
                }}
              >
                <FolderOpen className="h-4 w-4 mr-2" />
                Open File
              </Button>
            </div>
          </CardHeader>

          <CardContent className="space-y-5">
            {isEnvLoading ? (
              <p className="text-sm text-muted-foreground">Loading env settings...</p>
            ) : (
              Object.entries(groupedFields).map(([groupName, fields]) => (
                <div key={groupName} className="space-y-3">
                  <h4 className="text-xs uppercase tracking-wide text-muted-foreground">{groupName}</h4>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                    {fields.map((field) => {
                      const rawValue = envDraft[field.key] ?? "";
                      const original = envOriginal[field.key] ?? "";
                      const changed = rawValue !== original;
                      const isSecret = field.type === "secret" || !!envMetaMap[field.key]?.isSecret;

                      return (
                        <div key={field.key} className="rounded-xl border border-border/50 bg-background/30 p-3 space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <label className="text-sm font-medium">{field.label}</label>
                            <div className="flex items-center gap-1">
                              {field.required && <Badge variant="outline">Required</Badge>}
                              {changed && <Badge variant="warning">Changed</Badge>}
                            </div>
                          </div>
                          <p className="text-[11px] text-muted-foreground">{field.description || field.key}</p>

                          {field.type === "boolean" ? (
                            <select
                              value={parseEnvBoolean(rawValue) ? "1" : "0"}
                              onChange={(e) => updateEnvValue(field.key, e.target.value === "1" ? toEnvBoolean(true) : toEnvBoolean(false))}
                              className="w-full px-3 py-2 border rounded-lg text-sm bg-background text-foreground"
                            >
                              <option value="1">Enabled (1)</option>
                              <option value="0">Disabled (0)</option>
                            </select>
                          ) : field.type === "select" ? (
                            <select
                              value={rawValue}
                              onChange={(e) => updateEnvValue(field.key, e.target.value)}
                              className="w-full px-3 py-2 border rounded-lg text-sm bg-background text-foreground"
                            >
                              <option value="">(empty)</option>
                              {(field.options || []).map((option) => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                              ))}
                            </select>
                          ) : (
                            <input
                              type={isSecret && !showSecrets ? "password" : field.type === "number" ? "number" : "text"}
                              value={rawValue}
                              onChange={(e) => updateEnvValue(field.key, e.target.value)}
                              placeholder={field.placeholder}
                              className="w-full px-3 py-2 border rounded-lg text-sm bg-background text-foreground"
                            />
                          )}

                          <p className="text-[11px] text-muted-foreground font-mono">{field.key}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))
            )}

            <div className="rounded-xl border border-dashed border-border/70 p-3 space-y-2">
              <p className="text-xs font-medium">Add custom env key</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <input
                  type="text"
                  value={newEnvKey}
                  onChange={(e) => setNewEnvKey(e.target.value.toUpperCase())}
                  placeholder="NEW_ENV_KEY"
                  className="px-3 py-2 border rounded-lg text-sm bg-background text-foreground"
                />
                <input
                  type={showSecrets ? "text" : "password"}
                  value={newEnvValue}
                  onChange={(e) => setNewEnvValue(e.target.value)}
                  placeholder="value"
                  className="px-3 py-2 border rounded-lg text-sm bg-background text-foreground"
                />
              </div>
              <Button variant="outline" size="sm" onClick={addCustomEnvVar}>
                <Plus className="h-4 w-4 mr-2" />
                Add Variable
              </Button>
            </div>

            {showAdvancedEnv && (
              <div className="space-y-3">
                <h4 className="text-xs uppercase tracking-wide text-muted-foreground">Advanced / Unmapped Keys</h4>
                {advancedEnvKeys.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No additional keys matched your filter.</p>
                ) : (
                  <div className="space-y-2">
                    {advancedEnvKeys.map((key) => {
                      const rawValue = envDraft[key] ?? "";
                      const original = envOriginal[key] ?? "";
                      const changed = rawValue !== original;
                      const isSecret = !!envMetaMap[key]?.isSecret;
                      return (
                        <div key={key} className="rounded-xl border border-border/50 bg-background/20 p-3">
                          <div className="flex items-center justify-between gap-2 mb-2">
                            <p className="text-xs font-mono">{key}</p>
                            {changed && <Badge variant="warning">Changed</Badge>}
                          </div>
                          <input
                            type={isSecret && !showSecrets ? "password" : "text"}
                            value={rawValue}
                            onChange={(e) => updateEnvValue(key, e.target.value)}
                            className="w-full px-3 py-2 border rounded-lg text-sm bg-background text-foreground"
                          />
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      <AnimatePresence>
        {(hasChanges || hasEnvChanges) && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}>
            <Card className="border-yellow-500/50 bg-yellow-500/5">
              <CardContent className="flex items-center gap-3 p-4">
                <AlertCircle className="h-5 w-5 text-yellow-500" />
                <div>
                  <p className="font-medium text-sm">Some changes require service restart</p>
                  <p className="text-xs text-muted-foreground">
                    Routing, model, and worker env changes take effect after restarting services.
                  </p>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
