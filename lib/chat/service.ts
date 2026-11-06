import "server-only";

import brandColors from "@/lib/brand/colors.json";
import { FROM_ADDRESS, SERVICE_FROM_ADDRESS } from "@/lib/config";
import type { DataStore } from "@/lib/db/types";
import { transport } from "@/lib/email/send";
import { escapeHtml, wrapPlainEmail } from "@/lib/email/templates";
import { getPublicProductRecordsByIds } from "@/lib/public/product-catalog";
import { notificationOrigin } from "@/lib/supplier-portal/notify";
import { SITE_URL } from "@/lib/site";
import { presenceKey, readPresence } from "./presence";
import { supplierShortName } from "@/lib/public/supplier-name";
import type { ChatConversation, ChatMessage, ChatSender, Supplier } from "@/lib/types";
import { chatPreview, chatRateLimited, cleanChatBody, hasUnread, otherSide, shouldNotify, tooManyNewConversations } from "./core";

/**
 * Chat người mua ↔ nhà cung cấp. Thay luồng email trực tiếp của "Ask supplier": cuộc trò
 * chuyện nằm trên Vexim, email chỉ là lời báo có tin mới (giới hạn tần suất, không mang
 * email người mua cho nhà cung cấp). Mọi kiểm quyền nằm ở đây và ở API, không ở trình duyệt.
 */

export class ChatError extends Error {
  constructor(public code: "not_found" | "forbidden" | "empty" | "too_long" | "rate_limited" | "product_unavailable") { super(code); }
}

export interface ChatConversationView {
  id: string;
  /** Tên bên kia hiển thị cho người đang xem. */
  counterpart: string;
  counterpartHref: string | null;
  productName: string | null;
  preview: string | null;
  lastMessageAt: string | null;
  unread: boolean;
  /** Bên kia đã đọc tới mốc này: tin của mình gửi trước mốc là "đã xem". */
  counterpartReadAt: string | null;
  /** Lần cuối bên kia còn mở Vexim; null là chưa biết. */
  counterpartLastSeen: string | null;
}

/** Thẻ sản phẩm trong khung chat: cả hai bên nhìn thấy cùng một hàng hoá. */
export interface ChatProductCard {
  id: string;
  name: string;
  /** Có khi sản phẩm còn công khai; sản phẩm đã gỡ chỉ còn tên đã lưu trong tin. */
  imageUrl: string | null;
  href: string | null;
  price: string | null;
}

export interface ChatMessageView {
  id: string;
  mine: boolean;
  body: string;
  productName: string | null;
  product: ChatProductCard | null;
  createdAt: string;
}

/** Tên ngắn (tên hiển thị, tên thương mại, rồi pháp nhân đã bỏ tiền tố, hạ kiểu chữ). */
function supplierName(s: Pick<Supplier, "display_name" | "trade_name" | "name">): string {
  return supplierShortName({ name: s.name || "Supplier", trade_name: s.trade_name, display_name: s.display_name }) || "Supplier";
}

/** Nhà cung cấp chỉ thấy tên công ty người mua đã khai, không thấy email. */
async function buyerLabel(store: DataStore, email: string): Promise<string> {
  const account = await store.getBuyerUserByEmail(email).catch(() => null);
  if (account?.company_name?.trim()) return account.company_name.trim();
  const crm = typeof store.getBuyerByEmail === "function" ? await store.getBuyerByEmail(email).catch(() => null) : null;
  return crm?.company?.trim() || "Người mua";
}

