"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Bot, ChevronLeft, ImageIcon, Loader2, MessageCircle, Paperclip, Plus, Send, SlidersHorizontal, Trash2, X } from "lucide-react";

import { CLIENT_PROVIDER_STORAGE_KEY } from "@/components/layout/provider-credential-fetch-bridge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type Mode = "auto" | "chat" | "image";
type Message = { role: "user" | "assistant"; content: string; imageUrl?: string | null };
type Conversation = { id: string; title: string; messages: Message[] };
type Attachment = { id: string; name: string; type: string; size: number; dataUrl?: string };
type PlaygroundModel = {
  modelId: string;
  label: string;
  capabilities?: Record<string, unknown>;
  isDefaultPlanning?: boolean;
  isDefaultHeroImage?: boolean;
  isDefaultDetailImage?: boolean;
  isDefaultImageEdit?: boolean;
};

const fallbackModels: PlaygroundModel[] = [
  { modelId: "gpt-5-mini", label: "gpt-5-mini" },
  { modelId: "gpt-5.5", label: "gpt-5.5" },
  { modelId: "gpt-image-2", label: "gpt-image-2", capabilities: { image_gen: true } },
];

const modeOptions: Array<{ key: Mode; label: string }> = [
  { key: "auto", label: "Auto" },
  { key: "chat", label: "Chat" },
  { key: "image", label: "Image" },
];

const PLAYGROUND_CONVERSATIONS_STORAGE_KEY = "mxpage_playground_conversations_v1";
const PLAYGROUND_ACTIVE_CONVERSATION_STORAGE_KEY = "mxpage_playground_active_conversation_v1";
const REDACTED_SENSITIVE_CONTENT = "**";
const SENSITIVE_BLOCKED_MESSAGE = "您的内容因含有敏感词汇，已被系统自动拦截。";
const DEFAULT_CONVERSATION: Conversation = { id: "default", title: "新对话", messages: [] };

function createConversation(index: number): Conversation {
  return {
    id: `${Date.now()}-${index}`,
    title: index === 1 ? "新对话" : `新对话 ${index}`,
    messages: [],
  };
}

function sanitizeStoredMessages(messages: Message[]) {
  const next = messages.map((message) => ({ ...message }));
  for (let index = 0; index < next.length; index += 1) {
    if (next[index].role === "assistant" && /内容包含屏蔽词|敏感词汇|SENSITIVE_WORD_BLOCKED/i.test(next[index].content)) {
      next[index].content = SENSITIVE_BLOCKED_MESSAGE;
      if (next[index - 1]?.role === "user") {
        next[index - 1] = { role: "user", content: REDACTED_SENSITIVE_CONTENT };
      }
    }
  }
  return next;
}

function sanitizeConversations(value: unknown): Conversation[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item): Conversation | null => {
      if (!item || typeof item !== "object") return null;
      const conversation = item as Partial<Conversation>;
      if (typeof conversation.id !== "string") return null;
      const messages = Array.isArray(conversation.messages)
        ? conversation.messages
            .filter((message): message is Message => {
              return Boolean(
                message &&
                  typeof message === "object" &&
                  (message.role === "user" || message.role === "assistant") &&
                  typeof message.content === "string",
              );
            })
            .slice(-80)
        : [];
      return {
        id: conversation.id,
        title: typeof conversation.title === "string" && conversation.title.trim() ? conversation.title : "新对话",
        messages: sanitizeStoredMessages(messages),
      };
    })
    .filter((item): item is Conversation => Boolean(item))
    .slice(0, 50);
}

function loadStoredConversations() {
  if (typeof window === "undefined") return { conversations: [DEFAULT_CONVERSATION], activeId: DEFAULT_CONVERSATION.id };
  try {
    const conversations = sanitizeConversations(JSON.parse(window.localStorage.getItem(PLAYGROUND_CONVERSATIONS_STORAGE_KEY) || "[]"));
    const fallback = conversations.length ? conversations : [DEFAULT_CONVERSATION];
    const storedActiveId = window.localStorage.getItem(PLAYGROUND_ACTIVE_CONVERSATION_STORAGE_KEY) || "";
    const activeId = fallback.some((item) => item.id === storedActiveId) ? storedActiveId : fallback[0].id;
    return { conversations: fallback, activeId };
  } catch {
    const fallback = [DEFAULT_CONVERSATION];
    return { conversations: fallback, activeId: fallback[0].id };
  }
}

