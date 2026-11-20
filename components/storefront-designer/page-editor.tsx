"use client";

import { createContext, useContext, useEffect, useImperativeHandle, useMemo, useRef, useState, type ReactNode, type Ref } from "react";
import {
  BlockNoteSchema, createHeadingBlockSpec, defaultBlockSpecs, defaultInlineContentSpecs, defaultStyleSpecs,
  filterSuggestionItems, insertOrUpdateBlockForSlashMenu, type PartialBlock,
} from "@blocknote/core";
import { en as bnEn, vi as bnVi } from "@blocknote/core/locales";
import {
  BasicTextStyleButton, BlockTypeSelect, createReactBlockSpec, DragHandleMenu, FileCaptionButton, FileDeleteButton, FilePanel, FilePanelController,
  FileReplaceButton, FormattingToolbar, FormattingToolbarController, getDefaultReactSlashMenuItems, RemoveBlockItem, SideMenu, SideMenuController,
  SuggestionMenuController, UploadTab, useCreateBlockNote, type FilePanelProps,
} from "@blocknote/react";
import { BlockNoteView } from "@blocknote/shadcn";
import "@blocknote/shadcn/style.css";
import { Eye, EyeOff, LayoutGrid, Settings2 } from "lucide-react";

import { renderStorefrontBlock, type BlockEditor, type StorefrontBlocksData } from "@/components/public/storefront-blocks";
import type { DesignerMessages } from "@/lib/i18n/portal/designer";
import {
  newLayoutBlockId, REQUIRED_BLOCKS, SECTION_BLOCK_TYPES, TEXT_MAX_NODES,
  type LayoutBlock, type LayoutBlockType, type TextNode, type TextRun,
} from "@/lib/storefront-layout";

/**
 * Trình soạn trang kiểu Notion (BlockNote; chủ sàn chốt phương án 3, 2026-11-20). Cả trang là một
 * tài liệu: gõ đoạn văn, tiêu đề, danh sách, chèn ảnh ở bất kỳ đâu; gõ "/" để chèn đoạn văn hoặc
 * các mục của trang (sản phẩm, số liệu, xác minh…). Mỗi mục là một khối đặc biệt hiển thị đúng như
 * trang thật, sửa tại chỗ và có bảng cài đặt riêng.
 *
 * Lưu vẫn ra bố cục có cấu trúc (StorefrontLayout): đoạn văn liền nhau thành khối "text", mục giữ
 * nguyên kiểu. Máy chủ kiểm tra như cũ (tiếng Anh, không liên hệ, ảnh đúng nhà cung cấp, khoá gói),
 * trang công khai dựng HTML ngữ nghĩa cho SEO. Chỉ chữ đậm, nghiêng: không link, màu, cỡ chữ.
 */

export type PageEditorHandle = { replace: (blocks: LayoutBlock[]) => void; undo: () => void; redo: () => void };

type SectionContext = {
  data: StorefrontBlocksData;
  copy: DesignerMessages;
  editorFor: (patch: SectionPatch) => BlockEditor;
  settings: (block: LayoutBlock, patch: SectionPatch) => ReactNode;
  emptyBlock: (block: LayoutBlock) => ReactNode;
};
/** Sửa khối mục: đưa thay đổi, hoặc hàm tính thay đổi từ khối mới nhất (sau khi tải ảnh xong). */
export type SectionPatch = (change: Partial<LayoutBlock> | ((current: LayoutBlock) => Partial<LayoutBlock>)) => void;
const Ctx = createContext<SectionContext | null>(null);

/** Khối "mục trang": giữ nguyên dữ liệu khối bố cục (JSON) trong một thuộc tính. */
const sectionBlock = createReactBlockSpec(
  { type: "section", propSchema: { data: { default: "{}" } }, content: "none" },
  { render: ({ block, editor }) => <SectionView id={block.id} data={block.props.data}
    onChange={(next) => editor.updateBlock(block.id, { props: { data: next } })} /> },
);

const schema = BlockNoteSchema.create({
  blockSpecs: {
    paragraph: defaultBlockSpecs.paragraph,
    heading: createHeadingBlockSpec({ levels: [2, 3], defaultLevel: 2 }),
    bulletListItem: defaultBlockSpecs.bulletListItem,
    numberedListItem: defaultBlockSpecs.numberedListItem,
    image: defaultBlockSpecs.image,
    section: sectionBlock(),
  },
  // Link vẫn có trong lược đồ (thư viện cần), nhưng không có nút tạo link và khi lưu chỉ giữ chữ.
  inlineContentSpecs: defaultInlineContentSpecs,
  styleSpecs: { bold: defaultStyleSpecs.bold, italic: defaultStyleSpecs.italic },
});
type Editor = typeof schema.BlockNoteEditor;
type DocBlock = typeof schema.Block;
type DocPartial = PartialBlock<typeof schema.blockSchema, typeof schema.inlineContentSchema, typeof schema.styleSchema>;

