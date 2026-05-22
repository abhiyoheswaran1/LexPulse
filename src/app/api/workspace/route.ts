import { NextResponse } from "next/server";
import {
  getOrCreateAccount,
  loadWorkspacePayload,
  normalizePreference,
  persistWorkspace,
  updateAccountIdentity,
  type WorkspacePreference,
} from "@/lib/account";
import { EMPTY_WORKFLOW_STATE, parseWorkflowState, type WorkflowState } from "@/lib/workflow";

export const dynamic = "force-dynamic";

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

export async function PATCH(req: Request) {
  const account = await getOrCreateAccount();
  const body = await req.json().catch(() => ({}));
  try {
    const payload = await updateAccountIdentity(account.id, {
      email: body.email,
      name: body.name,
      workspaceName: body.workspaceName,
    });
    return NextResponse.json(payload);
  } catch (error) {
    const message = error instanceof Error && error.message.includes("Unique constraint")
      ? "That email is already attached to another LexPulse account."
      : "Unable to update account identity.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
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
