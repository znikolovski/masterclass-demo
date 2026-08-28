export interface AppInfo {
  name: string;
  version: string;
}

export interface AppCapabilities {
  availableDisplayModes?: Array<'inline' | 'fullscreen' | 'pip'>;
  tools?: { listChanged?: boolean };
  experimental?: Record<string, unknown>;
}

export interface LLMAppOptions {
  appInfo: AppInfo;
  appCapabilities?: AppCapabilities;
}

export type ContainerDimensions =
  ({ height: number } | { maxHeight?: number }) &
  ({ width: number } | { maxWidth?: number });

export interface HostContext {
  theme?: 'light' | 'dark';
  locale?: string;
  timeZone?: string;
  displayMode?: 'inline' | 'fullscreen' | 'pip';
  availableDisplayModes?: Array<'inline' | 'fullscreen' | 'pip'>;
  containerDimensions?: ContainerDimensions;
  platform?: 'web' | 'desktop' | 'mobile';
  deviceCapabilities?: {
    touch?: boolean;
    hover?: boolean;
  };
  safeAreaInsets?: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
  userAgent?: string;
  toolInfo?: {
    id?: string | number;
    tool: {
      name: string;
      description?: string;
      inputSchema?: Record<string, unknown>;
      [key: string]: unknown;
    };
  };
  styles?: {
    variables?: Record<string, string | undefined>;
    css?: {
      fonts?: string;
    };
  };
  [key: string]: unknown;
}

export interface HostCapabilities {
  experimental?: Record<string, unknown>;
  openLinks?: Record<string, never>;
  serverTools?: { listChanged?: boolean };
  serverResources?: { listChanged?: boolean };
  logging?: Record<string, never>;
  sandbox?: {
    permissions?: {
      camera?: Record<string, never>;
      microphone?: Record<string, never>;
      geolocation?: Record<string, never>;
      clipboardWrite?: Record<string, never>;
    };
    csp?: {
      connectDomains?: string[];
      resourceDomains?: string[];
      frameDomains?: string[];
      baseUriDomains?: string[];
    };
  };
  [key: string]: unknown;
}

export interface HostInfo {
  name?: string;
  version?: string;
}

export interface ToolResult {
  content?: Array<{ type: string; text?: string; [key: string]: unknown }>;
  structuredContent?: Record<string, unknown>;
  _meta?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface ToolInput {
  arguments?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface ToolCancelled {
  reason?: string;
  [key: string]: unknown;
}

export interface ToolCallResult {
  content?: Array<{ type: string; text?: string; [key: string]: unknown }>;
  structuredContent?: Record<string, unknown>;
  _meta?: Record<string, unknown>;
  [key: string]: unknown;
}

export type LogLevel = 'debug' | 'info' | 'warning' | 'error';
export type DisplayMode = 'inline' | 'fullscreen' | 'pip';

export declare class ChatGPTExtensions {
  get widgetState(): unknown | null;
  setWidgetState(state: unknown): void;
  uploadFile(file: File): Promise<{ fileId: string }>;
  getFileDownloadUrl(opts: { fileId: string }): Promise<{ downloadUrl: string }>;
  requestModal(opts?: { template?: string; params?: Record<string, unknown> }): Promise<void>;
  requestClose(): void;
  requestCheckout(opts: Record<string, unknown>): Promise<void>;
  setOpenInAppUrl(opts: { href: string }): void;
  get view(): string | null;
  requestConnectSheet(opts?: Record<string, unknown>): Promise<{ didConnect?: boolean; linkId?: string }>;
  get supportsConnectSheet(): boolean;
}

export declare class LLMApp {
  constructor(options: LLMAppOptions);

  /** Promise that resolves with the tool's response (ui/notifications/tool-result). */
  readonly toolResult: Promise<ToolResult>;

  /** Promise that resolves with the tool's input arguments (ui/notifications/tool-input). */
  readonly toolInput: Promise<ToolInput>;

  /** Promise that resolves if the tool invocation is cancelled (ui/notifications/tool-cancelled). */
  readonly toolCancelled: Promise<ToolCancelled>;

  /** Whether this code is running inside an iframe. */
  get isEmbedded(): boolean;

  /** Whether the ui/initialize handshake has completed. */
  get isConnected(): boolean;

  /** Detected host name. */
  get host(): 'chatgpt' | 'claude' | string | 'unknown' | null;

  /** Host context from the ui/initialize result. Updated on host-context-changed. */
  get hostContext(): HostContext;

  /** Host capabilities from the ui/initialize result. */
  get hostCapabilities(): HostCapabilities;

  /** Host identity from the ui/initialize result. */
  get hostInfo(): HostInfo;

  /** ChatGPT vendor extensions (window.openai). Returns null when not running inside ChatGPT. */
  get chatgpt(): ChatGPTExtensions | null;

  /** Connect to the host and perform the ui/initialize handshake. */
  connect(): Promise<this>;

  /** Stop listening and clean up. */
  destroy(): void;

  /** Call a tool from the UI (tools/call). */
  callTool(name: string, args?: Record<string, unknown>): Promise<ToolCallResult>;

  /** Post a follow-up message in the conversation (ui/message). */
  sendMessage(text: string): Promise<Record<string, never>>;

  /** Update model-visible context from the UI (ui/update-model-context). */
  updateModelContext(text: string): Promise<Record<string, never>>;

  /** Ask the host to open a URL (ui/open-link). */
  openLink(url: string): Promise<Record<string, never>>;

  /** Request a display mode change (ui/request-display-mode). */
  requestDisplayMode(mode: DisplayMode): Promise<{ mode: string }>;

  /** Manually report widget dimensions to the host (ui/notifications/size-changed). */
  reportSize(width: number, height: number): void;

  /** Read an MCP resource by URI (resources/read). */
  readResource(uri: string): Promise<{ contents: unknown[] }>;

  /** Send a log message to the host (notifications/message). */
  log(level: LogLevel, message: string): void;

  /** Start automatic size reporting via ResizeObserver. Returns a cleanup function. */
  autoResize(target?: HTMLElement): () => void;

  /** Subscribe to host context changes (ui/notifications/host-context-changed). Returns an unsubscribe function. */
  onContextChange(callback: (context: HostContext) => void): () => void;

  /** Subscribe to streaming tool input arguments (ui/notifications/tool-input-partial). Returns an unsubscribe function. */
  onToolInputPartial(callback: (params: ToolInput) => void): () => void;

  /** Apply host-provided CSS variables and fonts to the document. */
  applyHostStyles(target?: HTMLElement): void;

  /** Apply host-provided container dimensions as CSS. */
  applyContainerDimensions(target?: HTMLElement): void;

  /** Send a JSON-RPC request (low-level). */
  request(method: string, params?: Record<string, unknown>, options?: { timeout?: number }): Promise<unknown>;

  /** Send a JSON-RPC notification (low-level, fire-and-forget). */
  notify(method: string, params?: Record<string, unknown>): void;
}

/** Create and connect an app in one call. */
export declare function createApp(options: LLMAppOptions): Promise<LLMApp>;

export default LLMApp;
