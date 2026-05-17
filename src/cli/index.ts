#!/usr/bin/env node
import { createProgram, loadVersion } from "./program.js";
import {
  startUpdateCheck,
  formatUpdateNotification,
} from "../infra/update-check.js";

const currentVersion = loadVersion();
const updatePromise = startUpdateCheck(currentVersion);

const program = createProgram();
await program.parseAsync();

const result = await updatePromise;
if (result) {
  console.log(formatUpdateNotification(result.current, result.latest));
}