export async function conversationViews(store: DataStore, rows: ChatConversation[], side: ChatSender): Promise<ChatConversationView[]> {
  const otherKey = (c: ChatConversation) => side === "buyer" ? presenceKey.supplier(c.supplier_id) : presenceKey.buyer(c.buyer_email);
  const seen = await readPresence(store, rows.map(otherKey));
  return Promise.all(rows.map(async (c) => {
    let counterpart = "";
    let counterpartHref: string | null = null;
    if (side === "buyer") {
      const supplier = await store.getSupplier(c.supplier_id).catch(() => null);
      counterpart = supplier ? supplierName(supplier) : "Supplier";
      counterpartHref = supplier?.status === "published" ? `/suppliers/${encodeURIComponent(supplier.slug || supplier.id)}` : null;
    } else {
      counterpart = await buyerLabel(store, c.buyer_email);
    }
    return { id: c.id, counterpart, counterpartHref, productName: c.product_name, preview: c.last_message_preview,
      lastMessageAt: c.last_message_at ?? c.created_at, unread: hasUnread(c, side),
      counterpartReadAt: side === "buyer" ? c.supplier_last_read_at : c.buyer_last_read_at,
      counterpartLastSeen: seen[otherKey(c)] ?? null };
  }));
}

/** Ảnh, giá và đường dẫn của các sản phẩm còn công khai, qua đúng cổng công bố của trang danh mục. */
async function productCards(ids: string[]): Promise<Map<string, ChatProductCard>> {
  const unique = [...new Set(ids.filter(Boolean))].slice(0, 30);
  if (!unique.length) return new Map();
  const records = await getPublicProductRecordsByIds(unique).catch(() => []);
  return new Map(records.map((r) => {
    const path = r.card.cardImagePath ?? r.card.imagePaths[0] ?? null;
    return [r.product.id, {
      id: r.product.id,
      name: (r.card.name || r.product.name).slice(0, 200),
      imageUrl: path ? `/public-media/${path.replace(/^\/+/, "")}` : null,
      href: `/products/${encodeURIComponent(r.category.slug)}/${encodeURIComponent(r.card.id)}`,
      price: r.card.price ?? null,
    }];
  }));
}

export async function messageViews(messages: ChatMessage[], side: ChatSender): Promise<ChatMessageView[]> {
  const cards = await productCards(messages.map((m) => m.product_id ?? ""));
  return messages.map((m) => ({
    id: m.id, mine: m.sender === side, body: m.body, productName: m.product_name, createdAt: m.created_at,
    product: m.product_id ? cards.get(m.product_id) ?? { id: m.product_id, name: m.product_name ?? "", imageUrl: null, href: null, price: null } : null,
  }));
}

/** Cuộc trò chuyện của đúng người đang xem; không phải của họ thì coi như không tồn tại. */
export async function ownedConversation(store: DataStore, id: string, viewer: { side: "buyer"; email: string } | { side: "supplier"; supplierId: string }): Promise<ChatConversation> {
  const conversation = /^[0-9a-f-]{8,64}$/i.test(id) ? await store.getChatConversation(id) : null;
  if (!conversation) throw new ChatError("not_found");
  const owns = viewer.side === "buyer"
    ? conversation.buyer_email === viewer.email.trim().toLowerCase()
    : conversation.supplier_id === viewer.supplierId;
  if (!owns) throw new ChatError("not_found");
  return conversation;
}

export async function markConversationRead(store: DataStore, conversation: ChatConversation, side: ChatSender): Promise<void> {
  if (!hasUnread(conversation, side)) return;
  // Không lùi sau tin cuối: lệch đồng hồ giữa máy chủ và CSDL không được để tin còn "chưa đọc".
  const now = new Date().toISOString();
  const at = conversation.last_message_at && conversation.last_message_at > now ? conversation.last_message_at : now;
  await store.updateChatConversation(conversation.id, side === "buyer" ? { buyer_last_read_at: at } : { supplier_last_read_at: at });
}

/**
 * Người mua bấm "Ask supplier": mở cuộc trò chuyện với nhà cung cấp của sản phẩm (hoặc mở
 * lại cuộc cũ) và gửi tin đầu. Sản phẩm phải đang công khai, nên không hỏi được sản phẩm
 * đã gỡ hay nhà cung cấp chưa duyệt.
 */