function redactedMessages(messages: Message[], assistantMessage: string) {
  const next = [...messages];
  for (let index = next.length - 1; index >= 0; index -= 1) {
    if (next[index].role === "user") {
      next[index] = { role: "user", content: REDACTED_SENSITIVE_CONTENT };
      break;
    }
  }
  return [...next, { role: "assistant" as const, content: assistantMessage }];
}

function isImageModel(model: PlaygroundModel) {
  const text = `${model.modelId} ${model.label}`.toLowerCase();
  return Boolean(model.capabilities?.image_gen || model.capabilities?.image_edit) || /(image|dall|flux|recraft|imagen|gpt-image)/.test(text);
}

function pickDefaultModel(models: PlaygroundModel[], mode: Mode) {
  if (mode === "image") {
    return (
      models.find((item) => item.isDefaultHeroImage || item.isDefaultDetailImage || item.isDefaultImageEdit)?.modelId ??
      models.find(isImageModel)?.modelId ??
      models[0]?.modelId ??
      "gpt-image-2"
    );
  }

  return (
    models.find((item) => item.isDefaultPlanning)?.modelId ??
    models.find((item) => !isImageModel(item))?.modelId ??
    models[0]?.modelId ??
    "gpt-5-mini"
  );
}

function readLocalProviderStatus() {
  if (typeof window === "undefined") return { connected: false, masked: "未配置" };
  try {
    const parsed = JSON.parse(window.localStorage.getItem(CLIENT_PROVIDER_STORAGE_KEY) || "{}") as { apiKey?: string };
    const apiKey = parsed.apiKey?.trim() ?? "";
    if (!apiKey) return { connected: false, masked: "未配置" };
    const masked = apiKey.length > 10 ? `${apiKey.slice(0, 6)}....${apiKey.slice(-4)}` : `${apiKey.slice(0, 3)}....`;
    return { connected: true, masked };
  } catch {
    return { connected: false, masked: "未配置" };
  }
}

function readFileAsDataUrl(file: File) {
  return new Promise<string | undefined>((resolve) => {
    if (!file.type.startsWith("image/")) {
      resolve(undefined);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : undefined);
    reader.onerror = () => resolve(undefined);
    reader.readAsDataURL(file);
  });
}

