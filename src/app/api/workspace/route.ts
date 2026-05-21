import { NextResponse } from "next/server";
import {
  getOrCreateAccount,
  loadWorkspacePayload,
  normalizePreference,
  persistWorkspace,
  type WorkspacePreference,
} from "@/lib/account";
import { EMPTY_WORKFLOW_STATE, parseWorkflowState, type WorkflowState } from "@/lib/workflow";

export async function GET() {
  const account = await getOrCreateAccount();
  const payload = await loadWorkspacePayload(account.id);
  return NextResponse.json(payload);
}

export async function PUT(req: Request) {
  const account = await getOrCreateAccount();
  const body = await req.json().catch(() => ({}));
  const workflow = normalizeWorkflowBody(body.workflow);
  const preference = normalizePreferenceBody(body.preference);
  await persistWorkspace(account.id, workflow, preference);
  const payload = await loadWorkspacePayload(account.id);
  return NextResponse.json(payload);
}

function normalizeWorkflowBody(value: unknown): WorkflowState {
  if (!value) return EMPTY_WORKFLOW_STATE;
  return parseWorkflowState(JSON.stringify(value));
}

function normalizePreferenceBody(value: unknown): Partial<WorkspacePreference> | undefined {
  if (!value || typeof value !== "object") return undefined;
  const normalized = normalizePreference(value);
  return {
    defaultWorkspace: normalized.defaultWorkspace,
    onboardingComplete: normalized.onboardingComplete,
    digestFrequency: normalized.digestFrequency,
    digestChannel: normalized.digestChannel,
    alertThreshold: normalized.alertThreshold,
  };
}
