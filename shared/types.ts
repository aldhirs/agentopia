// Types shared by the Electron main process and the Vue renderer.

export type PermissionMode = 'default' | 'acceptEdits' | 'plan' | 'auto';

export interface StartSessionOptions {
  cwd: string;
  name?: string;
  prompt?: string;
  permissionMode?: PermissionMode;
  model?: string;
  worktree?: boolean;
  /** Claude Code session id to resume (`claude --resume <id>`). */
  resumeId?: string;
  /** Extra CLI flags typed by the user, e.g. ['--chrome', '--continue']. */
  extraArgs?: string[];
  /** Talk to this agent directly instead of the default Lead (`claude --agent <name>`). */
  agent?: string;
  cols?: number;
  rows?: number;
}

export type SessionStatus = 'running' | 'exited';

export interface SessionInfo {
  id: string;
  name: string;
  cwd: string;
  permissionMode: PermissionMode | 'inherit';
  model?: string;
  status: SessionStatus;
  startedAt: number;
  exitCode?: number;
  /** Claude Code's own session id, learned from the first hook event. */
  claudeSessionId?: string;
  /** Row in the persistent history (stays the same when a conversation is resumed). */
  historyId: string;
  /** Set when the session talks to one agent directly (`claude --agent`). */
  agent?: string;
}

export interface ClaudeInfo {
  found: boolean;
  path?: string;
  version?: string;
  loggedIn?: boolean;
  authMethod?: string;
  subscriptionType?: string;
  error?: string;
}

export type AgentStatus =
  | 'idle'
  | 'thinking'
  | 'tool_use'
  | 'waiting'           // waiting for a permission answer
  | 'error'
  | 'done'
  | 'waiting_subagents' // lead only: turn ended while subagents still run
  | 'waiting_user';     // lead only: idle prompt

export interface LogEntry {
  at: number;
  kind: 'user' | 'tool' | 'text' | 'status';
  text: string;
  tool?: string;
  result?: string;
}

export interface AgentState {
  id: string;            // 'lead' or Claude Code agent_id
  kind: 'lead' | 'subagent';
  type: string;          // subagent_type, e.g. 'Explore', 'backend-engineer'
  label: string;         // display name, e.g. 'Explore #2'
  description?: string;  // task description given by the lead
  status: AgentStatus;
  activity?: string;     // short text for the desk, e.g. 'Bash · go test ./...'
  spawnToolUseId?: string;
  transcriptPath?: string;
  startedAt: number;
  updatedAt: number;
  log: LogEntry[];
}

export interface OfficeState {
  sessionId: string;
  claudeSessionId?: string;
  agents: Record<string, AgentState>;
  order: string[];       // agent ids in arrival order (lead first)
  ended: boolean;
}

/** One-shot visual effects for the office (task wires, report wires). */
export type OfficeEffect =
  | { type: 'dispatch'; from: 'lead'; to: string; at: number }
  | { type: 'report'; from: string; to: 'lead'; at: number };

/** Raw hook payload as Claude Code sends it (only the fields we use are typed). */
export interface HookPayload {
  hook_event_name: string;
  session_id?: string;
  transcript_path?: string;
  agent_id?: string;
  agent_type?: string;
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  tool_response?: unknown;
  tool_use_id?: string;
  prompt?: string;
  notification_type?: string;
  message?: string;
  last_assistant_message?: string | null;
  agent_transcript_path?: string;
  background_tasks?: Array<{ id: string; type: string; status: string; description?: string; agent_type?: string }>;
  [key: string]: unknown;
}

export interface HookRecord {
  sessionId: string;
  at: number;
  payload: HookPayload;
}

export interface HistoryEntry {
  id: string;               // app session id
  name: string;
  cwd: string;
  permissionMode: PermissionMode | 'inherit';
  model?: string;
  worktree?: boolean;
  extraArgs?: string[];
  agent?: string;
  startedAt: number;
  endedAt?: number;
  lastActiveAt?: number;
  claudeSessionId?: string; // needed for resume
  subagentTypes: string[];  // types that showed up, in arrival order (with repeats)
  lastActivity?: string;    // e.g. last lead message
}

export interface TeamMember {
  name: string;
  description?: string;
  source: 'builtin' | 'user' | 'project';
}

/** A new agent definition written from the app (<scope dir>/.claude/agents/<name>.md). */
export interface NewAgent {
  scope: 'project' | 'user';
  /** Project folder; required for the project scope. */
  cwd?: string;
  name: string;
  description: string;
  prompt: string;
  model?: 'sonnet' | 'opus' | 'haiku';
}

export interface FolderInfo {
  path: string | null;
  exists: boolean;
  isGit: boolean;
  team: TeamMember[];
}

export interface AppSettings {
  /** Absolute path to the claude binary; empty = find automatically. */
  claudePath: string;
  reduceMotion: boolean;
  terminalFontSize: number;
  notifications: boolean;
  /** Office view: 3D startup office (default) or the lighter 2D floor. */
  officeView: '3d' | '2d';
  /** Background music on/off and its volume (0–100). */
  music: boolean;
  musicVolume: number;
}

/** API exposed to the renderer by the preload script (window.office). */
export interface OfficeApi {
  claudeInfo(): Promise<ClaudeInfo>;
  pickFolder(): Promise<string | null>;
  startSession(opts: StartSessionOptions): Promise<SessionInfo>;
  stopSession(id: string): Promise<void>;
  listSessions(): Promise<SessionInfo[]>;
  getState(id: string): Promise<OfficeState | null>;
  getHooks(id: string): Promise<HookRecord[]>;
  getBuffer(id: string): Promise<string>;
  listHistory(): Promise<HistoryEntry[]>;
  recentFolders(): Promise<string[]>;
  resumeSession(historyId: string): Promise<SessionInfo>;
  removeHistory(historyId: string): Promise<void>;
  folderInfo(cwd: string | null): Promise<FolderInfo>;
  /** Writes a new agent file and returns the folder's updated team. */
  createAgent(agent: NewAgent): Promise<FolderInfo>;
  /** Sends a question to one agent through the running session (`@agent-<name> …`). */
  askAgent(sessionId: string, agent: string, text: string): Promise<void>;
  /** Local path of a file the user dropped on the window ('' when it has none). */
  pathForFile(file: File): string;
  platform: string;
  getSettings(): Promise<AppSettings>;
  setSettings(patch: Partial<AppSettings>): Promise<AppSettings>;
  pickFile(): Promise<string | null>;
  write(id: string, data: string): void;
  resize(id: string, cols: number, rows: number): void;
  onPtyData(cb: (id: string, data: string) => void): () => void;
  onState(cb: (state: OfficeState) => void): () => void;
  onEffects(cb: (sessionId: string, effects: OfficeEffect[]) => void): () => void;
  onHook(cb: (record: HookRecord) => void): () => void;
  onSessions(cb: (sessions: SessionInfo[]) => void): () => void;
  onHistory(cb: (history: HistoryEntry[]) => void): () => void;
  onSettings(cb: (settings: AppSettings) => void): () => void;
  /** Main process asks the UI to show a session (e.g. after clicking a notification). */
  onOpenSession(cb: (sessionId: string) => void): () => void;
}
