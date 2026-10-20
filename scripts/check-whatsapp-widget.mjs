#!/usr/bin/env node
/**
 * Kiểm tra hồi quy widget WhatsApp public.
 * Chạy: node scripts/check-whatsapp-widget.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../components/whatsapp-chat-button.tsx", import.meta.url), "utf8");
const layout = readFileSync(new URL("../app/(public)/layout.tsx", import.meta.url), "utf8");

assert.match(source, /^"use client";/);
assert.ok(layout.includes("<WhatsAppChatButton />"), "Widget chưa được gắn vào layout public");
assert.ok(source.includes("wa.me/") || source.includes("https://wa.me/${WHATSAPP_NUMBER}"), "Thiếu liên kết wa.me");
assert.ok(source.includes("84373685634"), "Sai số WhatsApp");
assert.ok(source.includes("window.setTimeout(() => setOpen(true), 800)"), "Widget chưa tự mở sau khi trang tải");
assert.ok(source.includes("vexim:whatsapp-widget-dismissed"), "Chưa ghi nhớ việc đóng trong phiên tab");
assert.ok(source.includes("Type your message"), "Thiếu ô gõ tin nhắn đầu tiên");
assert.ok(source.includes("Pressing send opens WhatsApp"), "Chưa nói rõ thao tác mở WhatsApp");
assert.ok(!source.includes("iframe"), "Không được nhúng iframe WhatsApp");

console.log("ĐẠT: Widget WhatsApp tự mở, có ô soạn tin và chuyển đúng sang wa.me.");