export async function startConversation(input: { store: DataStore; buyerEmail: string; productId: string; body: string }): Promise<ChatConversation> {
  const checked = cleanChatBody(input.body);
  if (!checked.ok) throw new ChatError(checked.error);
  const [record] = await getPublicProductRecordsByIds([input.productId]);
  if (!record) throw new ChatError("product_unavailable");
  const productName = (record.card.name || record.product.name).slice(0, 200);
  const existing = await input.store.findChatConversation(input.buyerEmail, record.supplier.id);
  if (!existing && tooManyNewConversations(await input.store.listChatConversations({ buyerEmail: input.buyerEmail, limit: 100 }))) {
    throw new ChatError("rate_limited");
  }
  const conversation = existing ?? await input.store.createChatConversation({
    buyer_email: input.buyerEmail, supplier_id: record.supplier.id, product_id: record.product.id, product_name: productName,
  });
  await postMessage({ store: input.store, conversation, sender: "buyer", senderEmail: input.buyerEmail, body: checked.body,
    product: { id: record.product.id, name: productName } });
  return conversation;
}

/**
 * Sản phẩm đính kèm vào một tin trong cuộc đã có: chỉ nhận sản phẩm đang công khai và đúng
 * nhà cung cấp của cuộc trò chuyện, để người mua không gắn hàng của bên khác vào.
 */
export async function attachableProduct(conversation: ChatConversation, productId: string): Promise<{ id: string; name: string } | null> {
  if (!productId) return null;
  const [record] = await getPublicProductRecordsByIds([productId]);
  if (!record || record.supplier.id !== conversation.supplier_id) return null;
  return { id: record.product.id, name: (record.card.name || record.product.name).slice(0, 200) };
}

/** Cửa sổ chat trên trang sản phẩm hỏi trước: người mua đã có cuộc với nhà cung cấp này chưa. */
export async function existingConversationForProduct(store: DataStore, buyerEmail: string, productId: string): Promise<string | null> {
  const [record] = await getPublicProductRecordsByIds([productId]);
  if (!record) throw new ChatError("product_unavailable");
  return (await store.findChatConversation(buyerEmail, record.supplier.id))?.id ?? null;
}

export async function postMessage(input: {
  store: DataStore; conversation: ChatConversation; sender: ChatSender; senderEmail: string; body: string;
  product?: { id: string; name: string } | null;
}): Promise<ChatMessage> {
  const { store, conversation, sender } = input;
  const checked = cleanChatBody(input.body);
  if (!checked.ok) throw new ChatError(checked.error);
  const recent = await store.listChatMessages(conversation.id, 60);
  if (chatRateLimited(recent, sender)) throw new ChatError("rate_limited");
  const message = await store.addChatMessage({
    conversation_id: conversation.id, sender, sender_email: input.senderEmail.trim().toLowerCase(), body: checked.body,
    product_id: input.product?.id ?? null, product_name: input.product?.name ?? null,
  });
  const patch: Partial<ChatConversation> = {
    last_message_at: message.created_at, last_message_preview: chatPreview(checked.body), last_sender: sender,
    // Người gửi đương nhiên đã đọc tới tin của mình.
    ...(sender === "buyer" ? { buyer_last_read_at: message.created_at } : { supplier_last_read_at: message.created_at }),
    ...(input.product ? { product_id: input.product.id, product_name: input.product.name } : {}),
  };
  const recipient = otherSide(sender);
  const latest = { ...conversation, ...patch };
  if (shouldNotify(latest, recipient)) {
    const sent = await notifyNewMessage(store, latest, recipient, checked.body)
      .catch((error) => { console.error("[chat] new-message email failed", error); return false; });
    if (sent) Object.assign(patch, recipient === "buyer" ? { buyer_notified_at: message.created_at } : { supplier_notified_at: message.created_at });
  }
  await store.updateChatConversation(conversation.id, patch);
  return message;
}

