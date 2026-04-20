#!/usr/bin/env node
// Dump full block content for a specific JSONL line.

import { readFileSync } from "node:fs";

const [path, lineArg] = process.argv.slice(2);
const target = parseInt(lineArg, 10);

const lines = readFileSync(path, "utf8").trim().split("\n");
const r = JSON.parse(lines[target - 1]);
console.log(JSON.stringify(r.message?.content, null, 2));