/** Mục văn bản có sẵn trong menu "/". */
const TEXT_ITEMS = new Set(["heading_2", "heading_3", "paragraph", "bullet_list", "numbered_list", "image"]);

function parse(data: string): LayoutBlock | null {
  try { const value = JSON.parse(data) as LayoutBlock; return value && typeof value === "object" && typeof value.type === "string" ? value : null; }
  catch { return null; }
}

/** Bố cục → tài liệu soạn thảo. */
export function layoutToDoc(blocks: LayoutBlock[], previewUrl: (path: string) => string): DocPartial[] {
  const doc: DocPartial[] = [];
  for (const block of blocks) {
    if (block.type !== "text") { doc.push({ id: block.id, type: "section", props: { data: JSON.stringify(block) } }); continue; }
    block.nodes.forEach((node, i) => {
      const id = i === 0 ? { id: block.id } : {};
      if (node.kind === "img") { doc.push({ ...id, type: "image", props: { url: previewUrl(node.path), caption: node.caption } }); return; }
      const content = node.runs.map((run) => ({ type: "text" as const, text: run.t, styles: { ...(run.b ? { bold: true as const } : {}), ...(run.i ? { italic: true as const } : {}) } }));
      if (node.kind === "h2" || node.kind === "h3") doc.push({ ...id, type: "heading", props: { level: node.kind === "h2" ? 2 : 3 }, content });
      else doc.push({ ...id, type: node.kind === "ul" ? "bulletListItem" : node.kind === "ol" ? "numberedListItem" : "paragraph", content });
    });
  }
  return doc;
}

/** Tài liệu soạn thảo → bố cục: đoạn văn liền nhau gộp một khối "text"; khối con được trải phẳng. */
export function docToLayout(doc: DocBlock[], previewBase: string): LayoutBlock[] {
  const out: LayoutBlock[] = [];
  let text: Extract<LayoutBlock, { type: "text" }> | null = null;
  const flush = () => { if (text && text.nodes.length) out.push(text); text = null; };
  const walk = (block: DocBlock) => {
    if (block.type === "section") {
      flush();
      const parsed = parse(block.props.data);
      if (parsed) out.push({ ...parsed, id: block.id } as LayoutBlock);
    } else {
      const node = toNode(block, previewBase);
      if (node) {
        if (!text || text.nodes.length >= TEXT_MAX_NODES) { flush(); text = { id: block.id, type: "text", nodes: [] }; }
        text.nodes.push(node);
      }
    }
    for (const child of block.children ?? []) walk(child as DocBlock);
  };
  doc.forEach(walk);
  flush();
  return out;
}

function toNode(block: DocBlock, previewBase: string): TextNode | null {
  if (block.type === "image") {
    const url = block.props.url ?? "";
    if (!url.startsWith(previewBase)) return null;
    return { kind: "img", path: decodeURIComponent(url.slice(previewBase.length)), caption: block.props.caption ?? "" };
  }
  const content = Array.isArray(block.content) ? block.content : [];
  type Styled = { type: string; text?: string; styles?: { bold?: boolean; italic?: boolean }; content?: Styled[] };
  const flat = (items: Styled[]): Styled[] => items.flatMap((item) => item.type === "link" ? flat(item.content ?? []) : [item]);
  const runs: TextRun[] = flat(content as Styled[]).flatMap((item) => item.type === "text" && item.text
    ? [{ t: item.text, ...(item.styles?.bold ? { b: true as const } : {}), ...(item.styles?.italic ? { i: true as const } : {}) }] : []);
  if (!runs.some((run) => run.t.trim())) return null;
  const kind = block.type === "heading" ? (block.props.level === 3 ? "h3" : "h2")
    : block.type === "bulletListItem" ? "ul" : block.type === "numberedListItem" ? "ol" : "p";
  return { kind, runs };
}