/** Email báo tin mới. Không chứa email người mua; trả lời phải làm trên Vexim. */
/** Nút lớn trong email báo tin: trả lời diễn ra trên Vexim, không qua hộp thư. */
function replyButton(href: string, label: string) {
  return `<p style="margin:20px 0;"><a href="${escapeHtml(href)}" style="display:inline-block;background:${brandColors.primary};color:#ffffff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:10px;">${escapeHtml(label)}</a></p>`;
}

/**
 * Email chỉ để báo có tin mới; mọi trao đổi diễn ra trong khung chat trên Vexim để hai bên
 * có chung một lịch sử, email người mua không lộ ra và sàn theo dõi được thời gian phản hồi.
 */
async function notifyNewMessage(store: DataStore, conversation: ChatConversation, recipient: ChatSender, body: string): Promise<boolean> {
  const preview = chatPreview(body, 600);
  const product = conversation.product_name ? ` · ${conversation.product_name}` : "";
  if (recipient === "supplier") {
    const supplier = await store.getSupplier(conversation.supplier_id);
    if (!supplier) return false;
    const users = await store.listUsers().catch(() => []);
    const portal = users.filter((u) => u.is_active && u.role === "supplier" && u.supplier_id === supplier.id).map((u) => u.email.trim().toLowerCase());
    const to = [...new Set(portal.length ? portal : supplier.email ? [supplier.email.trim().toLowerCase()] : [])].filter(Boolean);
    if (!to.length) return false;
    const from = await buyerLabel(store, conversation.buyer_email);
    const link = `${notificationOrigin()}/supplier/portal/messages?c=${encodeURIComponent(conversation.id)}`;
    const title = `Tin nhắn mới từ ${from}${product}`;
    const html = `<p>Bạn có tin nhắn mới từ người mua trên Vexim.</p>
      <div style="margin:14px 0;padding:12px 16px;border-left:4px solid ${brandColors.primary};background:${brandColors.surface};white-space:pre-wrap;">${escapeHtml(preview)}</div>
      ${replyButton(link, "Trả lời trên Vexim")}
      <p style="color:${brandColors.muted};font-size:12.5px;">Vui lòng không trả lời email này: người mua chỉ nhận được tin gửi trong mục Tin nhắn của cổng nhà cung cấp. Trả lời sớm giúp hồ sơ của bạn được tin cậy hơn.</p>`;
    const res = await transport({ to, from: SERVICE_FROM_ADDRESS, subject: title, html: wrapPlainEmail({ title: escapeHtml(title), body: html }),
      text: `${title}\n\n${preview}\n\nTrả lời trên Vexim: ${link}\nVui lòng không trả lời email này: người mua chỉ nhận được tin gửi trên Vexim.`, headers: { "X-Vexim-Chat": conversation.id } });
    return res.ok;
  }
  const supplier = await store.getSupplier(conversation.supplier_id).catch(() => null);
  const name = supplier ? supplierName(supplier) : "the supplier";
  const link = `${SITE_URL}/buyer/account/messages?c=${encodeURIComponent(conversation.id)}`;
  const title = `New message from ${name}${product}`;
  const html = `<p>You have a new message on Vexim Trade.</p>
    <div style="margin:14px 0;padding:12px 16px;border-left:4px solid ${brandColors.primary};background:${brandColors.surface};white-space:pre-wrap;">${escapeHtml(preview)}</div>
    ${replyButton(link, "Reply on Vexim")}
    <p style="color:${brandColors.muted};font-size:12.5px;">Please do not reply to this email. The supplier only receives messages sent from your Vexim account, and your email address stays private.</p>`;
  const res = await transport({ to: [conversation.buyer_email], from: FROM_ADDRESS, subject: title,
    html: wrapPlainEmail({ title: escapeHtml(title), body: html }), text: `${title}\n\n${preview}\n\nReply on Vexim: ${link}\nPlease do not reply to this email. The supplier only receives messages sent on Vexim.`,
    headers: { "X-Vexim-Chat": conversation.id } });
  return res.ok;
}