export function PlaygroundWorkspace() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<Mode>("auto");
  const [model, setModel] = useState("gpt-5-mini");
  const [models, setModels] = useState<PlaygroundModel[]>(fallbackModels);
  const [providerLabel, setProviderLabel] = useState("AI 配置");
  const [showParams, setShowParams] = useState(false);
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([DEFAULT_CONVERSATION]);
  const [activeConversationId, setActiveConversationId] = useState(DEFAULT_CONVERSATION.id);
  const [storageReady, setStorageReady] = useState(false);
  const [sending, setSending] = useState(false);
  const [providerStatus, setProviderStatus] = useState(() => readLocalProviderStatus());

  const activeConversation = conversations.find((item) => item.id === activeConversationId) ?? conversations[0];
  const messages = activeConversation?.messages ?? [];
  const paramLabel = mode === "image" ? "图片参数" : mode === "chat" ? "聊天参数" : "参数";
  const visibleModels = useMemo(() => (mode === "image" ? models.filter(isImageModel) : models), [mode, models]);

  useEffect(() => {
    const stored = loadStoredConversations();
    setConversations(stored.conversations);
    setActiveConversationId(stored.activeId);
    setStorageReady(true);
  }, []);

  useEffect(() => {
    try {
      if (!storageReady) return;
      window.localStorage.setItem(PLAYGROUND_CONVERSATIONS_STORAGE_KEY, JSON.stringify(conversations));
    } catch {}
  }, [conversations, storageReady]);

  useEffect(() => {
    try {
      if (!storageReady) return;
      window.localStorage.setItem(PLAYGROUND_ACTIVE_CONVERSATION_STORAGE_KEY, activeConversationId);
    } catch {}
  }, [activeConversationId, storageReady]);

  useEffect(() => {
    setProviderStatus(readLocalProviderStatus());
    let active = true;
    fetch("/api/playground/models", { cache: "no-store" })
      .then((response) => response.json())
      .then((payload) => {
        if (!active || !payload?.success) return;
        const nextModels = payload.data?.models?.length ? payload.data.models : fallbackModels;
        setModels(nextModels);
        setProviderLabel(payload.data?.provider?.name ?? "AI 配置");
        setModel((current) => current || pickDefaultModel(nextModels, mode));
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const next = pickDefaultModel(models, mode);
    if (!visibleModels.some((item) => item.modelId === model) && next) {
      setModel(next);
    }
  }, [mode, model, models, visibleModels]);

  function updateActiveMessages(nextMessages: Message[]) {
    setConversations((current) => current.map((item) => (item.id === activeConversationId ? { ...item, messages: nextMessages } : item)));
  }

  function startNewConversation() {
    const next = createConversation(conversations.length + 1);
    setConversations((current) => [next, ...current]);
    setActiveConversationId(next.id);
    setInput("");
    setAttachments([]);
    setShowParams(false);
  }

  function deleteConversation(conversationId: string) {
    setConversations((current) => {
      const remaining = current.filter((item) => item.id !== conversationId);
      const next = remaining.length ? remaining : [createConversation(1)];
      if (conversationId === activeConversationId) {
        setActiveConversationId(next[0].id);
      }
      return next;
    });
  }

  function clearCurrentConversation() {
    updateActiveMessages([]);
    setInput("");
    setAttachments([]);
  }

  async function handleFiles(files: FileList | null) {
    if (!files?.length) return;
    const nextFiles = await Promise.all(
      Array.from(files).map(async (file) => ({
        id: `${file.name}-${file.lastModified}-${file.size}`,
        name: file.name,
        type: file.type || "file",
        size: file.size,
        dataUrl: await readFileAsDataUrl(file),
      })),
    );
    setAttachments((current) => [...current, ...nextFiles]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function sendMessage() {
    const text = input.trim();
    if ((!text && attachments.length === 0) || sending) return;

    const attachmentText = attachments.length ? `\n\n附件：${attachments.map((file) => file.name).join("、")}` : "";
    const userContent = `${text || "请根据附件继续。"}${attachmentText}`;
    const baseMessages: Message[] = [...messages, { role: "user", content: userContent }];
    updateActiveMessages(baseMessages);
    setInput("");
    setSending(true);

    try {
      const response = await fetch("/api/playground/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          model,
          message: text || "请根据附件继续。",
          images: attachments.map((file) => file.dataUrl).filter(Boolean),
        }),
      });
      const payload = await response.json();
      if (!payload.success) {
        const message = payload.error?.message ?? "发送失败";
        if (payload.error?.code === "SENSITIVE_WORD_BLOCKED") {
          const safeMessage = payload.error?.message ?? SENSITIVE_BLOCKED_MESSAGE;
          toast.warning(safeMessage, { duration: 7000 });
          updateActiveMessages(redactedMessages(baseMessages, safeMessage));
          setAttachments([]);
          return;
        } else {
          toast.error(message);
        }
        throw new Error(message);
      }

      const data = payload.data;
      const assistantMessage: Message =
        data?.type === "image"
          ? {
              role: "assistant",
              content: data.image?.revisedPrompt ? `图片已生成。\n${data.image.revisedPrompt}` : "图片已生成。",
              imageUrl: data.image?.url ?? (data.image?.b64Json ? `data:image/png;base64,${data.image.b64Json}` : null),
            }
          : { role: "assistant", content: data?.text || "模型没有返回内容。" };

      const nextMessages = [...baseMessages, assistantMessage];
      setConversations((current) =>
        current.map((item) =>
          item.id === activeConversationId
            ? { ...item, title: text ? text.slice(0, 18) : item.title, messages: nextMessages }
            : item,
        ),
      );
      setAttachments([]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "发送失败";
      updateActiveMessages([...baseMessages, { role: "assistant", content: message }]);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex h-full min-h-[680px] overflow-hidden rounded-[1.5rem] border border-slate-200 bg-white text-slate-950 shadow-sm dark:border-white/10 dark:bg-[#101011] dark:text-white">
      <aside className="flex w-[260px] shrink-0 flex-col border-r border-slate-200 bg-slate-50/70 p-3 dark:border-white/10 dark:bg-white/5">
        <div className="flex items-center gap-3 px-2 py-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-950 text-white dark:bg-white dark:text-black">
            <Bot className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-black tracking-normal">操练场</h1>
          </div>
          <Button variant="ghost" size="sm" className="h-9 w-9 rounded-xl p-0" title="收起">
            <ChevronLeft className="h-4 w-4" />
          </Button>
        </div>

        <Button className="mt-3 h-11 rounded-lg bg-slate-950 text-white hover:bg-slate-900 dark:bg-white dark:text-black dark:hover:bg-slate-100" onClick={startNewConversation}>
          <Plus className="mr-2 h-4 w-4" />
          新对话
        </Button>

        <div className="mt-4 space-y-2 overflow-y-auto pr-1">
          {conversations.map((conversation) => (
            <div
              key={conversation.id}
              className={cn(
                "group flex items-center gap-1 rounded-lg pr-1 transition",
                conversation.id === activeConversationId
                  ? "bg-white text-slate-950 shadow-sm dark:bg-white/10 dark:text-white"
                  : "text-slate-600 hover:bg-white/70 dark:text-slate-300 dark:hover:bg-white/8",
              )}
            >
              <button
                type="button"
                onClick={() => setActiveConversationId(conversation.id)}
                className="flex min-w-0 flex-1 items-center gap-3 px-3 py-3 text-left text-sm"
              >
                <MessageCircle className="h-4 w-4 shrink-0" />
                <span className="truncate">{conversation.title}</span>
              </button>
              <button
                type="button"
                onClick={() => deleteConversation(conversation.id)}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-slate-400 opacity-0 transition hover:bg-slate-100 hover:text-rose-600 group-hover:opacity-100 dark:hover:bg-white/10"
                title="删除对话"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>

        <div className="mt-auto rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-600 dark:border-white/10 dark:bg-black/20 dark:text-slate-300">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-slate-400">API Key</span>
            <span className={cn("inline-flex items-center gap-1", providerStatus.connected ? "text-emerald-600" : "text-amber-600")}>
              <span className={cn("h-2 w-2 rounded-full", providerStatus.connected ? "bg-emerald-500" : "bg-amber-500")} />
              {providerStatus.connected ? "已连接" : "未配置"}
            </span>
          </div>
          <div className="font-semibold text-slate-950 dark:text-white">{providerStatus.masked}</div>
          <div className="mt-1 truncate text-slate-400">{providerLabel}</div>
        </div>
      </aside>

      <section className="relative flex min-w-0 flex-1 flex-col bg-white dark:bg-[#111112]">
        <header className="flex min-h-[62px] shrink-0 flex-wrap items-center gap-3 border-b border-slate-200 px-5 py-3 dark:border-white/10">
          <select value={model} onChange={(event) => setModel(event.target.value)} className="h-10 w-[220px] rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none dark:border-white/10 dark:bg-black/20 lg:w-[260px]">
            {visibleModels.map((item) => (
              <option key={item.modelId} value={item.modelId}>{item.label || item.modelId}</option>
            ))}
          </select>

          <div className="grid h-10 w-[220px] grid-cols-3 rounded-lg border border-slate-200 bg-slate-100 p-1 dark:border-white/10 dark:bg-white/8 lg:w-[260px]">
            {modeOptions.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setMode(item.key)}
                className={cn(
                  "rounded-md text-sm font-semibold transition",
                  mode === item.key ? "bg-white text-slate-950 shadow-sm dark:bg-white dark:text-black" : "text-slate-600 dark:text-slate-300",
                )}
              >
                {item.label}
              </button>
            ))}
          </div>

          <Button variant="outline" className="h-10 rounded-lg" onClick={() => setShowParams((value) => !value)}>
            <SlidersHorizontal className="mr-2 h-4 w-4" />
            {paramLabel}
          </Button>

          <Button variant="outline" className="ml-auto h-10 rounded-lg whitespace-nowrap" onClick={clearCurrentConversation}>
            <Trash2 className="mr-2 h-4 w-4" />
            清空当前对话
          </Button>
        </header>

        {showParams ? <ParameterPanel mode={mode} /> : null}

        <main className="flex min-h-0 flex-1 flex-col overflow-y-auto px-8 py-8">
          {messages.length === 0 ? (
            <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col items-center justify-center pb-24">
              <h2 className="text-center text-2xl font-semibold tracking-normal">今天想聊点什么？</h2>
            </div>
          ) : (
            <div className="mx-auto w-full max-w-3xl space-y-4 pb-36">
              {messages.map((message, index) => (
                <div key={`${message.role}-${index}`} className={cn("flex", message.role === "user" ? "justify-end" : "justify-start")}>
                  <div
                    className={cn(
                      "max-w-[78%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-7",
                      message.role === "user" ? "bg-slate-950 text-white dark:bg-white dark:text-black" : "bg-slate-100 text-slate-800 dark:bg-white/8 dark:text-slate-100",
                    )}
                  >
                    {message.imageUrl ? <img src={message.imageUrl} alt="生成图片" className="mb-3 max-h-[420px] w-full rounded-xl object-contain" /> : null}
                    {message.content}
                  </div>
                </div>
              ))}
              {sending ? (
                <div className="flex justify-start">
                  <div className="inline-flex items-center gap-2 rounded-2xl bg-slate-100 px-4 py-3 text-sm text-slate-600 dark:bg-white/8 dark:text-slate-300">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    正在调用你的 AI 配置...
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </main>

        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-white via-white/95 to-transparent px-8 pb-5 pt-12 dark:from-[#111112] dark:via-[#111112]/95">
          <div className="mx-auto max-w-4xl">
            {attachments.length ? (
              <div className="mb-2 flex flex-wrap gap-2">
                {attachments.map((file) => (
                  <span key={file.id} className="inline-flex max-w-[220px] items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600 shadow-sm dark:border-white/10 dark:bg-[#1a1a1c] dark:text-slate-300">
                    {file.dataUrl ? <ImageIcon className="h-3.5 w-3.5 shrink-0" /> : <Paperclip className="h-3.5 w-3.5 shrink-0" />}
                    <span className="truncate">{file.name}</span>
                    <button onClick={() => setAttachments((current) => current.filter((item) => item.id !== file.id))} title="移除">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </span>
                ))}
              </div>
            ) : null}
            <div className="flex items-center gap-3 rounded-[2rem] border border-slate-200 bg-white p-2 shadow-[0_18px_60px_-36px_rgba(15,23,42,0.55)] dark:border-white/10 dark:bg-[#1a1a1c]">
              <input ref={fileInputRef} type="file" multiple accept="image/*,.pdf,.doc,.docx,.txt,.md,.csv,.xlsx,.xls,.ppt,.pptx,.zip" className="hidden" onChange={(event) => handleFiles(event.target.files)} />
              <Button variant="ghost" className="h-11 w-11 shrink-0 rounded-full p-0" title="上传图片或文件" onClick={() => fileInputRef.current?.click()}>
                <Plus className="h-5 w-5" />
              </Button>
              <Input
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    sendMessage();
                  }
                }}
                placeholder="问点什么，或描述一张图片..."
                className="h-11 flex-1 border-0 bg-transparent text-base shadow-none focus-visible:ring-0"
              />
              <Button onClick={sendMessage} disabled={sending} className="h-11 w-11 shrink-0 rounded-full bg-slate-950 p-0 text-white hover:bg-slate-800 disabled:opacity-60 dark:bg-white dark:text-black dark:hover:bg-slate-100" title="发送">
                {sending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
              </Button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function ParameterPanel({ mode }: { mode: Mode }) {
  const showChat = mode === "auto" || mode === "chat";
  const showImage = mode === "auto" || mode === "image";

  return (
    <div className="absolute left-7 right-7 top-[58px] z-20 max-h-[calc(100%-88px)] max-w-[760px] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_24px_80px_-42px_rgba(15,23,42,0.55)] dark:border-white/10 dark:bg-[#18181a]">
      {showChat ? (
        <div>
          <h3 className="text-sm font-semibold">聊天参数</h3>
          <div className="mt-3 grid grid-cols-3 gap-3">
            <Field label="温度" placeholder="Auto" />
            <Field label="Top P" placeholder="Auto" />
            <Field label="最大 tokens" placeholder="Auto" />
            <Field label="存在惩罚" placeholder="Auto" />
            <Field label="频率惩罚" placeholder="Auto" />
          </div>
          <SearchControls />
        </div>
      ) : null}

      {showChat && showImage ? <div className="my-5 h-px bg-slate-200 dark:bg-white/10" /> : null}

      {showImage ? (
        <div>
          <h3 className="text-sm font-semibold">图片参数</h3>
          <div className="mt-3 grid grid-cols-3 gap-3">
            <SelectField label="分辨率" values={["1024x1024", "1024x1536", "1536x1024"]} />
            <SelectField label="质量" values={["Auto", "High", "Medium", "Low"]} />
            <SelectField label="风格" values={["Auto", "写实", "插画", "产品图"]} />
            <SelectField label="背景" values={["Auto", "透明", "白底", "场景"]} />
            <SelectField label="格式" values={["Auto", "PNG", "JPEG", "WEBP"]} />
          </div>
          <label className="mt-3 block text-xs font-medium text-slate-600 dark:text-slate-300">图片额外 JSON</label>
          <Textarea className="mt-2 min-h-[76px]" placeholder='{"moderation":"auto"}' />
        </div>
      ) : null}
    </div>
  );
}

function SearchControls() {
  return (
    <div className="mt-5">
      <h3 className="text-sm font-semibold">联网搜索</h3>
      <div className="mt-3 grid grid-cols-4 gap-3">
        <SelectField label="搜索模式" values={["自动", "关闭", "强制"]} />
        <SelectField label="上下文量" values={["Auto", "Low", "Medium", "High"]} />
        <SelectField label="搜索预算" values={["Auto", "低", "中", "高"]} />
        <Field label="来源上限" placeholder="20" />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <Textarea className="min-h-[76px]" placeholder="openai.com, developers.openai.com" />
        <Textarea className="min-h-[76px]" placeholder="reddit.com, quora.com" />
      </div>
      <label className="mt-3 flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm dark:border-white/10 dark:bg-white/5">
        <input type="checkbox" defaultChecked className="h-4 w-4 accent-slate-950" />
        允许访问实时网页
      </label>
      <label className="mt-3 block text-xs font-medium text-slate-600 dark:text-slate-300">聊天额外 JSON</label>
      <Textarea className="mt-2 min-h-[76px]" placeholder='{"seed":1234,"reasoning":{"effort":"low"}}' />
    </div>
  );
}

function Field({ label, placeholder }: { label: string; placeholder: string }) {
  return (
    <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">
      {label}
      <Input className="mt-2 h-10" placeholder={placeholder} />
    </label>
  );
}

function SelectField({ label, values }: { label: string; values: string[] }) {
  return (
    <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">
      {label}
      <select className="mt-2 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none dark:border-white/10 dark:bg-black/20">
        {values.map((value) => (
          <option key={value}>{value}</option>
        ))}
      </select>
    </label>
  );
}