export function PageEditor({ initial, onChange, previewUrl, previewBase, upload, canAdd, copy, locale, data, editorFor, settings, emptyBlock, handle }: {
  initial: LayoutBlock[];
  onChange: (blocks: LayoutBlock[]) => void;
  previewUrl: (path: string) => string;
  /** Tiền tố đường dẫn xem trước ảnh, để đổi ngược URL ảnh trong tài liệu thành đường dẫn lưu. */
  previewBase: string;
  upload: (file: File) => Promise<string | null>;
  canAdd: (type: LayoutBlockType, blocks: LayoutBlock[]) => boolean;
  copy: DesignerMessages;
  locale: "vi" | "en";
  data: StorefrontBlocksData;
  editorFor: SectionContext["editorFor"];
  settings: SectionContext["settings"];
  emptyBlock: SectionContext["emptyBlock"];
  handle?: Ref<PageEditorHandle>;
}) {
  const uploadRef = useRef(upload);
  uploadRef.current = upload;
  const editor = useCreateBlockNote({
    schema,
    initialContent: initial.length ? layoutToDoc(initial, previewUrl) : undefined,
    dictionary: { ...(locale === "vi" ? bnVi : bnEn), placeholders: { ...(locale === "vi" ? bnVi : bnEn).placeholders, default: copy.editor.placeholder, emptyDocument: copy.editor.placeholder } },
    uploadFile: async (file: File) => {
      const path = await uploadRef.current(file);
      if (!path) throw new Error(copy.errors.upload);
      return previewUrl(path);
    },
  }) as Editor;

  useImperativeHandle(handle, () => ({
    replace: (blocks) => editor.replaceBlocks(editor.document, layoutToDoc(blocks, previewUrl)),
    undo: () => { editor.undo(); },
    redo: () => { editor.redo(); },
  }), [editor, previewUrl]);

  const emit = () => {
    let blocks = docToLayout(editor.document as DocBlock[], previewBase);
    // Khối xác minh của Vexim là bắt buộc: lỡ xoá thì thêm lại cuối trang.
    if (!blocks.some((block) => block.type === "checks")) {
      const last = editor.document[editor.document.length - 1];
      const checks = { id: newLayoutBlockId(), type: "checks" as const };
      if (last) editor.insertBlocks([{ id: checks.id, type: "section", props: { data: JSON.stringify(checks) } }], last, "after");
      blocks = docToLayout(editor.document as DocBlock[], previewBase);
    }
    onChange(blocks);
  };
  const emitRef = useRef(emit);
  emitRef.current = emit;
  useEffect(() => { emitRef.current(); }, []);

  const context = useMemo<SectionContext>(() => ({ data, copy, editorFor, settings, emptyBlock }), [data, copy, editorFor, settings, emptyBlock]);

  const slashItems = (query: string) => {
    const current = docToLayout(editor.document as DocBlock[], previewBase);
    const text = getDefaultReactSlashMenuItems(editor).filter((item) => TEXT_ITEMS.has((item as { key?: string }).key ?? ""));
    const sections = SECTION_BLOCK_TYPES.filter((type) => canAdd(type, current)).map((type) => ({
      title: copy.types[type].name,
      subtext: copy.types[type].desc,
      group: copy.editor.sectionsGroup,
      icon: <LayoutGrid className="size-[18px]" aria-hidden="true" />,
      aliases: [type],
      onItemClick: () => { insertOrUpdateBlockForSlashMenu(editor, { id: newLayoutBlockId(), type: "section", props: { data: JSON.stringify(newSection(type, data)) } }); },
    }));
    return filterSuggestionItems([...text, ...sections], query);
  };

  return <Ctx.Provider value={context}>
    <BlockNoteView editor={editor} theme="light" slashMenu={false} sideMenu={false} formattingToolbar={false} filePanel={false} onChange={() => emitRef.current()}
      className="vexim-page-editor">
      <SuggestionMenuController triggerCharacter="/" getItems={async (query) => slashItems(query)} />
      <FilePanelController filePanel={(props) => <UploadOnlyPanel {...props} title={(locale === "vi" ? bnVi : bnEn).file_panel.upload.title} />} />
      <SideMenuController sideMenu={(props) => <SideMenu {...props} dragHandleMenu={() => <DragHandleMenu>
        <RemoveBlockItem>{copy.remove}</RemoveBlockItem>
      </DragHandleMenu>} />} />
      <FormattingToolbarController formattingToolbar={() => <FormattingToolbar>
        <BlockTypeSelect key="type" />
        <FileCaptionButton key="caption" />
        <FileReplaceButton key="replace" />
        <FileDeleteButton key="delete" />
        <BasicTextStyleButton basicTextStyle="bold" key="bold" />
        <BasicTextStyleButton basicTextStyle="italic" key="italic" />
      </FormattingToolbar>} />
    </BlockNoteView>
  </Ctx.Provider>;
}

