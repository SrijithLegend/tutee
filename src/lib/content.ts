import fs from "node:fs";
import path from "node:path";
import type { ContentPack } from "@/types/content";

let cached: ContentPack | null = null;

export function getContent(): ContentPack {
  if (!cached) {
    const file = path.join(process.cwd(), "content", "algebra.json");
    cached = JSON.parse(fs.readFileSync(file, "utf-8")) as ContentPack;
  }
  return cached;
}