/** Chỉ tải ảnh lên (không nhúng ảnh từ đường link ngoài: ảnh phải nằm trong kho của nhà cung cấp). */
function UploadOnlyPanel(props: FilePanelProps & { title: string }) {
  const [, setLoading] = useState(false);
  return <FilePanel blockId={props.blockId} defaultOpenTab={props.title}
    tabs={[{ name: props.title, tabPanel: <UploadTab blockId={props.blockId} setLoading={setLoading} /> }]} />;
}

/** Khối mục mới với nội dung mặc định (như nút thêm khối cũ). */
function newSection(type: LayoutBlockType, data: StorefrontBlocksData): LayoutBlock {
  const id = newLayoutBlockId();
  if (type === "banner") return { id, type, images: [], eyebrow: "", headline: "" };
  if (type === "stats") {
    const stats = (Object.keys(data.statValues) as (keyof typeof data.statValues)[]).filter((stat) => data.statValues[stat]).slice(0, 4);
    return { id, type, stats: stats.length ? stats : ["capacity"] } as LayoutBlock;
  }
  if (type === "products") return { id, type, product_ids: Object.keys(data.products).slice(0, 4) };
  if (type === "about") return { id, type, image_path: "", title: "", body: "" };
  if (type === "video") return { id, type, video_uid: "", title: "" };
  if (type === "text") return { id, type, nodes: [] };
  return { id, type } as LayoutBlock;
}

/** Mục trang trong tài liệu: hiển thị như trang thật, sửa tại chỗ, nút cài đặt và ẩn. */
function SectionView({ id, data, onChange }: { id: string; data: string; onChange: (data: string) => void }) {
  const ctx = useContext(Ctx);
  const [open, setOpen] = useState(false);
  const block = useMemo(() => { const parsed = parse(data); return parsed ? { ...parsed, id } as LayoutBlock : null; }, [data, id]);
  const latest = useRef(block);
  latest.current = block;
  if (!ctx || !block) return null;
  const patch: SectionPatch = (change) => {
    const current = latest.current;
    if (!current) return;
    const next = { ...current, ...(typeof change === "function" ? change(current) : change) };
    latest.current = next as LayoutBlock;
    onChange(JSON.stringify(next));
  };
  const required = REQUIRED_BLOCKS.includes(block.type);
  const view = renderStorefrontBlock(block, ctx.data, 0, ctx.editorFor(patch));
  const panel = ctx.settings(block, patch);
  // Ô chữ, nút trong mục là phần tử thường: chặn để trình soạn không coi là gõ vào tài liệu.
  const stop = (event: React.SyntheticEvent) => event.stopPropagation();
  return <div contentEditable={false} suppressContentEditableWarning className="vexim-section relative my-3 w-full select-text"
    onKeyDown={stop} onKeyUp={stop} onKeyPress={stop} onPaste={stop} onCopy={stop} onCut={stop} onInput={stop} onBeforeInput={stop} onDrop={stop}>
    <div className="pointer-events-none absolute -top-3 left-3 z-20 flex items-center gap-1">
      <span className="pointer-events-auto inline-flex items-center gap-1 rounded-full border border-ink-200 bg-white px-2 py-0.5 text-[11px] font-bold text-ink-700 shadow-sm">
        <LayoutGrid className="size-3" aria-hidden="true" />{ctx.copy.types[block.type].name}
        {required && <span className="ml-1 rounded-full bg-ink-100 px-1.5 text-[10px] text-ink-600" title={ctx.copy.requiredHint}>{ctx.copy.required}</span>}
      </span>
      {panel && <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}
        className="pointer-events-auto inline-flex items-center gap-1 rounded-full border border-ink-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-ink-700 shadow-sm hover:bg-brand-50">
        <Settings2 className="size-3" aria-hidden="true" />{ctx.copy.editor.settings}
      </button>}
      {!required && <button type="button" onClick={() => patch({ hidden: !block.hidden || undefined })}
        className="pointer-events-auto inline-flex items-center gap-1 rounded-full border border-ink-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-ink-700 shadow-sm hover:bg-brand-50">
        {block.hidden ? <EyeOff className="size-3" aria-hidden="true" /> : <Eye className="size-3" aria-hidden="true" />}{block.hidden ? ctx.copy.show : ctx.copy.hide}
      </button>}
    </div>
    <div className={`rounded-xl pt-2 outline outline-1 outline-offset-4 outline-transparent transition hover:outline-brand-200 ${block.hidden ? "opacity-40" : ""}`}>
      {view ?? ctx.emptyBlock(block)}
    </div>
    {open && panel && <div className="mt-3 space-y-3 rounded-xl border border-brand-200 bg-brand-50/40 p-4 text-[12.5px]">{panel}</div>}
  </div>;
}
